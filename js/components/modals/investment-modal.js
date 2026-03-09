// ============================================================
// Investment Modal — add/edit investment with ticker autocomplete,
// historical price lookup, and FX section for foreign securities.
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { toDateStr, currencySymbol } from '../../utils/format.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';

// Modal-scoped state (reset on every open)
let _historicalData = null;
let _tickerCurrency = null;
let _exchangeRateAtPurchase = null;
let _lastAutocompletedTicker = null;
let _priceDateOffset = 0;       // day offset from purchase date for price lookup
let _manualPriceMode = false;   // true when user selected the "ידני" price type

export function showInvestmentModal(kid, existing) {
    const isEdit = !!existing;
    const title = isEdit ? 'עריכת השקעה' : 'הוספת השקעה';
    const inv = existing || {};
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    _tickerCurrency = inv.currency || null;
    _exchangeRateAtPurchase = inv.exchange_rate_at_purchase || null;
    _historicalData = null;
    _lastAutocompletedTicker = inv.ticker || null;
    _priceDateOffset = 0;
    _manualPriceMode = false;

    const html = `
        <h2>${title}</h2>
        <div class="form-group ticker-autocomplete-wrap">
            <label for="inv-ticker">טיקר</label>
            <div class="ticker-input-row">
                <input type="text" id="inv-ticker" dir="ltr" placeholder="למשל: VOO" autocomplete="off" value="${esc(inv.ticker || '')}">
                <button type="button" id="ticker-search-btn">חפש</button>
            </div>
            <div id="ticker-results" class="ticker-results" hidden></div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="inv-asset">שם הנכס</label>
                <input type="text" id="inv-asset" placeholder="ימולא אוטומטית מהטיקר" value="${esc(inv.asset_name || '')}">
            </div>
            <div class="form-group">
                <label for="inv-nickname">כינוי (אופציונלי)</label>
                <input type="text" id="inv-nickname" placeholder="למשל: קרן S&amp;P" value="${esc(inv.nickname || '')}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="inv-date">תאריך רכישה</label>
                <input type="date" id="inv-date" value="${toDateStr(inv.purchase_date)}">
            </div>
            <div class="form-group">
                <label for="inv-shares">יחידות</label>
                <input type="number" id="inv-shares" step="any" min="0" value="${inv.shares || ''}">
            </div>
        </div>
        <div id="purchase-price-section" class="form-group" hidden>
            <label>מחיר רכישה ליחידה</label>
            <div class="price-date-nav" id="price-date-nav" hidden>
                <button type="button" class="btn btn-ghost btn-sm price-nav-btn" id="price-date-prev" title="יום קודם">◀</button>
                <span class="price-date-label" id="price-date-label"></span>
                <button type="button" class="btn btn-ghost btn-sm price-nav-btn" id="price-date-next" title="יום הבא">▶</button>
            </div>
            <div class="price-type-bar" id="price-type-bar">
                <button type="button" class="price-type-btn active" data-type="close">סגירה</button>
                <button type="button" class="price-type-btn" data-type="open">פתיחה</button>
                <button type="button" class="price-type-btn" data-type="high">גבוה</button>
                <button type="button" class="price-type-btn" data-type="low">נמוך</button>
                <button type="button" class="price-type-btn" data-type="average">ממוצע</button>
                <button type="button" class="price-type-btn" data-type="manual">ידני</button>
            </div>
            <div id="manual-price-input-wrap" class="manual-price-input-wrap" hidden>
                <input type="number" id="manual-price-input" class="manual-price-input" step="any" min="0" placeholder="הכנס מחיר ידני">
            </div>
            <div id="purchase-price-display" class="purchase-price-display"></div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="inv-amount">סכום שהושקע (${sym})</label>
                <input type="number" id="inv-amount" step="any" min="0" value="${inv.amount_invested || ''}">
            </div>
            <div class="form-group">
                <label for="inv-price">מחיר נוכחי ליחידה</label>
                <input type="number" id="inv-price" step="any" min="0" value="${inv.current_price != null ? inv.current_price : ''}">
                <div class="form-hint">השאר ריק אם לא ידוע</div>
            </div>
        </div>
        <div id="fx-section" class="fx-section" hidden>
            <div class="fx-section-inner">
                <div class="fx-row">
                    <span class="fx-label">שער בתאריך הרכישה (<span id="fx-pair-label">USD/ILS</span>):</span>
                    <input type="number" id="inv-exchange-rate" class="fx-rate-input" step="any" min="0" placeholder="טוען...">
                    <button type="button" id="fx-refresh-btn" class="btn btn-ghost btn-sm" title="רענן שער נוכחי">↻</button>
                </div>
                <div class="fx-row">
                    <span class="fx-label">שער נוכחי:</span>
                    <span id="fx-current-rate-display" class="fx-current-rate">—</span>
                </div>
                <div class="fx-equiv" id="fx-equiv-display"></div>
            </div>
        </div>
        <div class="modal-actions">
            ${isEdit ? '<button class="btn btn-danger" id="modal-delete" style="margin-inline-end:auto">מחק</button>' : ''}
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור</button>
        </div>
    `;

    openModal(html);

    const modal = document.getElementById('modal-content');
    setupTickerAutocomplete(modal);
    setupPurchasePriceLookup(modal);
    setupFxSection(modal);
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const assetName = modal.querySelector('#inv-asset').value.trim();
        const nickname = modal.querySelector('#inv-nickname').value.trim();
        const ticker = modal.querySelector('#inv-ticker').value.trim();
        const purchaseDate = modal.querySelector('#inv-date').value;
        const sharesRaw = modal.querySelector('#inv-shares').value;
        const amountRaw = modal.querySelector('#inv-amount').value;
        const currentPrice = modal.querySelector('#inv-price').value;
        const rateInput = modal.querySelector('#inv-exchange-rate');
        const exchangeRate = rateInput && rateInput.value
            ? parseFloat(rateInput.value)
            : (_exchangeRateAtPurchase || null);

        if (!assetName) { modal.querySelector('#inv-asset').focus(); return; }

        let finalShares = sharesRaw ? parseFloat(sharesRaw) : null;
        let finalAmount = amountRaw ? parseFloat(amountRaw) : null;

        if (!finalShares && !finalAmount) {
            modal.querySelector('#inv-amount').focus();
            return;
        }

        const currency = _tickerCurrency || 'ILS';
        const rate = exchangeRate || 1;

        if (!finalAmount && finalShares) {
            let purchasePrice = null;
            if (_manualPriceMode) {
                purchasePrice = parseFloat(modal.querySelector('#manual-price-input')?.value) || null;
            } else if (_historicalData) {
                const activeBtn = modal.querySelector('#price-type-bar .price-type-btn.active');
                const pType = activeBtn?.dataset.type || 'close';
                purchasePrice = _historicalData[pType];
            }
            if (purchasePrice > 0) {
                finalAmount = currency === 'ILS'
                    ? finalShares * purchasePrice
                    : finalShares * purchasePrice * rate;
            }
        }

        const record = {
            kid,
            asset_name: assetName,
            nickname: nickname || null,
            ticker,
            purchase_date: purchaseDate || null,
            shares: finalShares,
            amount_invested: finalAmount,
            current_price: currentPrice ? parseFloat(currentPrice) : null,
            currency,
            exchange_rate_at_purchase: exchangeRate || _exchangeRateAtPurchase || null,
        };

        try {
            const user = store.get('user');
            const { add, update } = await import('../../services/investment-service.js');
            if (isEdit) {
                await update(user.familyId, existing.id, record);
            } else {
                await add(user.familyId, record);
            }
            closeModal();
            emit('toast', { message: isEdit ? 'השקעה עודכנה' : 'השקעה נוספה', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בשמירת השקעה', type: 'error' });
        }
    });

    if (isEdit) {
        modal.querySelector('#modal-delete').addEventListener('click', () => {
            deleteInvestment(existing.id);
            closeModal();
        });
    }

    modal.querySelector('#inv-ticker').focus();

    if (isEdit && inv.currency && inv.currency !== 'ILS') {
        showFxSection(modal, inv.currency, inv.exchange_rate_at_purchase);
    }

    if (inv.ticker && inv.purchase_date) {
        triggerPurchasePriceLookup(modal, { skipRateUpdate: !!inv.exchange_rate_at_purchase });
    }
}

export async function deleteInvestment(id) {
    try {
        const user = store.get('user');
        const { remove } = await import('../../services/investment-service.js');
        await remove(user.familyId, id);
        emit('toast', { message: 'השקעה נמחקה', type: 'success' });
    } catch (e) {
        emit('toast', { message: 'שגיאה במחיקת השקעה', type: 'error' });
    }
}

// ─── Ticker autocomplete ──────────────────────────────────────

function getHistoricTickers() {
    const investments = store.get('investments') || [];
    const seen = new Set();
    const result = [];
    for (const inv of investments) {
        const sym = (inv.ticker || '').trim();
        if (!sym || seen.has(sym.toUpperCase())) continue;
        seen.add(sym.toUpperCase());
        result.push({ symbol: sym, name: inv.asset_name || inv.nickname || '', historic: true });
    }
    return result;
}

function renderResults(modal, resultsEl, items, activeIndex) {
    resultsEl.innerHTML = items.map((r, i) => `
        <div class="ticker-result-item${r.historic ? ' ticker-result-historic' : ''}" data-index="${i}" data-symbol="${esc(r.symbol)}" data-name="${esc(r.name)}">
            ${r.historic ? '<span class="ticker-historic-badge">היסטוריה</span>' : ''}
            <span class="ticker-symbol">${esc(r.symbol)}</span>
            <span class="ticker-name">${esc(r.name)}</span>
            ${r.exchange ? `<span class="ticker-exchange">${esc(r.exchange)}</span>` : ''}
        </div>
    `).join('');
    resultsEl.hidden = items.length === 0;

    resultsEl.querySelectorAll('.ticker-result-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectResult(modal, item.dataset.symbol, item.dataset.name);
            resultsEl.hidden = true;
        });
    });
    return items.length;
}

function setupTickerAutocomplete(modal) {
    const input = modal.querySelector('#inv-ticker');
    const btn = modal.querySelector('#ticker-search-btn');
    const resultsEl = modal.querySelector('#ticker-results');
    let activeIndex = -1;
    let _currentItems = [];

    function showHistoric() {
        const historic = getHistoricTickers();
        if (historic.length === 0) { resultsEl.hidden = true; return; }
        activeIndex = -1;
        _currentItems = historic;
        renderResults(modal, resultsEl, historic, activeIndex);
    }

    async function doSearch() {
        const q = input.value.trim();
        if (q.length < 1) { showHistoric(); return; }
        btn.disabled = true;

        // Instantly show filtered historic matches while API loads
        const historic = getHistoricTickers().filter(h =>
            h.symbol.toUpperCase().includes(q.toUpperCase()) ||
            h.name.toLowerCase().includes(q.toLowerCase())
        );
        if (historic.length > 0) {
            activeIndex = -1;
            _currentItems = historic;
            renderResults(modal, resultsEl, historic, activeIndex);
        }

        const { searchTickers } = await import('../../services/price-service.js');
        const apiResults = await searchTickers(q);
        btn.disabled = false;

        // Merge: historic first, then API results, dedup by symbol
        const seen = new Set(historic.map(h => h.symbol.toUpperCase()));
        const merged = [
            ...historic,
            ...apiResults.filter(r => !seen.has(r.symbol.toUpperCase())),
        ];
        if (merged.length === 0) { resultsEl.hidden = true; return; }
        activeIndex = -1;
        _currentItems = merged;
        renderResults(modal, resultsEl, merged, activeIndex);
    }

    btn.addEventListener('click', doSearch);

    input.addEventListener('focus', () => {
        if (!input.value.trim()) showHistoric();
    });

    input.addEventListener('input', doSearch);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && resultsEl.hidden) { e.preventDefault(); doSearch(); return; }
        if (resultsEl.hidden) return;
        const items = resultsEl.querySelectorAll('.ticker-result-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActive(items, activeIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActive(items, activeIndex);
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            const item = items[activeIndex];
            selectResult(modal, item.dataset.symbol, item.dataset.name);
            resultsEl.hidden = true;
        } else if (e.key === 'Escape') {
            resultsEl.hidden = true;
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(async () => {
            resultsEl.hidden = true;
            const ticker = input.value.trim();
            if (ticker && ticker.toUpperCase() !== (_lastAutocompletedTicker || '').toUpperCase()) {
                await detectTickerCurrency(modal, ticker);
            }
        }, 150);
    });
}

function updateActive(items, index) {
    items.forEach((el, i) => el.classList.toggle('active', i === index));
}

async function selectResult(modal, symbol, name) {
    modal.querySelector('#inv-ticker').value = symbol;
    modal.querySelector('#inv-asset').value = name || symbol;
    _lastAutocompletedTicker = symbol;

    const priceInput = modal.querySelector('#inv-price');
    try {
        const { validateTicker } = await import('../../services/price-service.js');
        const result = await validateTicker(symbol);
        if (result.valid) {
            if (!priceInput.value && result.price != null) priceInput.value = result.price;
            _tickerCurrency = result.currency || 'ILS';
        }
    } catch { /* ignore */ }

    if (_tickerCurrency && _tickerCurrency !== 'ILS') {
        const { fetchExchangeRate } = await import('../../services/price-service.js');
        const rate = await fetchExchangeRate(_tickerCurrency);
        if (rate) _exchangeRateAtPurchase = rate;
        showFxSection(modal, _tickerCurrency, rate);
    } else {
        hideFxSection(modal);
    }

    triggerPurchasePriceLookup(modal);
}

async function detectTickerCurrency(modal, ticker) {
    try {
        const { validateTicker, fetchExchangeRate } = await import('../../services/price-service.js');
        const result = await validateTicker(ticker);
        if (!result.valid) return;

        _tickerCurrency = result.currency || 'ILS';
        _lastAutocompletedTicker = ticker;

        const priceInput = modal.querySelector('#inv-price');
        if (priceInput && !priceInput.value && result.price != null) priceInput.value = result.price;

        if (_tickerCurrency !== 'ILS') {
            const rate = await fetchExchangeRate(_tickerCurrency);
            if (rate) _exchangeRateAtPurchase = rate;
            showFxSection(modal, _tickerCurrency, rate);
        } else {
            hideFxSection(modal);
        }
    } catch { /* ignore */ }
}

// ─── FX section ───────────────────────────────────────────────

function showFxSection(modal, currency, rate) {
    const section = modal.querySelector('#fx-section');
    if (!section) return;
    section.hidden = false;
    const pairLabel = modal.querySelector('#fx-pair-label');
    if (pairLabel) pairLabel.textContent = currency + '/ILS';
    const rateInput = modal.querySelector('#inv-exchange-rate');
    if (rateInput && rate) rateInput.value = rate;
    updateCurrentRateDisplay(modal, currency);
    updateFxEquiv(modal);
}

function updateCurrentRateDisplay(modal, currency) {
    const el = modal.querySelector('#fx-current-rate-display');
    if (!el) return;
    const exchangeRates = store.get('exchangeRates') || {};
    const currentRate = currency && currency !== 'ILS' ? (exchangeRates[currency] ?? null) : null;
    el.textContent = currentRate != null ? currentRate.toFixed(4) : '—';
}

function hideFxSection(modal) {
    const section = modal.querySelector('#fx-section');
    if (section) section.hidden = true;
}

function setupFxSection(modal) {
    const amountInput = modal.querySelector('#inv-amount');
    const rateInput = modal.querySelector('#inv-exchange-rate');
    const refreshBtn = modal.querySelector('#fx-refresh-btn');

    if (amountInput) amountInput.addEventListener('input', () => updateFxEquiv(modal));
    if (rateInput) {
        rateInput.addEventListener('input', () => {
            const rate = parseFloat(rateInput.value);
            if (rate > 0) _exchangeRateAtPurchase = rate;
            updateFxEquiv(modal);
        });
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (!_tickerCurrency || _tickerCurrency === 'ILS') return;
            refreshBtn.disabled = true;
            try {
                const { fetchExchangeRate } = await import('../../services/price-service.js');
                const rate = await fetchExchangeRate(_tickerCurrency);
                if (rate && rateInput) {
                    rateInput.value = rate;
                    _exchangeRateAtPurchase = rate;
                    updateFxEquiv(modal);
                    updateCurrentRateDisplay(modal, _tickerCurrency);
                }
            } finally {
                refreshBtn.disabled = false;
            }
        });
    }
}

function updateFxEquiv(modal) {
    const equivEl = modal.querySelector('#fx-equiv-display');
    if (!equivEl) return;
    const ilsAmount = parseFloat(modal.querySelector('#inv-amount')?.value) || 0;
    const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || 0;
    const currency = _tickerCurrency || 'ILS';
    const sym = currencySymbol(currency);
    if (ilsAmount > 0 && rate > 0) {
        const nativeAmount = ilsAmount / rate;
        equivEl.textContent = `= ${sym}${nativeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
        equivEl.textContent = '';
    }
}

// ─── Purchase price lookup ────────────────────────────────────

function setupPurchasePriceLookup(modal) {
    const dateInput = modal.querySelector('#inv-date');
    const priceBar = modal.querySelector('#price-type-bar');

    dateInput.addEventListener('change', () => {
        _priceDateOffset = 0;
        triggerPurchasePriceLookup(modal);
    });

    priceBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.price-type-btn');
        if (!btn) return;
        priceBar.querySelectorAll('.price-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.type === 'manual') {
            _manualPriceMode = true;
            modal.querySelector('#manual-price-input-wrap').hidden = false;
            showManualPriceControls(modal);
            return;
        }

        _manualPriceMode = false;
        modal.querySelector('#manual-price-input-wrap').hidden = true;
        if (_historicalData) {
            updatePurchasePriceDisplay(modal, _historicalData[btn.dataset.type], btn.dataset.type);
        }
    });

    modal.querySelector('#price-date-prev').addEventListener('click', () => {
        _priceDateOffset -= 1;
        triggerPurchasePriceLookup(modal);
    });

    modal.querySelector('#price-date-next').addEventListener('click', () => {
        _priceDateOffset += 1;
        triggerPurchasePriceLookup(modal);
    });
}

async function triggerPurchasePriceLookup(modal, options = {}) {
    const { skipRateUpdate = false } = options;
    const ticker = modal.querySelector('#inv-ticker').value.trim();
    const dateStr = modal.querySelector('#inv-date').value;
    const section = modal.querySelector('#purchase-price-section');
    const display = modal.querySelector('#purchase-price-display');
    const dateNavRow = modal.querySelector('#price-date-nav');
    const dateLabelEl = modal.querySelector('#price-date-label');

    if (!ticker || !dateStr) { section.hidden = true; _historicalData = null; return; }

    section.hidden = false;

    // In manual mode just ensure the section is visible without fetching
    if (_manualPriceMode) {
        showManualPriceControls(modal);
        return;
    }

    display.innerHTML = '<span class="price-loading">טוען מחיר...</span>';
    _historicalData = null;
    dateNavRow.hidden = true;

    // Apply day offset to base date
    const base = new Date(dateStr + 'T00:00:00');
    base.setDate(base.getDate() + _priceDateOffset);
    const effectiveDateStr = base.toISOString().slice(0, 10);
    if (dateLabelEl) dateLabelEl.textContent = effectiveDateStr;

    try {
        const { fetchHistoricalPrice, fetchHistoricalExchangeRate } = await import('../../services/price-service.js');

        const promises = [fetchHistoricalPrice(ticker, effectiveDateStr)];
        const currency = _tickerCurrency || 'ILS';
        if (currency !== 'ILS') promises.push(fetchHistoricalExchangeRate(currency, effectiveDateStr));

        const [data, historicalRate] = await Promise.all(promises);
        _historicalData = data;

        if (historicalRate && historicalRate > 0 && !skipRateUpdate) {
            _exchangeRateAtPurchase = historicalRate;
            const rateInput = modal.querySelector('#inv-exchange-rate');
            if (rateInput) { rateInput.value = historicalRate; updateFxEquiv(modal); }
        }

        // Show actual trading date that was found (may differ from effectiveDateStr due to weekend/holiday fallback)
        if (dateLabelEl && data.date) dateLabelEl.textContent = data.date;
        dateNavRow.hidden = false;

        const activeBtn = modal.querySelector('#price-type-bar .price-type-btn.active');
        const type = activeBtn?.dataset.type || 'close';
        if (type !== 'manual') updatePurchasePriceDisplay(modal, data[type], type);
    } catch {
        display.innerHTML = '<span class="price-error">לא נמצא מחיר לתאריך זה</span>';
        if (dateLabelEl) dateLabelEl.textContent = effectiveDateStr;
        dateNavRow.hidden = false;
    }
}

function updatePurchasePriceDisplay(modal, price, type) {
    const display = modal.querySelector('#purchase-price-display');
    const labels = { open: 'פתיחה', close: 'סגירה', high: 'גבוה', low: 'נמוך', average: 'ממוצע' };
    const currency = _tickerCurrency || 'ILS';
    const sym = currencySymbol(currency);

    if (price != null) {
        display.innerHTML = `
            <span class="price-value" dir="ltr">${sym}${price}</span>
            <button type="button" class="btn btn-ghost btn-sm" id="use-purchase-price">חשב יחידות</button>
            <button type="button" class="btn btn-ghost btn-sm" id="calc-amount-from-shares">חשב סכום</button>
        `;

        display.querySelector('#use-purchase-price').addEventListener('click', () => {
            const sharesInput = modal.querySelector('#inv-shares');
            const amountInput = modal.querySelector('#inv-amount');
            const ilsAmount = parseFloat(amountInput.value);
            if (!ilsAmount || ilsAmount <= 0 || !price || price <= 0) return;
            const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || _exchangeRateAtPurchase || 1;
            const units = currency === 'ILS' ? ilsAmount / price : (rate <= 0 ? 0 : (ilsAmount / rate) / price);
            if (units > 0) sharesInput.value = +units.toFixed(6);
        });

        display.querySelector('#calc-amount-from-shares').addEventListener('click', () => {
            const sharesInput = modal.querySelector('#inv-shares');
            const amountInput = modal.querySelector('#inv-amount');
            const units = parseFloat(sharesInput.value);
            if (!units || units <= 0 || !price || price <= 0) return;
            const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || _exchangeRateAtPurchase || 1;
            const ilsAmount = currency === 'ILS' ? units * price : (rate <= 0 ? 0 : units * price * rate);
            if (ilsAmount > 0) { amountInput.value = +ilsAmount.toFixed(2); updateFxEquiv(modal); }
        });
    } else {
        display.innerHTML = '<span class="price-error">אין נתון ל' + (labels[type] || type) + '</span>';
    }
}

function showManualPriceControls(modal) {
    const display = modal.querySelector('#purchase-price-display');
    const currency = _tickerCurrency || 'ILS';

    display.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="use-purchase-price">חשב יחידות</button>
        <button type="button" class="btn btn-ghost btn-sm" id="calc-amount-from-shares">חשב סכום</button>
    `;

    const getPrice = () => parseFloat(modal.querySelector('#manual-price-input')?.value) || 0;

    display.querySelector('#use-purchase-price').addEventListener('click', () => {
        const price = getPrice();
        const sharesInput = modal.querySelector('#inv-shares');
        const amountInput = modal.querySelector('#inv-amount');
        const ilsAmount = parseFloat(amountInput.value);
        if (!ilsAmount || ilsAmount <= 0 || !price || price <= 0) return;
        const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || _exchangeRateAtPurchase || 1;
        const units = currency === 'ILS' ? ilsAmount / price : (rate <= 0 ? 0 : (ilsAmount / rate) / price);
        if (units > 0) sharesInput.value = +units.toFixed(6);
    });

    display.querySelector('#calc-amount-from-shares').addEventListener('click', () => {
        const price = getPrice();
        const sharesInput = modal.querySelector('#inv-shares');
        const amountInput = modal.querySelector('#inv-amount');
        const units = parseFloat(sharesInput.value);
        if (!units || units <= 0 || !price || price <= 0) return;
        const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || _exchangeRateAtPurchase || 1;
        const ilsAmount = currency === 'ILS' ? units * price : (rate <= 0 ? 0 : units * price * rate);
        if (ilsAmount > 0) { amountInput.value = +ilsAmount.toFixed(2); updateFxEquiv(modal); }
    });
}
