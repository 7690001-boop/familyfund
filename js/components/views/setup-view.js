// ============================================================
// Setup View — first-time family creation wizard
// Shown when user is authenticated but has no familyId
// ============================================================

import { esc } from '../../utils/dom-helpers.js';
import { DEFAULT_MATCHING_TICKERS } from '../../utils/compute.js';
import { emit } from '../../event-bus.js';
import * as store from '../../store.js';
import * as authService from '../../services/auth-service.js';
import * as familyService from '../../services/family-service.js';
import t from '../../i18n.js';

let container = null;

export function mount(el) {
    container = el;
    render();
}

export function unmount() {
    container = null;
}

function render() {
    if (!container) return;

    container.innerHTML = `
        <div class="auth-gate" style="display:flex">
            <div class="auth-box" style="max-width:450px">
                <h2>${t.setup.welcome}</h2>
                <p>${t.setup.subtitle}</p>
                <div class="form-group">
                    <label for="setup-family-name">${t.setup.familyNameLabel}</label>
                    <input type="text" id="setup-family-name" placeholder="${t.setup.familyNamePlaceholder}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="setup-currency">${t.setup.currencyLabel}</label>
                        <input type="text" id="setup-currency" value="₪">
                    </div>
                    <div class="form-group">
                        <label for="setup-matching-days">${t.setup.matchingDaysLabel}</label>
                        <input type="number" id="setup-matching-days" value="365" min="1">
                    </div>
                    <div class="form-group">
                        <label for="setup-matching-ratio">${t.setup.matchingRatioLabel}</label>
                        <input type="number" id="setup-matching-ratio" min="0.1" max="10" step="0.1" value="1">
                        <div class="form-hint">${t.setup.matchingRatioHint}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="setup-matching-tickers">${t.setup.matchingTickersLabel}</label>
                    <input type="text" id="setup-matching-tickers" dir="ltr" placeholder="${t.setup.matchingTickersHint}" value="${esc(DEFAULT_MATCHING_TICKERS.join(', '))}">
                    <div class="form-hint">${t.setup.matchingTickersHint}</div>
                </div>
                <div id="setup-error" class="auth-error" hidden></div>
                <button id="setup-create-btn" class="btn btn-primary btn-large" style="width:100%;margin-top:1rem">${t.setup.createBtn}</button>
                <div style="margin-top:1rem;text-align:center">
                    <button id="setup-logout-btn" class="btn btn-ghost" style="font-size:0.85rem">${t.setup.logout}</button>
                </div>
            </div>
        </div>
    `;

    setupEvents();
}

function setupEvents() {
    container.querySelector('#setup-create-btn').addEventListener('click', handleCreate);
    container.querySelector('#setup-logout-btn').addEventListener('click', () => authService.logout());
    container.querySelector('#setup-family-name').focus();
    container.querySelector('#setup-family-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCreate();
    });
}

async function handleCreate() {
    const familyName = container.querySelector('#setup-family-name').value.trim();
    const currency = container.querySelector('#setup-currency').value.trim() || '₪';
    const matchingDays = parseInt(container.querySelector('#setup-matching-days').value) || 365;
    const matchingRatio = parseFloat(container.querySelector('#setup-matching-ratio').value) || 1;
    const matchingTickers = container.querySelector('#setup-matching-tickers').value.split(',').map(s => s.trim()).filter(Boolean);
    const errorEl = container.querySelector('#setup-error');
    const btn = container.querySelector('#setup-create-btn');

    if (!familyName) {
        errorEl.textContent = t.errors.enterFamilyName;
        errorEl.hidden = false;
        container.querySelector('#setup-family-name').focus();
        return;
    }

    btn.disabled = true;
    btn.textContent = t.common.creatingFamily;
    errorEl.hidden = true;

    try {
        const user = store.get('user');
        const familyId = await familyService.createFamily({
            family_name: familyName,
            currency_symbol: currency,
            matching_tiers: matchingDays > 0 ? [{ days: matchingDays, ratio: matchingRatio }] : [],
            matching_tickers: matchingTickers,
            matching_retroactive: true,
            matching_activated_at: matchingTickers.length > 0 ? new Date().toISOString().slice(0, 10) : null,
        }, user.uid);

        // Add manager as a member of the family
        await familyService.addMember(familyId, {
            name: familyName + t.setup.managerSuffix,
            email: user.email,
            role: 'manager',
            uid: user.uid,
            created_at: new Date().toISOString(),
        });

        // Update user profile with familyId
        await authService.createUserProfile(user.uid, {
            email: user.email,
            displayName: familyName + t.setup.managerSuffix,
            role: 'manager',
            familyId: familyId,
            kidName: null,
        });

        // Show family code before navigating
        showFamilyCodeScreen(familyId, familyName, user);
    } catch (e) {
        console.error('Failed to create family:', e);
        errorEl.textContent = t.errors.createFamilyError(e.message);
        errorEl.hidden = false;
        btn.disabled = false;
        btn.textContent = t.setup.createBtn;
    }
}

function showFamilyCodeScreen(familyId, familyName, user) {
    if (!container) return;

    container.innerHTML = `
        <div class="auth-gate" style="display:flex">
            <div class="auth-box" style="max-width:450px">
                <h2>${t.setup.successTitle}</h2>
                <p>${t.setup.successDesc}</p>
                <div style="background:var(--color-tab-hover);padding:1rem 1.25rem;border-radius:var(--radius-sm);margin:1rem 0;text-align:center">
                    <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.5rem">${t.setup.familyCodeLabel}</div>
                    <div dir="ltr" style="font-family:monospace;font-size:1.3rem;font-weight:700;user-select:all;letter-spacing:1px">${esc(familyId)}</div>
                </div>
                <p style="font-size:0.85rem;color:var(--color-text-muted)">
                    ${t.setup.findCodeHint}
                </p>
                <button id="continue-btn" class="btn btn-primary btn-large" style="width:100%;margin-top:1rem">${t.common.continue}</button>
            </div>
        </div>
    `;

    container.querySelector('#continue-btn').addEventListener('click', () => {
        // Now navigate to dashboard
        store.set('user', {
            ...user,
            familyId: familyId,
            displayName: familyName + t.setup.managerSuffix,
        });
        emit('toast', { message: t.setup.welcomeToast, type: 'success' });
    });
}
