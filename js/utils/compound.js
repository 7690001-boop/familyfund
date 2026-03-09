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
 * @param {number} [opts.inflationPct]   — annual inflation % to subtract (0 = nominal)
 * @returns {Array<{month, year, totalContributed, totalValue, cumulativeEarnings}>}
 */
export function computeFixedRate({ initialAmount, monthlyContribution, annualReturnPct, years, inflationPct = 0 }) {
    const monthlyRate = (annualReturnPct - inflationPct) / 100 / 12;
    const totalMonths = years * 12;
    const results = [];

    let balance = initialAmount;
    let totalContributed = initialAmount;

    for (let m = 1; m <= totalMonths; m++) {
        balance = (balance + monthlyContribution) * (1 + monthlyRate);
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
 * Simulates investing initialAmount at startDate, then monthlyContribution each month,
 * using actual monthly returns from the price series.
 *
 * @param {object} opts
 * @param {number} opts.initialAmount
 * @param {number} opts.monthlyContribution
 * @param {Array<{date:string, price:number}>} opts.priceData — sorted monthly prices
 * @param {string} opts.startDate — "YYYY-MM" to start from
 * @param {number} opts.years
 * @param {number} [opts.inflationPct] — annual inflation % to subtract monthly
 * @returns {Array<{month, year, date, totalContributed, totalValue, cumulativeEarnings}>}
 */
export function computeHistorical({ initialAmount, monthlyContribution, priceData, startDate, years, inflationPct = 0 }) {
    const startIdx = priceData.findIndex(p => p.date >= startDate);
    if (startIdx < 0) return [];

    const totalMonths = years * 12;
    const endIdx = Math.min(startIdx + totalMonths, priceData.length - 1);
    const results = [];

    let balance = initialAmount;
    let totalContributed = initialAmount;
    const monthlyInflation = inflationPct / 100 / 12;

    for (let i = startIdx; i < endIdx; i++) {
        const prevPrice = priceData[i].price;
        const currPrice = priceData[i + 1].price;
        if (!prevPrice || !currPrice) continue;

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
