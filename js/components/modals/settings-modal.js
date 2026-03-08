// ============================================================
// Settings Modal — family configuration
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';

export function showSettingsModal() {
    const family = store.get('family') || {};

    const html = `
        <h2>הגדרות</h2>
        <div class="form-group">
            <label for="cfg-family">שם המשפחה</label>
            <input type="text" id="cfg-family" value="${esc(family.family_name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="cfg-currency">סמל מטבע</label>
                <input type="text" id="cfg-currency" value="${esc(family.currency_symbol || '₪')}">
            </div>
            <div class="form-group">
                <label for="cfg-matching-days">ימים להתאמה</label>
                <input type="number" id="cfg-matching-days" min="1" value="${family.matching_days || 365}">
            </div>
        </div>
        <div class="form-group">
            <label for="cfg-sp500">טיקר S&P 500</label>
            <input type="text" id="cfg-sp500" dir="ltr" placeholder="למשל: VOO" value="${esc(family.sp500_ticker || '')}">
            <div class="form-hint">הטיקר שמשמש לתוכנית ההתאמה של ההורים</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        try {
            const user = store.get('user');
            await familyService.updateFamily(user.familyId, {
                family_name: modal.querySelector('#cfg-family').value.trim(),
                currency_symbol: modal.querySelector('#cfg-currency').value.trim() || '₪',
                matching_days: parseInt(modal.querySelector('#cfg-matching-days').value) || 365,
                sp500_ticker: modal.querySelector('#cfg-sp500').value.trim(),
            });
            closeModal();
            emit('toast', { message: 'הגדרות נשמרו', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בשמירת הגדרות', type: 'error' });
        }
    });
}
