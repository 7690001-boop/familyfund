// ============================================================
// Kid Modals — rename, delete kid; context menu
// Accepts onRenamed/onDeleted callbacks so the shell can update
// its active-tab state without coupling back to the shell module.
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as investmentService from '../../services/investment-service.js';
import * as goalService from '../../services/goal-service.js';
import * as familyService from '../../services/family-service.js';

export function showKidContextMenu(kid, { onRenamed, onDeleted } = {}) {
    const html = `
        <h2>${esc(kid)}</h2>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
            <button class="btn btn-secondary" id="ctx-rename">שנה שם</button>
            <button class="btn btn-danger" id="ctx-delete">מחק ילד/ה</button>
            <button class="btn btn-secondary" id="ctx-close">סגור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#ctx-rename').addEventListener('click', () => { closeModal(); showRenameKidModal(kid, onRenamed); });
    modal.querySelector('#ctx-delete').addEventListener('click', () => { closeModal(); showDeleteKidModal(kid, onDeleted); });
    modal.querySelector('#ctx-close').addEventListener('click', closeModal);
}

function showRenameKidModal(kid, onRenamed) {
    const html = `
        <h2>שינוי שם</h2>
        <div class="form-group">
            <label for="kid-new-name">שם חדש</label>
            <input type="text" id="kid-new-name" value="${esc(kid)}">
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
        const newName = modal.querySelector('#kid-new-name').value.trim();
        if (!newName) { modal.querySelector('#kid-new-name').focus(); return; }

        try {
            const user = store.get('user');
            const investments = store.get('investments') || [];
            const goals = store.get('goals') || [];

            const invUpdates = investments.filter(i => i.kid === kid).map(i =>
                investmentService.update(user.familyId, i.id, { kid: newName })
            );
            const goalUpdates = goals.filter(g => g.kid === kid).map(g =>
                goalService.update(user.familyId, g.id, { kid: newName })
            );
            await Promise.all([...invUpdates, ...goalUpdates]);

            const members = store.get('members') || [];
            const member = members.find(m => m.name === kid);
            if (member) {
                await familyService.updateMember(user.familyId, member.uid, { name: newName });
            }

            closeModal();
            if (onRenamed) onRenamed(newName);
            emit('toast', { message: 'שם עודכן', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בעדכון שם', type: 'error' });
        }
    });
    modal.querySelector('#kid-new-name').focus();
}

function showDeleteKidModal(kid, onDeleted) {
    const investments = (store.get('investments') || []).filter(i => i.kid === kid);
    const goals = (store.get('goals') || []).filter(g => g.kid === kid);

    const html = `
        <h2>מחיקת ${esc(kid)}?</h2>
        <p>פעולה זו תמחק את כל ההשקעות (${investments.length}) והיעדים (${goals.length}) של ${esc(kid)}.</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-danger" id="modal-delete">מחק</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-delete').addEventListener('click', async () => {
        try {
            const user = store.get('user');

            const delInv = investments.map(i => investmentService.remove(user.familyId, i.id));
            const delGoals = goals.map(g => goalService.remove(user.familyId, g.id));
            await Promise.all([...delInv, ...delGoals]);

            const members = store.get('members') || [];
            const member = members.find(m => m.name === kid);
            if (member) {
                await familyService.removeMember(user.familyId, member.uid || member.id);
            }

            closeModal();
            if (onDeleted) onDeleted();
            emit('toast', { message: kid + ' נמחק/ה', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה במחיקה', type: 'error' });
            closeModal();
        }
    });
}
