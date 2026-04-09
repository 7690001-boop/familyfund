/**
 * Test fixtures — complete mock family scenario for use in vitest tests.
 *
 * Usage:
 *   import { setupTestStore, testInvestments, ... } from './fixtures.js';
 *   beforeEach(() => setupTestStore(store));
 */

// ── IDs ────────────────────────────────────────────────────────────────────────
export const FAMILY_ID   = 'test-family-levi';
export const MANAGER_UID = 'uid-dana';
export const YUVAL_UID   = 'uid-yuval';
export const SHIRA_UID   = 'uid-shira';
export const TOM_UID     = 'uid-tom';

// ── Family config ──────────────────────────────────────────────────────────────
// matching_tickers + matching_tiers (new format); also includes legacy fields for compat tests
export const testFamily = {
    id: FAMILY_ID,
    name: 'משפחת לוי',
    managerUid: MANAGER_UID,
    matching_tickers: ['SPY', 'VOO'],
    matching_tiers: [
        { days: 365, ratio: 0.10 },   // 10% bonus shares after 1 year
        { days: 730, ratio: 0.20 },   // additional 20% after 2 years
    ],
    matching_retroactive: true,
};

// ── Members ────────────────────────────────────────────────────────────────────
export const testManager = {
    uid: MANAGER_UID,
    name: 'דנה לוי',
    email: 'dana@test.example',
    role: 'manager',
    familyId: FAMILY_ID,
    displayName: 'דנה לוי',
};

export const testKids = [
    { uid: YUVAL_UID, name: 'יובל', username: 'yuval', role: 'member', familyId: FAMILY_ID },
    { uid: SHIRA_UID, name: 'שירה', username: 'shira', role: 'member', familyId: FAMILY_ID },
    { uid: TOM_UID,   name: 'תום',  username: 'tom',   role: 'member', familyId: FAMILY_ID },
];

export const testMembers = [testManager, ...testKids];

// ── Exchange rates ─────────────────────────────────────────────────────────────
export const testExchangeRates = { ILS: 1, USD: 3.7 };

// ── Investments ────────────────────────────────────────────────────────────────
// purchase_date values:
//   '2020-01-01'  → >2 years held (qualifies for both matching tiers)
//   '2024-01-01'  → >1 year held  (qualifies for first tier only)
//   '2026-01-01'  → <1 year held  (no matching yet)
//
// יובל: mix of USD stocks + ILS ETF, long-held and new

export const yuvalInvestments = [
    {
        id: 'inv-yuval-aapl',
        kid: 'יובל',
        ticker: 'AAPL',
        asset_name: 'Apple Inc.',
        currency: 'USD',
        amount_invested: 3700,         // 1000 USD at rate 3.7
        shares: 7,
        current_price: 185,            // 7 × 185 = 1295 USD → 4791.5 ILS (profit)
        purchase_date: '2020-01-01',   // >2 years — not a matching ticker
        exchange_rate_at_purchase: 3.7,
        hidden: false,
    },
    {
        id: 'inv-yuval-spy',
        kid: 'יובל',
        ticker: 'SPY',
        asset_name: 'SPDR S&P 500 ETF',
        currency: 'USD',
        amount_invested: 3700,         // 1000 USD at rate 3.7
        shares: 5,
        current_price: 500,            // 5 × 500 = 2500 USD → 9250 ILS (big profit)
        purchase_date: '2020-01-01',   // >2 years → eligible for both tiers
        exchange_rate_at_purchase: 3.7,
        hidden: false,
    },
    {
        id: 'inv-yuval-voo',
        kid: 'יובל',
        ticker: 'VOO',
        asset_name: 'Vanguard S&P 500 ETF',
        currency: 'USD',
        amount_invested: 1850,         // 500 USD at rate 3.7
        shares: 2,
        current_price: 450,            // 2 × 450 = 900 USD → 3330 ILS (profit)
        purchase_date: '2024-06-01',   // >1 year → eligible for first tier only
        exchange_rate_at_purchase: 3.7,
        hidden: false,
    },
    {
        id: 'inv-yuval-tsla',
        kid: 'יובל',
        ticker: 'TSLA',
        asset_name: 'Tesla Inc.',
        currency: 'USD',
        amount_invested: 1850,         // 500 USD at rate 3.7
        shares: 3,
        current_price: 120,            // 3 × 120 = 360 USD → 1332 ILS (loss)
        purchase_date: '2026-01-01',   // <1 year → no matching
        exchange_rate_at_purchase: 3.7,
        hidden: false,
    },
];

// שירה: ILS-only ETF portfolio, long-held and medium-held
export const shiraInvestments = [
    {
        id: 'inv-shira-kessem',
        kid: 'שירה',
        ticker: 'KESSEM',
        asset_name: 'קסם S&P 500',
        currency: 'ILS',
        amount_invested: 5000,
        shares: 50,
        current_price: 112,            // 50 × 112 = 5600 ILS (profit +600)
        purchase_date: '2023-01-01',   // >2 years — not a matching ticker
        hidden: false,
    },
    {
        id: 'inv-shira-bond',
        kid: 'שירה',
        ticker: 'BOND5',
        asset_name: 'אג״ח ממשלתי 5 שנה',
        currency: 'ILS',
        amount_invested: 3000,
        shares: 30,
        current_price: 95,             // 30 × 95 = 2850 ILS (loss -150)
        purchase_date: '2025-01-01',   // >1 year — not a matching ticker
        hidden: false,
    },
    {
        id: 'inv-shira-hidden',
        kid: 'שירה',
        ticker: 'BOND5',
        asset_name: 'אג״ח ממשלתי 5 שנה',
        currency: 'ILS',
        amount_invested: 1000,
        shares: 10,
        current_price: 95,
        purchase_date: '2025-03-01',
        hidden: true,                  // שירה marked this as private
    },
];

// תום: beginner — one asset with no current price yet
export const tomInvestments = [
    {
        id: 'inv-tom-1',
        kid: 'תום',
        ticker: null,
        asset_name: 'קופת גמל להשקעה',
        currency: 'ILS',
        amount_invested: 500,
        shares: 5,
        current_price: null,           // price not yet loaded
        purchase_date: '2026-03-01',
        hidden: false,
    },
];

export const testInvestments = [...yuvalInvestments, ...shiraInvestments, ...tomInvestments];

// ── Goals ──────────────────────────────────────────────────────────────────────
export const testGoals = [
    { id: 'goal-yuval-1', kid: 'יובל', goal_name: 'אופניים חשמליים', target_amount: 3000, priority: 1 },
    { id: 'goal-yuval-2', kid: 'יובל', goal_name: 'טיול לאירופה',    target_amount: 8000, priority: 2 },
    { id: 'goal-shira-1', kid: 'שירה', goal_name: 'מחשב נייד',        target_amount: 4500, priority: 1 },
    { id: 'goal-shira-2', kid: 'שירה', goal_name: 'קורס ציור',        target_amount: 800,  priority: 2 },
    { id: 'goal-tom-1',   kid: 'תום',  goal_name: 'לגו סדרה גדולה',  target_amount: 400,  priority: 1 },
];

// ── Store setup helper ─────────────────────────────────────────────────────────
/**
 * Populates the store with the full test family scenario — bypasses Firebase.
 * Call this in beforeEach() to simulate a logged-in manager session.
 *
 * @param {object} store           - the reactive store module
 * @param {object} [opts]
 * @param {object} [opts.user]        - override current user (default: manager)
 * @param {Array}  [opts.investments] - override investments list
 * @param {Array}  [opts.goals]       - override goals list
 * @param {object} [opts.family]      - override family config
 */
export function setupTestStore(store, opts = {}) {
    store.set('user', opts.user ?? testManager);
    store.set('family', opts.family ?? testFamily);
    store.set('members', testMembers);
    store.set('kids', testKids.map(k => k.name));
    store.set('investments', opts.investments ?? testInvestments);
    store.set('goals', opts.goals ?? testGoals);
    store.set('exchangeRates', testExchangeRates);
}
