#!/usr/bin/env node
// Fetch ~55 years of weekly prices from Yahoo Finance, aggregate to monthly averages.
// Indices: S&P 500, MSCI World (ETF), Total US Market (ETF).
// Output: js/data/historical-monthly.json

const INDICES = [
    { key: 'sp500',    ticker: '^GSPC',  name: 'S&P 500' },
    { key: 'world',    ticker: 'URTH',   name: 'MSCI World (ETF)' },
    { key: 'total_us', ticker: 'VTI',    name: 'Total US Market (ETF)' },
];

const YAHOO_CHART = 'https://query2.finance.yahoo.com/v8/finance/chart';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
};

async function fetchWeekly(ticker) {
    const now = Math.floor(Date.now() / 1000);
    const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?period1=0&period2=${now}&interval=1wk`;
    console.log(`Fetching ${ticker} (weekly)...`);

    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${ticker}`);

    const json = await resp.json();
    const result = json.chart?.result?.[0];
    if (!result) throw new Error(`No data for ${ticker}`);

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const { open, high, low, close } = quotes;

    // Group by YYYY-MM and average
    const monthBuckets = {};
    for (let i = 0; i < timestamps.length; i++) {
        const d = new Date(timestamps[i] * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const vals = [open?.[i], high?.[i], low?.[i], close?.[i]].filter(v => v != null && !isNaN(v));
        if (vals.length === 0) continue;
        const weekAvg = vals.reduce((a, b) => a + b, 0) / vals.length;

        if (!monthBuckets[key]) monthBuckets[key] = [];
        monthBuckets[key].push(weekAvg);
    }

    const monthly = Object.entries(monthBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, prices]) => ({
            date,
            price: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
        }));

    console.log(`  ${ticker}: ${monthly.length} months (${monthly[0]?.date} → ${monthly[monthly.length - 1]?.date})`);
    return monthly;
}

async function main() {
    const data = {};

    for (const idx of INDICES) {
        try {
            const monthly = await fetchWeekly(idx.ticker);
            data[idx.key] = { name: idx.name, ticker: idx.ticker, monthly };
        } catch (e) {
            console.error(`Error fetching ${idx.ticker}: ${e.message}`);
            data[idx.key] = { name: idx.name, ticker: idx.ticker, monthly: [] };
        }
    }

    const fs = await import('fs');
    const path = await import('path');
    const outDir = path.resolve(import.meta.dirname, '..', 'js', 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'historical-monthly.json');
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`\nWritten to ${outFile}`);

    // Print summary
    for (const [key, val] of Object.entries(data)) {
        console.log(`${key}: ${val.monthly.length} months`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
