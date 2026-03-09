#!/usr/bin/env node
// Fetch US annual inflation rates from World Bank API

async function main() {
    const resp = await fetch('https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL.ZG?date=1960:2025&format=json&per_page=100');
    const json = await resp.json();
    const data = json[1]
        .filter(r => r.value != null)
        .map(r => ({ year: parseInt(r.date), rate: Math.round(r.value * 100) / 100 }))
        .sort((a, b) => a.year - b.year);

    // Build a JS object: { year: rate }
    const obj = {};
    for (const d of data) obj[d.year] = d.rate;

    console.log(`Fetched ${data.length} years: ${data[0].year} - ${data[data.length - 1].year}`);
    console.log('Average:', (data.reduce((s, d) => s + d.rate, 0) / data.length).toFixed(2) + '%');

    const fs = await import('fs');
    const path = await import('path');
    const outFile = path.resolve(import.meta.dirname, '..', 'js', 'data', 'us-inflation.json');
    fs.writeFileSync(outFile, JSON.stringify(obj, null, 2));
    console.log(`Written to ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
