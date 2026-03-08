// ============================================================
// Login View — dual login: manager (email) and kid (username)
// ============================================================

import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import * as authService from '../../services/auth-service.js';

let container = null;
let activeMode = 'kid'; // 'kid' or 'manager'

export function mount(el) {
    container = el;
    activeMode = 'kid';
    render();
}

export function unmount() {
    container = null;
}

function render() {
    if (!container) return;

    const kidActive = activeMode === 'kid' ? ' active' : '';
    const managerActive = activeMode === 'manager' ? ' active' : '';

    container.innerHTML = `
        <div class="auth-gate" style="display:flex">
            <div class="auth-box" style="max-width:400px">
                <h2>Family Money</h2>

                <!-- Login mode tabs -->
                <div class="login-tabs">
                    <button class="login-tab${kidActive}" id="tab-kid">ילד/ה</button>
                    <button class="login-tab${managerActive}" id="tab-manager">מנהל/ת</button>
                </div>

                <!-- Kid login (username-based) -->
                <div id="kid-login-form"${activeMode !== 'kid' ? ' hidden' : ''}>
                    <p style="color:var(--color-text-muted);font-size:0.88rem;margin-bottom:1rem">
                        הכנס עם שם המשתמש שקיבלת מההורים
                    </p>
                    <div class="form-group">
                        <label for="kid-username">שם משתמש</label>
                        <input type="text" id="kid-username" placeholder="למשל: דניאל" autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="kid-password">סיסמה</label>
                        <input type="password" id="kid-password" placeholder="סיסמה" autocomplete="current-password">
                    </div>
                    <div id="kid-login-error" class="auth-error" hidden></div>
                    <button id="kid-login-btn" class="btn btn-primary btn-large" style="width:100%">כניסה</button>
                </div>

                <!-- Manager login (email-based) -->
                <div id="manager-login-form"${activeMode !== 'manager' ? ' hidden' : ''}>
                    <div id="manager-signin"${activeMode === 'manager' ? '' : ' hidden'}>
                        <div class="form-group">
                            <label for="login-email">אימייל</label>
                            <input type="email" id="login-email" placeholder="email@example.com" dir="ltr" autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="login-password">סיסמה</label>
                            <input type="password" id="login-password" placeholder="סיסמה" autocomplete="current-password">
                        </div>
                        <div id="login-error" class="auth-error" hidden></div>
                        <button id="login-btn" class="btn btn-primary btn-large" style="width:100%">כניסה</button>
                        <div style="margin-top:1rem;text-align:center">
                            <button id="switch-to-signup" class="btn btn-ghost" style="font-size:0.88rem">
                                אין לך חשבון? הרשם כמנהל משפחה
                            </button>
                        </div>
                    </div>
                    <div id="manager-signup" hidden>
                        <div class="form-group">
                            <label for="signup-email">אימייל</label>
                            <input type="email" id="signup-email" placeholder="email@example.com" dir="ltr" autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="signup-password">סיסמה</label>
                            <input type="password" id="signup-password" placeholder="לפחות 6 תווים" autocomplete="new-password">
                        </div>
                        <div class="form-group">
                            <label for="signup-password-confirm">אימות סיסמה</label>
                            <input type="password" id="signup-password-confirm" placeholder="הזן סיסמה שוב" autocomplete="new-password">
                        </div>
                        <div id="signup-error" class="auth-error" hidden></div>
                        <button id="signup-btn" class="btn btn-primary btn-large" style="width:100%">הרשמה</button>
                        <div style="margin-top:1rem;text-align:center">
                            <button id="switch-to-login" class="btn btn-ghost" style="font-size:0.88rem">
                                יש לך חשבון? התחבר
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupEvents();
}

function setupEvents() {
    // Tab switching
    container.querySelector('#tab-kid').addEventListener('click', () => {
        activeMode = 'kid';
        render();
    });
    container.querySelector('#tab-manager').addEventListener('click', () => {
        activeMode = 'manager';
        render();
    });

    // Kid login
    const kidLoginBtn = container.querySelector('#kid-login-btn');
    if (kidLoginBtn) {
        kidLoginBtn.addEventListener('click', handleKidLogin);
        container.querySelector('#kid-username').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') container.querySelector('#kid-password')?.focus();
        });
        container.querySelector('#kid-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleKidLogin();
        });
    }

    // Manager login
    const loginBtn = container.querySelector('#login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleManagerLogin);
        container.querySelector('#login-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleManagerLogin();
        });
    }

    // Manager signup toggle
    const switchToSignup = container.querySelector('#switch-to-signup');
    const switchToLogin = container.querySelector('#switch-to-login');
    if (switchToSignup) {
        switchToSignup.addEventListener('click', () => {
            container.querySelector('#manager-signin').hidden = true;
            container.querySelector('#manager-signup').hidden = false;
            container.querySelector('#signup-email')?.focus();
        });
    }
    if (switchToLogin) {
        switchToLogin.addEventListener('click', () => {
            container.querySelector('#manager-signup').hidden = true;
            container.querySelector('#manager-signin').hidden = false;
            container.querySelector('#login-email')?.focus();
        });
    }

    // Manager signup
    const signupBtn = container.querySelector('#signup-btn');
    if (signupBtn) {
        signupBtn.addEventListener('click', handleSignup);
        container.querySelector('#signup-password-confirm')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSignup();
        });
    }

    // Auto-focus
    if (activeMode === 'kid') {
        container.querySelector('#kid-username')?.focus();
    } else {
        container.querySelector('#login-email')?.focus();
    }
}

async function handleKidLogin() {
    const username = container.querySelector('#kid-username').value.trim();
    const password = container.querySelector('#kid-password').value;
    const errorEl = container.querySelector('#kid-login-error');
    const btn = container.querySelector('#kid-login-btn');

    if (!username || !password) {
        showError(errorEl, 'נא למלא שם משתמש וסיסמה');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'מתחבר...';
    errorEl.hidden = true;

    try {
        // Look up familyId from username before authenticating
        const familyId = await authService.lookupFamilyIdByUsername(username);
        if (!familyId) {
            showError(errorEl, 'שם משתמש לא נמצא');
            btn.disabled = false;
            btn.textContent = 'כניסה';
            return;
        }
        await authService.loginWithUsername(username, password, familyId);
        // onAuthStateChanged will handle the rest
    } catch (e) {
        const msg = e.code === 'auth/invalid-credential' ? 'שם משתמש או סיסמה שגויים'
            : e.code === 'auth/user-not-found' ? 'משתמש לא נמצא'
            : e.code === 'auth/too-many-requests' ? 'יותר מדי ניסיונות, נסה מאוחר יותר'
            : 'שגיאה בהתחברות: ' + e.message;
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = 'כניסה';
    }
}

async function handleManagerLogin() {
    const email = container.querySelector('#login-email').value.trim();
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    const btn = container.querySelector('#login-btn');

    if (!email || !password) {
        showError(errorEl, 'נא למלא אימייל וסיסמה');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'מתחבר...';
    errorEl.hidden = true;

    try {
        await authService.login(email, password);
    } catch (e) {
        const msg = e.code === 'auth/invalid-credential' ? 'אימייל או סיסמה שגויים'
            : e.code === 'auth/user-not-found' ? 'משתמש לא נמצא'
            : e.code === 'auth/too-many-requests' ? 'יותר מדי ניסיונות, נסה מאוחר יותר'
            : 'שגיאה בהתחברות: ' + e.message;
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = 'כניסה';
    }
}

async function handleSignup() {
    const email = container.querySelector('#signup-email').value.trim();
    const password = container.querySelector('#signup-password').value;
    const confirmPassword = container.querySelector('#signup-password-confirm').value;
    const errorEl = container.querySelector('#signup-error');
    const btn = container.querySelector('#signup-btn');

    if (!email || !password) {
        showError(errorEl, 'נא למלא אימייל וסיסמה');
        return;
    }
    if (password.length < 6) {
        showError(errorEl, 'סיסמה חייבת להכיל לפחות 6 תווים');
        return;
    }
    if (password !== confirmPassword) {
        showError(errorEl, 'הסיסמאות לא תואמות');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'נרשם...';
    errorEl.hidden = true;

    try {
        const cred = await authService.signup(email, password);
        await authService.createUserProfile(cred.user.uid, {
            email,
            displayName: email,
            role: 'manager',
            familyId: null,
            kidName: null,
            username: null,
        });
    } catch (e) {
        const msg = e.code === 'auth/email-already-in-use' ? 'אימייל כבר רשום'
            : e.code === 'auth/weak-password' ? 'סיסמה חלשה מדי'
            : 'שגיאה בהרשמה: ' + e.message;
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = 'הרשמה';
    }
}

function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
}
