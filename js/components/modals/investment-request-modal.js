// ============================================================
// Investment Request Modal — kid submits a buy or sell request
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import t from '../../i18n.js';

export function showBuyRequestModal(kid) {
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';
    const allInvestments = store.get('investments') || [];

    // Kid's cash balances for funding options
    const kidCash = allInvestments.filter(i => i.kid === kid && i.type === 'cash');
    const totalIls = kidCash.filter(i => i.currency === 'ILS').reduce((s, i) => s + (i.shares || 0), 0);
    const totalUsd = kidCash.filter(i => i.currency === 'USD').reduce((s, i) => s + (i.shares || 0), 0);

    const fundingOptions = `
        <label class="radio-option">
            <input type="radio" name="req-funding" value="parent" checked>
            <span>${t.settlement.fundingParent}</span>
        </label>
        ${totalIls > 0 ? `<label class="radio-option">
            <input type="radio" name="req-funding" value="cash_ILS">
            <span>${t.settlement.fundingCashIls} (${sym}${totalIls.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${t.settlement.available})</span>
        </label>` : ''}
        ${totalUsd > 0 ? `<label class="radio-option">
            <input type="radio" name="req-funding" value="cash_USD">
            <span>${t.settlement.fundingCashUsd} ($${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.settlement.available})</span>
        </label>` : ''}
    `;

    const html = `
        <h2>${t.investmentRequest.buyTitle}</h2>
        <div class="form-group ticker-autocomplete-wrap">
            <label for="req-ticker">${t.investment.tickerLabel}</label>
            <div class="ticker-input-row">
                <input type="text" id="req-ticker" dir="ltr" placeholder="${t.investment.tickerPlaceholder}" autocomplete="off">
                <button type="button" id="req-ticker-search-btn">${t.investment.searchBtn}</button>
            </div>
            <div id="req-ticker-results" class="ticker-results" hidden></div>
        </div>
        <div class="form-group">
            <label for="req-asset">${t.investment.assetLabel}</label>
            <input type="text" id="req-asset" placeholder="${t.investment.assetPlaceholder}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="req-shares">${t.investment.sharesLabel}</label>
                <input type="number" id="req-shares" step="any" min="0">
            </div>
            <div class="form-group">
                <label for="req-amount">${t.investment.amountLabel(sym)}</label>
                <input type="number" id="req-amount" step="any" min="0">
            </div>
        </div>
        <div class="form-group">
            <label for="req-note">${t.investmentRequest.noteLabel}</label>
            <input type="text" id="req-note" placeholder="${t.investmentRequest.notePlaceholder}">
        </div>
        <div class="form-group">
            <label>${t.settlement.fundingLabel}</label>
            <div class="radio-group">${fundingOptions}</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.investmentRequest.submitBuyBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    setupTickerSearch(modal);
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#req-ticker').focus();

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const ticker = modal.querySelector('#req-ticker').value.trim();
        const assetName = modal.querySelector('#req-asset').value.trim();
        const shares = modal.querySelector('#req-shares').value;
        const amount = modal.querySelector('#req-amount').value;
        const note = modal.querySelector('#req-note').value.trim();
        const fundingSource = modal.querySelector('input[name="req-funding"]:checked')?.value || 'parent';

        if (!assetName && !ticker) {
            modal.querySelector('#req-ticker').focus();
            return;
        }

        const user = store.get('user');
        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const { add } = await import('../../services/investment-request-service.js');
            await add(user.familyId, {
                type: 'buy',
                kid,
                kid_uid: user.uid,
                ticker: ticker || null,
                asset_name: assetName || ticker,
                shares: shares ? parseFloat(shares) : null,
                amount_ils: amount ? parseFloat(amount) : null,
                note: note || null,
                investment_id: null,
                funding_source: fundingSource,
            });
            closeModal();
            emit('toast', { message: t.investmentRequest.buyRequestedToast, type: 'success' });
        } catch {
            btn.disabled = false;
            emit('toast', { message: t.investmentRequest.requestErrorToast, type: 'error' });
        }
    });
}

export function showSellRequestModal(kid, investment) {
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';
    const maxShares = investment.shares != null ? investment.shares : '';

    const proceedsOptions = `
        <label class="radio-option">
            <input type="radio" name="req-proceeds" value="" checked>
            <span>${t.settlement.proceedsNone}</span>
        </label>
        <label class="radio-option">
            <input type="radio" name="req-proceeds" value="ILS">
            <span>${t.settlement.proceedsCashIls}</span>
        </label>
        <label class="radio-option">
            <input type="radio" name="req-proceeds" value="USD">
            <span>${t.settlement.proceedsCashUsd}</span>
        </label>
    `;

    const html = `
        <h2>${t.investmentRequest.sellTitle}</h2>
        <div class="form-group">
            <label>${t.investmentRequest.assetLabel}</label>
            <div class="inv-request-asset-info">
                ${investment.ticker ? `<span class="currency-badge" dir="ltr">${esc(investment.ticker)}</span>` : ''}
                <span>${esc(investment.asset_name || investment.nickname || investment.ticker || '')}</span>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="req-shares">${t.investmentRequest.sharesToSellLabel}</label>
                <input type="number" id="req-shares" step="any" min="0" ${maxShares ? `max="${maxShares}" placeholder="${maxShares}"` : ''}>
            </div>
            <div class="form-group">
                <label for="req-amount">${t.investment.amountLabel(sym)}</label>
                <input type="number" id="req-amount" step="any" min="0">
            </div>
        </div>
        <div class="form-group">
            <label for="req-note">${t.investmentRequest.noteLabel}</label>
            <input type="text" id="req-note" placeholder="${t.investmentRequest.notePlaceholder}">
        </div>
        <div class="form-group">
            <label>${t.settlement.proceedsLabel}</label>
            <div class="radio-group">${proceedsOptions}</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary btn-danger" id="modal-save">${t.investmentRequest.submitSellBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#req-shares').focus();

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const shares = modal.querySelector('#req-shares').value;
        const amount = modal.querySelector('#req-amount').value;
        const note = modal.querySelector('#req-note').value.trim();
        const proceedsCurrency = modal.querySelector('input[name="req-proceeds"]:checked')?.value || null;

        const user = store.get('user');
        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        try {
            const { add } = await import('../../services/investment-request-service.js');
            await add(user.familyId, {
                type: 'sell',
                kid,
                kid_uid: user.uid,
                ticker: investment.ticker || null,
                asset_name: investment.asset_name || investment.nickname || investment.ticker,
                shares: shares ? parseFloat(shares) : null,
                amount_ils: amount ? parseFloat(amount) : null,
                note: note || null,
                investment_id: investment.id,
                proceeds_currency: proceedsCurrency || null,
            });
            closeModal();
            emit('toast', { message: t.investmentRequest.sellRequestedToast, type: 'success' });
        } catch {
            btn.disabled = false;
            emit('toast', { message: t.investmentRequest.requestErrorToast, type: 'error' });
        }
    });
}

function setupTickerSearch(modal) {
    const input = modal.querySelector('#req-ticker');
    const btn = modal.querySelector('#req-ticker-search-btn');
    const resultsEl = modal.querySelector('#req-ticker-results');
    if (!input || !btn || !resultsEl) return;

    // Show historic tickers from existing investments on focus
    input.addEventListener('focus', () => {
        if (!input.value.trim()) showHistoric(modal, resultsEl);
    });

    async function doSearch() {
        const q = input.value.trim();
        if (q.length < 1) { showHistoric(modal, resultsEl); return; }
        btn.disabled = true;
        try {
            const { searchTickers } = await import('../../services/price-service.js');
            const results = await searchTickers(q);
            btn.disabled = false;
            if (results.length === 0) { resultsEl.hidden = true; return; }
            renderResults(modal, resultsEl, results);
        } catch {
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('input', doSearch);
    input.addEventListener('blur', () => setTimeout(() => { resultsEl.hidden = true; }, 150));
}

function showHistoric(modal, resultsEl) {
    const investments = store.get('investments') || [];
    const seen = new Set();
    const items = [];
    for (const inv of investments) {
        const sym = (inv.ticker || '').trim();
        if (!sym || seen.has(sym.toUpperCase())) continue;
        seen.add(sym.toUpperCase());
        items.push({ symbol: sym, name: inv.asset_name || inv.nickname || '' });
    }
    if (items.length === 0) return;
    renderResults(modal, resultsEl, items);
}

function renderResults(modal, resultsEl, items) {
    resultsEl.innerHTML = items.map(r => `
        <div class="ticker-result-item" data-symbol="${esc(r.symbol)}" data-name="${esc(r.name || '')}">
            <span class="ticker-symbol">${esc(r.symbol)}</span>
            <span class="ticker-name">${esc(r.name || '')}</span>
        </div>
    `).join('');
    resultsEl.hidden = false;

    resultsEl.querySelectorAll('.ticker-result-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const input = modal.querySelector('#req-ticker');
            if (input) input.value = item.dataset.symbol;
            const assetInput = modal.querySelector('#req-asset');
            if (assetInput && !assetInput.value) assetInput.value = item.dataset.name;
            resultsEl.hidden = true;
        });
    });
}
