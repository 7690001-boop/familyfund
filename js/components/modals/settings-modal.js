// ============================================================
// Settings Modal — family configuration
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import t from '../../i18n.js';

export function showSettingsModal() {
    const family = store.get('family') || {};

    const html = `
        <h2>${t.settings.title}</h2>
        <div class="form-group">
            <label for="cfg-family">${t.settings.familyNameLabel}</label>
            <input type="text" id="cfg-family" value="${esc(family.family_name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="cfg-currency">${t.settings.currencyLabel}</label>
                <input type="text" id="cfg-currency" value="${esc(family.currency_symbol || '₪')}">
            </div>
            <div class="form-group">
                <label for="cfg-matching-days">${t.settings.matchingDaysLabel}</label>
                <input type="number" id="cfg-matching-days" min="1" value="${family.matching_days || 365}">
            </div>
        </div>
        <div class="form-group">
            <label for="cfg-sp500">${t.settings.sp500Label}</label>
            <input type="text" id="cfg-sp500" dir="ltr" placeholder="${t.settings.sp500Placeholder}" value="${esc(family.sp500_ticker || '')}">
            <div class="form-hint">${t.settings.sp500Hint}</div>
        </div>
        <div class="form-group">
            <label for="cfg-monthly-income">${t.settings.monthlyIncomeLabel}</label>
            <input type="number" id="cfg-monthly-income" min="0" step="any" placeholder="${t.settings.monthlyIncomePlaceholder}" value="${family.monthly_income || ''}">
        </div>
        <div class="form-group settings-toggle-row">
            <label class="settings-toggle-label">
                <input type="checkbox" id="cfg-chat-enabled" ${family.chatDisabled ? '' : 'checked'}>
                <span>${t.settings.chatEnabledLabel}</span>
            </label>
            <div class="form-hint">${t.settings.chatEnabledHint}</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.common.save}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        try {
            const user = store.get('user');
            const incomeVal = modal.querySelector('#cfg-monthly-income').value;
            await familyService.updateFamily(user.familyId, {
                family_name: modal.querySelector('#cfg-family').value.trim(),
                currency_symbol: modal.querySelector('#cfg-currency').value.trim() || '₪',
                matching_days: parseInt(modal.querySelector('#cfg-matching-days').value) || 365,
                sp500_ticker: modal.querySelector('#cfg-sp500').value.trim(),
                chatDisabled: !modal.querySelector('#cfg-chat-enabled').checked,
                monthly_income: incomeVal ? parseFloat(incomeVal) : 0,
            });
            closeModal();
            emit('toast', { message: t.settings.savedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.settings.errorToast, type: 'error' });
        }
    });
}
