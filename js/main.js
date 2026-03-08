// ============================================================
// Main Entry Point — bootstraps the entire application
// ============================================================

import { init as initFirebase } from './firebase-init.js';
import { init as initRouter } from './router.js';
import { init as initAuth } from './services/auth-service.js';
import { init as initToast } from './components/toast.js';
import { init as initModal } from './components/modal.js';

async function boot() {
    try {
        // Initialize Firebase first
        await initFirebase();

        // Initialize global UI components
        initToast(document.body);
        initModal(document.body);

        // Initialize router (watches store.user changes)
        const appContainer = document.getElementById('app');
        initRouter(appContainer);

        // Start auth listener (drives the entire app lifecycle)
        await initAuth();
    } catch (e) {
        console.error('Boot failed:', e);
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = `
                <div class="auth-gate" style="display:flex">
                    <div class="auth-box">
                        <h2>שגיאה</h2>
                        <p>לא ניתן להתחבר לשרת. נסה לרענן את הדף.</p>
                        <button class="btn btn-primary" onclick="location.reload()">רענן</button>
                    </div>
                </div>
            `;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
