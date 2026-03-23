// ============================================================
// Cash Modal — three manager operations:
//   showAddCashModal(kid)        — deposit ILS or USD cash
//   showConvertModal(kid)        — convert between currencies
//   showSellModal(kid, inv)      — sell a security, pocket proceeds
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { currencySymbol } from '../../utils/format.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import t from '../../i18n.js';

// ── Add Cash ─────────────────────────────────────────────────

export function showAddCashModal(kid) {
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';

    const html = `
        <h2>${t.cash.addTitle}</h2>
        <div class="form-group">
            <label>${t.cash.currencyLabel}</label>
            <div class="btn-group" id="cash-currency-group">
                <button type="button" class="btn btn-small btn-primary active" data-currency="ILS">${ilsSym} ${t.cash.ils}</button>
                <button type="button" class="btn btn-small btn-secondary" data-currency="USD">$ ${t.cash.usd}</button>
            </div>
        </div>
        <div class="form-group" id="cash-amount-group">
            <label for="cash-amount" id="cash-amount-label">${t.cash.amountLabel(ilsSym)}</label>
            <input type="number" id="cash-amount" step="any" min="0" placeholder="0">
        </div>
        <div id="cash-fx-section" hidden>
            <div class="fx-section">
                <div class="fx-section-inner">
                    <div class="fx-row">
                        <span class="fx-label">${t.cash.rateLabel}</span>
                        <input type="number" id="cash-rate" class="fx-rate-input" step="any" min="0" placeholder="${t.cash.ratePlaceholder}">
                        <button type="button" id="cash-rate-refresh" class="btn btn-ghost btn-sm" title="${t.cash.rateRefresh}">↻</button>
                    </div>
                    <div class="fx-equiv" id="cash-ils-equiv"></div>
                </div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="cash-date">${t.cash.dateLabel}</label>
                <input type="date" id="cash-date" value="${todayStr()}">
            </div>
        </div>
        <div class="form-group">
            <label for="cash-note">${t.cash.noteLabel}</label>
            <input type="text" id="cash-note" placeholder="${t.cash.notePlaceholder}">
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.cash.depositBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    let _currency = 'ILS';
    let _rate = null;

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#cash-amount').focus();

    // Currency toggle
    modal.querySelectorAll('[data-currency]').forEach(btn => {
        btn.addEventListener('click', async () => {
            _currency = btn.dataset.currency;
            modal.querySelectorAll('[data-currency]').forEach(b => {
                b.classList.toggle('active', b.dataset.currency === _currency);
                b.classList.toggle('btn-primary', b.dataset.currency === _currency);
                b.classList.toggle('btn-secondary', b.dataset.currency !== _currency);
            });
            const fxSection = modal.querySelector('#cash-fx-section');
            const amountLabel = modal.querySelector('#cash-amount-label');
            const sym = currencySymbol(_currency);
            amountLabel.textContent = t.cash.amountLabel(sym);
            if (_currency !== 'ILS') {
                fxSection.hidden = false;
                if (!_rate) await refreshRate(modal, _currency, (r) => { _rate = r; });
            } else {
                fxSection.hidden = true;
                modal.querySelector('#cash-ils-equiv').textContent = '';
            }
        });
    });

    // Rate refresh
    modal.querySelector('#cash-rate-refresh').addEventListener('click', async () => {
        await refreshRate(modal, _currency, (r) => { _rate = r; });
        updateIlsEquiv(modal, _currency);
    });

    modal.querySelector('#cash-rate').addEventListener('input', () => {
        _rate = parseFloat(modal.querySelector('#cash-rate').value) || null;
        updateIlsEquiv(modal, _currency);
    });

    modal.querySelector('#cash-amount').addEventListener('input', () => updateIlsEquiv(modal, _currency));

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const amountStr = modal.querySelector('#cash-amount').value;
        const date = modal.querySelector('#cash-date').value;
        const note = modal.querySelector('#cash-note').value.trim();

        const nativeAmount = parseFloat(amountStr);
        if (!nativeAmount || nativeAmount <= 0) {
            modal.querySelector('#cash-amount').focus();
            return;
        }

        const sym = currencySymbol(_currency);
        const assetName = _currency === 'ILS'
            ? `${t.cash.cashLabel} ${sym}`
            : `${t.cash.cashLabel} ${sym}`;

        let ilsAmount, rate;
        if (_currency === 'ILS') {
            ilsAmount = nativeAmount;
            rate = null;
        } else {
            rate = parseFloat(modal.querySelector('#cash-rate').value) || _rate || 1;
            ilsAmount = nativeAmount * rate;
        }

        const record = {
            type: 'cash',
            kid,
            asset_name: assetName,
            ticker: null,
            nickname: null,
            purchase_date: date || todayStr(),
            shares: nativeAmount,
            amount_invested: ilsAmount,
            current_price: 1,
            currency: _currency,
            exchange_rate_at_purchase: rate,
            hidden: false,
            note: note || null,
        };

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const user = store.get('user');
            const { add } = await import('../../services/investment-service.js');
            await add(user.familyId, record);
            closeModal();
            emit('toast', { message: t.cash.depositedToast, type: 'success' });
        } catch {
            btn.disabled = false;
            emit('toast', { message: t.cash.saveErrorToast, type: 'error' });
        }
    });
}

// ── Convert Currency ──────────────────────────────────────────

export function showConvertModal(kid) {
    const investments = store.get('investments') || [];
    const cashEntries = investments.filter(i => i.kid === kid && i.type === 'cash');

    const usdCash = cashEntries.filter(i => i.currency === 'USD');
    const ilsCash = cashEntries.filter(i => i.currency === 'ILS');
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';

    if (usdCash.length === 0 && ilsCash.length === 0) {
        emit('toast', { message: t.cash.noCashToConvert, type: 'error' });
        return;
    }

    // Build source options
    const buildOptions = (entries, currency) => entries.map(e =>
        `<option value="${esc(e.id)}" data-currency="${esc(currency)}" data-shares="${e.shares || 0}">
            ${esc(e.asset_name)} — ${currencySymbol(currency)}${(e.shares || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            (${new Date(e.created_at).toLocaleDateString('he-IL')})
        </option>`
    ).join('');

    const allOptions = buildOptions(usdCash, 'USD') + buildOptions(ilsCash, 'ILS');

    const html = `
        <h2>${t.cash.convertTitle}</h2>
        <div class="form-group">
            <label for="conv-source">${t.cash.convertFromLabel}</label>
            <select id="conv-source" class="form-select">${allOptions}</select>
        </div>
        <div class="form-group">
            <label for="conv-amount">${t.cash.convertAmountLabel}</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="number" id="conv-amount" step="any" min="0" style="flex:1">
                <button type="button" class="btn btn-ghost btn-sm" id="conv-all-btn">${t.cash.convertAllBtn}</button>
            </div>
        </div>
        <div class="fx-section" id="conv-rate-section">
            <div class="fx-section-inner">
                <div class="fx-row">
                    <span class="fx-label" id="conv-rate-label">${t.cash.rateLabel}</span>
                    <input type="number" id="conv-rate" class="fx-rate-input" step="any" min="0" placeholder="${t.cash.ratePlaceholder}">
                    <button type="button" id="conv-rate-refresh" class="btn btn-ghost btn-sm" title="${t.cash.rateRefresh}">↻</button>
                </div>
                <div class="fx-equiv" id="conv-result-display"></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="conv-date">${t.cash.dateLabel}</label>
                <input type="date" id="conv-date" value="${todayStr()}">
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.cash.convertBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    let _rate = null;

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

    function getSelected() {
        const sel = modal.querySelector('#conv-source');
        const opt = sel.options[sel.selectedIndex];
        return {
            id: sel.value,
            currency: opt.dataset.currency,
            shares: parseFloat(opt.dataset.shares) || 0,
        };
    }

    async function updateRateSection() {
        const { currency } = getSelected();
        const targetCurrency = currency === 'USD' ? 'ILS' : 'USD';
        const rateLabel = modal.querySelector('#conv-rate-label');
        rateLabel.textContent = `${currency}/${targetCurrency === 'ILS' ? ilsSym : '$'} ${t.cash.rateLabel}`;
        await refreshRate(modal, currency === 'USD' ? 'USD' : 'USD', (r) => { _rate = r; }, '#conv-rate');
        updateConvResult(modal, getSelected().currency, ilsSym);
    }

    modal.querySelector('#conv-source').addEventListener('change', () => updateRateSection());
    modal.querySelector('#conv-rate').addEventListener('input', () => {
        _rate = parseFloat(modal.querySelector('#conv-rate').value) || null;
        updateConvResult(modal, getSelected().currency, ilsSym);
    });
    modal.querySelector('#conv-amount').addEventListener('input', () =>
        updateConvResult(modal, getSelected().currency, ilsSym)
    );
    modal.querySelector('#conv-all-btn').addEventListener('click', () => {
        modal.querySelector('#conv-amount').value = getSelected().shares;
        updateConvResult(modal, getSelected().currency, ilsSym);
    });
    modal.querySelector('#conv-rate-refresh').addEventListener('click', async () => {
        const { currency } = getSelected();
        const fetchCurrency = currency === 'USD' ? 'USD' : 'USD';
        await refreshRate(modal, fetchCurrency, (r) => { _rate = r; }, '#conv-rate');
        updateConvResult(modal, currency, ilsSym);
    });

    updateRateSection();

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const { id: sourceId, currency: sourceCurrency, shares: maxShares } = getSelected();
        const amountStr = modal.querySelector('#conv-amount').value;
        const date = modal.querySelector('#conv-date').value;
        const rateVal = parseFloat(modal.querySelector('#conv-rate').value) || _rate;

        const convertAmount = parseFloat(amountStr);
        if (!convertAmount || convertAmount <= 0) {
            modal.querySelector('#conv-amount').focus();
            return;
        }
        if (!rateVal || rateVal <= 0) {
            modal.querySelector('#conv-rate').focus();
            return;
        }

        const targetCurrency = sourceCurrency === 'USD' ? 'ILS' : 'USD';
        const targetSym = currencySymbol(targetCurrency);
        const familySym = family.currency_symbol || '₪';

        // Compute target amount
        let targetAmount, newIlsAmount;
        if (sourceCurrency === 'USD') {
            // USD → ILS: convertAmount USD * rate = ILS
            targetAmount = convertAmount * rateVal;
            newIlsAmount = targetAmount;
        } else {
            // ILS → USD: convertAmount ILS / rate = USD
            targetAmount = convertAmount / rateVal;
            newIlsAmount = convertAmount;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const user = store.get('user');
            const { add, update, remove } = await import('../../services/investment-service.js');

            // Reduce or delete source cash
            const remaining = maxShares - convertAmount;
            const sourceEntry = investments.find(i => i.id === sourceId);
            if (remaining < 0.0001) {
                await remove(user.familyId, sourceId);
            } else {
                const remainingIls = sourceCurrency === 'ILS'
                    ? remaining
                    : remaining * (sourceEntry?.exchange_rate_at_purchase || rateVal);
                await update(user.familyId, sourceId, {
                    shares: remaining,
                    amount_invested: remainingIls,
                });
            }

            // Create target cash entry
            const targetSym2 = currencySymbol(targetCurrency);
            await add(user.familyId, {
                type: 'cash',
                kid,
                asset_name: `${t.cash.cashLabel} ${targetSym2}`,
                ticker: null,
                nickname: null,
                purchase_date: date || todayStr(),
                shares: targetAmount,
                amount_invested: newIlsAmount,
                current_price: 1,
                currency: targetCurrency,
                exchange_rate_at_purchase: targetCurrency === 'ILS' ? null : rateVal,
                hidden: false,
                note: `${t.cash.convertedFromNote} ${currencySymbol(sourceCurrency)}`,
            });

            closeModal();
            emit('toast', { message: t.cash.convertedToast, type: 'success' });
        } catch {
            btn.disabled = false;
            emit('toast', { message: t.cash.saveErrorToast, type: 'error' });
        }
    });
}

// ── Sell Security ─────────────────────────────────────────────

export function showSellModal(kid, inv) {
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';
    const nativeSym = currencySymbol(inv.currency || 'ILS');
    const isFx = (inv.currency || 'ILS') !== 'ILS';
    const maxShares = inv.shares;

    const currentPriceHint = inv.current_price != null
        ? `${nativeSym}${inv.current_price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
        : '';

    const html = `
        <h2>${t.cash.sellTitle}</h2>
        <div class="form-group">
            <div class="inv-request-asset-info">
                ${inv.ticker ? `<span class="currency-badge" dir="ltr">${esc(inv.ticker)}</span>` : ''}
                <strong>${esc(inv.asset_name || inv.nickname || inv.ticker || '')}</strong>
                ${maxShares != null ? `<span style="color:var(--color-text-secondary);font-size:0.85rem">(${t.cash.sharesHeld}: ${maxShares.toLocaleString('en-US', {maximumFractionDigits: 4})} ${t.investmentRequest.units})</span>` : ''}
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="sell-shares">${t.cash.sharesToSellLabel}</label>
                <input type="number" id="sell-shares" step="any" min="0" ${maxShares != null ? `max="${maxShares}" placeholder="${maxShares}"` : ''}>
            </div>
            <div class="form-group">
                <label for="sell-price">${t.cash.salePriceLabel} (${nativeSym})</label>
                <input type="number" id="sell-price" step="any" min="0" placeholder="${currentPriceHint}">
            </div>
        </div>
        ${isFx ? `
        <div class="form-group">
            <label for="sell-rate">${t.cash.saleRateLabel} (${inv.currency}/${ilsSym})</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="number" id="sell-rate" class="fx-rate-input" step="any" min="0" style="flex:1">
                <button type="button" id="sell-rate-refresh" class="btn btn-ghost btn-sm">↻</button>
            </div>
        </div>
        ` : ''}
        <div class="fx-equiv" id="sell-proceeds-display" style="margin-bottom:0.75rem;font-size:0.9rem"></div>
        <div class="form-row">
            <div class="form-group">
                <label for="sell-date">${t.cash.saleDateLabel}</label>
                <input type="date" id="sell-date" value="${todayStr()}">
            </div>
        </div>
        <div class="form-group settings-toggle-row">
            <label class="settings-toggle-label">
                <input type="checkbox" id="sell-add-cash" checked>
                <span>${t.cash.addProceedsLabel}</span>
            </label>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary btn-danger" id="modal-save">${t.cash.sellBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    let _rate = null;

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#sell-shares').focus();

    // Pre-fill current exchange rate for FX
    if (isFx) {
        const exchangeRates = store.get('exchangeRates') || {};
        _rate = exchangeRates[inv.currency] || inv.exchange_rate_at_purchase || null;
        if (_rate) modal.querySelector('#sell-rate').value = _rate;

        modal.querySelector('#sell-rate-refresh').addEventListener('click', async () => {
            await refreshRate(modal, inv.currency, (r) => { _rate = r; }, '#sell-rate');
            updateSellProceeds(modal, inv, ilsSym, _rate);
        });
        modal.querySelector('#sell-rate').addEventListener('input', () => {
            _rate = parseFloat(modal.querySelector('#sell-rate').value) || null;
            updateSellProceeds(modal, inv, ilsSym, _rate);
        });
    }

    // Pre-fill current price if available
    if (inv.current_price != null) {
        modal.querySelector('#sell-price').value = inv.current_price;
    }

    modal.querySelector('#sell-shares').addEventListener('input', () =>
        updateSellProceeds(modal, inv, ilsSym, _rate)
    );
    modal.querySelector('#sell-price').addEventListener('input', () =>
        updateSellProceeds(modal, inv, ilsSym, _rate)
    );

    updateSellProceeds(modal, inv, ilsSym, _rate);

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const sharesStr = modal.querySelector('#sell-shares').value;
        const priceStr = modal.querySelector('#sell-price').value;
        const date = modal.querySelector('#sell-date').value || todayStr();
        const addCash = modal.querySelector('#sell-add-cash').checked;
        const rateInput = isFx ? (parseFloat(modal.querySelector('#sell-rate').value) || _rate) : null;

        const sharesToSell = parseFloat(sharesStr);
        const salePrice = parseFloat(priceStr);

        if (!sharesToSell || sharesToSell <= 0) {
            modal.querySelector('#sell-shares').focus();
            return;
        }
        if (!salePrice || salePrice <= 0) {
            modal.querySelector('#sell-price').focus();
            return;
        }

        const proceedsNative = sharesToSell * salePrice;
        const rate = isFx ? (rateInput || 1) : 1;
        const proceedsIls = proceedsNative * rate;

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const user = store.get('user');
            const { add, update, remove } = await import('../../services/investment-service.js');

            const remaining = (maxShares || 0) - sharesToSell;
            if (remaining < 0.0001) {
                // Sold everything — delete investment
                await remove(user.familyId, inv.id);
            } else {
                // Partial sell — reduce shares proportionally
                const remainingFraction = remaining / (maxShares || 1);
                await update(user.familyId, inv.id, {
                    shares: remaining,
                    amount_invested: (inv.amount_invested || 0) * remainingFraction,
                });
            }

            if (addCash) {
                const cashCurrency = inv.currency || 'ILS';
                const cashSym = currencySymbol(cashCurrency);
                await add(user.familyId, {
                    type: 'cash',
                    kid,
                    asset_name: `${t.cash.cashLabel} ${cashSym}`,
                    ticker: null,
                    nickname: null,
                    purchase_date: date,
                    shares: proceedsNative,
                    amount_invested: proceedsIls,
                    current_price: 1,
                    currency: cashCurrency,
                    exchange_rate_at_purchase: isFx ? rate : null,
                    hidden: false,
                    note: `${t.cash.saleOf} ${inv.ticker || inv.asset_name || ''}`,
                });
            }

            closeModal();
            emit('toast', { message: t.cash.soldToast, type: 'success' });
        } catch {
            btn.disabled = false;
            emit('toast', { message: t.cash.saveErrorToast, type: 'error' });
        }
    });
}

// ── Helpers ───────────────────────────────────────────────────

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

async function refreshRate(modal, currency, onRate, rateSelector = '#cash-rate') {
    const btn = modal.querySelector(`${rateSelector.replace('input', 'button')}`) ||
                modal.querySelector('#cash-rate-refresh') ||
                modal.querySelector('#conv-rate-refresh') ||
                modal.querySelector('#sell-rate-refresh');
    if (btn) btn.disabled = true;
    try {
        const { fetchExchangeRate } = await import('../../services/price-service.js');
        const rate = await fetchExchangeRate(currency);
        if (rate) {
            const input = modal.querySelector(rateSelector);
            if (input) input.value = rate;
            onRate(rate);
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

function updateIlsEquiv(modal, currency) {
    const equiv = modal.querySelector('#cash-ils-equiv');
    if (!equiv || currency === 'ILS') return;
    const amount = parseFloat(modal.querySelector('#cash-amount').value) || 0;
    const rate = parseFloat(modal.querySelector('#cash-rate').value) || 0;
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';
    equiv.textContent = (amount > 0 && rate > 0)
        ? `= ${sym}${(amount * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        : '';
}

function updateConvResult(modal, sourceCurrency, ilsSym) {
    const display = modal.querySelector('#conv-result-display');
    if (!display) return;
    const amount = parseFloat(modal.querySelector('#conv-amount').value) || 0;
    const rate = parseFloat(modal.querySelector('#conv-rate').value) || 0;
    if (amount <= 0 || rate <= 0) { display.textContent = ''; return; }

    let result, resultSym;
    if (sourceCurrency === 'USD') {
        result = amount * rate;
        resultSym = ilsSym;
    } else {
        result = amount / rate;
        resultSym = '$';
    }
    display.textContent = `= ${resultSym}${result.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function updateSellProceeds(modal, inv, ilsSym, rate) {
    const display = modal.querySelector('#sell-proceeds-display');
    if (!display) return;
    const shares = parseFloat(modal.querySelector('#sell-shares').value) || 0;
    const price = parseFloat(modal.querySelector('#sell-price').value) || 0;
    if (shares <= 0 || price <= 0) { display.textContent = ''; return; }

    const isFx = (inv.currency || 'ILS') !== 'ILS';
    const nativeSym = currencySymbol(inv.currency || 'ILS');
    const proceedsNative = shares * price;
    const effectiveRate = isFx ? (rate || 1) : 1;
    const proceedsIls = proceedsNative * effectiveRate;

    if (isFx) {
        display.textContent = `${t.cash.proceeds}: ${nativeSym}${proceedsNative.toLocaleString('en-US', { maximumFractionDigits: 2 })} = ${ilsSym}${proceedsIls.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else {
        display.textContent = `${t.cash.proceeds}: ${ilsSym}${proceedsIls.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
}
