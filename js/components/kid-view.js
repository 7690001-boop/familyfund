// ============================================================
// Kid View — per-kid dashboard: summary + assets + goals + matching
// ============================================================

import * as store from '../store.js';
import { can } from '../permissions.js';
import { kidInvestments, kidGoals, computeSummary, computeMatching } from '../utils/compute.js';
import { esc, cellGainLossClass } from '../utils/dom-helpers.js';
import { formatCurrency, formatPct, toDateStr, currencySymbol } from '../utils/format.js';
import { emit } from '../event-bus.js';
import * as summaryCards from './summary-cards.js';
import * as assetTable from './asset-table.js';
import * as goalList from './goal-list.js';
import * as matchingSection from './matching-section.js';
import { open as openModal, close as closeModal } from './modal.js';

let _unsubs = [];
let _container = null;
let _kidName = null;

export function mount(container, kidName) {
    unmount();
    _container = container;
    _kidName = kidName;
    renderView();

    _unsubs.push(
        store.subscribe('investments', () => renderView()),
        store.subscribe('goals', () => renderView()),
        store.subscribe('exchangeRates', () => renderView()),
    );
}

export function unmount() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _container = null;
    _kidName = null;
}

function renderView() {
    if (!_container || !_kidName) return;

    const user = store.get('user');
    const family = store.get('family') || {};
    const allInvestments = (store.get('investments') || []);
    const allGoals = (store.get('goals') || []);

    const investments = kidInvestments(allInvestments, _kidName);
    const goals = kidGoals(allGoals, _kidName);
    const summary = computeSummary(investments);
    const matching = computeMatching(investments, family);

    _container.innerHTML = `
        <section class="summary-cards" data-slot="summary"></section>
        <section class="section" data-slot="assets"></section>
        <section class="section" data-slot="goals"></section>
        <section class="section" data-slot="matching"></section>
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        summary, family
    );

    assetTable.render(
        _container.querySelector('[data-slot="assets"]'),
        investments,
        {
            canEdit: can(user, 'investment:edit'),
            canAdd: can(user, 'investment:create'),
            onAdd: () => showInvestmentModal(_kidName),
            onEdit: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showInvestmentModal(_kidName, inv);
            },
            onDelete: (id) => deleteInvestment(id),
        }
    );

    goalList.render(
        _container.querySelector('[data-slot="goals"]'),
        goals, summary.totalCurrent,
        {
            canEdit: can(user, 'goal:edit', { kidName: _kidName }),
            canAdd: can(user, 'goal:create', { kidName: _kidName }),
            onAdd: () => showGoalModal(_kidName),
            onEdit: (id) => {
                const g = allGoals.find(g2 => g2.id === id);
                if (g) showGoalModal(_kidName, g);
            },
            onDelete: (id) => deleteGoal(id),
        }
    );

    matchingSection.render(
        _container.querySelector('[data-slot="matching"]'),
        matching, family
    );
}

// --- Investment modal ---

let _historicalData = null;
let _tickerCurrency = null;         // currency code of the selected ticker (e.g. 'USD')
let _exchangeRateAtPurchase = null; // ILS per 1 native unit, at purchase date
let _lastAutocompletedTicker = null; // tracks which ticker was validated via autocomplete

function showInvestmentModal(kid, existing) {
    const isEdit = !!existing;
    const title = isEdit ? 'עריכת השקעה' : 'הוספת השקעה';
    const inv = existing || {};
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    // Reset modal-scoped state
    _tickerCurrency = inv.currency || null;
    _exchangeRateAtPurchase = inv.exchange_rate_at_purchase || null;
    _historicalData = null;
    _lastAutocompletedTicker = inv.ticker || null; // pre-set so blur doesn't re-validate for edits

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
            <div class="price-type-bar" id="price-type-bar">
                <button type="button" class="price-type-btn active" data-type="close">סגירה</button>
                <button type="button" class="price-type-btn" data-type="open">פתיחה</button>
                <button type="button" class="price-type-btn" data-type="high">גבוה</button>
                <button type="button" class="price-type-btn" data-type="low">נמוך</button>
                <button type="button" class="price-type-btn" data-type="average">ממוצע</button>
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
        // Prefer the current input value over the cached rate (Fix #3)
        const exchangeRate = rateInput && rateInput.value
            ? parseFloat(rateInput.value)
            : (_exchangeRateAtPurchase || null);

        if (!assetName) { modal.querySelector('#inv-asset').focus(); return; }

        let finalShares = sharesRaw ? parseFloat(sharesRaw) : null;
        let finalAmount = amountRaw ? parseFloat(amountRaw) : null;

        // Require at least one of shares or amount
        if (!finalShares && !finalAmount) {
            modal.querySelector('#inv-amount').focus();
            return;
        }

        const currency = _tickerCurrency || 'ILS';
        const rate = exchangeRate || 1;

        // Auto-derive amount from shares × purchase price if amount is missing
        if (!finalAmount && finalShares && _historicalData) {
            const activeBtn = modal.querySelector('#price-type-bar .price-type-btn.active');
            const pType = activeBtn?.dataset.type || 'close';
            const purchasePrice = _historicalData[pType];
            if (purchasePrice > 0) {
                finalAmount = currency === 'ILS'
                    ? finalShares * purchasePrice
                    : finalShares * purchasePrice * rate;
            }
        }

        const record = {
            kid: kid,
            asset_name: assetName,
            nickname: nickname || null,
            ticker: ticker,
            purchase_date: purchaseDate || null,
            shares: finalShares,
            amount_invested: finalAmount,
            current_price: currentPrice ? parseFloat(currentPrice) : null,
            currency,
            exchange_rate_at_purchase: exchangeRate || _exchangeRateAtPurchase || null,
        };

        try {
            const user = store.get('user');
            const { add, update } = await import('../services/investment-service.js');
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

    // If editing an existing non-ILS investment, show the FX section immediately
    if (isEdit && inv.currency && inv.currency !== 'ILS') {
        showFxSection(modal, inv.currency, inv.exchange_rate_at_purchase);
    }

    // Auto-fetch historical price in edit mode so "calculate units/amount" buttons are visible.
    // In edit mode the date field is pre-filled but never fires a 'change' event, so we trigger manually.
    // skipRateUpdate=true when a rate is already stored so we don't overwrite it.
    if (inv.ticker && inv.purchase_date) {
        triggerPurchasePriceLookup(modal, { skipRateUpdate: !!inv.exchange_rate_at_purchase });
    }
}

// --- Ticker autocomplete ---
function setupTickerAutocomplete(modal) {
    const input = modal.querySelector('#inv-ticker');
    const btn = modal.querySelector('#ticker-search-btn');
    const resultsEl = modal.querySelector('#ticker-results');
    let activeIndex = -1;

    async function doSearch() {
        const q = input.value.trim();
        if (q.length < 1) {
            resultsEl.hidden = true;
            return;
        }
        btn.disabled = true;
        const { searchTickers } = await import('../services/price-service.js');
        const results = await searchTickers(q);
        btn.disabled = false;
        if (results.length === 0) {
            resultsEl.hidden = true;
            return;
        }
        activeIndex = -1;
        resultsEl.innerHTML = results.map((r, i) => `
            <div class="ticker-result-item" data-index="${i}" data-symbol="${esc(r.symbol)}" data-name="${esc(r.name)}">
                <span class="ticker-symbol">${esc(r.symbol)}</span>
                <span class="ticker-name">${esc(r.name)}</span>
                <span class="ticker-exchange">${esc(r.exchange)}</span>
            </div>
        `).join('');
        resultsEl.hidden = false;

        resultsEl.querySelectorAll('.ticker-result-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectResult(modal, item.dataset.symbol, item.dataset.name);
                resultsEl.hidden = true;
            });
        });
    }

    btn.addEventListener('click', doSearch);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && resultsEl.hidden) {
            e.preventDefault();
            doSearch();
            return;
        }
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
            // If ticker was typed manually (not via autocomplete), detect its currency now
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
    _lastAutocompletedTicker = symbol; // mark as validated via autocomplete

    // Fetch current price and detect currency
    const priceInput = modal.querySelector('#inv-price');
    try {
        const { validateTicker } = await import('../services/price-service.js');
        const result = await validateTicker(symbol);
        if (result.valid) {
            if (!priceInput.value && result.price != null) {
                priceInput.value = result.price;
            }
            _tickerCurrency = result.currency || 'ILS';
        }
    } catch { /* ignore */ }

    // Show / hide the FX section based on currency
    if (_tickerCurrency && _tickerCurrency !== 'ILS') {
        const { fetchExchangeRate } = await import('../services/price-service.js');
        const rate = await fetchExchangeRate(_tickerCurrency);
        if (rate) _exchangeRateAtPurchase = rate;
        showFxSection(modal, _tickerCurrency, rate);
    } else {
        hideFxSection(modal);
    }

    triggerPurchasePriceLookup(modal);
}

// Validates a manually typed ticker and sets currency / FX section accordingly
async function detectTickerCurrency(modal, ticker) {
    try {
        const { validateTicker, fetchExchangeRate } = await import('../services/price-service.js');
        const result = await validateTicker(ticker);
        if (!result.valid) return;

        _tickerCurrency = result.currency || 'ILS';
        _lastAutocompletedTicker = ticker;

        // Fill current price if empty
        const priceInput = modal.querySelector('#inv-price');
        if (priceInput && !priceInput.value && result.price != null) {
            priceInput.value = result.price;
        }

        if (_tickerCurrency !== 'ILS') {
            const rate = await fetchExchangeRate(_tickerCurrency);
            if (rate) _exchangeRateAtPurchase = rate;
            showFxSection(modal, _tickerCurrency, rate);
        } else {
            hideFxSection(modal);
        }
    } catch { /* ignore */ }
}

// --- FX section (ILS → native conversion) ---

function showFxSection(modal, currency, rate) {
    const section = modal.querySelector('#fx-section');
    if (!section) return;
    section.hidden = false;

    const pairLabel = modal.querySelector('#fx-pair-label');
    if (pairLabel) pairLabel.textContent = currency + '/ILS';

    const rateInput = modal.querySelector('#inv-exchange-rate');
    if (rateInput && rate) rateInput.value = rate;

    // Show current live exchange rate (from store) for comparison
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

    if (amountInput) {
        amountInput.addEventListener('input', () => updateFxEquiv(modal));
    }
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
                const { fetchExchangeRate } = await import('../services/price-service.js');
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

// --- Purchase price lookup by date ---

function setupPurchasePriceLookup(modal) {
    const dateInput = modal.querySelector('#inv-date');
    const priceBar = modal.querySelector('#price-type-bar');

    dateInput.addEventListener('change', () => triggerPurchasePriceLookup(modal));

    priceBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.price-type-btn');
        if (!btn || !_historicalData) return;

        priceBar.querySelectorAll('.price-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const type = btn.dataset.type;
        const price = _historicalData[type];
        updatePurchasePriceDisplay(modal, price, type);
    });
}

async function triggerPurchasePriceLookup(modal, options = {}) {
    const { skipRateUpdate = false } = options;
    const ticker = modal.querySelector('#inv-ticker').value.trim();
    const dateStr = modal.querySelector('#inv-date').value;
    const section = modal.querySelector('#purchase-price-section');
    const display = modal.querySelector('#purchase-price-display');

    if (!ticker || !dateStr) {
        section.hidden = true;
        _historicalData = null;
        return;
    }

    section.hidden = false;
    display.innerHTML = '<span class="price-loading">טוען מחיר...</span>';
    _historicalData = null;

    try {
        const { fetchHistoricalPrice, fetchHistoricalExchangeRate } = await import('../services/price-service.js');

        // Fetch both historical price and (if needed) historical exchange rate in parallel
        const promises = [fetchHistoricalPrice(ticker, dateStr)];
        const currency = _tickerCurrency || 'ILS';
        if (currency !== 'ILS') {
            promises.push(fetchHistoricalExchangeRate(currency, dateStr));
        }

        const [data, historicalRate] = await Promise.all(promises);
        _historicalData = data;

        // Use historical rate if available. In edit mode with a stored rate,
        // skipRateUpdate=true so we don't overwrite the original exchange_rate_at_purchase.
        if (historicalRate && historicalRate > 0 && !skipRateUpdate) {
            _exchangeRateAtPurchase = historicalRate;
            const rateInput = modal.querySelector('#inv-exchange-rate');
            if (rateInput) {
                rateInput.value = historicalRate;
                updateFxEquiv(modal);
            }
        }

        const activeBtn = modal.querySelector('#price-type-bar .price-type-btn.active');
        const type = activeBtn?.dataset.type || 'close';
        updatePurchasePriceDisplay(modal, data[type], type);
    } catch {
        display.innerHTML = '<span class="price-error">לא נמצא מחיר לתאריך זה</span>';
    }
}

function updatePurchasePriceDisplay(modal, price, type) {
    const display = modal.querySelector('#purchase-price-display');
    const labels = { open: 'פתיחה', close: 'סגירה', high: 'גבוה', low: 'נמוך', average: 'ממוצע' };
    const currency = _tickerCurrency || 'ILS';
    const sym = currencySymbol(currency);

    if (price != null) {
        const priceDisplay = `${sym}${price}`;
        display.innerHTML = `
            <span class="price-value" dir="ltr">${priceDisplay}</span>
            <button type="button" class="btn btn-ghost btn-sm" id="use-purchase-price">חשב יחידות</button>
            <button type="button" class="btn btn-ghost btn-sm" id="calc-amount-from-shares">חשב סכום</button>
        `;

        // "Calculate units" from ILS amount
        display.querySelector('#use-purchase-price').addEventListener('click', () => {
            const sharesInput = modal.querySelector('#inv-shares');
            const amountInput = modal.querySelector('#inv-amount');
            const ilsAmount = parseFloat(amountInput.value);

            if (!ilsAmount || ilsAmount <= 0 || !price || price <= 0) return;

            // Fix #3: prefer live input value over cached rate
            const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || _exchangeRateAtPurchase || 1;

            let units;
            if (currency === 'ILS') {
                units = ilsAmount / price;
            } else {
                if (rate <= 0) return;
                units = (ilsAmount / rate) / price;
            }
            sharesInput.value = +units.toFixed(6);
        });

        // "Calculate ILS amount" from units
        display.querySelector('#calc-amount-from-shares').addEventListener('click', () => {
            const sharesInput = modal.querySelector('#inv-shares');
            const amountInput = modal.querySelector('#inv-amount');
            const units = parseFloat(sharesInput.value);

            if (!units || units <= 0 || !price || price <= 0) return;

            const rate = parseFloat(modal.querySelector('#inv-exchange-rate')?.value) || _exchangeRateAtPurchase || 1;

            let ilsAmount;
            if (currency === 'ILS') {
                ilsAmount = units * price;
            } else {
                if (rate <= 0) return;
                ilsAmount = units * price * rate;
            }
            amountInput.value = +ilsAmount.toFixed(2);
            updateFxEquiv(modal);
        });
    } else {
        display.innerHTML = '<span class="price-error">אין נתון ל' + (labels[type] || type) + '</span>';
    }
}

async function deleteInvestment(id) {
    try {
        const user = store.get('user');
        const { remove } = await import('../services/investment-service.js');
        await remove(user.familyId, id);
        emit('toast', { message: 'השקעה נמחקה', type: 'success' });
    } catch (e) {
        emit('toast', { message: 'שגיאה במחיקת השקעה', type: 'error' });
    }
}

// --- Goal modal ---
function showGoalModal(kid, existing) {
    const isEdit = !!existing;
    const title = isEdit ? 'עריכת יעד' : 'הוספת יעד';
    const g = existing || {};
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';
    const user = store.get('user');

    const html = `
        <h2>${title}</h2>
        <div class="form-group">
            <label for="goal-name">שם היעד</label>
            <input type="text" id="goal-name" placeholder="למשל: אופניים חדשים" value="${esc(g.goal_name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="goal-target">סכום יעד (${sym})</label>
                <input type="number" id="goal-target" step="any" min="0" value="${g.target_amount || ''}">
            </div>
            <div class="form-group">
                <label for="goal-deadline">תאריך יעד (אופציונלי)</label>
                <input type="date" id="goal-deadline" value="${toDateStr(g.deadline)}">
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
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const goalName = modal.querySelector('#goal-name').value.trim();
        const targetAmount = modal.querySelector('#goal-target').value;
        const deadline = modal.querySelector('#goal-deadline').value;

        if (!goalName) { modal.querySelector('#goal-name').focus(); return; }
        if (!targetAmount) { modal.querySelector('#goal-target').focus(); return; }

        const record = {
            kid: kid,
            kid_uid: user.uid,
            goal_name: goalName,
            target_amount: parseFloat(targetAmount),
            deadline: deadline || null,
        };

        try {
            const { add, update } = await import('../services/goal-service.js');
            if (isEdit) {
                await update(user.familyId, existing.id, record);
            } else {
                await add(user.familyId, record);
            }
            closeModal();
            emit('toast', { message: isEdit ? 'יעד עודכן' : 'יעד נוסף', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בשמירת יעד', type: 'error' });
        }
    });

    if (isEdit) {
        modal.querySelector('#modal-delete').addEventListener('click', () => {
            deleteGoal(existing.id);
            closeModal();
        });
    }

    modal.querySelector('#goal-name').focus();
}

async function deleteGoal(id) {
    try {
        const user = store.get('user');
        const { remove } = await import('../services/goal-service.js');
        await remove(user.familyId, id);
        emit('toast', { message: 'יעד נמחק', type: 'success' });
    } catch (e) {
        emit('toast', { message: 'שגיאה במחיקת יעד', type: 'error' });
    }
}
