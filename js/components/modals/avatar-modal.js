// ============================================================
// Avatar Editor Modal — pick face parts to compose an avatar
// ============================================================

import * as store from '../../store.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import {
    DEFAULT_AVATAR, renderAvatar,
    SKIN_COLORS, HAIR_COLORS, BG_COLORS,
    EYES_OPTIONS, MOUTH_OPTIONS, HAIR_OPTIONS, ACCESSORY_OPTIONS,
    LABELS,
    EYES_LABELS, MOUTH_LABELS, HAIR_LABELS, ACCESSORY_LABELS,
} from '../ui/avatar.js';

export function showAvatarModal(kidName, currentAvatar) {
    const cfg = { ...DEFAULT_AVATAR, ...(currentAvatar || {}) };
    let draft = { ...cfg };

    function preview() {
        const el = document.getElementById('avatar-preview');
        if (el) el.innerHTML = renderAvatar(draft, 120);
    }

    function colorPicker(id, colors, current, onPick) {
        return `<div class="avatar-color-row" id="${id}">
            ${colors.map(c => `
                <button class="avatar-color-swatch${c === current ? ' active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>
            `).join('')}
        </div>`;
    }

    function optionPicker(id, options, labels, current) {
        return `<div class="avatar-option-row" id="${id}">
            ${options.map(o => `
                <button class="avatar-option-btn${o === current ? ' active' : ''}" data-value="${o}">${labels[o]}</button>
            `).join('')}
        </div>`;
    }

    const html = `
        <h2>עריכת אווטאר</h2>
        <div class="avatar-editor">
            <div class="avatar-preview-area">
                <div id="avatar-preview">${renderAvatar(draft, 120)}</div>
                <div class="avatar-kid-name">${kidName}</div>
            </div>
            <div class="avatar-controls">
                <div class="avatar-section">
                    <label>${LABELS.bgColor}</label>
                    ${colorPicker('pick-bg', BG_COLORS, draft.bgColor)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.skin}</label>
                    ${colorPicker('pick-skin', SKIN_COLORS, draft.skin)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.eyes}</label>
                    ${optionPicker('pick-eyes', EYES_OPTIONS, EYES_LABELS, draft.eyes)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.mouth}</label>
                    ${optionPicker('pick-mouth', MOUTH_OPTIONS, MOUTH_LABELS, draft.mouth)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.hair}</label>
                    ${optionPicker('pick-hair', HAIR_OPTIONS, HAIR_LABELS, draft.hair)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.hairColor}</label>
                    ${colorPicker('pick-hair-color', HAIR_COLORS, draft.hairColor)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.accessory}</label>
                    ${optionPicker('pick-accessory', ACCESSORY_OPTIONS, ACCESSORY_LABELS, draft.accessory)}
                </div>
                <button class="btn btn-ghost avatar-randomize" id="avatar-randomize" type="button">🎲 אקראי</button>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');

    // Wire color pickers
    function wireColors(containerId, key) {
        modal.querySelector('#' + containerId)?.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-color-swatch');
            if (!btn) return;
            draft[key] = btn.dataset.color;
            // Update active state
            modal.querySelectorAll('#' + containerId + ' .avatar-color-swatch').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            preview();
        });
    }
    wireColors('pick-bg', 'bgColor');
    wireColors('pick-skin', 'skin');
    wireColors('pick-hair-color', 'hairColor');

    // Wire option pickers
    function wireOptions(containerId, key) {
        modal.querySelector('#' + containerId)?.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-option-btn');
            if (!btn) return;
            draft[key] = btn.dataset.value;
            modal.querySelectorAll('#' + containerId + ' .avatar-option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            preview();
        });
    }
    wireOptions('pick-eyes', 'eyes');
    wireOptions('pick-mouth', 'mouth');
    wireOptions('pick-hair', 'hair');
    wireOptions('pick-accessory', 'accessory');

    // Randomize
    modal.querySelector('#avatar-randomize')?.addEventListener('click', () => {
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        draft = {
            skin: pick(SKIN_COLORS),
            hair: pick(HAIR_OPTIONS),
            hairColor: pick(HAIR_COLORS),
            eyes: pick(EYES_OPTIONS),
            mouth: pick(MOUTH_OPTIONS),
            accessory: pick(ACCESSORY_OPTIONS),
            bgColor: pick(BG_COLORS),
        };
        // Rebuild the controls section to reflect new active states
        rebuildControls();
        preview();
    });

    function rebuildControls() {
        // Update all active states without rebuilding the whole modal
        function updateColorActive(containerId, value) {
            modal.querySelectorAll('#' + containerId + ' .avatar-color-swatch').forEach(b => {
                b.classList.toggle('active', b.dataset.color === value);
            });
        }
        function updateOptionActive(containerId, value) {
            modal.querySelectorAll('#' + containerId + ' .avatar-option-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.value === value);
            });
        }
        updateColorActive('pick-bg', draft.bgColor);
        updateColorActive('pick-skin', draft.skin);
        updateColorActive('pick-hair-color', draft.hairColor);
        updateOptionActive('pick-eyes', draft.eyes);
        updateOptionActive('pick-mouth', draft.mouth);
        updateOptionActive('pick-hair', draft.hair);
        updateOptionActive('pick-accessory', draft.accessory);
    }

    // Cancel / Save
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = 'שומר...';

        try {
            const user = store.get('user');
            const members = store.get('members') || [];
            const member = members.find(m => m.name === kidName);
            if (member) {
                await familyService.updateMember(user.familyId, member.uid || member.id, { avatar: draft });
            }
            closeModal();
            emit('toast', { message: 'האווטאר עודכן!', type: 'success' });
        } catch (e) {
            console.error('Failed to save avatar:', e);
            emit('toast', { message: 'שגיאה בשמירת האווטאר', type: 'error' });
            btn.disabled = false;
            btn.textContent = 'שמור';
        }
    });
}
