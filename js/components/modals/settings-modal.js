// ============================================================
// Settings Modal — family configuration
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { DEFAULT_MATCHING_TICKERS, resolveTiers } from '../../utils/compute.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import t from '../../i18n.js';

function buildTierRowHtml(tier, index) {
    const ratioPct = Math.round(tier.ratio * 1000) / 10; // avoid floating point display issues
    return `
        <div class="tier-row" data-index="${index}">
            <span class="tier-row__num">${index + 1}</span>
            <input type="number" class="tier-days" min="1" value="${tier.days}" placeholder="${t.settings.matchingTierDays}" style="width:5rem">
            <span class="tier-row__sep">${t.settings.matchingTierDays}</span>
            <input type="number" class="tier-ratio-pct" min="0.1" step="0.1" value="${ratioPct}" placeholder="%" style="width:4rem">
            <span class="tier-row__sep">%</span>
            <button type="button" class="tier-remove-btn btn btn-ghost" title="${t.settings.matchingTierRemove}" style="color:var(--color-danger)">✕</button>
        </div>
    `;
}

function createTierRowElement(tier, index) {
    const ratioPct = Math.round(tier.ratio * 1000) / 10;
    const row = document.createElement('div');
    row.className = 'tier-row';
    row.dataset.index = String(index);

    const num = document.createElement('span');
    num.className = 'tier-row__num';
    num.textContent = String(index + 1);

    const daysInput = document.createElement('input');
    daysInput.type = 'number';
    daysInput.className = 'tier-days';
    daysInput.min = '1';
    daysInput.value = String(tier.days);
    daysInput.placeholder = t.settings.matchingTierDays;
    daysInput.style.width = '5rem';

    const daysSep = document.createElement('span');
    daysSep.className = 'tier-row__sep';
    daysSep.textContent = t.settings.matchingTierDays;

    const ratioInput = document.createElement('input');
    ratioInput.type = 'number';
    ratioInput.className = 'tier-ratio-pct';
    ratioInput.min = '0.1';
    ratioInput.step = '0.1';
    ratioInput.value = String(ratioPct);
    ratioInput.placeholder = '%';
    ratioInput.style.width = '4rem';

    const ratioSep = document.createElement('span');
    ratioSep.className = 'tier-row__sep';
    ratioSep.textContent = '%';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tier-remove-btn btn btn-ghost';
    removeBtn.title = t.settings.matchingTierRemove;
    removeBtn.style.color = 'var(--color-danger)';
    removeBtn.textContent = '✕';

    row.append(num, daysInput, daysSep, ratioInput, ratioSep, removeBtn);
    return row;
}

function renumberTiers(editor) {
    editor.querySelectorAll('.tier-row').forEach((row, i) => {
        row.querySelector('.tier-row__num').textContent = String(i + 1);
    });
}

export function showSettingsModal() {
    const family = store.get('family') || {};
    const initialTiers = resolveTiers(family);

    const tiersHtml = initialTiers.map(buildTierRowHtml).join('');

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
        <div class="form-group">
            <label>${t.settings.matchingTiersLabel}</label>
            <div id="tiers-editor" class="tiers-editor">${tiersHtml}</div>
            <button type="button" id="add-tier-btn" class="btn btn-secondary btn-sm" style="margin-top:0.5rem">${t.settings.matchingTierAdd}</button>
            <div class="form-hint">${t.settings.matchingTiersHint}</div>
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

    // Tier editor — add/remove rows dynamically
    const tiersEditor = modal.querySelector('#tiers-editor');
    modal.querySelector('#add-tier-btn').addEventListener('click', () => {
        const rows = tiersEditor.querySelectorAll('.tier-row');
        const lastDays = rows.length > 0
            ? (parseInt(rows[rows.length - 1].querySelector('.tier-days').value) || 365) + 365
            : 365;
        tiersEditor.appendChild(createTierRowElement({ days: lastDays, ratio: 1 }, rows.length));
        renumberTiers(tiersEditor);
    });
    tiersEditor.addEventListener('click', (e) => {
        if (e.target.classList.contains('tier-remove-btn')) {
            if (tiersEditor.querySelectorAll('.tier-row').length > 1) {
                e.target.closest('.tier-row').remove();
                renumberTiers(tiersEditor);
            }
        }
    });

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        try {
            const user = store.get('user');
            const incomeVal = modal.querySelector('#cfg-monthly-income').value;
            const newTickers = modal.querySelector('#cfg-matching-tickers').value.split(',').map(s => s.trim()).filter(Boolean);
            const retroactive = modal.querySelector('#cfg-matching-retroactive').checked;

            const tierRows = tiersEditor.querySelectorAll('.tier-row');
            const matching_tiers = [...tierRows].map(row => ({
                days: parseInt(row.querySelector('.tier-days').value) || 365,
                ratio: (parseFloat(row.querySelector('.tier-ratio-pct').value) || 100) / 100,
            })).filter(tier => tier.days > 0 && tier.ratio > 0).sort((a, b) => a.days - b.days);

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
                matching_tiers,
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
