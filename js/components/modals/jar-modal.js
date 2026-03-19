// ============================================================
// Jar Modal — pick a savings container type
// Auto-saves on each selection; cancel reverts to original.
// Same pattern as avatar-modal.js.
// ============================================================

import * as store from '../../store.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import { JAR_TYPES, JAR_LABELS, renderJar } from '../ui/jar.js';
import t from '../../i18n.js';

export function showJarModal(kidName, currentJarType = 'glass') {
    let selected = currentJarType;
    const originalType = currentJarType;
    let saveTimer = null;
    let saveGeneration = 0;

    function updateStatus(status) {
        const el = document.getElementById('jar-save-status');
        if (!el) return;
        if (status === 'saving') { el.textContent = t.common.saving; el.className = 'avatar-save-status saving'; }
        else if (status === 'saved') { el.textContent = t.common.saved; el.className = 'avatar-save-status saved'; }
        else if (status === 'error') { el.textContent = t.common.error; el.className = 'avatar-save-status error'; }
        else { el.textContent = ''; el.className = 'avatar-save-status'; }
    }

    async function autoSave() {
        clearTimeout(saveTimer);
        const gen = ++saveGeneration;
        updateStatus('saving');
        saveTimer = setTimeout(async () => {
            if (gen !== saveGeneration) return;
            try {
                const user = store.get('user');
                const members = store.get('members') || [];
                const member = members.find(m => m.name === kidName);
                if (member) {
                    await familyService.updateMember(user.familyId, member.uid || member.id, { jarType: selected });
                }
                if (gen === saveGeneration) updateStatus('saved');
            } catch (e) {
                console.error('Failed to save jar:', e);
                if (gen === saveGeneration) {
                    updateStatus('error');
                    emit('toast', { message: t.errors.saveJarError, type: 'error' });
                }
            }
        }, 400);
    }

    function optionHtml(type) {
        const active = type === selected ? ' active' : '';
        return `
            <button class="jar-option-btn${active}" data-type="${type}">
                <div class="jar-option-preview">${renderJar(type, 58)}</div>
                <div class="jar-option-label">${JAR_LABELS[type]}</div>
            </button>`;
    }

    const html = `
        <h2>${t.jar.title}</h2>
        <div class="jar-modal-preview">
            <div id="jar-big-preview" class="jar-big-preview">${renderJar(selected, 90)}</div>
            <div class="jar-big-preview-name" id="jar-big-preview-name">${JAR_LABELS[selected]}</div>
        </div>
        <div class="jar-picker">
            ${JAR_TYPES.map(optionHtml).join('')}
        </div>
        <div class="modal-actions">
            <span class="avatar-save-status" id="jar-save-status"></span>
            <button class="btn btn-secondary" id="jar-cancel-btn">${t.jar.cancel}</button>
        </div>`;

    openModal(html);
    const modal = document.getElementById('modal-content');

    modal.querySelectorAll('.jar-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selected = btn.dataset.type;
            modal.querySelectorAll('.jar-option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update live preview
            const bigPreview = modal.querySelector('#jar-big-preview');
            if (bigPreview) bigPreview.innerHTML = renderJar(selected, 90);
            const bigName = modal.querySelector('#jar-big-preview-name');
            if (bigName) bigName.textContent = JAR_LABELS[selected];
            autoSave();
        });
    });

    // Cancel — revert to original jar type
    modal.querySelector('#jar-cancel-btn').addEventListener('click', async () => {
        clearTimeout(saveTimer);
        saveGeneration++;
        try {
            const user = store.get('user');
            const members = store.get('members') || [];
            const member = members.find(m => m.name === kidName);
            if (member) {
                await familyService.updateMember(user.familyId, member.uid || member.id, { jarType: originalType });
            }
        } catch (e) {
            console.error('Failed to revert jar:', e);
        }
        closeModal();
    });
}
