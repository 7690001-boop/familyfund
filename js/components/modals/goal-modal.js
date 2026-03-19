// ============================================================
// Goal Modal — add/edit savings goals
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { toDateStr } from '../../utils/format.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import t from '../../i18n.js';

export function showGoalModal(kid, existing) {
    const isEdit = !!existing;
    const title = isEdit ? t.goalModal.titleEdit : t.goalModal.titleAdd;
    const g = existing || {};
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';
    const user = store.get('user');

    const html = `
        <h2>${title}</h2>
        <div class="form-group">
            <label for="goal-name">${t.goalModal.nameLabel}</label>
            <input type="text" id="goal-name" placeholder="${t.goalModal.namePlaceholder}" value="${esc(g.goal_name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="goal-target">${t.goalModal.targetLabel(sym)}</label>
                <input type="number" id="goal-target" step="any" min="0" value="${g.target_amount || ''}">
            </div>
            <div class="form-group">
                <label for="goal-deadline">${t.goalModal.deadlineLabel}</label>
                <input type="date" id="goal-deadline" value="${toDateStr(g.deadline)}">
            </div>
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
        const goalName = modal.querySelector('#goal-name').value.trim();
        const targetAmount = modal.querySelector('#goal-target').value;
        const deadline = modal.querySelector('#goal-deadline').value;

        if (!goalName) { modal.querySelector('#goal-name').focus(); return; }
        if (!targetAmount) { modal.querySelector('#goal-target').focus(); return; }

        const record = {
            kid,
            kid_uid: user.uid,
            goal_name: goalName,
            target_amount: parseFloat(targetAmount),
            deadline: deadline || null,
        };

        try {
            const { add, update } = await import('../../services/goal-service.js');
            if (isEdit) {
                await update(user.familyId, existing.id, record);
            } else {
                await add(user.familyId, record);
            }
            closeModal();
            emit('toast', { message: isEdit ? t.goalModal.updatedToast : t.goalModal.addedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.goalModal.saveErrorToast, type: 'error' });
        }
    });

    if (isEdit) {
        modal.querySelector('#modal-delete').addEventListener('click', () => {
            deleteGoal(existing.id);
            closeModal();
        });
    }

    modal.querySelector('#goal-name').focus();
}

export async function deleteGoal(id) {
    try {
        const user = store.get('user');
        const { remove } = await import('../../services/goal-service.js');
        await remove(user.familyId, id);
        emit('toast', { message: t.goalModal.deletedToast, type: 'success' });
    } catch (e) {
        emit('toast', { message: t.goalModal.deleteErrorToast, type: 'error' });
    }
}
