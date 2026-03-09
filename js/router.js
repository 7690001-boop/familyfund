// ============================================================
// Router — state-driven view manager
// Reacts to store.user changes to switch between views
// ============================================================

import * as store from './store.js';

let currentView = null;
let currentViewName = null;
let container = null;

export function init(appContainer) {
    container = appContainer;

    store.subscribe('user', (user) => {
        if (!user) {
            navigate('login');
        } else if (!user.familyId) {
            navigate('setup');
        } else {
            navigate('dashboard');
        }
    });

    // Initial route: only navigate immediately if user is already known.
    // If user is null, wait for the auth listener (initAuth) to resolve —
    // navigating now would flash the login screen for already-logged-in users.
    const user = store.get('user');
    if (user !== undefined) {
        navigate(user ? (user.familyId ? 'dashboard' : 'setup') : 'login');
    }
}

async function navigate(viewName) {
    if (viewName === currentViewName) return;
    if (currentView?.unmount) currentView.unmount();
    currentView = null;
    currentViewName = viewName;

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
    }
}
