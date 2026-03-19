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
import t from '../../i18n.js';

export function showKidContextMenu(kid, { onRenamed, onDeleted } = {}) {
    const html = `
        <h2>${esc(kid)}</h2>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
            <button class="btn btn-secondary" id="ctx-rename">${t.kidModals.renameBtn}</button>
            <button class="btn btn-danger" id="ctx-delete">${t.kidModals.deleteBtn}</button>
            <button class="btn btn-secondary" id="ctx-close">${t.common.close}</button>
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
        <h2>${t.kidModals.renameTitle}</h2>
        <div class="form-group">
            <label for="kid-new-name">${t.kidModals.newNameLabel}</label>
            <input type="text" id="kid-new-name" value="${esc(kid)}">
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.common.save}</button>
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
            emit('toast', { message: t.kidModals.nameUpdated, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.kidModals.nameUpdateError, type: 'error' });
        }
    });
    modal.querySelector('#kid-new-name').focus();
}

function showDeleteKidModal(kid, onDeleted) {
    const investments = (store.get('investments') || []).filter(i => i.kid === kid);
    const goals = (store.get('goals') || []).filter(g => g.kid === kid);

    const html = `
        <h2>${t.kidModals.deleteTitle(esc(kid))}</h2>
        <p>${t.kidModals.deleteBody(esc(kid), investments.length, goals.length)}</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-danger" id="modal-delete">${t.common.delete}</button>
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
            emit('toast', { message: t.kidModals.deleted(kid), type: 'success' });
        } catch (e) {
            emit('toast', { message: t.kidModals.deleteError, type: 'error' });
            closeModal();
        }
    });
}
