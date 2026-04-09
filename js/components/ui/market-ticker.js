// ============================================================
// Market Ticker Banner — live USD/ILS, S&P 500, MSCI World
// ============================================================

import { YAHOO_CHART_URL } from '../../config.js';
import t from '../../i18n.js';

const REFRESH_MS = 5 * 60 * 1000;
const TICKERS = [
    { key: 'usdils', symbol: 'ILS=X', label: () => t.ticker.usdIls, isFx: true,  show150HL: true },
    { key: 'sp500',  symbol: '^GSPC',  label: () => t.ticker.sp500,  isFx: false, show150HL: true },
    { key: 'world',  symbol: 'URTH',   label: () => t.ticker.world,  isFx: false, show150HL: false },
];

let _container = null;
let _timer = null;
let _expandedKey = null;
let _data = {};

export function mount(container) {
    _container = container;
    _container.className = 'market-ticker-bar';
    _container.innerHTML = renderSkeleton();
    fetchAndRender();
    _timer = setInterval(fetchAndRender, REFRESH_MS);
}

export function unmount() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _container = null;
    _expandedKey = null;
    _data = {};
}

function renderSkeleton() {
    const chips = TICKERS.map(tk => `
        <span class="ticker-chip">
            <span class="ticker-chip-label">${tk.label()}</span>
            <span class="ticker-chip-value">${t.ticker.loading}</span>
        </span>
    `).join('<span class="ticker-sep">|</span>');
    return `<div class="ticker-main-row">${chips}</div>`;
}

async function fetchAndRender() {
    if (!_container) return;
    const results = await Promise.allSettled(
        TICKERS.map(tk => fetchTickerData(tk.symbol))
    );
    if (!_container) return;

    TICKERS.forEach((tk, i) => {
        const r = results[i];
        _data[tk.key] = r.status === 'fulfilled' ? r.value : null;
    });

    renderAll();
}

function renderAll() {
    if (!_container) return;

    const chips = TICKERS.map((tk) => {
        const data = _data[tk.key];
        const isExpanded = _expandedKey === tk.key;
        return buildChip(tk, data, isExpanded);
    }).join('<span class="ticker-sep">|</span>');

    const expanded = _expandedKey ? TICKERS.find(tk => tk.key === _expandedKey) : null;
    const detailHtml = expanded ? buildDetailRow(expanded, _data[expanded.key]) : '';

    _container.innerHTML = `<div class="ticker-main-row">${chips}</div>${detailHtml}`;

    _container.querySelectorAll('.ticker-chip-expandable').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.key;
            _expandedKey = _expandedKey === key ? null : key;
            renderAll();
        });
    });
}

async function fetchTickerData(symbol) {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    const valid = timestamps
        .map((ts, i) => ({ ts, close: closes[i] }))
        .filter(p => p.close != null);

    if (valid.length === 0) throw new Error('No valid price data');

    const last = valid[valid.length - 1];
    const current = last.close;

    const todayChange = meta.regularMarketChangePercent ??
        (valid.length >= 2
            ? ((current - valid[valid.length - 2].close) / valid[valid.length - 2].close) * 100
            : 0);

    const pctFrom = (idx) => idx >= 0
        ? ((current - valid[idx].close) / valid[idx].close) * 100
        : null;

    const change5d = pctFrom(valid.length - 6);
    const change1m = pctFrom(valid.length - 23);
    const change1y = pctFrom(0);

    // YTD: first trading day of current year
    const curYear = new Date(last.ts * 1000).getFullYear();
    const ytdIdx  = valid.findIndex(p => new Date(p.ts * 1000).getFullYear() >= curYear);
    const changeYtd = (ytdIdx >= 0 && ytdIdx < valid.length - 1) ? pctFrom(ytdIdx) : null;

    // 150D high/low
    const last150 = valid.slice(-150);
    const high150 = Math.max(...last150.map(p => p.close));
    const low150  = Math.min(...last150.map(p => p.close));

    return { price: current, change: todayChange, change5d, change1m, changeYtd, change1y, high150, low150 };
}

function buildChip(tk, data, isExpanded) {
    if (!data) {
        return `<span class="ticker-chip">
            <span class="ticker-chip-label">${tk.label()}</span>
            <span class="ticker-chip-value">${t.ticker.error}</span>
        </span>`;
    }

    const display = tk.isFx ? data.price.toFixed(3) : formatIndex(data.price);
    const sign = data.change >= 0 ? '+' : '';
    const cls  = data.change >= 0 ? 'gain' : 'loss';
    const arrow = data.change >= 0 ? '▲' : '▼';

    return `<span class="ticker-chip ticker-chip-expandable${isExpanded ? ' expanded' : ''}" data-key="${tk.key}" title="${t.ticker.clickToExpand}">
        <span class="ticker-chip-label">${tk.label()}</span>
        <span class="ticker-chip-value">${display}</span>
        <span class="ticker-change ${cls}">${arrow} ${sign}${data.change.toFixed(2)}%</span>
        <span class="ticker-caret">${isExpanded ? '▾' : '▸'}</span>
    </span>`;
}

function buildDetailRow(tk, data) {
    if (!data) return '';

    const periods = [
        { label: t.ticker.period5d,  value: data.change5d  },
        { label: t.ticker.period1m,  value: data.change1m  },
        { label: t.ticker.periodYtd, value: data.changeYtd },
        { label: t.ticker.period1y,  value: data.change1y  },
    ];

    const periodsHtml = periods.map(p => {
        if (p.value == null) return '';
        const s = p.value >= 0 ? '+' : '';
        const c = p.value >= 0 ? 'gain' : 'loss';
        return `<span class="ticker-period-chip">
            <span class="ticker-period-label">${p.label}</span>
            <span class="ticker-change ${c}">${s}${p.value.toFixed(2)}%</span>
        </span>`;
    }).join('');

    let hlHtml = '';
    if (tk.show150HL) {
        const fmt = v => tk.isFx ? v.toFixed(3) : formatIndex(v);
        hlHtml = `<span class="ticker-hl-chip">
            <span class="ticker-period-label">${t.ticker.hl150}</span>
            <span class="ticker-hl-range">
                <span class="ticker-hl-low">${fmt(data.low150)}</span>
                <span class="ticker-hl-sep"> – </span>
                <span class="ticker-hl-high">${fmt(data.high150)}</span>
            </span>
        </span>`;
    }

    return `<div class="ticker-detail-row">${periodsHtml}${hlHtml}</div>`;
}

function formatIndex(n) {
    if (n >= 1000) return n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
    return n.toFixed(2);
}
