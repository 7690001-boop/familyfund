// ============================================================
// Feedback Modal — send feedback/ideas/bugs to system admin
// ============================================================

import { open as openModal, close as closeModal } from '../ui/modal.js';
import { emit } from '../../event-bus.js';
import t from '../../i18n.js';

// Sub-type pill groups per feedback type (pre-rendered in template)
function subTypePills(type, items) {
    return `<div class="feedback-subtype-group" data-for="${type}" style="display:none;gap:0.5rem;flex-wrap:wrap">
        ${items.map(([v, label]) =>
            `<button type="button" class="feedback-pill" data-value="${v}"
                style="padding:0.45rem 0.85rem;border:2px solid var(--color-border);border-radius:20px;
                       background:none;cursor:pointer;font-size:0.82rem;font-family:inherit;
                       transition:all 0.15s;white-space:nowrap;color:var(--color-text)">${label}</button>`
        ).join('')}
    </div>`;
}

export function showFeedbackModal() {
    const html = `
        <h2 style="margin-bottom:0.5rem">${t.feedback.title}</h2>
        <p style="color:var(--color-text-muted);font-size:0.85rem;margin-bottom:1.25rem">
            ${t.feedback.subtitle}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">
            <div class="form-group" style="margin-bottom:0">
                <label for="feedback-type">${t.feedback.typeLabel}</label>
                <select id="feedback-type" class="form-input">
                    <option value="idea">${t.feedback.typeIdea}</option>
                    <option value="bug">${t.feedback.typeBug}</option>
                    <option value="improvement">${t.feedback.typeImprovement}</option>
                    <option value="other">${t.feedback.typeOther}</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
                <label for="feedback-area">${t.feedback.areaLabel}</label>
                <select id="feedback-area" class="form-input">
                    <option value="">${t.feedback.areaGeneral}</option>
                    <option value="dashboard">${t.feedback.areaDashboard}</option>
                    <option value="kid-view">${t.feedback.areaKidView}</option>
                    <option value="family-view">${t.feedback.areaFamilyView}</option>
                    <option value="school">${t.feedback.areaSchool}</option>
                    <option value="settings">${t.feedback.areaSettings}</option>
                    <option value="import">${t.feedback.areaImport}</option>
                    <option value="members">${t.feedback.areaMembers}</option>
                    <option value="other">${t.feedback.areaOther}</option>
                </select>
            </div>
        </div>

        <div id="feedback-subtype-wrap" class="form-group" hidden>
            <label>${t.feedback.subTypeLabel}</label>
            ${subTypePills('bug', [
                ['visual',      t.feedback.bugVisual],
                ['functional',  t.feedback.bugFunctional],
                ['performance', t.feedback.bugPerformance],
                ['content',     t.feedback.bugContent],
            ])}
            ${subTypePills('idea', [
                ['new-feature', t.feedback.ideaNewFeature],
                ['enhance',     t.feedback.ideaEnhance],
                ['ux',          t.feedback.ideaUx],
                ['data',        t.feedback.ideaData],
            ])}
            ${subTypePills('improvement', [
                ['speed',        t.feedback.improvSpeed],
                ['design',       t.feedback.improvDesign],
                ['usability',    t.feedback.improvUsability],
                ['missing-info', t.feedback.improvMissingInfo],
            ])}
        </div>

        <div class="form-group" style="margin-bottom:0.5rem">
            <label for="feedback-text">${t.feedback.messageLabel}</label>
            <textarea id="feedback-text" class="form-input" rows="7"
                style="resize:vertical;min-height:160px;font-size:1rem;line-height:1.6;padding:0.85rem 1rem"></textarea>
        </div>

        <div id="feedback-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="feedback-cancel">${t.feedback.cancelBtn}</button>
            <button class="btn btn-primary" id="feedback-send">${t.feedback.sendBtn}</button>
        </div>
    `;

    openModal(html);
    const modal    = document.getElementById('modal-content');
    modal.style.maxWidth = '600px';

    modal.querySelector('#feedback-cancel').addEventListener('click', closeModal);

    const typeSelect  = modal.querySelector('#feedback-type');
    const subtypeWrap = modal.querySelector('#feedback-subtype-wrap');
    const textarea    = modal.querySelector('#feedback-text');

    const placeholders = {
        bug:         t.feedback.messagePlaceholderBug,
        idea:        t.feedback.messagePlaceholderIdea,
        improvement: t.feedback.messagePlaceholderImprovement,
        other:       t.feedback.messagePlaceholderOther,
    };

    let selectedSub = '';

    function activateType(type) {
        selectedSub = '';
        // Show/hide sub-type pill groups
        const groups = subtypeWrap.querySelectorAll('.feedback-subtype-group');
        let hasGroup = false;
        groups.forEach(g => {
            const active = g.dataset.for === type;
            g.style.display = active ? 'flex' : 'none';
            if (active) hasGroup = true;
            // Reset pill state
            g.querySelectorAll('.feedback-pill').forEach(b => {
                b.style.borderColor = 'var(--color-border)';
                b.style.background  = 'none';
                b.style.color       = 'var(--color-text)';
            });
        });
        subtypeWrap.hidden = !hasGroup;
        textarea.placeholder = placeholders[type] || placeholders.other;
    }

    // Pill toggle (delegated)
    subtypeWrap.addEventListener('click', e => {
        const btn = e.target.closest('.feedback-pill');
        if (!btn) return;
        const group = btn.closest('.feedback-subtype-group');
        const val   = btn.dataset.value;
        if (selectedSub === val) {
            selectedSub         = '';
            btn.style.borderColor = 'var(--color-border)';
            btn.style.background  = 'none';
            btn.style.color       = 'var(--color-text)';
        } else {
            group.querySelectorAll('.feedback-pill').forEach(b => {
                b.style.borderColor = 'var(--color-border)';
                b.style.background  = 'none';
                b.style.color       = 'var(--color-text)';
            });
            selectedSub           = val;
            btn.style.borderColor = 'var(--color-primary)';
            btn.style.background  = 'var(--color-primary)';
            btn.style.color       = '#fff';
        }
    });

    typeSelect.addEventListener('change', () => activateType(typeSelect.value));

    // Init
    activateType(typeSelect.value);
    textarea.focus();

    modal.querySelector('#feedback-send').addEventListener('click', async () => {
        const text    = textarea.value.trim();
        const type    = typeSelect.value;
        const area    = modal.querySelector('#feedback-area').value;
        const errorEl = modal.querySelector('#feedback-error');
        const btn     = modal.querySelector('#feedback-send');

        if (!text) {
            textarea.focus();
            return;
        }

        btn.disabled    = true;
        btn.textContent = t.common.sending;

        try {
            const { sendFeedback } = await import('../../services/feedback-service.js');
            await sendFeedback({
                text,
                type,
                area:    area        || null,
                subType: selectedSub || null,
            });
            closeModal();
            emit('toast', { message: t.feedback.successToast, type: 'success' });
        } catch (e) {
            console.error('Failed to send feedback:', e);
            errorEl.textContent = t.errors.saveFeedbackError;
            errorEl.hidden      = false;
            btn.disabled        = false;
            btn.textContent     = t.feedback.sendBtn;
        }
    });
}
