// ============================================================
// Login View — unified login for all users (manager & member)
// Auto-detects role by input: email → manager, username → member
// ============================================================

import * as authService from '../../services/auth-service.js';
import t from '../../i18n.js';

let container = null;
let showSignup = false;

export function mount(el) {
    container = el;
    showSignup = false;
    render();
}

export function unmount() {
    container = null;
}

function render() {
    if (!container) return;

    container.innerHTML = `
        <div class="auth-gate" style="display:flex">
            <div class="auth-box" style="max-width:400px">
                <h2>Family Money</h2>

                ${showSignup ? renderSignup() : renderLogin()}
            </div>
        </div>
    `;

    setupEvents();
}

function renderLogin() {
    return `
        <div id="login-form">
            <p style="color:var(--color-text-muted);font-size:0.88rem;margin-bottom:1rem">
                ${t.login.subtitle}
            </p>
            <div class="form-group">
                <label for="login-identifier">${t.login.identifierLabel}</label>
                <input type="text" id="login-identifier" placeholder="${t.login.identifierPlaceholder}" autocomplete="username">
            </div>
            <div class="form-group">
                <label for="login-password">${t.login.passwordLabel}</label>
                <input type="password" id="login-password" placeholder="${t.login.passwordPlaceholder}" autocomplete="current-password">
            </div>
            <div id="login-error" class="auth-error" hidden></div>
            <button id="login-btn" class="btn btn-primary btn-large" style="width:100%">${t.login.loginBtn}</button>
            <div style="margin-top:1rem;text-align:center">
                <button id="switch-to-signup" class="btn btn-ghost" style="font-size:0.88rem">
                    ${t.login.noAccount}
                </button>
            </div>
        </div>
    `;
}

function renderSignup() {
    return `
        <div id="signup-form">
            <div class="form-group">
                <label for="signup-email">${t.login.emailLabel}</label>
                <input type="email" id="signup-email" placeholder="email@example.com" dir="ltr" autocomplete="email">
            </div>
            <div class="form-group">
                <label for="signup-password">${t.login.passwordLabel}</label>
                <input type="password" id="signup-password" placeholder="${t.login.signupPasswordPlaceholder}" autocomplete="new-password">
            </div>
            <div class="form-group">
                <label for="signup-password-confirm">${t.login.confirmPasswordLabel}</label>
                <input type="password" id="signup-password-confirm" placeholder="${t.login.confirmPasswordPlaceholder}" autocomplete="new-password">
            </div>
            <div id="signup-error" class="auth-error" hidden></div>
            <button id="signup-btn" class="btn btn-primary btn-large" style="width:100%">${t.login.signupBtn}</button>
            <div style="margin-top:1rem;text-align:center">
                <button id="switch-to-login" class="btn btn-ghost" style="font-size:0.88rem">
                    ${t.login.hasAccount}
                </button>
            </div>
        </div>
    `;
}

function isEmail(value) {
    return value.includes('@');
}

function setupEvents() {
    // Login form
    const loginBtn = container.querySelector('#login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
        container.querySelector('#login-identifier')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') container.querySelector('#login-password')?.focus();
        });
        container.querySelector('#login-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        container.querySelector('#login-identifier')?.focus();
    }

    // Signup toggle
    const switchToSignup = container.querySelector('#switch-to-signup');
    if (switchToSignup) {
        switchToSignup.addEventListener('click', () => {
            showSignup = true;
            render();
        });
    }
    const switchToLogin = container.querySelector('#switch-to-login');
    if (switchToLogin) {
        switchToLogin.addEventListener('click', () => {
            showSignup = false;
            render();
        });
    }

    // Signup form
    const signupBtn = container.querySelector('#signup-btn');
    if (signupBtn) {
        signupBtn.addEventListener('click', handleSignup);
        container.querySelector('#signup-password-confirm')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSignup();
        });
        container.querySelector('#signup-email')?.focus();
    }
}

async function handleLogin() {
    const identifier = container.querySelector('#login-identifier').value.trim();
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    const btn = container.querySelector('#login-btn');

    if (!identifier || !password) {
        showError(errorEl, t.errors.fillUsernameAndPassword);
        return;
    }

    btn.disabled = true;
    btn.textContent = t.common.connecting;
    errorEl.hidden = true;

    try {
        if (isEmail(identifier)) {
            // Email login (manager / system)
            await authService.login(identifier, password);
        } else {
            // Username login (member) — server-side lookup via worker
            await authService.loginWithUsername(identifier, password);
        }
        // onAuthStateChanged will handle routing
    } catch (e) {
        const msg = e.code === 'auth/invalid-credential' ? t.errors.wrongPassword
            : e.code === 'auth/user-not-found' ? t.errors.userNotFound
            : e.code === 'auth/too-many-requests' ? t.errors.tooManyAttempts
            : t.errors.loginError(e.message);
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = t.login.loginBtn;
    }
}

async function handleSignup() {
    const email = container.querySelector('#signup-email').value.trim();
    const password = container.querySelector('#signup-password').value;
    const confirmPassword = container.querySelector('#signup-password-confirm').value;
    const errorEl = container.querySelector('#signup-error');
    const btn = container.querySelector('#signup-btn');

    if (!email || !password) {
        showError(errorEl, t.errors.fillEmailAndPassword);
        return;
    }
    if (password.length < 6) {
        showError(errorEl, t.errors.passwordTooShort);
        return;
    }
    if (password !== confirmPassword) {
        showError(errorEl, t.errors.passwordMismatch);
        return;
    }

    btn.disabled = true;
    btn.textContent = t.common.registering;
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
        const msg = e.code === 'auth/email-already-in-use' ? t.errors.emailAlreadyInUse
            : e.code === 'auth/weak-password' ? t.errors.passwordWeak
            : t.errors.signupError(e.message);
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = t.login.signupBtn;
    }
}

function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
}
