// ============================================================
// Modal — generic modal system
// Listens to event-bus 'modal:open' and 'modal:close' events
// ============================================================

import { on, emit } from '../../event-bus.js';

let overlay = null;
let content = null;

export function init(parentEl) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;

    content = document.createElement('div');
    content.className = 'modal';
    content.id = 'modal-content';

    overlay.appendChild(content);
    parentEl.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) close();
    });

    on('modal:open', ({ html }) => open(html));
    on('modal:close', () => close());
}

export function open(html) {
    if (!overlay || !content) return;
    content.innerHTML = html;
    overlay.hidden = false;
}

export function close() {
    if (!overlay || !content) return;
    overlay.hidden = true;
    content.innerHTML = '';
}

export function getContent() {
    return content;
}
