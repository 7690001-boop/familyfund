// ============================================================
// Computation utilities — pure functions for investment math
// ============================================================

import { daysBetween, toDateStr } from './format.js';
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

export function kidInvestments(investments, kid, showHidden = true) {
    return investments
        .filter(inv => inv.kid === kid && (showHidden || !inv.hidden))
        .map(calcInvestment);
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
            someHidden: group.some(inv => !!inv.hidden),
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
            firstId: first.id,
            note: first.note || '',
            nickname: first.nickname || '',
            baseAssetName: first.asset_name || first.ticker || '',
        };
    });
}

// Default tickers eligible for long-term holding rewards
const DEFAULT_REWARD_TICKERS = ['VOO', 'SPY', 'CSPX', 'IWDA', 'VWRA', 'VT', 'EIMI'];

// Milestone thresholds in days
const MILESTONES = [
    { days: 730, level: 'oak',     icon: '🌳', label: '2y' },
    { days: 365, level: 'tree',    icon: '🌲', label: '1y' },
    { days: 180, level: 'sapling', icon: '🌿', label: '6m' },
    { days: 90,  level: 'sprout',  icon: '🌱', label: '3m' },
    { days: 30,  level: 'seed',    icon: '🫘', label: '1m' },
];

export function getRewardMilestone(inv, familyConfig) {
    const eligibleRaw = familyConfig?.reward_eligible_tickers;
    const eligibleTickers = eligibleRaw && eligibleRaw.length > 0
        ? eligibleRaw.map(t => normalizeTicker(t))
        : DEFAULT_REWARD_TICKERS.map(t => normalizeTicker(t));

    // Also include matching tickers if configured
    const matchingTickers = familyConfig?.matching_tickers?.length
        ? familyConfig.matching_tickers
        : familyConfig?.sp500_ticker ? [familyConfig.sp500_ticker] : [];
    for (const t of matchingTickers) eligibleTickers.push(normalizeTicker(t));

    const ticker = normalizeTicker(inv.ticker || '');
    if (!ticker || !eligibleTickers.includes(ticker)) return null;

    const days = inv.daysHeld ?? daysBetween(inv.purchase_date);
    if (days < 30) return null;

    for (const m of MILESTONES) {
        if (days >= m.days) {
            return { ...m, days: days };
        }
    }
    return null;
}

export const DEFAULT_MATCHING_TICKERS = ['VOO', 'SPY', 'CSPX', 'IWDA', 'VWRA'];

// Resolve tiers from family config.
// Supports new matching_tiers array or falls back to legacy matching_days + matching_ratio.
export function resolveTiers(familyConfig) {
    if (familyConfig?.matching_tiers?.length) {
        return [...familyConfig.matching_tiers].sort((a, b) => a.days - b.days);
    }
    const days = Number(familyConfig?.matching_days) || 365;
    const ratio = Number(familyConfig?.matching_ratio ?? 1);
    return [{ days, ratio }];
}

export function computeMatching(investments, familyConfig) {
    // Resolve matching tickers: new array field, fallback to legacy sp500_ticker, fallback to defaults
    const rawTickers = familyConfig?.matching_tickers?.length
        ? familyConfig.matching_tickers
        : familyConfig?.sp500_ticker
            ? [familyConfig.sp500_ticker]
            : [];
    if (!rawTickers.length) return { deposits: [], matched: 0, total: 0 };

    const normalizedTickers = rawTickers.map(t => normalizeTicker(t));
    const tiers = resolveTiers(familyConfig);
    const totalRatio = tiers.reduce((s, t) => s + t.ratio, 0);
    const retroactive = familyConfig.matching_retroactive !== false; // default true
    const activatedAt = familyConfig.matching_activated_at || null;

    const deposits = investments
        .filter(inv => {
            if (!normalizedTickers.includes(normalizeTicker(inv.ticker))) return false;
            // Non-retroactive: exclude investments purchased before the program was activated
            if (!retroactive && activatedAt && inv.purchase_date && inv.purchase_date < activatedAt) return false;
            return true;
        })
        .map(inv => {
            const daysHeld = inv.daysHeld ?? 0;
            const earnedTiers = tiers.filter(t => daysHeld >= t.days);
            const pendingTiers = tiers.filter(t => daysHeld < t.days);

            const earnedRatio = earnedTiers.reduce((s, t) => s + t.ratio, 0);
            const shares = inv.shares ?? 0;
            const earnedShares = shares * earnedRatio;
            const potentialShares = shares * totalRatio;

            const eligible = earnedShares > 0;
            const allEligible = pendingTiers.length === 0;

            const nextTier = pendingTiers[0] ?? null;
            const lastEarnedTier = earnedTiers.length > 0 ? earnedTiers[earnedTiers.length - 1] : null;
            const prevTierDays = lastEarnedTier?.days ?? 0;
            const nextTierDays = nextTier?.days ?? tiers[tiers.length - 1]?.days ?? 365;

            const daysRemaining = nextTier ? nextTier.days - daysHeld : 0;
            const nextTierShares = nextTier ? shares * nextTier.ratio : 0;

            const purchaseMs = inv.purchase_date ? new Date(inv.purchase_date).getTime() : null;
            const unlockDate = nextTier && purchaseMs
                ? toDateStr(new Date(purchaseMs + nextTier.days * 86400000))
                : null;

            const currentPriceILS = (inv.currentPrice ?? 0) * (inv.exchangeRate ?? 1);
            const matchedAmount = earnedShares * currentPriceILS;

            return {
                ...inv,
                eligible,
                allEligible,
                daysRemaining,
                prevTierDays,
                nextTierDays,
                potentialShares,
                matchedShares: earnedShares,
                matchedAmount,
                unlockDate,
                nextTierShares,
            };
        });

    const matched = deposits.reduce((s, d) => s + d.matchedAmount, 0);
    const total = deposits.reduce((s, d) => s + d.potentialShares * ((d.currentPrice ?? 0) * (d.exchangeRate ?? 1)), 0);
    return { deposits, matched, total };
}
