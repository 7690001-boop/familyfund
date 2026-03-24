// ============================================================
// Summary Cards — investment jar visualization (all-in-one)
// Coins pile up naturally using physics-like simulation
// ============================================================

import { formatCurrency, formatPct } from '../../utils/format.js';
import { gainLossClass } from '../../utils/dom-helpers.js';
import t from '../../i18n.js';

// Coin metal palettes — mapped by security type for visual distinction
const COIN_METALS = {
    stock:   { hi: '#fffde0', face: '#FFD700', shadow: '#8a6000', edge: '#6a4400', emboss: '#fffff0' },  // gold — equities
    etf:     { hi: '#e4f0ff', face: '#7aaed8', shadow: '#28608a', edge: '#0e4068', emboss: '#f0f8ff' },  // steel blue — baskets
    fund:    { hi: '#ffefc0', face: '#c08028', shadow: '#783e08', edge: '#582c00', emboss: '#fff8e0' },  // dark bronze — mutual funds
    bond:    { hi: '#eeeaff', face: '#9080c8', shadow: '#484080', edge: '#302858', emboss: '#f6f4ff' },  // violet silver — bonds
    cash:    { hi: '#dcfce8', face: '#38b068', shadow: '#14663a', edge: '#085028', emboss: '#f0fff6' },  // emerald — cash
    crypto:  { hi: '#fff0dc', face: '#e07818', shadow: '#884000', edge: '#6a2800', emboss: '#fff8ea' },  // orange — crypto
    default: { hi: '#eeeff4', face: '#b0b8c8', shadow: '#58687a', edge: '#384858', emboss: '#f8f9fc' },  // neutral silver
};

// Detect which metal a given investment deserves
function getSecurityMetal(inv) {
    const ticker = (inv.ticker || '').toUpperCase().trim();
    const type   = (inv.type || inv.asset_type || '').toLowerCase();
    const name   = (inv.asset_name || inv.nickname || '').toLowerCase();

    if (type === 'cash' || ticker === 'CASH' || name.includes('מזומן')) return COIN_METALS.cash;
    if (type === 'bond' || name.includes('אג"ח') || name.includes('אגח') || name.includes('bond')) return COIN_METALS.bond;
    if (type === 'crypto' || ticker.startsWith('BTC') || ticker.startsWith('ETH')) return COIN_METALS.crypto;
    // Israeli mutual funds are 6–10 digit numeric codes
    if (/^\d{5,}$/.test(ticker)) return COIN_METALS.fund;
    // Well-known ETFs
    const ETF_LIST = ['SPY','QQQ','VTI','IVV','VOO','VEA','VWO','GLD','SLV','TLT','AGG',
                      'ARKK','XLK','XLF','EEM','IEMG','ACWI','CSPX','IWDA','EIMI'];
    if (ETF_LIST.includes(ticker) || type === 'etf') return COIN_METALS.etf;
    if (type === 'stock' || type === 'equity') return COIN_METALS.stock;
    return COIN_METALS.stock; // default: gold for any equity-like holding
}

// How many shekels each coin represents
const SHEKELS_PER_COIN = 80;

// Bill definitions — id maps to CSS class suffix
const BILL_DEFS = [
    { id: 'dollar', label: '$',          color1: '#c8f7d4', color2: '#3fa866', border: '#2ecc71', textColor: '#0a4020' },
    { id: 'shekel', label: '₪',          color1: '#c0e8ff', color2: '#4a9ed0', border: '#0984e3', textColor: '#042d58' },
    { id: 'stock',  label: 'מניה',       color1: '#fff5c0', color2: '#c89030', border: '#b07818', textColor: '#4a2800' },
    { id: 'bond',   label: 'איגרת חוב',  color1: '#eae4fc', color2: '#9070d0', border: '#6040c0', textColor: '#2a1060' },
];

// Simulate bills falling into jar — fan layout with seeded randomness
function buildBills(seed) {
    const rng = seededRandom(seed + 1337);

    // Pool: 3 dollar, 3 shekel, 2 stock, 2 bond
    const pool = [
        { ...BILL_DEFS[0], w: 58, h: 122 },
        { ...BILL_DEFS[0], w: 54, h: 112 },
        { ...BILL_DEFS[0], w: 56, h: 118 },
        { ...BILL_DEFS[1], w: 56, h: 116 },
        { ...BILL_DEFS[1], w: 58, h: 120 },
        { ...BILL_DEFS[1], w: 54, h: 110 },
        { ...BILL_DEFS[2], w: 56, h: 114 },
        { ...BILL_DEFS[2], w: 54, h: 108 },
        { ...BILL_DEFS[3], w: 58, h: 118 },
        { ...BILL_DEFS[3], w: 56, h: 112 },
    ];

    // Shuffle so types are interleaved, not grouped
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const containerW = 300; // matches jar-coins width (bills live inside jar-coins)
    const n = pool.length;
    const spread = 76;   // ±spread from center
    const maxAngle = 26; // max lean angle

    return pool.map((bill, i) => {
        const t = n > 1 ? i / (n - 1) : 0.5; // 0..1 left→right
        const baseX = containerW / 2 - bill.w / 2 + (t - 0.5) * spread * 2;
        const jitter = (rng() - 0.5) * 12;
        const x = Math.round(Math.max(8, Math.min(containerW - bill.w - 8, baseX + jitter)));
        const baseRot = (t - 0.5) * maxAngle * 2;
        const jitterRot = (rng() - 0.5) * 5;
        const rotate = Math.round((baseRot + jitterRot) * 10) / 10;
        return { ...bill, x, rotate, zIndex: i + 1 };
    });
}

// Seeded random for stable layout
function seededRandom(seed) {
    let s = Math.abs(seed) || 1;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Simulate dropping coins into a jar.
 * Returns array of { ...coin, x, y, rotate } with pixel positions.
 * x = pixels from left edge, y = pixels from bottom of pile area.
 */
function simulatePile(coins, rng, containerW) {
    // Heightmap: for each x column, how high (px) is the pile
    const heightmap = new Float32Array(containerW).fill(0);
    const placed = [];

    // Coin visual stacking height (how much each coin adds to the pile)
    const STACK_H = 6;

    // Jar has curved bottom — raise floor at edges
    for (let x = 0; x < containerW; x++) {
        const center = containerW / 2;
        const dist = Math.abs(x - center) / center; // 0..1
        if (dist > 0.65) {
            heightmap[x] = Math.pow((dist - 0.65) / 0.35, 2) * 50;
        }
    }

    for (const coin of coins) {
        const coinW = coin.size;
        const pad = 8; // margin from jar edges

        // Try many positions, pick lowest landing point
        let bestX = Math.round(containerW / 2 - coinW / 2);
        let bestLandH = Infinity;

        for (let a = 0; a < 30; a++) {
            const tryX = Math.round(pad + rng() * (containerW - coinW - pad * 2));
            // Max height under this coin's footprint
            let maxH = 0;
            const x0 = Math.max(0, tryX);
            const x1 = Math.min(containerW - 1, tryX + coinW);
            for (let px = x0; px <= x1; px++) {
                if (heightmap[px] > maxH) maxH = heightmap[px];
            }
            // Slight center preference to keep pile natural
            const centerPenalty = Math.abs(tryX + coinW / 2 - containerW / 2) * 0.02;
            if (maxH + centerPenalty < bestLandH) {
                bestLandH = maxH + centerPenalty;
                bestX = tryX;
            }
        }

        // Actual landing height at chosen position
        let landY = 0;
        const x0 = Math.max(0, bestX);
        const x1 = Math.min(containerW - 1, bestX + coinW);
        for (let px = x0; px <= x1; px++) {
            if (heightmap[px] > landY) landY = heightmap[px];
        }

        // Update heightmap
        for (let px = x0; px <= x1; px++) {
            heightmap[px] = landY + STACK_H;
        }

        const rotate = Math.round((rng() - 0.5) * 32);
        placed.push({ ...coin, x: bestX, y: landY, rotate });
    }

    return placed;
}

function buildCoins(investments, totalInvested) {
    if (!investments || investments.length === 0 || totalInvested <= 0) return '';

    const sorted = [...investments]
        .map((inv) => ({
            name: inv.nickname || inv.asset_name || inv.ticker || '',
            amount: inv.amountInvested || 0,
            pct: (inv.amountInvested || 0) / totalInvested,
            metal: getSecurityMetal(inv),
        }))
        .filter(c => c.pct > 0)
        .sort((a, b) => b.pct - a.pct);

    const rng = seededRandom(Math.round(totalInvested * 100) + 7);

    // Generate coins
    const allCoins = [];
    for (const inv of sorted) {
        const count = Math.max(1, Math.round(inv.amount / SHEKELS_PER_COIN));
        for (let c = 0; c < count; c++) {
            const baseSize = 32 + (inv.pct * 20);
            const jitter = (rng() - 0.5) * 8;
            const size = Math.max(26, Math.min(48, Math.round(baseSize + jitter)));
            allCoins.push({ name: inv.name, pct: inv.pct, metal: inv.metal, size });
        }
    }

    // Shuffle
    for (let i = allCoins.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [allCoins[i], allCoins[j]] = [allCoins[j], allCoins[i]];
    }

    const coins = allCoins.slice(0, 20);

    // Run physics simulation
    const containerW = 300; // matches CSS jar-coins width
    const placed = simulatePile(coins, rng, containerW);

    // Find max pile height for container sizing
    let maxPileH = 0;
    for (const c of placed) {
        const top = c.y + 10;
        if (top > maxPileH) maxPileH = top;
    }
    const pileH = Math.max(80, maxPileH + 20);

    // Render coins as absolutely positioned elements
    const coinHtml = placed.map((coin, idx) => {
        const thickness = Math.max(7, Math.round(coin.size * 0.42));
        const m = coin.metal;
        const fontSize = Math.max(6, Math.min(10, Math.round(coin.size * 0.19)));
        const label = coin.name.length > 4 ? coin.name.slice(0, 3) + '…' : coin.name;
        const delay = (idx * 0.018).toFixed(3);
        const zIdx = Math.round(coin.y) + 1;

        return `<div class="jar-coin" style="
            left:${coin.x}px;
            bottom:${Math.round(coin.y)}px;
            width:${coin.size}px;
            --coin-h:${Math.round(coin.size * 0.44)}px;
            --coin-thickness:${thickness}px;
            --coin-face:${m.face};
            --coin-hi:${m.hi};
            --coin-shadow:${m.shadow};
            --coin-edge:${m.edge};
            --coin-emboss:${m.emboss};
            font-size:${fontSize}px;
            animation-delay:${delay}s;
            --coin-rotate:${coin.rotate}deg;
            z-index:${zIdx};
            transform: rotateX(42deg) rotate(${coin.rotate}deg);
        " title="${coin.name} (${Math.round(coin.pct * 100)}%)">
            <span class="coin-face">
                <span class="coin-label">${label}</span>
            </span>
            <span class="coin-edge-strip"></span>
        </div>`;
    }).join('');

    return `<div class="coin-pile" style="height:${pileH}px">${coinHtml}</div>`;
}

export function render(container, summary, family, investments = [], labelPrefix = '') {
    const sym = family?.currency_symbol || '₪';
    const glClass = gainLossClass(summary.gainLoss);
    const arrow = summary.gainLoss >= 0 ? '▲' : '▼';

    const coins = buildCoins(investments, summary.totalInvested);
    const bills = buildBills(Math.round((summary.totalInvested || 100) * 7 + 42));
    const billsHtml = bills.map(b =>
        `<div class="jar-bill jar-bill--${b.id}" style="left:${b.x}px;width:${b.w}px;height:${b.h}px;--bill-c1:${b.color1};--bill-c2:${b.color2};--bill-bd:${b.border};--bill-tx:${b.textColor};z-index:${b.zIndex};transform:rotate(${b.rotate}deg)"><span class="bill-label">${b.label}</span></div>` // eslint-disable-line
    ).join('');

    // note: billsHtml contains only static, code-generated HTML — no user input // noqa
    container.innerHTML = `
        <div class="jar-container jar-unified">
            <div class="jar-lid">
                <div class="jar-lid-knob"></div>
                <div class="jar-lid-invested has-tip" title="${t.summaryCards.tipInvested}">
                    <div class="jar-lid-label">${labelPrefix}${t.summaryCards.totalInvested}</div>
                    <div class="jar-lid-invested-value">${formatCurrency(summary.totalInvested, sym)}</div>
                </div>
                <div class="jar-lid-gainloss ${glClass} has-tip" title="${t.summaryCards.tipGainLoss}">
                    <span class="jar-lid-arrow">${arrow}</span>
                    <span class="jar-lid-gl-amount">${formatCurrency(Math.abs(summary.gainLoss), sym)}</span>
                    <span class="jar-lid-gl-pct">(${formatPct(summary.gainLossPct)})</span>
                </div>
            </div>
            <div class="jar-neck"></div>
            <div class="jar-body">
                <div class="jar-coins">
                    <div class="jar-bills" aria-hidden="true">${billsHtml}</div>
                    ${coins || '<div class="jar-empty">🪙</div>'}
                </div>
                <div class="jar-floor">
                    <div class="jar-current-value has-tip" title="${t.summaryCards.tipCurrentValue}">
                        <div class="jar-current-label">${labelPrefix}${t.summaryCards.currentValue}</div>
                        <div class="jar-current-amount">${formatCurrency(summary.totalCurrent, sym)}</div>
                    </div>
                </div>
                <div class="jar-shine"></div>
                <div class="jar-shine-left"></div>
            </div>
        </div>
    `;
}
