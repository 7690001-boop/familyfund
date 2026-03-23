// ============================================================
// Settlement Modal — manager executes a pending buy/sell request.
// For buy: confirms price/shares, selects funding source, creates investment.
// For sell: confirms sale price/shares, selects proceeds destination, reduces investment.
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { currencySymbol } from '../../utils/format.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import t from '../../i18n.js';

// ── Settle Buy ────────────────────────────────────────────────

export function showSettleBuyModal(request) {
    const allInvestments = store.get('investments') || [];
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';
    const exchangeRates = store.get('exchangeRates') || {};

    // Determine native currency from existing investments with same ticker (best guess)
    const existing = request.ticker
        ? allInvestments.find(i => i.ticker === request.ticker && i.current_price != null)
        : null;
    const nativeCurrency = existing?.currency || 'ILS';
    const nativeSym = currencySymbol(nativeCurrency);
    const isFx = nativeCurrency !== 'ILS';

    // Kid's cash holdings
    const kidCash = allInvestments.filter(i => i.kid === request.kid && i.type === 'cash');
    const ilsCashEntries = kidCash.filter(i => i.currency === 'ILS');
    const usdCashEntries = kidCash.filter(i => i.currency === 'USD');
    const totalIls = ilsCashEntries.reduce((s, i) => s + (i.shares || 0), 0);
    const totalUsd = usdCashEntries.reduce((s, i) => s + (i.shares || 0), 0);

    // Pre-fill price from existing investment with same ticker
    const prefilledPrice = existing?.current_price ?? '';

    // Build funding radio buttons — pre-select from kid's preference
    const kidPref = request.funding_source || 'parent';
    const r = (val, label, disabled = false) => `
        <label class="radio-option${disabled ? ' radio-disabled' : ''}">
            <input type="radio" name="funding" value="${val}" ${kidPref === val && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>${label}</span>
        </label>`;

    const fundingHtml =
        r('parent', t.settlement.fundingParent, false) +
        (totalIls > 0 ? r('cash_ILS', `${t.settlement.fundingCashIls} (${ilsSym}${totalIls.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${t.settlement.available})`) : '') +
        (totalUsd > 0 ? r('cash_USD', `${t.settlement.fundingCashUsd} ($${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.settlement.available})`) : '');

    const html = `
        <h2>${t.settlement.buyTitle}</h2>
        <div class="form-group">
            <div class="inv-request-asset-info">
                ${request.ticker ? `<span class="currency-badge" dir="ltr">${esc(request.ticker)}</span>` : ''}
                <strong>${esc(request.asset_name || request.ticker || '')}</strong>
            </div>
            <div class="req-details" style="margin-top:0.35rem;font-size:0.82rem;color:var(--color-text-secondary)">
                ${t.settlement.kidRequested}:
                ${request.shares != null ? `${request.shares.toLocaleString()} ${t.investmentRequest.units}` : ''}
                ${request.amount_ils != null ? `${ilsSym}${request.amount_ils.toLocaleString()}` : ''}
                ${request.note ? `· <em>${esc(request.note)}</em>` : ''}
                ${request.funding_source && request.funding_source !== 'parent'
                    ? `· ${t.settlement.kidWantsCash(request.funding_source === 'cash_ILS' ? ilsSym : '$')}`
                    : ''}
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="settle-price">${t.settlement.buyPriceLabel} (${nativeSym})</label>
                <input type="number" id="settle-price" step="any" min="0" value="${prefilledPrice}">
            </div>
            <div class="form-group">
                <label for="settle-shares">${t.investment.sharesLabel}</label>
                <input type="number" id="settle-shares" step="any" min="0" value="${request.shares || ''}">
            </div>
        </div>
        ${isFx ? `
        <div class="form-group">
            <label for="settle-rate">${t.cash.saleRateLabel} (${nativeCurrency}/${ilsSym})</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="number" id="settle-rate" class="fx-rate-input" step="any" min="0"
                    value="${exchangeRates[nativeCurrency] || ''}" style="flex:1">
                <button type="button" id="settle-rate-refresh" class="btn btn-ghost btn-sm">↻</button>
            </div>
        </div>
        ` : ''}
        <div class="fx-equiv" id="settle-total-display" style="margin-bottom:0.75rem"></div>
        <div class="form-row">
            <div class="form-group">
                <label for="settle-date">${t.cash.dateLabel}</label>
                <input type="date" id="settle-date" value="${todayStr()}">
            </div>
        </div>
        <div class="form-group">
            <label>${t.settlement.fundingLabel}</label>
            <div class="radio-group">${fundingHtml}</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.settlement.executeBuyBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    let _rate = isFx ? (exchangeRates[nativeCurrency] || null) : null;

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#settle-shares').focus();

    if (isFx) {
        modal.querySelector('#settle-rate').addEventListener('input', () => {
            _rate = parseFloat(modal.querySelector('#settle-rate').value) || null;
            updateBuyTotal();
        });
        modal.querySelector('#settle-rate-refresh').addEventListener('click', async () => {
            const { fetchExchangeRate } = await import('../../services/price-service.js');
            const rate = await fetchExchangeRate(nativeCurrency);
            if (rate) { _rate = rate; modal.querySelector('#settle-rate').value = rate; updateBuyTotal(); }
        });
    }

    function updateBuyTotal() {
        const price = parseFloat(modal.querySelector('#settle-price').value) || 0;
        const shares = parseFloat(modal.querySelector('#settle-shares').value) || 0;
        const display = modal.querySelector('#settle-total-display');
        if (price <= 0 || shares <= 0) { display.textContent = ''; return; }
        const nativeTotal = price * shares;
        const rate = _rate || 1;
        const ilsTotal = isFx ? nativeTotal * rate : nativeTotal;
        display.textContent = isFx
            ? `${t.settlement.total}: ${nativeSym}${nativeTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} = ${ilsSym}${ilsTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : `${t.settlement.total}: ${ilsSym}${ilsTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }

    modal.querySelector('#settle-price').addEventListener('input', updateBuyTotal);
    modal.querySelector('#settle-shares').addEventListener('input', updateBuyTotal);
    updateBuyTotal();

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const price = parseFloat(modal.querySelector('#settle-price').value);
        const shares = parseFloat(modal.querySelector('#settle-shares').value);
        const date = modal.querySelector('#settle-date').value || todayStr();
        const funding = modal.querySelector('input[name="funding"]:checked')?.value || 'parent';
        const rate = isFx ? (_rate || parseFloat(modal.querySelector('#settle-rate').value) || 1) : 1;

        if (!price || price <= 0) { modal.querySelector('#settle-price').focus(); return; }
        if (!shares || shares <= 0) { modal.querySelector('#settle-shares').focus(); return; }

        const ilsTotal = price * shares * rate;

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const user = store.get('user');
            const { add, update, remove } = await import('../../services/investment-service.js');
            const { approve } = await import('../../services/investment-request-service.js');

            // 1. Create investment
            await add(user.familyId, {
                kid: request.kid,
                asset_name: request.asset_name || request.ticker,
                ticker: request.ticker || null,
                nickname: null,
                purchase_date: date,
                shares,
                amount_invested: ilsTotal,
                current_price: price,
                currency: nativeCurrency,
                exchange_rate_at_purchase: isFx ? rate : null,
                hidden: false,
            });

            // 2. Deduct cash if chosen
            if (funding === 'cash_ILS' && ilsCashEntries.length > 0) {
                await deductCash(user.familyId, ilsCashEntries, ilsTotal, { update, remove });
            } else if (funding === 'cash_USD' && usdCashEntries.length > 0) {
                const usdAmount = isFx ? price * shares : ilsTotal / (exchangeRates['USD'] || 1);
                await deductCash(user.familyId, usdCashEntries, usdAmount, { update, remove });
            }

            // 3. Mark request as approved
            await approve(user.familyId, request.id);

            closeModal();
            emit('toast', { message: t.settlement.buyExecutedToast, type: 'success' });
        } catch (e) {
            console.error('Settle buy error:', e);
            btn.disabled = false;
            emit('toast', { message: t.settlement.errorToast, type: 'error' });
        }
    });
}

// ── Settle Sell ───────────────────────────────────────────────

export function showSettleSellModal(request) {
    const allInvestments = store.get('investments') || [];
    const inv = request.investment_id
        ? allInvestments.find(i => i.id === request.investment_id)
        : allInvestments.find(i => i.kid === request.kid && i.ticker === request.ticker && i.type !== 'cash');

    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';
    const exchangeRates = store.get('exchangeRates') || {};

    if (!inv) {
        emit('toast', { message: t.settlement.investmentNotFound, type: 'error' });
        return;
    }

    const maxShares = inv.shares;
    const currency = inv.currency || 'ILS';
    const nativeSym = currencySymbol(currency);
    const isFx = currency !== 'ILS';
    const currentRate = isFx ? (exchangeRates[currency] || inv.exchange_rate_at_purchase || 1) : 1;

    // Kid's preferred proceeds currency (from request)
    const kidPref = request.proceeds_currency || null;

    const r = (val, label, presel) => `
        <label class="radio-option">
            <input type="radio" name="proceeds" value="${val}" ${presel ? 'checked' : ''}>
            <span>${label}</span>
        </label>`;

    const proceedsHtml =
        r('none', t.settlement.proceedsNone, !kidPref) +
        r('ILS', t.settlement.proceedsCashIls, kidPref === 'ILS') +
        r('USD', t.settlement.proceedsCashUsd, kidPref === 'USD');

    const html = `
        <h2>${t.settlement.sellTitle}</h2>
        <div class="form-group">
            <div class="inv-request-asset-info">
                ${inv.ticker ? `<span class="currency-badge" dir="ltr">${esc(inv.ticker)}</span>` : ''}
                <strong>${esc(inv.asset_name || inv.nickname || inv.ticker || '')}</strong>
                ${maxShares != null ? `<span style="color:var(--color-text-secondary);font-size:0.85rem">(${t.cash.sharesHeld}: ${maxShares.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${t.investmentRequest.units})</span>` : ''}
            </div>
            <div class="req-details" style="margin-top:0.35rem;font-size:0.82rem;color:var(--color-text-secondary)">
                ${t.settlement.kidRequested}:
                ${request.shares != null ? `${request.shares.toLocaleString()} ${t.investmentRequest.units}` : t.settlement.allShares}
                ${request.note ? `· <em>${esc(request.note)}</em>` : ''}
                ${kidPref ? `· ${t.settlement.kidWantsCash(currencySymbol(kidPref))}` : ''}
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="settle-price">${t.cash.salePriceLabel} (${nativeSym})</label>
                <input type="number" id="settle-price" step="any" min="0" value="${inv.current_price ?? ''}">
            </div>
            <div class="form-group">
                <label for="settle-shares">${t.settlement.sharesToSellLabel}</label>
                <input type="number" id="settle-shares" step="any" min="0"
                    ${maxShares != null ? `max="${maxShares}"` : ''}
                    value="${request.shares ?? (maxShares ?? '')}">
            </div>
        </div>
        ${isFx ? `
        <div class="form-group">
            <label for="settle-rate">${t.cash.saleRateLabel} (${currency}/${ilsSym})</label>
            <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="number" id="settle-rate" class="fx-rate-input" step="any" min="0"
                    value="${currentRate}" style="flex:1">
                <button type="button" id="settle-rate-refresh" class="btn btn-ghost btn-sm">↻</button>
            </div>
        </div>
        ` : ''}
        <div class="fx-equiv" id="settle-proceeds-display" style="margin-bottom:0.75rem"></div>
        <div class="form-row">
            <div class="form-group">
                <label for="settle-date">${t.cash.saleDateLabel}</label>
                <input type="date" id="settle-date" value="${todayStr()}">
            </div>
        </div>
        <div class="form-group">
            <label>${t.settlement.proceedsLabel}</label>
            <div class="radio-group">${proceedsHtml}</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary btn-danger" id="modal-save">${t.settlement.executeSellBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    let _rate = currentRate;

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#settle-shares').focus();

    if (isFx) {
        modal.querySelector('#settle-rate').addEventListener('input', () => {
            _rate = parseFloat(modal.querySelector('#settle-rate').value) || currentRate;
            updateProceeds();
        });
        modal.querySelector('#settle-rate-refresh').addEventListener('click', async () => {
            const { fetchExchangeRate } = await import('../../services/price-service.js');
            const rate = await fetchExchangeRate(currency);
            if (rate) { _rate = rate; modal.querySelector('#settle-rate').value = rate; updateProceeds(); }
        });
    }

    function updateProceeds() {
        const display = modal.querySelector('#settle-proceeds-display');
        const shares = parseFloat(modal.querySelector('#settle-shares').value) || 0;
        const price = parseFloat(modal.querySelector('#settle-price').value) || 0;
        if (shares <= 0 || price <= 0) { display.textContent = ''; return; }
        const nativeTotal = shares * price;
        const ilsTotal = nativeTotal * _rate;
        display.textContent = isFx
            ? `${t.cash.proceeds}: ${nativeSym}${nativeTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} = ${ilsSym}${ilsTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : `${t.cash.proceeds}: ${ilsSym}${nativeTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }

    modal.querySelector('#settle-price').addEventListener('input', updateProceeds);
    modal.querySelector('#settle-shares').addEventListener('input', updateProceeds);
    updateProceeds();

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const price = parseFloat(modal.querySelector('#settle-price').value);
        const shares = parseFloat(modal.querySelector('#settle-shares').value);
        const date = modal.querySelector('#settle-date').value || todayStr();
        const proceedsTarget = modal.querySelector('input[name="proceeds"]:checked')?.value || 'none';
        const rate = isFx ? (_rate || 1) : 1;

        if (!price || price <= 0) { modal.querySelector('#settle-price').focus(); return; }
        if (!shares || shares <= 0) { modal.querySelector('#settle-shares').focus(); return; }

        const proceedsNative = shares * price;
        const proceedsIls = proceedsNative * rate;

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const user = store.get('user');
            const { add, update, remove } = await import('../../services/investment-service.js');
            const { approve } = await import('../../services/investment-request-service.js');

            // 1. Reduce or remove investment
            const remaining = (maxShares || 0) - shares;
            if (remaining < 0.0001) {
                await remove(user.familyId, inv.id);
            } else {
                const fraction = remaining / (maxShares || 1);
                await update(user.familyId, inv.id, {
                    shares: remaining,
                    amount_invested: (inv.amount_invested || 0) * fraction,
                });
            }

            // 2. Create cash proceeds if requested
            if (proceedsTarget !== 'none') {
                const cashCurrency = proceedsTarget; // 'ILS' or 'USD'
                const cashSym = currencySymbol(cashCurrency);
                // Determine native units for the target currency
                const cashShares = cashCurrency === 'ILS'
                    ? proceedsIls
                    : (currency === 'USD' ? proceedsNative : proceedsIls / (exchangeRates['USD'] || 1));
                const cashIlsAmount = cashCurrency === 'ILS'
                    ? proceedsIls
                    : cashShares * (exchangeRates['USD'] || 1);
                await add(user.familyId, {
                    type: 'cash',
                    kid: request.kid,
                    asset_name: `${t.cash.cashLabel} ${cashSym}`,
                    ticker: null,
                    nickname: null,
                    purchase_date: date,
                    shares: cashShares,
                    amount_invested: cashIlsAmount,
                    current_price: 1,
                    currency: cashCurrency,
                    exchange_rate_at_purchase: cashCurrency !== 'ILS' ? (exchangeRates['USD'] || 1) : null,
                    hidden: false,
                    note: `${t.cash.saleOf} ${request.ticker || request.asset_name || ''}`,
                });
            }

            // 3. Mark request as approved
            await approve(user.familyId, request.id);

            closeModal();
            emit('toast', { message: t.settlement.sellExecutedToast, type: 'success' });
        } catch (e) {
            console.error('Settle sell error:', e);
            btn.disabled = false;
            emit('toast', { message: t.settlement.errorToast, type: 'error' });
        }
    });
}

// ── Helpers ───────────────────────────────────────────────────

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// Deduct `amount` from cash entries FIFO
async function deductCash(familyId, entries, amount, { update, remove }) {
    let remaining = amount;
    const sorted = [...entries].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    for (const entry of sorted) {
        if (remaining <= 0.001) break;
        const available = entry.shares || 0;
        if (available <= remaining + 0.001) {
            await remove(familyId, entry.id);
            remaining -= available;
        } else {
            const newShares = available - remaining;
            const isIls = (entry.currency || 'ILS') === 'ILS';
            const newIlsAmount = isIls ? newShares : newShares * (entry.exchange_rate_at_purchase || 1);
            await update(familyId, entry.id, { shares: newShares, amount_invested: newIlsAmount });
            remaining = 0;
        }
    }
}
