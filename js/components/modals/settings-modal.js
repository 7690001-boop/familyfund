// ============================================================
// Settings Modal — family configuration
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { DEFAULT_MATCHING_TICKERS } from '../../utils/compute.js';
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
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="cfg-matching-days">${t.settings.matchingDaysLabel}</label>
                <input type="number" id="cfg-matching-days" min="1" value="${family.matching_days || 365}">
            </div>
            <div class="form-group">
                <label for="cfg-matching-ratio">${t.settings.matchingRatioLabel}</label>
                <input type="number" id="cfg-matching-ratio" min="0.1" step="0.1" value="${family.matching_ratio ?? 1}">
                <div class="form-hint">${t.settings.matchingRatioHint}</div>
            </div>
        </div>
        <div class="form-group">
            <label for="cfg-matching-tickers">${t.settings.matchingTickersLabel}</label>
            <input type="text" id="cfg-matching-tickers" dir="ltr" placeholder="${t.settings.matchingTickersPlaceholder}" value="${esc((family.matching_tickers || (family.sp500_ticker ? [family.sp500_ticker] : DEFAULT_MATCHING_TICKERS)).join(', '))}">
            <div class="form-hint">${t.settings.matchingTickersHint}</div>
        </div>
        <div class="form-group settings-toggle-row">
            <label class="settings-toggle-label">
                <input type="checkbox" id="cfg-matching-retroactive" ${family.matching_retroactive !== false ? 'checked' : ''}>
                <span>${t.settings.matchingRetroactiveLabel}</span>
            </label>
            <div class="form-hint">${t.settings.matchingRetroactiveHint}</div>
        </div>
        <div class="form-group">
            <label for="cfg-monthly-income">${t.settings.monthlyIncomeLabel}</label>
            <input type="number" id="cfg-monthly-income" min="0" step="any" placeholder="${t.settings.monthlyIncomePlaceholder}" value="${family.monthly_income || ''}">
        </div>
        <div class="form-group">
            <label for="cfg-reward-tickers">${t.settings.rewardTickersLabel}</label>
            <input type="text" id="cfg-reward-tickers" dir="ltr" placeholder="${t.settings.rewardTickersPlaceholder}" value="${esc((family.reward_eligible_tickers || []).join(', '))}">
            <div class="form-hint">${t.settings.rewardTickersHint}</div>
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
            const newTickers = modal.querySelector('#cfg-matching-tickers').value.split(',').map(s => s.trim()).filter(Boolean);
            const retroactive = modal.querySelector('#cfg-matching-retroactive').checked;
            const matching_days = parseInt(modal.querySelector('#cfg-matching-days').value) || 365;
            const matching_ratio = parseFloat(modal.querySelector('#cfg-matching-ratio').value) || 1;

            // Auto-set activation date when tickers are first configured
            const currentFamily = store.get('family') || {};
            let activatedAt = currentFamily.matching_activated_at || null;
            if (newTickers.length > 0 && !activatedAt) {
                activatedAt = new Date().toISOString().slice(0, 10);
            } else if (newTickers.length === 0) {
                activatedAt = null;
            }

            await familyService.updateFamily(user.familyId, {
                family_name: modal.querySelector('#cfg-family').value.trim(),
                currency_symbol: modal.querySelector('#cfg-currency').value.trim() || '₪',
                matching_days,
                matching_ratio,
                matching_tiers: null,
                matching_tickers: newTickers,
                matching_retroactive: retroactive,
                matching_activated_at: activatedAt,
                reward_eligible_tickers: modal.querySelector('#cfg-reward-tickers').value.split(',').map(s => s.trim()).filter(Boolean),
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
