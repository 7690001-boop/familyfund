// ============================================================
// Setup View — first-time family creation wizard
// Shown when user is authenticated but has no familyId
// ============================================================

import { esc } from '../utils/dom-helpers.js';
import { emit } from '../event-bus.js';
import * as store from '../store.js';
import * as authService from '../services/auth-service.js';
import * as familyService from '../services/family-service.js';

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
                <h2>ברוכים הבאים!</h2>
                <p>בוא ניצור את המשפחה שלך</p>
                <div class="form-group">
                    <label for="setup-family-name">שם המשפחה</label>
                    <input type="text" id="setup-family-name" placeholder="למשל: משפחת כהן">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="setup-currency">סמל מטבע</label>
                        <input type="text" id="setup-currency" value="₪">
                    </div>
                    <div class="form-group">
                        <label for="setup-matching-days">ימים להתאמה</label>
                        <input type="number" id="setup-matching-days" value="365" min="1">
                    </div>
                </div>
                <div class="form-group">
                    <label for="setup-sp500">טיקר S&P 500 (אופציונלי)</label>
                    <input type="text" id="setup-sp500" dir="ltr" placeholder="למשל: VOO">
                    <div class="form-hint">הטיקר שמשמש לתוכנית ההתאמה של ההורים</div>
                </div>
                <div id="setup-error" class="auth-error" hidden></div>
                <button id="setup-create-btn" class="btn btn-primary btn-large" style="width:100%;margin-top:1rem">צור משפחה</button>
                <div style="margin-top:1rem;text-align:center">
                    <button id="setup-logout-btn" class="btn btn-ghost" style="font-size:0.85rem">התנתק</button>
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
    const sp500 = container.querySelector('#setup-sp500').value.trim();
    const errorEl = container.querySelector('#setup-error');
    const btn = container.querySelector('#setup-create-btn');

    if (!familyName) {
        errorEl.textContent = 'נא להזין שם משפחה';
        errorEl.hidden = false;
        container.querySelector('#setup-family-name').focus();
        return;
    }

    btn.disabled = true;
    btn.textContent = 'יוצר משפחה...';
    errorEl.hidden = true;

    try {
        const user = store.get('user');
        const familyId = await familyService.createFamily({
            family_name: familyName,
            currency_symbol: currency,
            matching_days: matchingDays,
            sp500_ticker: sp500,
        }, user.uid);

        // Add manager as a member of the family
        await familyService.addMember(familyId, {
            name: familyName + ' (מנהל)',
            email: user.email,
            role: 'manager',
            uid: user.uid,
            created_at: new Date().toISOString(),
        });

        // Update user profile with familyId
        await authService.createUserProfile(user.uid, {
            email: user.email,
            displayName: familyName + ' (מנהל)',
            role: 'manager',
            familyId: familyId,
            kidName: null,
        });

        // Show family code before navigating
        showFamilyCodeScreen(familyId, familyName, user);
    } catch (e) {
        console.error('Failed to create family:', e);
        errorEl.textContent = 'שגיאה ביצירת משפחה: ' + e.message;
        errorEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'צור משפחה';
    }
}

function showFamilyCodeScreen(familyId, familyName, user) {
    if (!container) return;

    container.innerHTML = `
        <div class="auth-gate" style="display:flex">
            <div class="auth-box" style="max-width:450px">
                <h2>משפחה נוצרה בהצלחה!</h2>
                <p>שמור את קוד המשפחה — הילדים צריכים אותו כדי להתחבר:</p>
                <div style="background:var(--color-tab-hover);padding:1rem 1.25rem;border-radius:var(--radius-sm);margin:1rem 0;text-align:center">
                    <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.5rem">קוד משפחה</div>
                    <div dir="ltr" style="font-family:monospace;font-size:1.3rem;font-weight:700;user-select:all;letter-spacing:1px">${esc(familyId)}</div>
                </div>
                <p style="font-size:0.85rem;color:var(--color-text-muted)">
                    תוכל למצוא את הקוד שוב דרך כפתור "חברים" בדשבורד.
                </p>
                <button id="continue-btn" class="btn btn-primary btn-large" style="width:100%;margin-top:1rem">המשך לדשבורד</button>
            </div>
        </div>
    `;

    container.querySelector('#continue-btn').addEventListener('click', () => {
        // Now navigate to dashboard
        store.set('user', {
            ...user,
            familyId: familyId,
            displayName: familyName + ' (מנהל)',
        });
        emit('toast', { message: 'ברוכים הבאים!', type: 'success' });
    });
}
