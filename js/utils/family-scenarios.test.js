/**
 * Family scenario tests — realistic use-cases for the Levi family.
 *
 * These tests simulate a logged-in session by populating the store with
 * fixtures (no Firebase/network calls required).
 *
 * Family: דנה לוי (manager) + יובל, שירה, תום (kids)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../store.js';
import {
    calcInvestment,
    computeSummary,
    kidInvestments,
    kidGoals,
    aggregateByTicker,
    computeMatching,
} from './compute.js';
import {
    setupTestStore,
    testFamily,
    testInvestments,
    testGoals,
    yuvalInvestments,
    shiraInvestments,
    tomInvestments,
    testKids,
    testExchangeRates,
} from './fixtures.js';

beforeEach(() => {
    setupTestStore(store);
});

// ── Store setup ────────────────────────────────────────────────────────────────

describe('test store setup', () => {
    it('store has a logged-in manager user', () => {
        const user = store.get('user');
        expect(user.role).toBe('manager');
        expect(user.name).toBe('דנה לוי');
    });

    it('store has 4 members (1 manager + 3 kids)', () => {
        expect(store.get('members')).toHaveLength(4);
    });

    it('store has all test investments loaded', () => {
        expect(store.get('investments')).toHaveLength(testInvestments.length);
    });

    it('store has exchange rates set', () => {
        expect(store.get('exchangeRates').USD).toBe(3.7);
    });

    it('each kid can be looked up by name', () => {
        const kids = store.get('kids');
        expect(kids).toContain('יובל');
        expect(kids).toContain('שירה');
        expect(kids).toContain('תום');
    });
});

// ── Kid filtering ──────────────────────────────────────────────────────────────

describe('kidInvestments — filtering by kid name', () => {
    it('returns all יובל investments', () => {
        const result = kidInvestments(testInvestments, 'יובל');
        expect(result).toHaveLength(4);
        expect(result.every(i => i.kid === 'יובל')).toBe(true);
    });

    it('includes hidden investments by default (showHidden defaults to true)', () => {
        const result = kidInvestments(testInvestments, 'שירה');
        expect(result).toHaveLength(3); // default shows all including hidden
    });

    it('excludes hidden investments when showHidden=false', () => {
        const result = kidInvestments(testInvestments, 'שירה', false);
        expect(result).toHaveLength(2);
        expect(result.every(i => !i.hidden)).toBe(true);
    });

    it('returns תום single investment', () => {
        const result = kidInvestments(testInvestments, 'תום');
        expect(result).toHaveLength(1);
    });

    it('returns empty array for an unknown kid', () => {
        expect(kidInvestments(testInvestments, 'ילד לא קיים')).toHaveLength(0);
    });
});

// ── Goal filtering ─────────────────────────────────────────────────────────────

describe('kidGoals — filtering by kid name', () => {
    it('returns יובל goals in priority order', () => {
        const goals = kidGoals(testGoals, 'יובל');
        expect(goals).toHaveLength(2);
        expect(goals[0].goal_name).toBe('אופניים חשמליים');
        expect(goals[1].goal_name).toBe('טיול לאירופה');
    });

    it('returns שירה goals with correct targets', () => {
        const goals = kidGoals(testGoals, 'שירה');
        expect(goals).toHaveLength(2);
        expect(goals[0].target_amount).toBe(4500);
    });

    it('returns תום single goal', () => {
        const goals = kidGoals(testGoals, 'תום');
        expect(goals).toHaveLength(1);
        expect(goals[0].target_amount).toBe(400);
    });

    it('returns empty array for unknown kid', () => {
        expect(kidGoals(testGoals, 'אף אחד')).toHaveLength(0);
    });
});

// ── יובל portfolio ─────────────────────────────────────────────────────────────

describe('יובל — individual investment calculations', () => {
    it('AAPL: profitable USD investment', () => {
        const aapl = yuvalInvestments.find(i => i.ticker === 'AAPL');
        const r = calcInvestment(aapl);

        expect(r.currentValueNative).toBeCloseTo(7 * 185);           // 1295 USD
        expect(r.currentValueILS).toBeCloseTo(7 * 185 * 3.7);        // 4791.5 ILS
        expect(r.gainLossILS).toBeGreaterThan(0);
        expect(r.gainLossPctILS).toBeGreaterThan(0);
        expect(r.daysHeld).toBeGreaterThan(730);                      // held >2 years
    });

    it('TSLA: losing USD investment (bought recently)', () => {
        const tsla = yuvalInvestments.find(i => i.ticker === 'TSLA');
        const r = calcInvestment(tsla);

        expect(r.currentValueNative).toBeCloseTo(3 * 120);            // 360 USD
        expect(r.currentValueILS).toBeCloseTo(360 * 3.7);             // 1332 ILS
        expect(r.gainLossILS).toBeLessThan(0);                        // loss vs 1850 ILS paid
        expect(r.daysHeld).toBeLessThan(365);                         // <1 year
    });

    it('VOO: profitable — held between 1 and 2 years', () => {
        const voo = yuvalInvestments.find(i => i.ticker === 'VOO');
        const r = calcInvestment(voo);

        expect(r.gainLossILS).toBeGreaterThan(0);
        expect(r.daysHeld).toBeGreaterThan(365);
        expect(r.daysHeld).toBeLessThan(730);
    });
});

describe('יובל — full portfolio summary', () => {
    it('total invested equals sum of all amount_invested', () => {
        const investments = kidInvestments(testInvestments, 'יובל').map(calcInvestment);
        const summary = computeSummary(investments);
        const expected = yuvalInvestments.reduce((s, i) => s + i.amount_invested, 0);
        expect(summary.totalInvested).toBe(expected);
    });

    it('overall portfolio is in profit (AAPL + SPY gains > TSLA loss)', () => {
        const investments = kidInvestments(testInvestments, 'יובל').map(calcInvestment);
        const summary = computeSummary(investments);
        expect(summary.gainLoss).toBeGreaterThan(0);
    });
});

// ── שירה portfolio ─────────────────────────────────────────────────────────────

describe('שירה — ILS-only portfolio', () => {
    it('KESSEM ETF is profitable', () => {
        const k = shiraInvestments.find(i => i.ticker === 'KESSEM');
        const r = calcInvestment(k);
        expect(r.currentValueNative).toBe(50 * 112);   // 5600 ILS
        expect(r.gainLossNative).toBe(600);
        expect(r.gainLossPctNative).toBeCloseTo(0.12);
    });

    it('BOND5 is at a loss', () => {
        const b = shiraInvestments.find(i => i.ticker === 'BOND5');
        const r = calcInvestment(b);
        expect(r.currentValueNative).toBe(30 * 95);    // 2850 ILS
        expect(r.gainLossNative).toBe(-150);
    });

    it('portfolio net gain is +450 ILS (600 - 150) when hidden excluded', () => {
        const investments = kidInvestments(testInvestments, 'שירה', false).map(calcInvestment);
        const summary = computeSummary(investments);
        expect(summary.totalInvested).toBe(8000);
        expect(summary.gainLoss).toBe(450);
    });
});

// ── תום — beginner with no price ───────────────────────────────────────────────

describe('תום — investment without current price', () => {
    it('calcInvestment returns null value/gain when price is missing', () => {
        const r = calcInvestment(tomInvestments[0]);
        expect(r.currentValueNative).toBeNull();
        expect(r.currentValueILS).toBeNull();
        expect(r.gainLossNative).toBeNull();
        expect(r.gainLossILS).toBeNull();
        expect(r.amountInvested).toBe(500);
    });

    it('computeSummary shows invested amount with 0 gain when price missing', () => {
        const investments = kidInvestments(testInvestments, 'תום').map(calcInvestment);
        const summary = computeSummary(investments);
        expect(summary.totalInvested).toBe(500);
        expect(summary.gainLoss).toBe(0);
    });
});

// ── Ticker aggregation ─────────────────────────────────────────────────────────

describe('aggregateByTicker', () => {
    it('יובל has 4 distinct positions', () => {
        const investments = kidInvestments(testInvestments, 'יובל').map(calcInvestment);
        const agg = aggregateByTicker(investments);
        expect(agg).toHaveLength(4); // AAPL, SPY, VOO, TSLA
    });

    it('שירה has 2 distinct positions (hidden excluded)', () => {
        const investments = kidInvestments(testInvestments, 'שירה').map(calcInvestment);
        const agg = aggregateByTicker(investments);
        expect(agg).toHaveLength(2); // KESSEM, BOND5
    });

    it('merges two purchases of the same ticker for the same kid', () => {
        const doubled = [
            { ...yuvalInvestments[0], id: 'aapl-a', shares: 3, amount_invested: 1500 },
            { ...yuvalInvestments[0], id: 'aapl-b', shares: 4, amount_invested: 2000 },
        ].map(calcInvestment);
        const agg = aggregateByTicker(doubled);
        expect(agg).toHaveLength(1);
        expect(agg[0].totalShares).toBe(7);
        expect(agg[0].totalInvested).toBe(3500);
    });
});

// ── Matching / הצמדה ───────────────────────────────────────────────────────────
// computeMatching expects pre-computed investments (output of calcInvestment).

describe('computeMatching', () => {
    it('SPY held >2 years qualifies for both tiers (ratio 0.3 total)', () => {
        const computed = yuvalInvestments.map(calcInvestment);
        const { deposits } = computeMatching(computed, testFamily);
        const spy = deposits.find(d => d.ticker === 'SPY' || d.ticker?.endsWith('SPY'));
        expect(spy).toBeDefined();
        expect(spy.eligible).toBe(true);
        expect(spy.allEligible).toBe(true);
        expect(spy.matchedShares).toBeCloseTo(5 * 0.3); // 5 shares × 30%
    });

    it('VOO held >1 year qualifies for first tier only (ratio 0.1)', () => {
        const computed = yuvalInvestments.map(calcInvestment);
        const { deposits } = computeMatching(computed, testFamily);
        const voo = deposits.find(d => d.ticker === 'VOO' || d.ticker?.endsWith('VOO'));
        expect(voo).toBeDefined();
        expect(voo.eligible).toBe(true);
        expect(voo.allEligible).toBe(false);         // second tier not yet earned
        expect(voo.matchedShares).toBeCloseTo(2 * 0.1); // 2 shares × 10%
    });

    it('AAPL is not included in matching (not a matching ticker)', () => {
        const computed = yuvalInvestments.map(calcInvestment);
        const { deposits } = computeMatching(computed, testFamily);
        const aapl = deposits.find(d => d.ticker === 'AAPL');
        expect(aapl).toBeUndefined();
    });

    it('TSLA is not included in matching (not a matching ticker)', () => {
        const computed = yuvalInvestments.map(calcInvestment);
        const { deposits } = computeMatching(computed, testFamily);
        expect(deposits.find(d => d.ticker === 'TSLA')).toBeUndefined();
    });

    it('matching is 0 when matching_tickers is empty', () => {
        const computed = yuvalInvestments.map(calcInvestment);
        const result = computeMatching(computed, { ...testFamily, matching_tickers: [] });
        expect(result).toEqual({ deposits: [], matched: 0, total: 0 });
    });

    it('שירה has no matching-eligible investments (her tickers are not in matching_tickers)', () => {
        const computed = shiraInvestments.map(calcInvestment);
        const result = computeMatching(computed, testFamily);
        expect(result.deposits).toHaveLength(0);
        expect(result.matched).toBe(0);
    });
});

// ── Kid-as-user scenario ───────────────────────────────────────────────────────

describe('kid view — store set to child user', () => {
    it('store can be seeded with a kid as the logged-in user', () => {
        setupTestStore(store, { user: testKids[0] }); // יובל
        const user = store.get('user');
        expect(user.role).toBe('member');
        expect(user.name).toBe('יובל');
    });

    it('kid can still see their own investments from the store', () => {
        setupTestStore(store, { user: testKids[0] });
        const investments = store.get('investments');
        const mine = kidInvestments(investments, 'יובל');
        expect(mine.length).toBeGreaterThan(0);
    });
});
