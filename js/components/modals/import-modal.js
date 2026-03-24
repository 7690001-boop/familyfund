// ============================================================
// Import Modal — import topics (+ quiz/game) from a JSON file
// or pasted JSON. A template download makes the format explicit.
// ============================================================

import * as schoolService from '../../services/school-service.js';
import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import t from '../../i18n.js';

const VALID_CATEGORIES = ['מניות', 'אג"ח', 'קרנות', 'ריבית דריבית', 'פיזור', 'שוק ההון', 'כלכלה', 'כללי'];

// ── Template (downloadable example) ─────────────────────────

const TEMPLATE = [
    {
        title: 'שם הנושא',
        category: 'כללי',
        content: 'כתבו כאן את תוכן הנושא.\nכל שורה חדשה תוצג כפסקה נפרדת.',
        quiz: [
            {
                question: 'כתבו כאן את השאלה?',
                options: ['תשובה א', 'תשובה ב', 'תשובה ג', 'תשובה ד'],
                correct: 0,   // מספר התשובה הנכונה: 0 = א, 1 = ב, 2 = ג, 3 = ד
            },
        ],
        game: {
            type: 'matching',
            pairs: [
                { term: 'מושג ראשון',  definition: 'הגדרה של המושג הראשון' },
                { term: 'מושג שני',   definition: 'הגדרה של המושג השני' },
                { term: 'מושג שלישי', definition: 'הגדרה של המושג השלישי' },
            ],
        },
    },
];

function downloadTemplate() {
    const json = JSON.stringify(TEMPLATE, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'school-topic-template.json';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Parsing & validation ─────────────────────────────────────

function parseJson(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw.trim());
    } catch {
        throw new Error(t.school.importParseError);
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const topics = [];
    for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const isDelete = item._delete === true;
        // Delete entries only need an id or template_id, no title required
        if (!isDelete && !String(item.title || '').trim()) continue;
        topics.push({
            id:          item.id || null,
            template_id: item.template_id || null,
            _delete:     isDelete,
            title:       String(item.title || '').trim(),
            category:    (typeof item.category === 'string' && item.category.trim()) ? item.category.trim() : 'כללי',
            content:     String(item.content || '').trim(),
            status:      item.status === 'draft' ? 'draft' : 'published',
            quiz:        normalizeQuiz(item.quiz),
            game:        normalizeGame(item.game),
        });
    }
    if (topics.length === 0) throw new Error(t.school.importNoTopics);
    return topics;
}

function normalizeQuiz(quiz) {
    if (!Array.isArray(quiz) || quiz.length === 0) return undefined;
    const valid = quiz
        .filter(q => q?.question && Array.isArray(q.options) && q.options.length === 4)
        .map(q => ({
            question: String(q.question).trim(),
            options:  q.options.map(o => String(o ?? '').trim()),
            correct:  Math.max(0, Math.min(3, parseInt(q.correct, 10) || 0)),
        }))
        .filter(q => q.question && q.options.every(o => o));
    return valid.length > 0 ? valid : undefined;
}

function normalizeGame(game) {
    if (!game || game.type !== 'matching' || !Array.isArray(game.pairs)) return null;
    const pairs = game.pairs
        .filter(p => p?.term && p?.definition)
        .map(p => ({ term: String(p.term).trim(), definition: String(p.definition).trim() }))
        .filter(p => p.term && p.definition);
    return pairs.length >= 2 ? { type: 'matching', pairs } : null;
}

// ── Preview card ─────────────────────────────────────────────

function previewCardHtml(topic, idx) {
    const badges = [];
    if (topic._delete) {
        badges.push(`<span class="import-badge delete">${t.school.importWillDelete}</span>`);
    } else {
        if (topic.quiz?.length)        badges.push(`<span class="import-badge quiz">${t.school.importQuizCount(topic.quiz.length)}</span>`);
        if (topic.game?.pairs?.length) badges.push(`<span class="import-badge game">${t.school.importGamePairs(topic.game.pairs.length)}</span>`);
        if (topic.status === 'draft')  badges.push(`<span class="import-badge draft">${t.school.draftBadge}</span>`);
        if (!VALID_CATEGORIES.includes(topic.category)) badges.push(`<span class="import-badge new-cat">📌 ${t.school.importNewCategory}</span>`);
        if (topic.id || topic.template_id) badges.push(`<span class="import-badge has-id">${t.school.importHasId}</span>`);
        else                               badges.push(`<span class="import-badge no-id">${t.school.importNoId}</span>`);
    }
    const displayTitle = topic.title || topic.id || topic.template_id || '';
    return `
        <label class="import-preview-card">
            <input type="checkbox" class="import-topic-check" data-idx="${idx}" checked />
            <div class="import-preview-info">
                <span class="import-preview-title">${esc(displayTitle)}</span>
                <span class="import-preview-cat">${topic._delete ? '' : esc(topic.category)}</span>
                ${badges.join('')}
            </div>
        </label>`;
}

// ── Main ─────────────────────────────────────────────────────

export function showImportModal(familyId, user) {
    let _parsedTopics = [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal import-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h2 class="modal-title">${t.school.importModalTitle}</h2>
                <button class="modal-close" id="import-modal-close" aria-label="${t.common.close}">✕</button>
            </div>
            <div class="modal-body">

                <!-- Step 1: download template -->
                <div class="import-step">
                    <span class="import-step-num">1</span>
                    <div class="import-step-body">
                        <span class="import-step-label">${t.school.importStep1}</span>
                        <button class="btn btn-secondary import-template-btn" id="import-template-btn">
                            ${t.school.importDownloadTemplate}
                        </button>
                    </div>
                </div>

                <!-- Step 2: upload or paste -->
                <div class="import-step">
                    <span class="import-step-num">2</span>
                    <div class="import-step-body">
                        <span class="import-step-label">${t.school.importStep2}</span>
                        <label class="btn btn-secondary import-file-label" id="import-file-label">
                            ${t.school.importUploadBtn}
                            <input type="file" id="import-file-input" accept=".json,application/json" hidden />
                        </label>
                        <span class="import-file-name" id="import-file-name"></span>
                    </div>
                </div>

                <!-- Optional: paste JSON -->
                <details class="import-paste-details">
                    <summary>${t.school.importOrPaste}</summary>
                    <div class="import-paste-body">
                        <textarea class="form-input import-json-textarea" id="import-json-text"
                                  placeholder="${t.school.importPastePlaceholder}"
                                  rows="6" spellcheck="false" dir="ltr"></textarea>
                        <button class="btn btn-secondary import-parse-btn" id="import-parse-btn">${t.school.importParseBtn}</button>
                    </div>
                </details>

                <div id="import-parse-error" class="modal-error" hidden></div>

                <div id="import-preview-section" hidden>
                    <p class="import-preview-label">${t.school.importPreviewTitle}</p>
                    <div id="import-preview-list" class="import-preview-list"></div>

                    <!-- Import mode selector -->
                    <div class="import-mode-row">
                        <span class="import-mode-label">${t.school.importModeLabel}</span>
                        <label class="import-mode-option">
                            <input type="radio" name="import-mode" value="add" checked />
                            ${t.school.importModeAdd}
                        </label>
                        <label class="import-mode-option">
                            <input type="radio" name="import-mode" value="replace" />
                            ${t.school.importModeReplace}
                        </label>
                        <label class="import-mode-option">
                            <input type="radio" name="import-mode" value="override" />
                            ${t.school.importModeOverride}
                        </label>
                    </div>
                </div>

            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="import-modal-cancel">${t.common.cancel}</button>
                <button class="btn btn-secondary" id="import-add-manual-btn">${t.school.importAddManualBtn}</button>
                <button class="btn btn-primary" id="import-submit-btn" hidden></button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fileInput   = overlay.querySelector('#import-file-input');
    const fileName    = overlay.querySelector('#import-file-name');
    const textarea    = overlay.querySelector('#import-json-text');
    const parseBtn    = overlay.querySelector('#import-parse-btn');
    const parseError  = overlay.querySelector('#import-parse-error');
    const previewSec  = overlay.querySelector('#import-preview-section');
    const previewList = overlay.querySelector('#import-preview-list');
    const submitBtn   = overlay.querySelector('#import-submit-btn');

    const getMode = () => overlay.querySelector('input[name="import-mode"]:checked')?.value || 'add';

    const close = () => overlay.remove();
    overlay.querySelector('#import-modal-close').addEventListener('click', close);
    overlay.querySelector('#import-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Template download
    overlay.querySelector('#import-template-btn').addEventListener('click', downloadTemplate);

    // Add topic manually — close import modal and open topic modal
    overlay.querySelector('#import-add-manual-btn').addEventListener('click', async () => {
        close();
        const { showTopicModal } = await import('./topic-modal.js');
        showTopicModal(familyId, user);
    });

    // ── Shared parse & preview logic ──────────────────────────

    const showPreview = (raw) => {
        parseError.hidden = true;
        previewSec.hidden = true;
        submitBtn.hidden = true;
        if (!raw?.trim()) return;
        try {
            _parsedTopics = parseJson(raw);
        } catch (err) {
            parseError.textContent = err.message;
            parseError.hidden = false;
            return;
        }
        previewList.innerHTML = _parsedTopics.map((tp, i) => previewCardHtml(tp, i)).join('');
        previewSec.hidden = false;
        updateSubmitBtn();
    };

    const updateSubmitBtn = () => {
        const n = overlay.querySelectorAll('.import-topic-check:checked').length;
        submitBtn.hidden = n === 0;
        const mode = getMode();
        if (mode === 'replace') submitBtn.textContent = t.school.importSubmitReplace(n);
        else if (mode === 'override') submitBtn.textContent = t.school.importSubmitOverride(n);
        else submitBtn.textContent = t.school.importSubmitBtn(n);
    };

    // File upload → auto-parse immediately
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        fileName.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => showPreview(e.target.result);
        reader.readAsText(file, 'utf-8');
    });

    // Paste → manual parse button
    parseBtn.addEventListener('click', () => showPreview(textarea.value));
    textarea.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') showPreview(textarea.value); });

    previewList.addEventListener('change', updateSubmitBtn);
    overlay.querySelectorAll('input[name="import-mode"]').forEach(r => r.addEventListener('change', updateSubmitBtn));

    // ── Import selected ───────────────────────────────────────
    submitBtn.addEventListener('click', async () => {
        const selected = [...overlay.querySelectorAll('.import-topic-check:checked')]
            .map(cb => _parsedTopics[parseInt(cb.dataset.idx, 10)]);
        if (!selected.length) return;

        const mode = getMode();

        if (mode === 'override' && !window.confirm(t.school.importModeOverrideWarn)) return;

        submitBtn.disabled = true;
        parseBtn.disabled  = true;

        const authorName = user?.role === 'manager'
            ? (store.get('family')?.family_name || t.school.parent)
            : (user?.kidName || t.school.kid);

        try {
            if (mode === 'override') {
                submitBtn.textContent = t.school.importingProgress(0, selected.length);
                await schoolService.overrideAllTopics(familyId, selected, authorName);
                submitBtn.textContent = t.school.importSuccess(selected.length);
                setTimeout(close, 1400);
                return;
            }

            let done = 0;
            for (const topic of selected) {
                submitBtn.textContent = t.school.importingProgress(done, selected.length);
                try {
                    if (mode === 'replace') {
                        if (topic._delete) {
                            if (topic.id) {
                                await schoolService.deleteTopic(familyId, topic.id);
                            } else if (topic.template_id) {
                                await schoolService.deleteTopicByTemplateId(familyId, topic.template_id);
                            }
                        } else if (topic.id) {
                            const { id: _id, _delete, ...data } = topic;
                            await schoolService.upsertTopicById(familyId, topic.id, data);
                        } else if (topic.template_id) {
                            const { id: _id, _delete, ...data } = topic;
                            await schoolService.upsertTopicByTemplateId(familyId, topic.template_id, data, authorName);
                        } else {
                            const { id: _id, template_id: _tid, _delete, ...data } = topic;
                            await schoolService.addTopic(familyId, { ...data, created_by_name: authorName });
                        }
                    } else {
                        // mode === 'add'
                        const { id: _id, template_id: _tid, _delete, ...data } = topic;
                        await schoolService.addTopic(familyId, { ...data, created_by_name: authorName });
                    }
                    done++;
                } catch (err) {
                    console.error('Import error:', err);
                    parseError.textContent = `${t.school.importError}: ${topic.title || topic.id}`;
                    parseError.hidden = false;
                    submitBtn.disabled = false;
                    parseBtn.disabled  = false;
                    submitBtn.textContent = mode === 'replace'
                        ? t.school.importSubmitReplace(selected.length - done)
                        : t.school.importSubmitBtn(selected.length - done);
                    return;
                }
            }

            submitBtn.textContent = t.school.importSuccess(done);
            setTimeout(close, 1400);
        } catch (err) {
            console.error('Import error:', err);
            parseError.textContent = `${t.school.importError}: ${err.message}`;
            parseError.hidden = false;
            submitBtn.disabled = false;
            parseBtn.disabled  = false;
            updateSubmitBtn();
        }
    });
}
