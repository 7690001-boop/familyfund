// ============================================================
// Family Announcement Modal — create/edit family announcements
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as announcementService from '../../services/family-announcement-service.js';
import t from '../../i18n.js';

export function showAnnouncementModal(existing) {
    const isEdit = !!existing;
    const item = existing || {};

    const html = `
        <h2>${t.announcements.modalTitle}</h2>
        <div class="form-group">
            <label for="ann-title">${t.announcements.titleLabel}</label>
            <input type="text" id="ann-title" placeholder="" value="${esc(item.title || '')}">
        </div>
        <div class="form-group">
            <label for="ann-text">${t.announcements.textLabel}</label>
            <textarea id="ann-text" rows="3" style="width:100%;resize:vertical">${esc(item.text || '')}</textarea>
        </div>
        <div class="modal-actions">
            ${isEdit ? `<button class="btn btn-danger" id="modal-delete" style="margin-inline-end:auto">${t.common.delete}</button>` : ''}
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.common.save}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const title = modal.querySelector('#ann-title').value.trim();
        const text = modal.querySelector('#ann-text').value.trim();
        if (!text) return;

        const user = store.get('user');
        try {
            if (isEdit) {
                await announcementService.update(user.familyId, existing.id, { title, text });
            } else {
                await announcementService.add(user.familyId, { title, text });
            }
            closeModal();
            emit('toast', { message: t.announcements.savedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.common.error, type: 'error' });
        }
    });

    if (isEdit) {
        modal.querySelector('#modal-delete').addEventListener('click', async () => {
            const user = store.get('user');
            try {
                await announcementService.remove(user.familyId, existing.id);
                closeModal();
                emit('toast', { message: t.announcements.deletedToast, type: 'success' });
            } catch (e) {
                emit('toast', { message: t.common.error, type: 'error' });
            }
        });
    }
}
