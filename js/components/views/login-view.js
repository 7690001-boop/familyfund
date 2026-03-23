// ============================================================
// Login View — unified login for all users (manager & member)
// Auto-detects role by input: email → manager, username → member
// ============================================================

import * as authService from '../../services/auth-service.js';
import t from '../../i18n.js';

let container = null;
let showSignup = false;
let linkState = null; // { email, pendingCred } when Google needs password linking

export function mount(el) {
    container = el;
    showSignup = false;
    linkState = null;
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

                ${linkState ? renderLinkForm() : showSignup ? renderSignup() : renderLogin()}
            </div>
        </div>
    `;

    setupEvents();
}

function googleIcon() {
    return `<svg width="18" height="18" viewBox="0 0 48 48" style="vertical-align:middle;margin-left:8px"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
}

function renderGoogleButton(text) {
    return `
        <button class="btn btn-google" style="width:100%;margin-bottom:0.75rem;display:flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:#3c4043;border:1px solid #dadce0;font-size:0.95rem;padding:0.65rem 1rem;border-radius:8px;cursor:pointer;font-weight:500">
            ${googleIcon()} ${text}
        </button>
    `;
}

function renderDivider() {
    return `
        <div style="display:flex;align-items:center;gap:12px;margin:0.75rem 0">
            <hr style="flex:1;border:none;border-top:1px solid var(--color-border)">
            <span style="color:var(--color-text-muted);font-size:0.85rem">${t.login.orDivider}</span>
            <hr style="flex:1;border:none;border-top:1px solid var(--color-border)">
        </div>
    `;
}

function renderLogin() {
    return `
        <div id="login-form">
            <p style="color:var(--color-text-muted);font-size:0.88rem;margin-bottom:1rem">
                ${t.login.subtitle}
            </p>
            ${renderGoogleButton(t.login.googleLogin)}
            ${renderDivider()}
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
            ${renderGoogleButton(t.login.googleSignup)}
            ${renderDivider()}
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

function renderLinkForm() {
    return `
        <div id="link-form">
            <h3 style="margin-bottom:0.5rem">${t.login.googleLinkTitle}</h3>
            <p style="color:var(--color-text-muted);font-size:0.88rem;margin-bottom:1rem">
                ${t.login.googleLinkMsg}
            </p>
            <p style="font-size:0.9rem;margin-bottom:1rem;direction:ltr;text-align:center;font-weight:500">${linkState.email}</p>
            <div class="form-group">
                <label for="link-password">${t.login.passwordLabel}</label>
                <input type="password" id="link-password" placeholder="${t.login.passwordPlaceholder}" autocomplete="current-password">
            </div>
            <div id="link-error" class="auth-error" hidden></div>
            <button id="link-btn" class="btn btn-primary btn-large" style="width:100%">${t.login.googleLinkBtn}</button>
            <div style="margin-top:1rem;text-align:center">
                <button id="link-cancel" class="btn btn-ghost" style="font-size:0.88rem">
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
    // Google button (works on both login and signup forms)
    const googleBtn = container.querySelector('.btn-google');
    if (googleBtn) {
        googleBtn.addEventListener('click', handleGoogleSignIn);
    }

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

    // Link form
    const linkBtn = container.querySelector('#link-btn');
    if (linkBtn) {
        linkBtn.addEventListener('click', handleLink);
        container.querySelector('#link-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLink();
        });
        container.querySelector('#link-password')?.focus();
    }
    const linkCancel = container.querySelector('#link-cancel');
    if (linkCancel) {
        linkCancel.addEventListener('click', () => {
            linkState = null;
            render();
        });
    }
}

async function handleGoogleSignIn() {
    const googleBtn = container.querySelector('.btn-google');
    const errorEl = container.querySelector('#login-error') || container.querySelector('#signup-error');

    googleBtn.disabled = true;
    if (errorEl) errorEl.hidden = true;

    try {
        const { user } = await authService.signInWithGoogle();

        // Ensure Firestore profile exists (covers new signups and linked accounts)
        const { FIREBASE_CDN } = await import('../../config.js');
        const { doc, getDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
        const { getAppDb } = await import('../../firebase-init.js');
        const db = getAppDb();
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
            await authService.createUserProfile(user.uid, {
                email: user.email,
                displayName: user.displayName || user.email,
                role: 'manager',
                familyId: null,
                kidName: null,
                username: null,
            });
        }
        // onAuthStateChanged will handle routing
    } catch (e) {
        if (e.code === 'auth/needs-link') {
            linkState = { email: e.email, pendingCred: e.pendingCred };
            render();
            return;
        }
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
            googleBtn.disabled = false;
            return;
        }
        const msg = t.errors.loginError(e.message);
        if (errorEl) showError(errorEl, msg);
        googleBtn.disabled = false;
    }
}

async function handleLink() {
    const password = container.querySelector('#link-password').value;
    const errorEl = container.querySelector('#link-error');
    const btn = container.querySelector('#link-btn');

    if (!password) {
        showError(errorEl, t.errors.fillEmailAndPassword);
        return;
    }

    btn.disabled = true;
    btn.textContent = t.common.connecting;
    errorEl.hidden = true;

    try {
        await authService.linkGoogleAfterPassword(linkState.email, password, linkState.pendingCred);
        linkState = null;
        // onAuthStateChanged will handle routing
    } catch (e) {
        const msg = e.code === 'auth/invalid-credential' ? t.errors.wrongPassword
            : e.code === 'auth/wrong-password' ? t.errors.wrongPassword
            : t.errors.loginError(e.message);
        showError(errorEl, msg);
        btn.disabled = false;
        btn.textContent = t.login.googleLinkBtn;
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
