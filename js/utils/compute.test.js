import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../store.js';
import { calcInvestment, computeSummary, kidInvestments, kidGoals, aggregateByTicker, computeMatching } from './compute.js';

// Helper: build a minimal investment record
function inv(overrides = {}) {
    return {
        currency: 'ILS',
        amount_invested: 1000,
        shares: 10,
        current_price: 120,
        purchase_date: '2023-01-01',
        kid: 'Alice',
        ...overrides,
    };
}

beforeEach(() => {
    store.set('exchangeRates', { ILS: 1 });
});

// ─────────────────────────────────────────────────────────────
// calcInvestment — ILS securities
// ─────────────────────────────────────────────────────────────

describe('calcInvestment – ILS security', () => {
    it('calculates current value, gain/loss and percentage', () => {
        const r = calcInvestment(inv());
        expect(r.currentValueNative).toBe(1200); // 10 × 120
        expect(r.currentValueILS).toBe(1200);
        expect(r.amountInvested).toBe(1000);
        expect(r.amountInvestedNative).toBe(1000);
        expect(r.gainLossNative).toBe(200);
        expect(r.gainLossILS).toBe(200);
        expect(r.gainLossPctNative).toBeCloseTo(0.2);
        expect(r.gainLossPctILS).toBeCloseTo(0.2);
    });

    it('handles a loss correctly', () => {
        const r = calcInvestment(inv({ current_price: 80 }));
        expect(r.currentValueNative).toBe(800);
        expect(r.gainLossNative).toBe(-200);
        expect(r.gainLossPctNative).toBeCloseTo(-0.2);
    });

    it('returns null values when current_price is missing', () => {
        const r = calcInvestment(inv({ current_price: null }));
        expect(r.currentValueNative).toBeNull();
        expect(r.currentValueILS).toBeNull();
        expect(r.gainLossNative).toBeNull();
        expect(r.gainLossILS).toBeNull();
        expect(r.gainLossPctNative).toBeNull();
    });

    it('returns null values when shares are missing', () => {
        const r = calcInvestment(inv({ shares: null }));
        expect(r.shares).toBe(0);
        expect(r.currentValueNative).toBeNull();
        expect(r.gainLossNative).toBeNull();
    });

    it('returns null values when shares are zero', () => {
        const r = calcInvestment(inv({ shares: 0 }));
        expect(r.currentValueNative).toBeNull();
    });

    it('derives purchase price from amount / shares', () => {
        const r = calcInvestment(inv({ amount_invested: 500, shares: 5 }));
        expect(r.purchasePrice).toBe(100);
    });

    it('keeps amountInvested when there is no current price (backward compat)', () => {
        // computeSummary falls back to amountInvested when currentValue is null
        const r = calcInvestment(inv({ current_price: null }));
        expect(r.amountInvested).toBe(1000);
        expect(r.currentValue).toBeNull(); // ILS alias
    });
});

// ─────────────────────────────────────────────────────────────
// calcInvestment — foreign-currency securities (USD)
// ─────────────────────────────────────────────────────────────

describe('calcInvestment – USD security', () => {
    beforeEach(() => {
        store.set('exchangeRates', { ILS: 1, USD: 3.7 });
    });

    it('converts native values to ILS using current exchange rate', () => {
        // Invested ₪1000 at rate 3.7 → $270.27; bought 2 shares at $135.135 each
        // Current price $150; current value = 2 × $150 = $300 = ₪1110
        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: 1000,         // ₪ (always ILS)
            shares: 2,
            current_price: 150,            // USD per share
            exchange_rate_at_purchase: 3.7,
        }));

        expect(r.currency).toBe('USD');
        expect(r.currentValueNative).toBeCloseTo(300);
        expect(r.currentValueILS).toBeCloseTo(1110);
        expect(r.amountInvestedNative).toBeCloseTo(270.27, 1);
        expect(r.gainLossNative).toBeCloseTo(29.73, 1);   // in USD
        expect(r.gainLossILS).toBeCloseTo(110, 0);        // in ILS
        expect(r.gainLossPctNative).toBeCloseTo(0.11, 1); // ≈ +11%
        expect(r.gainLossPctILS).toBeCloseTo(0.11, 1);
    });

    it('P&L diverges when exchange rate at purchase differs from current rate', () => {
        // Bought at rate 3.7, current rate 3.8
        store.set('exchangeRates', { ILS: 1, USD: 3.8 });
        // Invested ₪1000 at rate 3.7 → $270.27 native cost
        // Current: 5 shares × $52 = $260 native; converted at 3.8 → ₪988
        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: 1000,
            shares: 5,
            current_price: 52,
            exchange_rate_at_purchase: 3.7,
        }));

        expect(r.currentValueNative).toBeCloseTo(260);
        expect(r.currentValueILS).toBeCloseTo(988);
        expect(r.gainLossNative).toBeCloseTo(-10.27, 1);  // loss in USD
        expect(r.gainLossILS).toBeCloseTo(-12, 0);        // loss in ILS
    });

    it('falls back to current exchange rate when rateAtPurchase is not set', () => {
        // If no exchange_rate_at_purchase, uses the current store rate (3.7)
        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: 370,   // ₪370 → $100 at rate 3.7
            shares: 1,
            current_price: 120,    // $120 now
            // no exchange_rate_at_purchase
        }));

        expect(r.amountInvestedNative).toBeCloseTo(100, 0);
        expect(r.currentValueNative).toBeCloseTo(120, 0);
        expect(r.gainLossNative).toBeCloseTo(20, 0);
    });

    it('returns null gain/loss when current_price is missing', () => {
        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: 1000,
            shares: 5,
            current_price: null,
            exchange_rate_at_purchase: 3.7,
        }));

        expect(r.currentValueNative).toBeNull();
        expect(r.gainLossNative).toBeNull();
        expect(r.gainLossILS).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────
// calcInvestment — backward-compatibility aliases
// ─────────────────────────────────────────────────────────────

describe('calcInvestment – backward-compat aliases', () => {
    it('currentValue aliases currentValueILS', () => {
        const r = calcInvestment(inv());
        expect(r.currentValue).toBe(r.currentValueILS);
    });

    it('gainLoss aliases gainLossILS', () => {
        const r = calcInvestment(inv());
        expect(r.gainLoss).toBe(r.gainLossILS);
    });

    it('gainLossPct aliases gainLossPctILS', () => {
        const r = calcInvestment(inv());
        expect(r.gainLossPct).toBe(r.gainLossPctILS);
    });
});

// ─────────────────────────────────────────────────────────────
// computeSummary
// ─────────────────────────────────────────────────────────────

describe('computeSummary', () => {
    it('sums invested and current values for ILS investments', () => {
        const investments = [
            calcInvestment(inv({ amount_invested: 1000, shares: 10, current_price: 120 })), // value 1200
            calcInvestment(inv({ amount_invested: 500,  shares: 5,  current_price: 80  })), // value 400
        ];
        const s = computeSummary(investments);
        expect(s.totalInvested).toBe(1500);
        expect(s.totalCurrent).toBe(1600);
        expect(s.gainLoss).toBe(100);
        expect(s.gainLossPct).toBeCloseTo(100 / 1500);
    });

    it('falls back to amountInvested when currentValue is null (no price)', () => {
        const investments = [
            calcInvestment(inv({ amount_invested: 1000, current_price: null })),
        ];
        const s = computeSummary(investments);
        expect(s.totalCurrent).toBe(1000);
        expect(s.gainLoss).toBe(0);
    });

    it('uses ILS-converted values for USD investments', () => {
        store.set('exchangeRates', { ILS: 1, USD: 3.7 });
        const investments = [
            // ₪370 invested → $100; 1 share at current $110 → ₪407
            calcInvestment(inv({
                currency: 'USD',
                amount_invested: 370,
                shares: 1,
                current_price: 110,
                exchange_rate_at_purchase: 3.7,
            })),
        ];
        const s = computeSummary(investments);
        expect(s.totalInvested).toBe(370);
        expect(s.totalCurrent).toBeCloseTo(407);
        expect(s.gainLoss).toBeCloseTo(37);
    });

    it('returns zero totals for empty list', () => {
        const s = computeSummary([]);
        expect(s.totalInvested).toBe(0);
        expect(s.totalCurrent).toBe(0);
        expect(s.gainLoss).toBe(0);
        expect(s.gainLossPct).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────
// kidInvestments
// ─────────────────────────────────────────────────────────────

describe('kidInvestments', () => {
    const raw = [
        inv({ kid: 'Alice', amount_invested: 1000 }),
        inv({ kid: 'Alice', amount_invested: 500  }),
        inv({ kid: 'Bob',   amount_invested: 800  }),
    ];

    it('returns only investments for the specified kid', () => {
        const result = kidInvestments(raw, 'Alice');
        expect(result).toHaveLength(2);
        result.forEach(r => expect(r.kid).toBe('Alice'));
    });

    it('returns empty array when kid has no investments', () => {
        expect(kidInvestments(raw, 'Charlie')).toHaveLength(0);
    });

    it('runs calcInvestment on each record', () => {
        const result = kidInvestments(raw, 'Alice');
        // calcInvestment spreads and adds computed fields
        expect(result[0]).toHaveProperty('currentValueNative');
        expect(result[0]).toHaveProperty('gainLossNative');
    });
});

// ─────────────────────────────────────────────────────────────
// Unit / amount calculation formula (mirrors kid-view.js logic)
// ─────────────────────────────────────────────────────────────

describe('units ↔ amount formulas', () => {
    it('ILS: units = amount / price', () => {
        const ilsAmount = 1000;
        const price = 125;
        const units = ilsAmount / price;
        // Verify via calcInvestment round-trip
        const r = calcInvestment(inv({ amount_invested: ilsAmount, shares: units, current_price: price }));
        expect(r.gainLossNative).toBeCloseTo(0);
    });

    it('USD: units = (ILS_amount / rate) / price', () => {
        store.set('exchangeRates', { ILS: 1, USD: 3.7 });
        const ilsAmount = 1000;
        const rate = 3.7;
        const price = 50; // USD
        const units = (ilsAmount / rate) / price;  // ≈ 5.405

        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: ilsAmount,
            shares: units,
            current_price: price,
            exchange_rate_at_purchase: rate,
        }));
        // If bought at exactly the price we calculated, gain/loss should be ~0
        expect(r.gainLossNative).toBeCloseTo(0, 3);
    });

    it('USD: ILS_amount = units × price × rate (reverse direction)', () => {
        store.set('exchangeRates', { ILS: 1, USD: 3.7 });
        const units = 5;
        const price = 50;   // USD
        const rate = 3.7;
        const expectedIls = units * price * rate; // 925

        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: expectedIls,
            shares: units,
            current_price: price,
            exchange_rate_at_purchase: rate,
        }));
        expect(r.gainLossNative).toBeCloseTo(0, 3);
        expect(r.gainLossILS).toBeCloseTo(0, 1);
    });
});

// ─────────────────────────────────────────────────────────────
// calcInvestment — edge cases (missing branch coverage)
// ─────────────────────────────────────────────────────────────

describe('calcInvestment – edge cases', () => {
    it('returns null purchasePrice when amount_invested is 0', () => {
        const r = calcInvestment(inv({ amount_invested: 0, shares: 10 }));
        expect(r.purchasePrice).toBeNull();
    });

    it('returns null gainLossPct when amount_invested is 0', () => {
        const r = calcInvestment(inv({ amount_invested: 0, shares: 10, current_price: 100 }));
        expect(r.gainLossPctNative).toBeNull();
        expect(r.gainLossPctILS).toBeNull();
    });

    it('treats negative shares as null', () => {
        const r = calcInvestment(inv({ shares: -5 }));
        expect(r.shares).toBe(0);
        expect(r.currentValueNative).toBeNull();
    });

    it('treats empty-string shares as null', () => {
        const r = calcInvestment(inv({ shares: '' }));
        expect(r.shares).toBe(0);
        expect(r.currentValueNative).toBeNull();
    });

    it('returns daysHeld as a non-negative integer', () => {
        const r = calcInvestment(inv({ purchase_date: '2020-01-01' }));
        expect(r.daysHeld).toBeGreaterThan(0);
        expect(Number.isInteger(r.daysHeld)).toBe(true);
    });

    it('falls back exchange_rate_at_purchase: 0 to current store rate', () => {
        store.set('exchangeRates', { ILS: 1, USD: 3.7 });
        const r = calcInvestment(inv({
            currency: 'USD',
            amount_invested: 370,
            shares: 1,
            current_price: 100,
            exchange_rate_at_purchase: 0,  // falsy → should use currentExchangeRate 3.7
        }));
        expect(r.amountInvestedNative).toBeCloseTo(100, 1); // 370 / 3.7
    });
});

// ─────────────────────────────────────────────────────────────
// computeSummary — additional branch
// ─────────────────────────────────────────────────────────────

describe('computeSummary – additional branches', () => {
    it('handles mix of priced and unpriced investments', () => {
        const investments = [
            calcInvestment(inv({ amount_invested: 1000, shares: 10, current_price: 120 })), // value 1200
            calcInvestment(inv({ amount_invested: 500, current_price: null })),              // fallback 500
        ];
        const s = computeSummary(investments);
        expect(s.totalInvested).toBe(1500);
        expect(s.totalCurrent).toBeCloseTo(1700); // 1200 + 500
        expect(s.gainLoss).toBeCloseTo(200);
        expect(s.gainLossPct).toBeCloseTo(200 / 1500);
    });
});

// ─────────────────────────────────────────────────────────────
// kidGoals
// ─────────────────────────────────────────────────────────────

describe('kidGoals', () => {
    const goals = [
        { kid: 'Alice', name: 'Bike',  target: 500 },
        { kid: 'Alice', name: 'Game',  target: 100 },
        { kid: 'Bob',   name: 'Book',  target: 50  },
    ];

    it('returns only goals for the specified kid', () => {
        const result = kidGoals(goals, 'Alice');
        expect(result).toHaveLength(2);
        result.forEach(g => expect(g.kid).toBe('Alice'));
    });

    it('returns empty array when kid has no goals', () => {
        expect(kidGoals(goals, 'Charlie')).toHaveLength(0);
    });

    it('returns empty array for empty goals list', () => {
        expect(kidGoals([], 'Alice')).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────
// aggregateByTicker
// ─────────────────────────────────────────────────────────────

describe('aggregateByTicker', () => {
    beforeEach(() => {
        store.set('exchangeRates', { ILS: 1, USD: 3.7 });
    });

    it('returns empty array for empty input', () => {
        expect(aggregateByTicker([])).toHaveLength(0);
    });

    it('consolidates two purchases of the same ticker', () => {
        const investments = [
            calcInvestment(inv({ ticker: 'AAPL', amount_invested: 1000, shares: 10, current_price: 120 })),
            calcInvestment(inv({ ticker: 'AAPL', amount_invested: 500,  shares: 5,  current_price: 120 })),
        ];
        const result = aggregateByTicker(investments);
        expect(result).toHaveLength(1);
        const agg = result[0];
        expect(agg.ticker).toBe('AAPL');
        expect(agg.purchaseCount).toBe(2);
        expect(agg.totalShares).toBe(15);
        expect(agg.totalInvested).toBe(1500);
        expect(agg.currentValueNative).toBeCloseTo(1800); // 15 × 120
        expect(agg.gainLossNative).toBeCloseTo(300);
        expect(agg.gainLossPctNative).toBeCloseTo(0.2);
        expect(agg.gainLossILS).toBeCloseTo(300);
        expect(agg.gainLossPctILS).toBeCloseTo(0.2);
    });

    it('keeps separate entries for different tickers', () => {
        const investments = [
            calcInvestment(inv({ ticker: 'AAPL', amount_invested: 1000, shares: 10, current_price: 120 })),
            calcInvestment(inv({ ticker: 'MSFT', amount_invested: 500,  shares: 5,  current_price: 80  })),
        ];
        const result = aggregateByTicker(investments);
        expect(result).toHaveLength(2);
    });

    it('groups by __name__ key when ticker is absent', () => {
        const investments = [
            calcInvestment(inv({ ticker: undefined, asset_name: 'Gold', amount_invested: 1000, shares: 1,   current_price: 1100 })),
            calcInvestment(inv({ ticker: undefined, asset_name: 'Gold', amount_invested: 500,  shares: 0.5, current_price: 1100 })),
        ];
        const result = aggregateByTicker(investments);
        expect(result).toHaveLength(1);
        expect(result[0].totalShares).toBeCloseTo(1.5);
        expect(result[0].currentValueNative).toBeCloseTo(1.5 * 1100);
    });

    it('computes weighted average cost correctly', () => {
        // 10 shares for ₪1000 + 5 shares for ₪400 = 15 shares, avgCost = 1400/15
        const investments = [
            calcInvestment(inv({ ticker: 'XYZ', amount_invested: 1000, shares: 10, current_price: 90 })),
            calcInvestment(inv({ ticker: 'XYZ', amount_invested: 400,  shares: 5,  current_price: 90 })),
        ];
        const result = aggregateByTicker(investments);
        expect(result[0].avgCostNative).toBeCloseTo(1400 / 15);
    });

    it('returns null currentValue and gain when no member has a price', () => {
        const investments = [
            calcInvestment(inv({ ticker: 'AAPL', amount_invested: 1000, shares: 10, current_price: null })),
        ];
        const result = aggregateByTicker(investments);
        expect(result[0].currentValueNative).toBeNull();
        expect(result[0].gainLossNative).toBeNull();
        expect(result[0].gainLossILS).toBeNull();
    });

    it('uses current exchange rate to convert USD group to ILS', () => {
        // ₪1000 invested at rate 3.7 → $270.27; 2 shares at current $150 → $300 → ₪1110
        const investments = [
            calcInvestment(inv({
                ticker: 'SPY',
                currency: 'USD',
                amount_invested: 1000,
                shares: 2,
                current_price: 150,
                exchange_rate_at_purchase: 3.7,
            })),
        ];
        const result = aggregateByTicker(investments);
        expect(result[0].currentValueILS).toBeCloseTo(1110);
        expect(result[0].gainLossILS).toBeCloseTo(110, 0);
    });

    it('prefers nickname over asset_name in output', () => {
        const investments = [
            calcInvestment(inv({ ticker: undefined, asset_name: 'Gold ETF', nickname: 'Gold', shares: 1, current_price: 100 })),
        ];
        const result = aggregateByTicker(investments);
        expect(result[0].asset_name).toBe('Gold');
    });
});

// ─────────────────────────────────────────────────────────────
// computeMatching
// ─────────────────────────────────────────────────────────────

describe('computeMatching', () => {
    const config = { sp500_ticker: 'SPY', matching_days: 365 };

    it('returns empty result when sp500_ticker is absent', () => {
        expect(computeMatching([], {})).toEqual({ deposits: [], matched: 0, total: 0 });
    });

    it('returns empty result when familyConfig is null', () => {
        expect(computeMatching([], null)).toEqual({ deposits: [], matched: 0, total: 0 });
    });

    it('marks deposit as eligible when daysHeld >= matching_days', () => {
        const investments = [{ ticker: 'SPY', amountInvested: 1000, daysHeld: 400 }];
        const result = computeMatching(investments, config);
        expect(result.deposits[0].eligible).toBe(true);
        expect(result.deposits[0].matchedAmount).toBe(1000);
        expect(result.deposits[0].daysRemaining).toBe(0);
        expect(result.matched).toBe(1000);
        expect(result.total).toBe(1000);
    });

    it('marks deposit as ineligible when daysHeld < matching_days', () => {
        const investments = [{ ticker: 'SPY', amountInvested: 500, daysHeld: 100 }];
        const result = computeMatching(investments, config);
        expect(result.deposits[0].eligible).toBe(false);
        expect(result.deposits[0].matchedAmount).toBe(0);
        expect(result.deposits[0].daysRemaining).toBe(265);
        expect(result.matched).toBe(0);
    });

    it('filters out non-SP500 tickers', () => {
        const investments = [
            { ticker: 'SPY',  amountInvested: 1000, daysHeld: 400 },
            { ticker: 'AAPL', amountInvested: 500,  daysHeld: 400 },
        ];
        const result = computeMatching(investments, config);
        expect(result.deposits).toHaveLength(1);
        expect(result.total).toBe(1000);
    });

    it('normalizes tickers — "XNAS:SPY" matches sp500_ticker "SPY"', () => {
        const investments = [{ ticker: 'XNAS:SPY', amountInvested: 800, daysHeld: 400 }];
        const result = computeMatching(investments, config);
        expect(result.deposits).toHaveLength(1);
        expect(result.matched).toBe(800);
    });

    it('defaults matching_days to 365 when not set in config', () => {
        const investments = [{ ticker: 'SPY', amountInvested: 1000, daysHeld: 364 }];
        const result = computeMatching(investments, { sp500_ticker: 'SPY' });
        expect(result.deposits[0].eligible).toBe(false);
        expect(result.deposits[0].daysRemaining).toBe(1);
    });

    it('sums matched and total across multiple deposits', () => {
        const investments = [
            { ticker: 'SPY', amountInvested: 1000, daysHeld: 400 }, // eligible
            { ticker: 'SPY', amountInvested: 500,  daysHeld: 200 }, // ineligible
            { ticker: 'SPY', amountInvested: 700,  daysHeld: 500 }, // eligible
        ];
        const result = computeMatching(investments, config);
        expect(result.matched).toBe(1700); // 1000 + 700
        expect(result.total).toBe(2200);   // all three
    });
});
