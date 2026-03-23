// ============================================================
// Market Ticker Banner — live USD/ILS, S&P 500, Nasdaq 100
// ============================================================

import { YAHOO_CHART_URL } from '../../config.js';
import t from '../../i18n.js';

const REFRESH_MS = 5 * 60 * 1000;
const TICKERS = [
    { key: 'usdils', symbol: 'ILS=X',  label: () => t.ticker.usdIls,  isFx: true },
    { key: 'sp500',  symbol: '^GSPC',   label: () => t.ticker.sp500,   isFx: false },
    { key: 'nasdaq', symbol: '^NDX',    label: () => t.ticker.nasdaq,  isFx: false },
];

let _container = null;
let _timer = null;

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
}

function renderSkeleton() {
    return TICKERS.map(tk => `
        <span class="ticker-chip">
            <span class="ticker-chip-label">${tk.label()}</span>
            <span class="ticker-chip-value">${t.ticker.loading}</span>
        </span>
    `).join('<span class="ticker-sep">|</span>');
}

async function fetchAndRender() {
    if (!_container) return;
    const results = await Promise.allSettled(
        TICKERS.map(tk => fetchTicker(tk.symbol))
    );
    if (!_container) return;
    _container.innerHTML = TICKERS.map((tk, i) => {
        const r = results[i];
        if (r.status === 'rejected' || !r.value) {
            return chipHtml(tk.label(), t.ticker.error, 0);
        }
        const { price, change } = r.value;
        const display = tk.isFx ? price.toFixed(3) : formatIndex(price);
        return chipHtml(tk.label(), display, change);
    }).join('<span class="ticker-sep">|</span>');
}

async function fetchTicker(symbol) {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('No meta');
    const price = meta.regularMarketPrice;
    const change = meta.regularMarketChangePercent ?? 0;
    return { price, change };
}

function chipHtml(label, value, changePct) {
    const sign = changePct >= 0 ? '+' : '';
    const cls = changePct >= 0 ? 'gain' : 'loss';
    const changeStr = changePct !== 0 ? ` <span class="ticker-change ${cls}">(${sign}${changePct.toFixed(2)}%)</span>` : '';
    return `<span class="ticker-chip">
        <span class="ticker-chip-label">${label}</span>
        <span class="ticker-chip-value">${value}${changeStr}</span>
    </span>`;
}

function formatIndex(n) {
    if (n >= 1000) return n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
    return n.toFixed(2);
}
