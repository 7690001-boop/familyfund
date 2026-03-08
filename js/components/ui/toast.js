// ============================================================
// Toast — notification system
// Listens to event-bus 'toast' events
// ============================================================

import { on } from '../../event-bus.js';

let container = null;

export function init(parentEl) {
    container = parentEl;
    on('toast', ({ message, type }) => show(message, type));
}

function show(message, type) {
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// Direct call for components that import this module
export function toast(message, type) {
    show(message, type);
}
