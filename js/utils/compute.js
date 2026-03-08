// ============================================================
// Computation utilities — pure functions for investment math
// ============================================================

import { daysBetween } from './format.js';
import { normalizeTicker } from './id.js';
import * as store from '../store.js';

export function calcInvestment(inv) {
    const exchangeRates = store.get('exchangeRates') || {};

    const currency = inv.currency || 'ILS';
    // How many ILS per 1 unit of this investment's currency
    const currentExchangeRate = (currency === 'ILS') ? 1 : (exchangeRates[currency] || 1);

    // amount_invested is always in ILS (the family's home currency)
    const amountInvested = Number(inv.amount_invested) || 0;

    const sharesRaw = inv.shares != null && inv.shares !== '' ? Number(inv.shares) : null;
    const shares = sharesRaw != null && sharesRaw > 0 ? sharesRaw : null;

    // current_price is in the investment's native currency
    const currentPrice = inv.current_price != null && inv.current_price !== '' ? Number(inv.current_price) : null;

    // Exchange rate at purchase time (ILS per 1 native unit); stored on the investment record
    const rateAtPurchase = Number(inv.exchange_rate_at_purchase) || currentExchangeRate || 1;

    // Amount invested in native currency
    const amountInvestedNative = currency === 'ILS'
        ? amountInvested
        : amountInvested / rateAtPurchase;

    // Purchase price per unit in native currency (derived)
    const purchasePrice = shares != null && amountInvestedNative > 0
        ? amountInvestedNative / shares
        : null;

    // Current value in native currency
    const currentValueNative = currentPrice != null && shares != null
        ? shares * currentPrice
        : null;

    // Current value in ILS
    const currentValueILS = currentValueNative != null
        ? currentValueNative * currentExchangeRate
        : null;

    // P&L in native currency
    const gainLossNative = currentValueNative != null
        ? currentValueNative - amountInvestedNative
        : null;
    const gainLossPctNative = gainLossNative != null && amountInvestedNative > 0
        ? gainLossNative / amountInvestedNative
        : null;

    // P&L in ILS
    const gainLossILS = currentValueILS != null
        ? currentValueILS - amountInvested
        : null;
    const gainLossPctILS = gainLossILS != null && amountInvested > 0
        ? gainLossILS / amountInvested
        : null;

    const daysHeld = daysBetween(inv.purchase_date);

    return {
        ...inv,
        currency,
        purchasePrice,         // native currency, per unit
        currentPrice,          // native currency, per unit
        currentValueNative,    // native currency total
        currentValueILS,       // ILS total
        currentValue: currentValueILS,  // backward compat (used by computeSummary)
        amountInvestedNative,  // native currency
        amountInvested,        // ILS (always)
        gainLossNative,        // native currency
        gainLossPctNative,
        gainLossILS,           // ILS
        gainLossPctILS,
        gainLoss: gainLossILS,          // backward compat (ILS)
        gainLossPct: gainLossPctILS,    // backward compat
        exchangeRate: currentExchangeRate,
        rateAtPurchase,
        daysHeld,
        shares: shares ?? 0,
    };
}

export function kidInvestments(investments, kid) {
    return investments.filter(inv => inv.kid === kid).map(calcInvestment);
}

export function kidGoals(goals, kid) {
    return goals.filter(g => g.kid === kid);
}

export function computeSummary(investments) {
    let totalInvested = 0;
    let totalCurrent = 0;
    investments.forEach(inv => {
        totalInvested += inv.amountInvested;
        totalCurrent += inv.currentValue != null ? inv.currentValue : inv.amountInvested;
    });
    const gainLoss = totalCurrent - totalInvested;
    const gainLossPct = totalInvested > 0 ? gainLoss / totalInvested : 0;
    return { totalInvested, totalCurrent, gainLoss, gainLossPct };
}

// Aggregates multiple purchases of the same ticker into a single consolidated position.
// Expects already-computed investments (output of calcInvestment).
export function aggregateByTicker(investments) {
    const groups = new Map();
    investments.forEach(inv => {
        const key = inv.ticker ? normalizeTicker(inv.ticker) : `__name__${inv.asset_name || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(inv);
    });

    return [...groups.values()].map(group => {
        const first = group[0];
        const currency = first.currency || 'ILS';
        const nativeIsIls = currency === 'ILS';

        const totalShares = group.reduce((s, inv) => s + (Number(inv.shares) || 0), 0);
        const totalInvested = group.reduce((s, inv) => s + (Number(inv.amountInvested) || 0), 0);       // ILS
        const totalInvestedNative = group.reduce((s, inv) => s + (Number(inv.amountInvestedNative) || 0), 0); // native

        // Use current price from any investment in the group that has one
        const withPrice = group.find(inv => inv.currentPrice != null);
        const currentPrice = withPrice?.currentPrice ?? null;
        const exchangeRate = first.exchangeRate || 1;

        // Weighted average cost per unit in native currency
        const avgCostNative = totalShares > 0 && totalInvestedNative > 0
            ? totalInvestedNative / totalShares : null;

        const currentValueNative = currentPrice != null && totalShares > 0
            ? totalShares * currentPrice : null;
        const currentValueILS = currentValueNative != null
            ? (nativeIsIls ? currentValueNative : currentValueNative * exchangeRate) : null;

        const gainLossNative = currentValueNative != null ? currentValueNative - totalInvestedNative : null;
        const gainLossPctNative = gainLossNative != null && totalInvestedNative > 0
            ? gainLossNative / totalInvestedNative : null;
        const gainLossILS = currentValueILS != null ? currentValueILS - totalInvested : null;
        const gainLossPctILS = gainLossILS != null && totalInvested > 0
            ? gainLossILS / totalInvested : null;

        return {
            ticker: first.ticker,
            asset_name: first.nickname || first.asset_name,
            kid: first.kid,
            currency,
            purchaseCount: group.length,
            totalShares,
            totalInvested,
            totalInvestedNative,
            avgCostNative,
            currentPrice,
            currentValueNative,
            currentValueILS,
            gainLossNative,
            gainLossPctNative,
            gainLossILS,
            gainLossPctILS,
            exchangeRate,
        };
    });
}

export function computeMatching(investments, familyConfig) {
    const sp500Ticker = familyConfig?.sp500_ticker;
    if (!sp500Ticker) return { deposits: [], matched: 0, total: 0 };

    const normalizedSp500 = normalizeTicker(sp500Ticker);
    const matchingDays = Number(familyConfig.matching_days) || 365;

    const deposits = investments
        .filter(inv => normalizeTicker(inv.ticker) === normalizedSp500)
        .map(inv => {
            const eligible = inv.daysHeld >= matchingDays;
            const daysRemaining = eligible ? 0 : matchingDays - inv.daysHeld;
            return {
                ...inv,
                eligible,
                daysRemaining,
                matchedAmount: eligible ? inv.amountInvested : 0,
            };
        });

    const matched = deposits.reduce((s, d) => s + d.matchedAmount, 0);
    const total = deposits.reduce((s, d) => s + d.amountInvested, 0);
    return { deposits, matched, total };
}
