// ============================================================
// Main Entry Point — bootstraps the entire application
// ============================================================

import { init as initFirebase } from './firebase-init.js';
import { init as initRouter } from './router.js';
import { init as initAuth } from './services/auth-service.js';
import { init as initToast } from './components/ui/toast.js';
import { init as initModal } from './components/ui/modal.js';

function spawnFloatingDecorations() {
    const emojis = ['💰', '⭐', '🪙', '🐷', '📈', '🎯', '💎', '🌟', '🎉', '🚀'];
    const container = document.createElement('div');
    container.id = 'bg-decorations';
    container.setAttribute('aria-hidden', 'true');
    document.body.prepend(container);

    function spawn() {
        const el = document.createElement('span');
        el.className = 'bg-deco';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.fontSize = (1.2 + Math.random() * 1.8) + 'rem';
        el.style.animationDuration = (18 + Math.random() * 20) + 's';
        el.style.animationDelay = Math.random() * 2 + 's';
        container.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }

    // Spawn a few at start, then continuously
    for (let i = 0; i < 5; i++) spawn();
    setInterval(spawn, 5000);
}

async function boot() {
    try {
        // Spawn fun floating decorations
        spawnFloatingDecorations();

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
