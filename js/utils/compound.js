// ============================================================
// Compound Growth Calculator — core math for investment simulator
// Supports fixed-rate and real historical data modes
// ============================================================

/**
 * Compute compound growth with a fixed annual return rate.
 * Monthly compounding: each month applies (annualReturnPct/100)/12.
 *
 * @param {object} opts
 * @param {number} opts.initialAmount
 * @param {number} opts.monthlyContribution
 * @param {number} opts.annualReturnPct  — e.g. 10 for 10%
 * @param {number} opts.years
 * @param {number} [opts.inflationPct]   — fixed annual inflation % to subtract (0 = nominal)
 * @param {object} [opts.inflationData]  — real year-by-year inflation { "2000": 3.38, ... }
 * @param {number} [opts.startYear]      — calendar year for inflation lookup (defaults to current year)
 * @returns {Array<{month, year, totalContributed, totalValue, cumulativeEarnings}>}
 */
export function computeFixedRate({ initialAmount, monthlyContribution, annualReturnPct, years, inflationPct = 0, inflationData = null, startYear = null }) {
    const totalMonths = years * 12;
    const results = [];
    const calendarStart = startYear || new Date().getFullYear();

    let balance = initialAmount;
    let totalContributed = initialAmount;

    for (let m = 1; m <= totalMonths; m++) {
        const calendarYear = calendarStart + Math.floor((m - 1) / 12);
        const monthlyInflation = getMonthlyInflation(calendarYear, inflationPct, inflationData);
        const monthlyRate = annualReturnPct / 100 / 12;

        balance = (balance + monthlyContribution) * (1 + monthlyRate - monthlyInflation);
        totalContributed += monthlyContribution;

        results.push({
            month: m,
            year: Math.ceil(m / 12),
            totalContributed: Math.round(totalContributed),
            totalValue: Math.round(balance),
            cumulativeEarnings: Math.round(balance - totalContributed),
        });
    }

    return results;
}

/**
 * Compute growth using real historical monthly prices.
 *
 * @param {object} opts
 * @param {number} opts.initialAmount
 * @param {number} opts.monthlyContribution
 * @param {Array<{date:string, price:number}>} opts.priceData — sorted monthly prices
 * @param {string} opts.startDate — "YYYY-MM" to start from
 * @param {number} opts.years
 * @param {number} [opts.inflationPct] — fixed annual inflation % to subtract monthly
 * @param {object} [opts.inflationData] — real year-by-year inflation { "2000": 3.38, ... }
 * @returns {Array<{month, year, date, totalContributed, totalValue, cumulativeEarnings}>}
 */
export function computeHistorical({ initialAmount, monthlyContribution, priceData, startDate, years, inflationPct = 0, inflationData = null }) {
    const startIdx = priceData.findIndex(p => p.date >= startDate);
    if (startIdx < 0) return [];

    const totalMonths = years * 12;
    const endIdx = Math.min(startIdx + totalMonths, priceData.length - 1);
    const results = [];

    let balance = initialAmount;
    let totalContributed = initialAmount;

    for (let i = startIdx; i < endIdx; i++) {
        const prevPrice = priceData[i].price;
        const currPrice = priceData[i + 1].price;
        if (!prevPrice || !currPrice) continue;

        const calendarYear = parseInt(priceData[i + 1].date.slice(0, 4));
        const monthlyInflation = getMonthlyInflation(calendarYear, inflationPct, inflationData);

        const monthReturn = (currPrice - prevPrice) / prevPrice;
        balance += monthlyContribution;
        totalContributed += monthlyContribution;
        balance *= (1 + monthReturn - monthlyInflation);

        const m = i - startIdx + 1;
        results.push({
            month: m,
            year: Math.ceil(m / 12),
            date: priceData[i + 1].date,
            totalContributed: Math.round(totalContributed),
            totalValue: Math.round(balance),
            cumulativeEarnings: Math.round(balance - totalContributed),
        });
    }

    return results;
}

/**
 * Get yearly summary from monthly results (last month of each year).
 */
export function yearlyFromMonthly(monthlyResults) {
    const byYear = {};
    for (const r of monthlyResults) {
        byYear[r.year] = r;
    }
    return Object.values(byYear).sort((a, b) => a.year - b.year);
}

function getMonthlyInflation(year, fixedPct, inflationData) {
    if (inflationData) {
        const rate = inflationData[year];
        if (rate != null) return rate / 100 / 12;
        // Fallback: use average of available data for future years
        const vals = Object.values(inflationData);
        if (vals.length > 0) return (vals.reduce((a, b) => a + b, 0) / vals.length) / 100 / 12;
    }
    return fixedPct / 100 / 12;
}
