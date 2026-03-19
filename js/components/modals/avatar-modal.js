// ============================================================
// Avatar Editor Modal — pick face parts to compose an avatar
// ============================================================

import * as store from '../../store.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import {
    DEFAULT_AVATAR, renderAvatar,
    SKIN_COLORS, EYE_COLORS, HAIR_COLORS, BG_COLORS,
    FACE_SHAPE_OPTIONS, EYES_OPTIONS, EYEBROW_OPTIONS, MOUTH_OPTIONS,
    HAIR_OPTIONS, ACCESSORY_OPTIONS, GLASSES_OPTIONS,
    LABELS,
    FACE_SHAPE_LABELS, EYES_LABELS, EYEBROW_LABELS, MOUTH_LABELS,
    HAIR_LABELS, ACCESSORY_LABELS, GLASSES_LABELS,
} from '../ui/avatar.js';
import t from '../../i18n.js';

export function showAvatarModal(kidName, currentAvatar) {
    const cfg = { ...DEFAULT_AVATAR, ...(currentAvatar || {}) };
    // Normalize legacy single accessory to array
    if (cfg.accessory && cfg.accessory !== 'none' && (!cfg.accessories || !cfg.accessories.length)) {
        cfg.accessories = [cfg.accessory];
    }
    if (!Array.isArray(cfg.accessories)) cfg.accessories = [];
    const originalCfg = { ...cfg, accessories: [...cfg.accessories] };
    let draft = { ...cfg, accessories: [...cfg.accessories] };

    let saveTimer = null;
    let saveGeneration = 0;

    function updateStatus(status) {
        const el = document.getElementById('avatar-save-status');
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
                    await familyService.updateMember(user.familyId, member.uid || member.id, { avatar: draft });
                }
                if (gen === saveGeneration) updateStatus('saved');
            } catch (e) {
                console.error('Failed to save avatar:', e);
                if (gen === saveGeneration) {
                    updateStatus('error');
                    emit('toast', { message: t.errors.saveAvatarError, type: 'error' });
                }
            }
        }, 400);
    }

    function preview() {
        const el = document.getElementById('avatar-preview');
        if (el) el.innerHTML = renderAvatar(draft, 120);
    }

    function colorPicker(id, colors, current) {
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

    function multiOptionPicker(id, options, labels, currentArr) {
        return `<div class="avatar-option-row" id="${id}">
            ${options.map(o => `
                <button class="avatar-option-btn avatar-multi-btn${currentArr.includes(o) ? ' active' : ''}" data-value="${o}">${labels[o]}</button>
            `).join('')}
        </div>`;
    }

    function togglePicker(id, label, current) {
        return `<div class="avatar-option-row" id="${id}">
            <button class="avatar-option-btn${current ? ' active' : ''}" data-value="true">${label}</button>
            <button class="avatar-option-btn${!current ? ' active' : ''}" data-value="false">${t.avatar.frecklesOff}</button>
        </div>`;
    }

    const html = `
        <h2>${t.avatar.title}</h2>
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
                    <label>${LABELS.faceShape}</label>
                    ${optionPicker('pick-face', FACE_SHAPE_OPTIONS, FACE_SHAPE_LABELS, draft.faceShape)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.skin}</label>
                    ${colorPicker('pick-skin', SKIN_COLORS, draft.skin)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.eyebrows}</label>
                    ${optionPicker('pick-eyebrows', EYEBROW_OPTIONS, EYEBROW_LABELS, draft.eyebrows)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.eyes}</label>
                    ${optionPicker('pick-eyes', EYES_OPTIONS, EYES_LABELS, draft.eyes)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.eyeColor}</label>
                    ${colorPicker('pick-eye-color', EYE_COLORS, draft.eyeColor)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.glasses}</label>
                    ${optionPicker('pick-glasses', GLASSES_OPTIONS, GLASSES_LABELS, draft.glasses)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.mouth}</label>
                    ${optionPicker('pick-mouth', MOUTH_OPTIONS, MOUTH_LABELS, draft.mouth)}
                </div>
                <div class="avatar-section">
                    <label>${LABELS.freckles}</label>
                    ${togglePicker('pick-freckles', t.avatar.frecklesOn, draft.freckles)}
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
                    <label>${LABELS.accessories} <span class="avatar-hint">${t.avatar.multiHint}</span></label>
                    ${multiOptionPicker('pick-accessories', ACCESSORY_OPTIONS, ACCESSORY_LABELS, draft.accessories)}
                </div>
                <button class="btn btn-ghost avatar-randomize" id="avatar-randomize" type="button">${t.avatar.randomize}</button>
            </div>
        </div>
        <div class="modal-actions">
            <span class="avatar-save-status" id="avatar-save-status"></span>
            <button class="btn btn-secondary" id="modal-cancel">${t.avatar.cancel}</button>
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
            modal.querySelectorAll('#' + containerId + ' .avatar-color-swatch').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            preview();
            autoSave();
        });
    }
    wireColors('pick-bg', 'bgColor');
    wireColors('pick-skin', 'skin');
    wireColors('pick-eye-color', 'eyeColor');
    wireColors('pick-hair-color', 'hairColor');

    // Wire single-select option pickers
    function wireOptions(containerId, key) {
        modal.querySelector('#' + containerId)?.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-option-btn');
            if (!btn) return;
            draft[key] = btn.dataset.value;
            modal.querySelectorAll('#' + containerId + ' .avatar-option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            preview();
            autoSave();
        });
    }
    wireOptions('pick-face', 'faceShape');
    wireOptions('pick-eyes', 'eyes');
    wireOptions('pick-eyebrows', 'eyebrows');
    wireOptions('pick-mouth', 'mouth');
    wireOptions('pick-hair', 'hair');
    wireOptions('pick-glasses', 'glasses');

    // Wire multi-select accessories (toggle on/off)
    modal.querySelector('#pick-accessories')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.avatar-multi-btn');
        if (!btn) return;
        const val = btn.dataset.value;
        const idx = draft.accessories.indexOf(val);
        if (idx >= 0) {
            draft.accessories.splice(idx, 1);
            btn.classList.remove('active');
        } else {
            draft.accessories.push(val);
            btn.classList.add('active');
        }
        preview();
        autoSave();
    });

    // Wire freckles toggle
    modal.querySelector('#pick-freckles')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.avatar-option-btn');
        if (!btn) return;
        draft.freckles = btn.dataset.value === 'true';
        modal.querySelectorAll('#pick-freckles .avatar-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        preview();
        autoSave();
    });

    // Randomize
    modal.querySelector('#avatar-randomize')?.addEventListener('click', () => {
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        // Pick 0-3 random accessories
        const numAcc = Math.floor(Math.random() * 3);
        const shuffled = [...ACCESSORY_OPTIONS].sort(() => Math.random() - 0.5);
        const randomAccs = shuffled.slice(0, numAcc);

        draft = {
            skin: pick(SKIN_COLORS),
            faceShape: pick(FACE_SHAPE_OPTIONS),
            hair: pick(HAIR_OPTIONS),
            hairColor: pick(HAIR_COLORS),
            eyes: pick(EYES_OPTIONS),
            eyeColor: pick(EYE_COLORS),
            eyebrows: pick(EYEBROW_OPTIONS),
            mouth: pick(MOUTH_OPTIONS),
            accessories: randomAccs,
            glasses: pick(GLASSES_OPTIONS),
            freckles: Math.random() > 0.7,
            bgColor: pick(BG_COLORS),
        };
        rebuildControls();
        preview();
        autoSave();
    });

    function rebuildControls() {
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
        updateColorActive('pick-eye-color', draft.eyeColor);
        updateColorActive('pick-hair-color', draft.hairColor);
        updateOptionActive('pick-face', draft.faceShape);
        updateOptionActive('pick-eyes', draft.eyes);
        updateOptionActive('pick-eyebrows', draft.eyebrows);
        updateOptionActive('pick-mouth', draft.mouth);
        updateOptionActive('pick-hair', draft.hair);
        updateOptionActive('pick-glasses', draft.glasses);
        // Multi-select accessories
        modal.querySelectorAll('#pick-accessories .avatar-multi-btn').forEach(b => {
            b.classList.toggle('active', draft.accessories.includes(b.dataset.value));
        });
        // Freckles toggle
        modal.querySelectorAll('#pick-freckles .avatar-option-btn').forEach(b => {
            b.classList.toggle('active', (b.dataset.value === 'true') === draft.freckles);
        });
    }

    // Cancel — revert to original avatar
    modal.querySelector('#modal-cancel').addEventListener('click', async () => {
        clearTimeout(saveTimer);
        saveGeneration++; // invalidate any pending auto-save
        try {
            const user = store.get('user');
            const members = store.get('members') || [];
            const member = members.find(m => m.name === kidName);
            if (member) {
                await familyService.updateMember(user.familyId, member.uid || member.id, { avatar: originalCfg });
            }
        } catch (e) {
            console.error('Failed to revert avatar:', e);
        }
        closeModal();
    });
}
