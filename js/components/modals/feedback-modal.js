// ============================================================
// Feedback Modal — send feedback/ideas/bugs to system admin
// ============================================================

import { open as openModal, close as closeModal } from '../ui/modal.js';
import { emit } from '../../event-bus.js';
import t from '../../i18n.js';

export function showFeedbackModal() {
    const html = `
        <h2>${t.feedback.title}</h2>
        <p style="color:var(--color-text-muted);font-size:0.85rem;margin-bottom:1rem">
            ${t.feedback.subtitle}
        </p>
        <div class="form-group">
            <label for="feedback-type">${t.feedback.typeLabel}</label>
            <select id="feedback-type" class="form-input">
                <option value="idea">${t.feedback.typeIdea}</option>
                <option value="bug">${t.feedback.typeBug}</option>
                <option value="improvement">${t.feedback.typeImprovement}</option>
                <option value="other">${t.feedback.typeOther}</option>
            </select>
        </div>
        <div class="form-group">
            <label for="feedback-text">${t.feedback.messageLabel}</label>
            <textarea id="feedback-text" class="form-input" rows="4" placeholder="${t.feedback.messagePlaceholder}"></textarea>
        </div>
        <div id="feedback-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="feedback-cancel">${t.feedback.cancelBtn}</button>
            <button class="btn btn-primary" id="feedback-send">${t.feedback.sendBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#feedback-cancel').addEventListener('click', closeModal);
    modal.querySelector('#feedback-text').focus();

    modal.querySelector('#feedback-send').addEventListener('click', async () => {
        const text = modal.querySelector('#feedback-text').value.trim();
        const type = modal.querySelector('#feedback-type').value;
        const errorEl = modal.querySelector('#feedback-error');
        const btn = modal.querySelector('#feedback-send');

        if (!text) {
            modal.querySelector('#feedback-text').focus();
            return;
        }

        btn.disabled = true;
        btn.textContent = t.common.sending;

        try {
            const { sendFeedback } = await import('../../services/feedback-service.js');
            await sendFeedback({ text, type });
            closeModal();
            emit('toast', { message: t.feedback.successToast, type: 'success' });
        } catch (e) {
            console.error('Failed to send feedback:', e);
            errorEl.textContent = t.errors.saveFeedbackError;
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = t.feedback.sendBtn;
        }
    });
}
