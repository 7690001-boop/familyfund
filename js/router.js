// ============================================================
// Router — state-driven view manager
// Reacts to store.user changes to switch between views.
// Supports /#/admin hash route for direct admin access.
// ============================================================

import * as store from './store.js';

let currentView = null;
let currentViewName = null;
let container = null;

function getHashRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    return h || null;
}

export function init(appContainer) {
    container = appContainer;

    store.subscribe('user', (user) => {
        if (!user) {
            navigate('login');
        } else if (user.role === 'system' || (getHashRoute() === 'admin' && user.role === 'system')) {
            navigate('admin');
        } else if (!user.familyId) {
            navigate('setup');
        } else {
            navigate('dashboard');
        }
    });

    // Listen for hash changes — only matters for /#/admin
    window.addEventListener('hashchange', () => {
        const user = store.get('user');
        if (getHashRoute() === 'admin' && user?.role === 'system') {
            navigate('admin');
        }
    });

    // Initial route: only navigate immediately if user is already known.
    // If user is null, wait for the auth listener (initAuth) to resolve —
    // navigating now would flash the login screen for already-logged-in users.
    const user = store.get('user');
    if (user !== undefined) {
        if (!user) navigate('login');
        else if (user.role === 'system') navigate('admin');
        else if (user.familyId) navigate('dashboard');
        else navigate('setup');
    }
}

async function navigate(viewName) {
    if (viewName === currentViewName) return;
    if (currentView?.unmount) currentView.unmount();
    currentView = null;
    currentViewName = viewName;

    // Only set hash for admin route, don't touch URL for other views
    if (viewName === 'admin') {
        if (location.hash !== '#/admin') history.replaceState(null, '', '#/admin');
    } else if (location.hash === '#/admin') {
        history.replaceState(null, '', location.pathname + location.search);
    }

    if (!container) return;

    switch (viewName) {
        case 'login': {
            const mod = await import('./components/views/login-view.js');
            mod.mount(container);
            currentView = mod;
            break;
        }
        case 'setup': {
            const mod = await import('./components/views/setup-view.js');
            mod.mount(container);
            currentView = mod;
            break;
        }
        case 'dashboard': {
            const mod = await import('./components/views/dashboard-shell.js');
            mod.mount(container);
            currentView = mod;
            break;
        }
        case 'admin': {
            const mod = await import('./components/views/admin-view.js');
            mod.mount(container);
            currentView = mod;
            break;
        }
    }
}
