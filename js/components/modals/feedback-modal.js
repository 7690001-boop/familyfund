// ============================================================
// Feedback Modal — send feedback/ideas/bugs to system admin
// ============================================================

import { open as openModal, close as closeModal } from '../ui/modal.js';
import { emit } from '../../event-bus.js';

export function showFeedbackModal() {
    const html = `
        <h2>שלח משוב</h2>
        <p style="color:var(--color-text-muted);font-size:0.85rem;margin-bottom:1rem">
            יש לך רעיון, באג, או הצעה לשיפור? נשמח לשמוע!
        </p>
        <div class="form-group">
            <label for="feedback-type">סוג</label>
            <select id="feedback-type" class="form-input">
                <option value="idea">💡 רעיון</option>
                <option value="bug">🐛 באג</option>
                <option value="improvement">✨ שיפור</option>
                <option value="other">💬 אחר</option>
            </select>
        </div>
        <div class="form-group">
            <label for="feedback-text">הודעה</label>
            <textarea id="feedback-text" class="form-input" rows="4" placeholder="ספר/י לנו מה חשבת..."></textarea>
        </div>
        <div id="feedback-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="feedback-cancel">ביטול</button>
            <button class="btn btn-primary" id="feedback-send">שלח</button>
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
        btn.textContent = 'שולח...';

        try {
            const { sendFeedback } = await import('../../services/feedback-service.js');
            await sendFeedback({ text, type });
            closeModal();
            emit('toast', { message: 'המשוב נשלח בהצלחה! תודה 🙏', type: 'success' });
        } catch (e) {
            console.error('Failed to send feedback:', e);
            errorEl.textContent = 'שגיאה בשליחת המשוב. נסה שוב.';
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = 'שלח';
        }
    });
}
