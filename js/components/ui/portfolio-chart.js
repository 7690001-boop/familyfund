// ============================================================
// Holdings Performance — multi-period % change per security
// Shows each ticker's own performance (5D / 30D / 180D / 1Y),
// similar to the market ticker expanded view.
// ============================================================

import { YAHOO_CHART_URL } from '../../config.js';
import { aggregateByTicker } from '../../utils/compute.js';
import t from '../../i18n.js';

// Trading-day approximations
const PERIODS = [
    { key: '5d',   label: () => t.holdingsPerf.period5d,   idx: -6   },
    { key: '30d',  label: () => t.holdingsPerf.period30d,  idx: -23  },
    { key: '180d', label: () => t.holdingsPerf.period180d, idx: -127 },
    { key: '1y',   label: () => t.holdingsPerf.period1y,   idx: 0    },
];

export function mount(container, investments) {
    const positions = aggregateByTicker(investments)
        .filter(p => p.ticker && (p.ticker.toUpperCase() !== 'CASH'));

    if (positions.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="holdings-perf-wrap">
            <h3 class="holdings-perf-title">${t.holdingsPerf.title}</h3>
            <div class="holdings-perf-list">
                ${positions.map(pos => `
                    <div class="holdings-perf-row" data-ticker="${pos.ticker}">
                        <span class="holdings-perf-name">${pos.asset_name || pos.ticker}</span>
                        <span class="holdings-perf-ticker">${pos.ticker}</span>
                        <span class="holdings-perf-periods">
                            ${PERIODS.map(p => `
                                <span class="holdings-period-chip loading" data-period="${p.key}">
                                    <span class="holdings-period-label">${p.label()}</span>
                                    <span class="holdings-period-val">...</span>
                                </span>`).join('')}
                        </span>
                    </div>`).join('')}
            </div>
        </div>
    `;

    // Fetch all tickers in parallel and fill in data as it arrives
    const uniqueTickers = [...new Set(positions.map(p => p.ticker))];
    uniqueTickers.forEach(ticker => {
        fetchTickerPerf(ticker).then(perf => {
            const row = container.querySelector(`[data-ticker="${ticker}"]`);
            if (!row) return;
            PERIODS.forEach(p => {
                const chip = row.querySelector(`[data-period="${p.key}"]`);
                if (!chip) return;
                chip.classList.remove('loading');
                const val = perf?.[p.key];
                if (val == null) {
                    chip.querySelector('.holdings-period-val').textContent = '—';
                } else {
                    const sign = val >= 0 ? '+' : '';
                    chip.classList.add(val >= 0 ? 'gain' : 'loss');
                    chip.querySelector('.holdings-period-val').textContent = `${sign}${val.toFixed(2)}%`;
                }
            });
        }).catch(() => {
            const row = container.querySelector(`[data-ticker="${ticker}"]`);
            if (!row) return;
            row.querySelectorAll('.holdings-period-chip').forEach(chip => {
                chip.classList.remove('loading');
                chip.querySelector('.holdings-period-val').textContent = '—';
            });
        });
    });
}

async function fetchTickerPerf(symbol) {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const isIla = result.meta?.currency === 'ILA';
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    const valid = timestamps
        .map((ts, i) => ({ ts, close: closes[i] }))
        .filter(p => p.close != null)
        .map(p => ({ ...p, close: isIla ? p.close / 100 : p.close }));

    if (valid.length === 0) return null;

    const current = valid[valid.length - 1].close;
    const pctFrom = (idx) => {
        const resolved = idx < 0 ? valid.length + idx : idx;
        if (resolved < 0 || resolved >= valid.length - 1) return null;
        const base = valid[resolved].close;
        return base > 0 ? ((current - base) / base) * 100 : null;
    };

    return {
        '5d':   pctFrom(-6),
        '30d':  pctFrom(-23),
        '180d': pctFrom(-127),
        '1y':   pctFrom(0),
    };
}
