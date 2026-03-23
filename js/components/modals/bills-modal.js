// ============================================================
// Bills Modal — add/edit a family recurring bill
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as billsService from '../../services/bills-service.js';
import t from '../../i18n.js';

export function showBillsModal(existing) {
    const isEdit = !!existing;
    const bill = existing || {};
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    const html = `
        <h2>${isEdit ? t.bills.editTitle : t.bills.modalTitle}</h2>
        <div class="form-group">
            <label for="bill-name">${t.bills.nameLabel}</label>
            <input type="text" id="bill-name" placeholder="${t.bills.namePlaceholder}" value="${esc(bill.name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="bill-amount">${t.bills.amountLabel(sym)}</label>
                <input type="number" id="bill-amount" step="any" min="0" value="${bill.amount || ''}">
            </div>
            <div class="form-group">
                <label for="bill-frequency">${t.bills.frequencyLabel}</label>
                <select id="bill-frequency">
                    <option value="monthly" ${bill.frequency !== 'yearly' ? 'selected' : ''}>${t.bills.monthly}</option>
                    <option value="yearly" ${bill.frequency === 'yearly' ? 'selected' : ''}>${t.bills.yearly}</option>
                </select>
            </div>
        </div>
        <div class="form-group settings-toggle-row">
            <label class="settings-toggle-label">
                <input type="checkbox" id="bill-active" ${bill.active === false ? '' : 'checked'}>
                <span>${t.bills.activeLabel}</span>
            </label>
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
        const name = modal.querySelector('#bill-name').value.trim();
        const amount = parseFloat(modal.querySelector('#bill-amount').value);
        const frequency = modal.querySelector('#bill-frequency').value;
        const active = modal.querySelector('#bill-active').checked;

        if (!name || isNaN(amount) || amount <= 0) return;

        const user = store.get('user');
        try {
            if (isEdit) {
                await billsService.update(user.familyId, existing.id, { name, amount, frequency, active });
            } else {
                await billsService.add(user.familyId, { name, amount, frequency, active });
            }
            closeModal();
            emit('toast', { message: t.bills.savedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.common.error, type: 'error' });
        }
    });

    if (isEdit) {
        modal.querySelector('#modal-delete').addEventListener('click', async () => {
            const user = store.get('user');
            try {
                await billsService.remove(user.familyId, existing.id);
                closeModal();
                emit('toast', { message: t.bills.deletedToast, type: 'success' });
            } catch (e) {
                emit('toast', { message: t.common.error, type: 'error' });
            }
        });
    }
}
