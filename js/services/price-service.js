// ============================================================
// Price Service — Yahoo Finance price fetching + Firestore cache
// ============================================================

import { FIREBASE_CDN, YAHOO_CHART_URL, YAHOO_SEARCH_URL, GLOBES_PRICE_URL, GLOBES_SEARCH_URL, GLOBES_HISTORY_URL } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';
import { emit } from '../event-bus.js';

const PRICE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
let priceTimer = null;
let _waitForInvestmentsUnsub = null;
let _fetchInProgress = false;
let _fs = null;

async function fs() {
    if (!_fs) _fs = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    return _fs;
}

function ilaToIls(price, currency) {
    return currency === 'ILA' ? price / 100 : price;
}

// Returns { price, currency } where currency is normalized (ILA → ILS)
async function fetchYahooPrice(ticker) {
    const url = YAHOO_CHART_URL + '/' + encodeURIComponent(ticker) + '?interval=1d&range=1d';
    console.log('[price-service] fetchYahooPrice →', url);
    const resp = await fetch(url);
    console.log('[price-service] fetchYahooPrice ←', ticker, 'status:', resp.status);
    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        console.warn('[price-service] fetchYahooPrice error body:', body.slice(0, 300));
        throw new Error('HTTP ' + resp.status);
    }
    const json = await resp.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const rawPrice = meta?.regularMarketPrice;
    console.log('[price-service] fetchYahooPrice meta:', { ticker, rawPrice, currency: meta?.currency });
    if (rawPrice == null) throw new Error('No price data');
    const isIla = meta.currency === 'ILA';
    const currency = isIla ? 'ILS' : (meta.currency || 'ILS');
    const price = isIla ? rawPrice / 100 : rawPrice;
    return { price, currency };
}

// Israeli mutual fund price via Globes API (fallback for tickers not on Yahoo)
async function fetchGlobesPrice(symbol) {
    const url = GLOBES_PRICE_URL + '?' + new URLSearchParams({ symbol });
    console.log('[price-service] fetchGlobesPrice →', url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    console.log('[price-service] fetchGlobesPrice ←', symbol, json.price, json.currency);
    // Globes reports mutual fund NAVs in ILA (agorot), convert to ILS
    const price = json.price / 100;
    return { price, currency: 'ILS' };
}

// Try Yahoo first, fall back to Globes for Israeli funds
async function fetchPrice(ticker) {
    try {
        return await fetchYahooPrice(ticker);
    } catch (yahooErr) {
        console.log(`[price-service] Yahoo failed for ${ticker}: ${yahooErr.message}, trying Globes...`);
        try {
            return await fetchGlobesPrice(ticker);
        } catch (globesErr) {
            console.warn(`[price-service] Globes also failed for ${ticker}: ${globesErr.message}`);
            throw yahooErr; // throw original Yahoo error
        }
    }
}

// Returns ILS per 1 unit of fromCurrency (e.g. fromCurrency='USD' → ~3.7)
export async function fetchExchangeRate(fromCurrency) {
    if (!fromCurrency || fromCurrency === 'ILS') return 1;
    console.log('[price-service] fetchExchangeRate', fromCurrency);
    // Yahoo Finance: {CURRENCY}=X gives "how many CURRENCY per 1 USD"
    // So ILS=X ≈ 3.7 (ILS per USD) — more reliable than USDILS=X cross-pair
    if (fromCurrency === 'USD') {
        try {
            const { price } = await fetchYahooPrice('ILS=X');
            console.log('[price-service] USD→ILS rate:', price);
            return price;
        } catch (e) {
            console.warn('[price-service] USD→ILS failed:', e.message);
            return null;
        }
    }
    // For non-USD: try direct cross (e.g. EURILS=X), fallback via USD
    try {
        const { price } = await fetchYahooPrice(fromCurrency + 'ILS=X');
        console.log(`[price-service] ${fromCurrency}→ILS rate (direct):`, price);
        return price;
    } catch (e) {
        console.warn(`[price-service] ${fromCurrency}ILS=X failed:`, e.message, '— trying via USD');
        try {
            // Route through USD: fromCurrency/USD * USD/ILS
            const [fxToUsd, usdToIls] = await Promise.all([
                fetchYahooPrice(fromCurrency + 'USD=X').then(r => r.price),
                fetchYahooPrice('ILS=X').then(r => r.price),
            ]);
            const rate = fxToUsd * usdToIls;
            console.log(`[price-service] ${fromCurrency}→ILS rate (via USD): ${fxToUsd} * ${usdToIls} = ${rate}`);
            return rate;
        } catch (e2) {
            console.warn(`[price-service] ${fromCurrency}→ILS via USD also failed:`, e2.message);
            return null;
        }
    }
}

// Returns historical ILS per 1 unit of fromCurrency for a given date
export async function fetchHistoricalExchangeRate(fromCurrency, dateStr) {
    if (!fromCurrency || fromCurrency === 'ILS') return 1;
    const ticker = fromCurrency === 'USD' ? 'ILS=X' : fromCurrency + 'ILS=X';
    try {
        const data = await fetchHistoricalPrice(ticker, dateStr);
        return data?.close ?? data?.average ?? null;
    } catch {
        return null;
    }
}

export async function fetchPrices(silent) {
    if (_fetchInProgress) return;
    _fetchInProgress = true;
    try { await _fetchPricesInner(silent); } finally { _fetchInProgress = false; }
}

async function _fetchPricesInner(silent) {
    const investments = store.get('investments') || [];
    const tickers = [...new Set(
        investments
            .map(inv => inv.ticker ? inv.ticker.trim() : '')
            .filter(Boolean)
    )];

    if (tickers.length === 0) {
        if (!silent) emit('toast', { message: 'אין טיקרים מוגדרים להשקעות', type: 'error' });
        return;
    }

    if (!silent) emit('toast', { message: 'מעדכן מחירים מ-Yahoo Finance...' });

    const prices = new Map();
    const currencies = new Map();
    let errors = 0;

    await Promise.all(tickers.map(async (ticker) => {
        try {
            const { price, currency } = await fetchPrice(ticker);
            prices.set(ticker, price);
            currencies.set(ticker, currency);
            console.log(`[price-service] ${ticker}: ${price} ${currency}`);
        } catch (e) {
            console.warn(`[price-service] ${ticker} failed:`, e.message);
            errors++;
        }
    }));

    // Fetch current exchange rates for all unique non-ILS currencies
    // Include currencies stored on investments (not just ones whose price succeeded)
    const investmentCurrencies = (store.get('investments') || [])
        .map(inv => inv.currency)
        .filter(c => c && c !== 'ILS');
    const uniqueCurrencies = [...new Set([...currencies.values(), ...investmentCurrencies])].filter(c => c !== 'ILS');
    console.log('[price-service] fetchPrices — currencies to fetch rates for:', uniqueCurrencies);
    const prevRates = store.get('exchangeRates') || {};
    const exchangeRates = { ...prevRates, ILS: 1 };
    await Promise.all(uniqueCurrencies.map(async (currency) => {
        const rate = await fetchExchangeRate(currency);
        console.log(`[price-service] exchange rate ${currency}→ILS:`, rate);
        if (rate) exchangeRates[currency] = rate;
    }));
    console.log('[price-service] final exchangeRates:', exchangeRates);
    store.set('exchangeRates', exchangeRates);

    if (prices.size > 0) {
        const user = store.get('user');
        if (user?.familyId) {
            const { updatePrices } = await import('./investment-service.js');
            await updatePrices(user.familyId, prices, currencies);
            await savePriceCache(user.familyId, prices, currencies, exchangeRates);
        }
    }

    if (!silent) {
        const updated = prices.size;
        emit('toast', {
            message: updated > 0
                ? 'עודכנו ' + updated + ' מחירים' + (errors > 0 ? ' (' + errors + ' נכשלו)' : '')
                : 'לא עודכנו מחירים' + (errors > 0 ? ' — בדוק את הטיקרים' : ''),
            type: updated > 0 ? 'success' : 'error',
        });
    }
}

async function savePriceCache(familyId, priceMap, currencyMap, exchangeRates) {
    const { doc, setDoc } = await fs();
    const db = getAppDb();

    const pricesObj = {};
    priceMap.forEach((price, ticker) => { pricesObj[ticker] = price; });

    const currenciesObj = {};
    if (currencyMap) currencyMap.forEach((currency, ticker) => { currenciesObj[ticker] = currency; });

    await setDoc(doc(db, 'families', familyId, 'prices', 'latest'), {
        _last_update: new Date().toISOString(),
        prices: pricesObj,
        currencies: currenciesObj,
        exchangeRates: exchangeRates || { ILS: 1 },
    });

    store.set('priceLastUpdate', new Date().toISOString());
}

// Loads cached exchange rates (and last update timestamp) from Firestore on startup
export async function loadPriceCache(familyId) {
    try {
        const { doc, getDoc } = await fs();
        const db = getAppDb();
        const snap = await getDoc(doc(db, 'families', familyId, 'prices', 'latest'));
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.exchangeRates) {
            store.set('exchangeRates', { ILS: 1, ...data.exchangeRates });
        }
        if (data._last_update) {
            store.set('priceLastUpdate', data._last_update);
        }
    } catch (e) {
        console.warn('Failed to load price cache:', e);
    }
}

function _startTimer() {
    if (priceTimer) return; // Already running
    fetchPrices(true);
    priceTimer = setInterval(() => fetchPrices(true), PRICE_REFRESH_MS);
}

export function startAutoRefresh() {
    stopAutoRefresh();
    const investments = store.get('investments') || [];
    if (investments.some(inv => !!inv.ticker)) {
        _startTimer();
    } else {
        // Investments not yet loaded from Firestore — wait for them
        _waitForInvestmentsUnsub = store.subscribe('investments', (invs) => {
            if (invs?.some(inv => !!inv.ticker)) {
                _waitForInvestmentsUnsub?.();
                _waitForInvestmentsUnsub = null;
                _startTimer();
            }
        });
    }
}

export function stopAutoRefresh() {
    if (_waitForInvestmentsUnsub) {
        _waitForInvestmentsUnsub();
        _waitForInvestmentsUnsub = null;
    }
    if (priceTimer) {
        clearInterval(priceTimer);
        priceTimer = null;
    }
}

// --- Ticker search / autocomplete ---

let _searchAbort = null;

export async function searchTickers(query) {
    if (!query || query.length < 1) return [];

    if (_searchAbort) _searchAbort.abort();
    _searchAbort = new AbortController();

    try {
        // Search Yahoo and Globes in parallel
        const [yahooResults, globesResults] = await Promise.all([
            fetch(
                YAHOO_SEARCH_URL + '?' +
                new URLSearchParams({ q: query, quotesCount: '8', newsCount: '0', listsCount: '0' }),
                { signal: _searchAbort.signal }
            ).then(async resp => {
                if (!resp.ok) return [];
                const json = await resp.json();
                return (json.quotes || [])
                    .filter(q => q.symbol)
                    .map(q => ({
                        symbol: q.symbol,
                        name: q.shortname || q.longname || '',
                        exchange: q.exchDisp || q.exchange || '',
                        type: q.quoteType || '',
                    }));
            }),
            fetch(
                GLOBES_SEARCH_URL + '?' + new URLSearchParams({ q: query }),
                { signal: _searchAbort.signal }
            ).then(async resp => {
                if (!resp.ok) return [];
                const json = await resp.json();
                return (json.quotes || []).map(q => ({
                    symbol: q.symbol,
                    name: q.name || '',
                    exchange: q.exchange || 'TASE',
                    type: q.type || 'MUTUALFUND',
                    source: 'globes',
                }));
            }).catch(() => []),
        ]);

        // Merge: Globes results first (if any), then Yahoo, deduplicate by symbol
        const seen = new Set();
        const merged = [];
        for (const r of [...globesResults, ...yahooResults]) {
            if (!seen.has(r.symbol)) {
                seen.add(r.symbol);
                merged.push(r);
            }
        }
        return merged;
    } catch (e) {
        if (e.name === 'AbortError') return [];
        console.warn('Ticker search failed:', e);
        return [];
    }
}

// Returns { valid, price, currency }
export async function validateTicker(ticker) {
    try {
        const { price, currency } = await fetchPrice(ticker);
        return { valid: true, price, currency };
    } catch {
        return { valid: false, price: null, currency: null };
    }
}

// --- Historical price for a specific date ---

// Globes historical price for Israeli mutual funds
async function fetchGlobesHistoricalPrice(symbol, dateStr) {
    const url = GLOBES_HISTORY_URL + '?' + new URLSearchParams({ symbol, date: dateStr });
    console.log('[price-service] fetchGlobesHistoricalPrice →', url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    // Globes reports mutual fund NAVs in ILA (agorot), convert to ILS
    const price = json.price / 100;
    console.log('[price-service] fetchGlobesHistoricalPrice ←', symbol, price);
    return {
        open: null, close: +price.toFixed(4), high: null, low: null,
        average: +price.toFixed(4), currency: 'ILS', date: json.date || dateStr,
    };
}

export async function fetchHistoricalPrice(ticker, dateStr) {
    if (!ticker || !dateStr) return null;

    // Try Yahoo first, fall back to Globes
    try {
        return await _fetchYahooHistoricalPrice(ticker, dateStr);
    } catch (yahooErr) {
        console.log(`[price-service] Yahoo historical failed for ${ticker}: ${yahooErr.message}, trying Globes...`);
        try {
            return await fetchGlobesHistoricalPrice(ticker, dateStr);
        } catch (globesErr) {
            console.warn(`[price-service] Globes historical also failed for ${ticker}: ${globesErr.message}`);
            throw yahooErr;
        }
    }
}

async function _fetchYahooHistoricalPrice(ticker, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    // Look back 7 days (covers weekends + holidays) and 2 days forward for timezone slack.
    const period1 = Math.floor(d.getTime() / 1000) - 7 * 86400;
    const period2 = Math.floor(d.getTime() / 1000) + 2 * 86400;

    const resp = await fetch(
        YAHOO_CHART_URL + '/' + encodeURIComponent(ticker) +
        '?period1=' + period1 + '&period2=' + period2 + '&interval=1d'
    );
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();

    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const rawCurrency = result.meta?.currency;
    const isIla = rawCurrency === 'ILA';
    const currency = isIla ? 'ILS' : (rawCurrency || 'ILS');
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    const targetTs = d.getTime() / 1000;
    // Prefer the most recent trading day at or before the target date.
    // Allow 1 day of forward slack to handle timezone differences.
    let bestIdx = -1;
    let bestTs = -Infinity;
    for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        if (ts <= targetTs + 86400 && ts > bestTs) {
            bestTs = ts;
            bestIdx = i;
        }
    }

    if (bestIdx === -1) throw new Error('No price data for date');

    const open = quotes.open?.[bestIdx];
    const close = quotes.close?.[bestIdx];
    const high = quotes.high?.[bestIdx];
    const low = quotes.low?.[bestIdx];

    if (open == null && close == null) throw new Error('No price data for date');

    const norm = v => v != null ? ilaToIls(v, rawCurrency) : null;
    const avg = [open, high, low, close].filter(v => v != null).map(v => ilaToIls(v, rawCurrency));
    return {
        open:    norm(open)  != null ? +norm(open).toFixed(4)  : null,
        close:   norm(close) != null ? +norm(close).toFixed(4) : null,
        high:    norm(high)  != null ? +norm(high).toFixed(4)  : null,
        low:     norm(low)   != null ? +norm(low).toFixed(4)   : null,
        average: avg.length > 0 ? +(avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(4) : null,
        currency,
        date: new Date(timestamps[bestIdx] * 1000).toISOString().slice(0, 10),
    };
}
