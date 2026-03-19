// ============================================================
// Summary Cards — investment jar visualization (all-in-one)
// Coins pile up naturally using physics-like simulation
// ============================================================

import { formatCurrency, formatPct } from '../../utils/format.js';
import { gainLossClass } from '../../utils/dom-helpers.js';
import t from '../../i18n.js';

// Coin metal palettes
const COIN_METALS = [
    { name: 'gold',     hi: '#fff8b0', face: '#FFD700', shadow: '#b8860b', edge: '#8a6508', emboss: '#fffadd' },
    { name: 'silver',   hi: '#f8f8f8', face: '#d0d0d0', shadow: '#7a7a7a', edge: '#5a5a5a', emboss: '#ffffff' },
    { name: 'copper',   hi: '#f8c898', face: '#CD7F32', shadow: '#8b4513', edge: '#603010', emboss: '#fce0c0' },
    { name: 'rose',     hi: '#ffd0d0', face: '#e8a098', shadow: '#a05858', edge: '#704040', emboss: '#ffe8e4' },
    { name: 'platinum', hi: '#eef2f5', face: '#c8d0d8', shadow: '#8898a0', edge: '#607078', emboss: '#f4f8fc' },
    { name: 'bronze',   hi: '#f0d080', face: '#c49a3c', shadow: '#7a5c10', edge: '#504008', emboss: '#f8e0a0' },
    { name: 'brass',    hi: '#f8e878', face: '#d4af37', shadow: '#8a7020', edge: '#5a4810', emboss: '#fcf0b0' },
    { name: 'nickel',   hi: '#e0e4e8', face: '#b8c0c4', shadow: '#687078', edge: '#485058', emboss: '#eef0f4' },
];

// How many shekels each coin represents
const SHEKELS_PER_COIN = 10;

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
        .map((inv, i) => ({
            name: inv.nickname || inv.asset_name || inv.ticker || '',
            amount: inv.amountInvested || 0,
            pct: (inv.amountInvested || 0) / totalInvested,
            metal: COIN_METALS[i % COIN_METALS.length],
        }))
        .filter(c => c.pct > 0)
        .sort((a, b) => b.pct - a.pct);

    const rng = seededRandom(Math.round(totalInvested * 100) + 7);

    // Generate coins
    const allCoins = [];
    for (const inv of sorted) {
        const count = Math.max(1, Math.round(inv.amount / SHEKELS_PER_COIN));
        for (let c = 0; c < count; c++) {
            const baseSize = 28 + (inv.pct * 14);
            const jitter = (rng() - 0.5) * 8;
            const size = Math.max(24, Math.min(38, Math.round(baseSize + jitter)));
            allCoins.push({ name: inv.name, pct: inv.pct, metal: inv.metal, size });
        }
    }

    // Shuffle
    for (let i = allCoins.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [allCoins[i], allCoins[j]] = [allCoins[j], allCoins[i]];
    }

    const coins = allCoins.slice(0, 70);

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
        const thickness = Math.max(5, Math.round(coin.size * 0.28));
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
            transform: rotateX(28deg) rotate(${coin.rotate}deg);
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

    container.innerHTML = `
        <div class="jar-container jar-unified">
            <div class="jar-lid">
                <div class="jar-lid-knob"></div>
                <div class="jar-lid-invested">
                    <div class="jar-lid-label">${labelPrefix}${t.summaryCards.totalInvested}</div>
                    <div class="jar-lid-invested-value">${formatCurrency(summary.totalInvested, sym)}</div>
                </div>
                <div class="jar-lid-gainloss ${glClass}">
                    <span class="jar-lid-arrow">${arrow}</span>
                    <span class="jar-lid-gl-amount">${formatCurrency(Math.abs(summary.gainLoss), sym)}</span>
                    <span class="jar-lid-gl-pct">(${formatPct(summary.gainLossPct)})</span>
                </div>
            </div>
            <div class="jar-neck"></div>
            <div class="jar-body">
                <div class="jar-coins">
                    ${coins || '<div class="jar-empty">🪙</div>'}
                </div>
                <div class="jar-current-value">
                    <div class="jar-current-label">${labelPrefix}${t.summaryCards.currentValue}</div>
                    <div class="jar-current-amount">${formatCurrency(summary.totalCurrent, sym)}</div>
                </div>
                <div class="jar-shine"></div>
                <div class="jar-shine-left"></div>
            </div>
        </div>
    `;
}
