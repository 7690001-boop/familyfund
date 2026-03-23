// ============================================================
// Topic Modal — Add / Edit a finance school topic with optional quiz + matching game
// ============================================================

import * as schoolService from '../../services/school-service.js';
import { esc } from '../../utils/dom-helpers.js';
import t from '../../i18n.js';

const CATEGORIES = ['מניות', 'אג"ח', 'קרנות', 'ריבית דריבית', 'פיזור', 'שוק ההון', 'כלכלה', 'כללי'];

// Each question: { question, options: [4 strings], correct: 0-3 }
let _questions = [];
// Each game pair: { term, definition }
let _gamePairs = [];

function buildQuestionHtml(q, idx) {
    return `
        <div class="quiz-builder-question" data-qidx="${idx}">
            <div class="quiz-builder-question-header">
                <span class="quiz-builder-question-num">${t.school.questionNum(idx + 1)}</span>
                <button type="button" class="quiz-builder-remove-btn" data-remove="${idx}" title="${t.school.removeQuestion}">✕</button>
            </div>
            <input type="text" class="form-input quiz-builder-question-text"
                   data-field="question" data-qidx="${idx}"
                   placeholder="${t.school.quizQuestionPlaceholder}"
                   value="${esc(q.question)}" maxlength="200" />
            <div class="quiz-builder-options">
                ${q.options.map((opt, oi) => `
                    <div class="quiz-builder-option-row">
                        <input type="radio" name="correct-${idx}" class="quiz-builder-correct-radio"
                               data-qidx="${idx}" data-oi="${oi}"
                               value="${oi}" ${q.correct === oi ? 'checked' : ''}
                               title="${t.school.markCorrect}" />
                        <input type="text" class="form-input quiz-builder-option-input"
                               data-field="option" data-qidx="${idx}" data-oi="${oi}"
                               placeholder="${t.school.optionPlaceholder(oi + 1)}"
                               value="${esc(opt)}" maxlength="120" />
                    </div>`).join('')}
            </div>
            <p class="form-hint">${t.school.markCorrectHint}</p>
        </div>
    `;
}

function renderQuizBuilder(container) {
    const list = container.querySelector('#quiz-questions-list');
    list.innerHTML = _questions.length === 0
        ? `<p class="quiz-builder-empty">${t.school.quizBuilderEmpty}</p>`
        : _questions.map((q, i) => buildQuestionHtml(q, i)).join('');

    // Wire remove buttons
    list.querySelectorAll('.quiz-builder-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _questions.splice(parseInt(btn.dataset.remove, 10), 1);
            renderQuizBuilder(container);
        });
    });

    // Wire question text inputs
    list.querySelectorAll('.quiz-builder-question-text').forEach(inp => {
        inp.addEventListener('input', () => {
            _questions[parseInt(inp.dataset.qidx, 10)].question = inp.value;
        });
    });

    // Wire option inputs
    list.querySelectorAll('.quiz-builder-option-input').forEach(inp => {
        inp.addEventListener('input', () => {
            _questions[parseInt(inp.dataset.qidx, 10)].options[parseInt(inp.dataset.oi, 10)] = inp.value;
        });
    });

    // Wire correct-answer radios
    list.querySelectorAll('.quiz-builder-correct-radio').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                _questions[parseInt(radio.dataset.qidx, 10)].correct = parseInt(radio.dataset.oi, 10);
            }
        });
    });
}

function buildGamePairHtml(pair, idx) {
    return `
        <div class="game-pair-row" data-pair-idx="${idx}">
            <input type="text" class="form-input game-pair-term"
                   data-pair-idx="${idx}" data-field="term"
                   placeholder="${t.school.gamePairTerm}"
                   value="${esc(pair.term)}" maxlength="100" />
            <input type="text" class="form-input game-pair-def"
                   data-pair-idx="${idx}" data-field="definition"
                   placeholder="${t.school.gamePairDef}"
                   value="${esc(pair.definition)}" maxlength="200" />
            <button type="button" class="game-pair-remove" data-pair-remove="${idx}" title="הסר">✕</button>
        </div>
    `;
}

function renderGameBuilder(container) {
    const builderDiv = container.querySelector('#game-builder');
    if (!builderDiv) return;
    const pairsHtml = _gamePairs.map((p, i) => buildGamePairHtml(p, i)).join('');
    builderDiv.innerHTML = `
        <p class="form-hint">${t.school.gameBuilderHint}</p>
        <div id="game-pairs-list">${pairsHtml}</div>
        <button type="button" class="btn btn-secondary game-add-pair-btn" id="game-add-pair-btn">
            ${t.school.gameAddPair}
        </button>
    `;

    builderDiv.querySelectorAll('.game-pair-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            _gamePairs.splice(parseInt(btn.dataset.pairRemove, 10), 1);
            renderGameBuilder(container);
        });
    });

    builderDiv.querySelectorAll('.game-pair-term').forEach(inp => {
        inp.addEventListener('input', () => {
            _gamePairs[parseInt(inp.dataset.pairIdx, 10)].term = inp.value;
        });
    });

    builderDiv.querySelectorAll('.game-pair-def').forEach(inp => {
        inp.addEventListener('input', () => {
            _gamePairs[parseInt(inp.dataset.pairIdx, 10)].definition = inp.value;
        });
    });

    builderDiv.querySelector('#game-add-pair-btn')?.addEventListener('click', () => {
        _gamePairs.push({ term: '', definition: '' });
        renderGameBuilder(container);
        const inputs = builderDiv.querySelectorAll('.game-pair-term');
        inputs[inputs.length - 1]?.focus();
    });
}

export function showTopicModal(familyId, user, existingTopic = null, initialCategory = null) {
    const isEditMode = existingTopic != null;

    // Initialize quiz questions
    _questions = isEditMode && existingTopic.quiz?.length
        ? existingTopic.quiz.map(q => ({
            question: q.question,
            options: [...q.options],
            correct: q.correct,
          }))
        : [];

    // Initialize game pairs
    _gamePairs = isEditMode && existingTopic.game?.pairs?.length
        ? existingTopic.game.pairs.map(p => ({ term: p.term, definition: p.definition }))
        : [];

    const hasGame = _gamePairs.length > 0;
    const isDraft = isEditMode ? existingTopic.status === 'draft' : false;
    const currentCategory = isEditMode ? existingTopic.category : (initialCategory || '');
    const isCustomCategory = currentCategory && !CATEGORIES.includes(currentCategory);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal topic-modal topic-modal-wide" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h2 class="modal-title">${isEditMode ? t.school.editTopicTitle : t.school.addTopicTitle}</h2>
                <button class="modal-close" id="topic-modal-close" aria-label="${t.common.close}">✕</button>
            </div>
            <div class="modal-body topic-modal-body">

                <div class="form-group">
                    <label class="form-label">${t.school.topicTitleLabel}</label>
                    <input class="form-input" id="topic-title" type="text"
                           placeholder="${t.school.topicTitlePlaceholder}" maxlength="120"
                           value="${esc(existingTopic?.title || '')}" />
                </div>

                <div class="form-group">
                    <label class="form-label">${t.school.topicCategoryLabel}</label>
                    <select class="form-input" id="topic-category">
                        ${CATEGORIES.map(c => `<option value="${esc(c)}" ${currentCategory === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                        <option value="__custom__" ${isCustomCategory ? 'selected' : ''}>${esc(t.school.topicCategoryCustom)}</option>
                    </select>
                    <input type="text" class="form-input" id="topic-category-custom"
                           placeholder="${esc(t.school.topicCategoryCustomPlaceholder)}"
                           value="${esc(isCustomCategory ? currentCategory : '')}"
                           style="margin-top:0.5rem;display:${isCustomCategory ? 'block' : 'none'}" maxlength="40" />
                </div>

                <div class="form-group">
                    <label class="form-label">${t.school.topicContentLabel}</label>
                    <textarea class="form-input topic-content-textarea" id="topic-content"
                              placeholder="${t.school.topicContentPlaceholder}" rows="5">${esc(existingTopic?.content || '')}</textarea>
                    <p class="form-hint">${t.school.topicContentHint}</p>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="topic-is-draft" ${isDraft ? 'checked' : ''} />
                        ${t.school.draftToggleLabel}
                    </label>
                </div>

                <div class="topic-modal-divider">
                    <span>${t.school.quizSectionLabel}</span>
                </div>

                <div id="quiz-questions-list"></div>

                <button type="button" class="btn btn-secondary quiz-builder-add-btn" id="quiz-add-question-btn">
                    ${t.school.addQuestionBtn}
                </button>

                <div class="topic-modal-divider" style="margin-top:1rem">
                    <span>${t.school.gameSection}</span>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="topic-has-game" ${hasGame ? 'checked' : ''} />
                        ${t.school.gameSection}
                    </label>
                </div>

                <div id="game-builder" class="game-builder-section" style="display:${hasGame ? 'block' : 'none'}">
                </div>

                <div class="modal-error" id="topic-modal-error" hidden></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="topic-modal-cancel">${t.common.cancel}</button>
                <button class="btn btn-primary" id="topic-modal-submit">
                    ${isEditMode ? t.school.editTopicSubmit : t.school.addTopicSubmit}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    renderQuizBuilder(overlay);
    if (hasGame) renderGameBuilder(overlay);

    const titleInput          = overlay.querySelector('#topic-title');
    const categoryInput       = overlay.querySelector('#topic-category');
    const customCategoryInput = overlay.querySelector('#topic-category-custom');
    const contentInput        = overlay.querySelector('#topic-content');
    const isDraftInput        = overlay.querySelector('#topic-is-draft');
    const hasGameInput        = overlay.querySelector('#topic-has-game');
    const gameBuilderEl       = overlay.querySelector('#game-builder');
    const errorEl             = overlay.querySelector('#topic-modal-error');
    const submitBtn           = overlay.querySelector('#topic-modal-submit');

    const close = () => { _questions = []; _gamePairs = []; overlay.remove(); };

    overlay.querySelector('#topic-modal-close').addEventListener('click', close);
    overlay.querySelector('#topic-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    categoryInput.addEventListener('change', () => {
        customCategoryInput.style.display = categoryInput.value === '__custom__' ? 'block' : 'none';
        if (categoryInput.value === '__custom__') customCategoryInput.focus();
    });

    hasGameInput.addEventListener('change', () => {
        if (hasGameInput.checked) {
            gameBuilderEl.style.display = 'block';
            if (_gamePairs.length === 0) {
                _gamePairs.push({ term: '', definition: '' });
                _gamePairs.push({ term: '', definition: '' });
            }
            renderGameBuilder(overlay);
        } else {
            gameBuilderEl.style.display = 'none';
        }
    });

    overlay.querySelector('#quiz-add-question-btn').addEventListener('click', () => {
        _questions.push({ question: '', options: ['', '', '', ''], correct: 0 });
        renderQuizBuilder(overlay);
        // Focus the new question's text input
        const inputs = overlay.querySelectorAll('.quiz-builder-question-text');
        inputs[inputs.length - 1]?.focus();
    });

    submitBtn.addEventListener('click', async () => {
        errorEl.hidden = true;
        const title    = titleInput.value.trim();
        const category = categoryInput.value === '__custom__'
            ? (customCategoryInput.value.trim() || 'כללי')
            : categoryInput.value;
        const content  = contentInput.value.trim();
        const status   = isDraftInput.checked ? 'draft' : 'published';

        if (!title) {
            errorEl.textContent = t.school.errorTitleRequired;
            errorEl.hidden = false;
            titleInput.focus();
            return;
        }
        if (!content) {
            errorEl.textContent = t.school.errorContentRequired;
            errorEl.hidden = false;
            contentInput.focus();
            return;
        }

        // Validate quiz questions if any were added
        for (let i = 0; i < _questions.length; i++) {
            const q = _questions[i];
            if (!q.question.trim()) {
                errorEl.textContent = t.school.errorQuestionText(i + 1);
                errorEl.hidden = false;
                return;
            }
            if (q.options.some(o => !o.trim())) {
                errorEl.textContent = t.school.errorQuestionOptions(i + 1);
                errorEl.hidden = false;
                return;
            }
        }

        // Validate game pairs if game is enabled
        let game = null;
        if (hasGameInput.checked) {
            const completePairs = _gamePairs.filter(p => p.term.trim() && p.definition.trim());
            if (completePairs.length < 2) {
                errorEl.textContent = t.school.gameMinPairs;
                errorEl.hidden = false;
                return;
            }
            game = { type: 'matching', pairs: completePairs.map(p => ({ term: p.term.trim(), definition: p.definition.trim() })) };
        }

        const quiz = _questions.length > 0
            ? _questions.map(q => ({
                question: q.question.trim(),
                options:  q.options.map(o => o.trim()),
                correct:  q.correct,
              }))
            : undefined;

        submitBtn.disabled = true;
        submitBtn.textContent = t.common.saving;

        const createdByName = user?.role === 'manager'
            ? (user?.displayName || t.school.parent)
            : (user?.kidName || t.school.kid);

        try {
            if (isEditMode) {
                await schoolService.updateTopic(familyId, existingTopic.id, {
                    title,
                    category,
                    content,
                    status,
                    quiz: quiz ?? null,
                    game: game ?? null,
                });
            } else {
                await schoolService.addTopic(familyId, {
                    title,
                    category,
                    content,
                    created_by_name: createdByName,
                    quiz,
                    status,
                    game,
                });
            }
            close();
        } catch (err) {
            console.error(err);
            errorEl.textContent = t.school.saveError;
            errorEl.hidden = false;
            submitBtn.disabled = false;
            submitBtn.textContent = isEditMode ? t.school.editTopicSubmit : t.school.addTopicSubmit;
        }
    });

    titleInput.focus();
}
