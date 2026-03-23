// ============================================================
// School View — Finance school: topic browsing + family discussion
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import * as schoolService from '../../services/school-service.js';
import t from '../../i18n.js';

const CATEGORIES = ['מניות', 'אג"ח', 'קרנות', 'ריבית דריבית', 'פיזור', 'שוק ההון', 'כלכלה', 'כללי'];

let _container = null;
let _unsubs = [];
let _renderTimer = null;
let _activeFilter = '';
let _expandedTopicId = null;
let _unsubComments = null;
let _comments = [];
let _familyId = null;
let _quizState = {}; // { [topicId]: { [qIdx]: selectedOptionIdx } }
let _gameState = {}; // { [topicId]: { selected: number|null, matched: Set, shuffledDefs: number[] } }
let _questions = []; // questions for expanded topic
let _unsubQuestions = null;

function debouncedRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(renderView, 50);
}

export async function mount(container) {
    unmount();
    _container = container;

    const user = store.get('user');
    _familyId = user?.familyId;
    if (!_familyId) return;

    await schoolService.listen(_familyId);

    _unsubs.push(store.subscribe('schoolTopics', debouncedRender));
    renderView();
}

export function unmount() {
    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    if (_unsubComments) { _unsubComments(); _unsubComments = null; }
    if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
    schoolService.stopListening();
    _container = null;
    _expandedTopicId = null;
    _comments = [];
    _activeFilter = '';
    _quizState = {};
    _gameState = {};
    _questions = [];
}

function renderView() {
    if (!_container) return;
    const user = store.get('user');
    const topics = store.get('schoolTopics') || [];
    const isManager = user?.role === 'manager';

    const filtered = _activeFilter
        ? topics.filter(t => t.category === _activeFilter)
        : topics;

    const customCats = [...new Set(topics.map(tp => tp.category).filter(c => c && !CATEGORIES.includes(c)))];
    const allCats = [...CATEGORIES, ...customCats];
    const filterPills = ['', ...allCats].map(cat => {
        const label = cat || t.school.filterAll;
        const active = _activeFilter === cat ? ' active' : '';
        return `<button class="school-filter-pill${active}" data-cat="${esc(cat)}">${esc(label)}</button>`;
    }).join('');

    const topicsHtml = filtered.length === 0
        ? `<div class="school-empty">
               ${t.school.emptyTopics}
               ${isManager && !_activeFilter ? `<br><button class="btn btn-secondary school-seed-btn" id="school-seed-topics-btn" style="margin-top:1rem">${t.school.seedTopicsBtn}</button>` : ''}
           </div>`
        : filtered.map(topic => renderTopicCard(topic, isManager, user)).join('');

    _container.innerHTML = `
        <section class="school-view">
            <div class="school-header">
                <div class="school-title-row">
                    <div>
                        <h2 class="school-title">📚 ${t.school.title}</h2>
                        <p class="school-subtitle">${t.school.subtitle}</p>
                    </div>
                    <div class="school-manager-btns">
                        ${isManager ? `<button class="btn btn-secondary school-seed-btn" id="school-seed-topics-btn">${t.school.seedTopicsBtn}</button>` : ''}
                        ${isManager ? `<button class="btn btn-secondary school-import-btn" id="school-import-btn">${t.school.importTopicBtn}</button>` : ''}
                        ${isManager ? `<button class="btn btn-primary school-add-btn" id="school-add-topic-btn">${t.school.addTopicBtn}</button>` : ''}
                    </div>
                </div>
                <div class="school-filters">${filterPills}</div>
            </div>
            <div class="school-topics" id="school-topics-list">
                ${topicsHtml}
            </div>
        </section>
    `;

    wireEvents();

    // Re-render comments if a topic is expanded
    if (_expandedTopicId) {
        const expanded = _container.querySelector(`.topic-card[data-topic-id="${CSS.escape(_expandedTopicId)}"]`);
        if (expanded) renderCommentsPanel(expanded);
    }
}

function renderTopicCard(topic, isManager, user) {
    const isExpanded = topic.id === _expandedTopicId;
    const commentCount = topic.comment_count ?? 0;
    const catColor = categoryColor(topic.category);
    const dateStr = topic.created_at ? new Date(topic.created_at).toLocaleDateString('he-IL') : '';

    const contentLines = (topic.content || '').split('\n').map(line => `<p>${esc(line)}</p>`).join('');

    const commentsHtml = isExpanded
        ? renderComments(topic, isManager, user)
        : '';

    return `
        <div class="topic-card${isExpanded ? ' expanded' : ''}" data-topic-id="${esc(topic.id)}">
            <div class="topic-card-header" data-action="toggle">
                <div class="topic-card-main">
                    <span class="topic-category-badge" style="--cat-color:${catColor}">${esc(topic.category || t.school.categoryGeneral)}</span>
                    ${topic.status === 'draft' ? `<span class="topic-draft-badge">${t.school.draftBadge}</span>` : ''}
                    <h3 class="topic-title-text">${esc(topic.title)}</h3>
                </div>
                <div class="topic-card-meta">
                    <span class="topic-comment-count">💬 ${commentCount}</span>
                    ${dateStr ? `<span class="topic-date">${esc(dateStr)}</span>` : ''}
                    ${isManager ? `<button class="topic-delete-btn" data-action="delete" title="${t.school.deleteTopic}">🗑</button>` : ''}
                    <span class="topic-chevron">${isExpanded ? '▲' : '▼'}</span>
                </div>
            </div>
            ${isExpanded ? `
            <div class="topic-card-body">
                <div class="topic-content">${contentLines}</div>
                ${renderQuiz(topic)}
                ${renderGame(topic)}
                ${renderQuestions(topic, isManager, user)}
                <div class="topic-discussion" id="discussion-${esc(topic.id)}">
                    ${commentsHtml}
                </div>
                <div class="topic-card-footer-actions">
                    <button class="btn btn-secondary-outline topic-edit-btn" data-action="edit">
                        ${t.school.editTopicBtn}
                    </button>
                    <button class="btn btn-secondary-outline topic-export-btn" data-action="export">
                        ${t.school.exportTopicBtn}
                    </button>
                    ${isManager ? `<button class="btn btn-danger-outline topic-delete-full-btn" data-action="delete">
                        🗑 ${t.school.deleteTopic}
                    </button>` : ''}
                </div>
            </div>` : ''}
        </div>
    `;
}

function renderComments(topic, isManager, user) {
    const commentsHtml = _comments.length === 0
        ? `<p class="school-no-comments">${t.school.noComments}</p>`
        : _comments.map(c => `
            <div class="school-comment" data-comment-id="${esc(c.id)}">
                <span class="school-comment-author">${esc(c.author_name || '?')}</span>
                <span class="school-comment-text">${esc(c.text)}</span>
                ${isManager ? `<button class="school-comment-delete" data-comment-id="${esc(c.id)}" title="${t.school.deleteComment}">✕</button>` : ''}
            </div>`).join('');

    const displayName = user?.role === 'manager'
        ? (store.get('family')?.family_name || t.school.parent)
        : (user?.kidName || t.school.kid);

    return `
        <div class="school-discussion-header">${t.school.discussionTitle}</div>
        <div class="school-comments-list">${commentsHtml}</div>
        <div class="school-comment-form">
            <input class="school-comment-input" id="comment-input-${esc(topic.id)}"
                   type="text" placeholder="${t.school.commentPlaceholder}" maxlength="500" />
            <button class="btn btn-small btn-primary school-comment-submit"
                    id="comment-submit-${esc(topic.id)}">${t.school.commentSubmit}</button>
        </div>
    `;
}

function renderQuiz(topic) {
    if (!topic.quiz?.length) return '';
    const state = _quizState[topic.id] || {};
    const answeredCount = Object.keys(state).length;
    const allAnswered = answeredCount === topic.quiz.length;

    const questionsHtml = topic.quiz.map((q, qi) => {
        const selected = state[qi];
        const answered = selected !== undefined;

        const optionsHtml = q.options.map((opt, oi) => {
            let cls = 'quiz-option';
            if (answered) {
                if (oi === q.correct) cls += ' correct';
                else if (oi === selected) cls += ' wrong';
                else cls += ' muted';
            }
            return `<button class="${cls}" data-qi="${qi}" data-oi="${oi}" ${answered ? 'disabled' : ''}>${esc(opt)}</button>`;
        }).join('');

        const feedbackHtml = answered
            ? `<div class="quiz-feedback ${selected === q.correct ? 'correct' : 'wrong'}">${
                selected === q.correct
                    ? t.school.quizCorrect
                    : `${t.school.quizWrong} <strong>${esc(q.options[q.correct])}</strong>`
              }</div>`
            : '';

        return `
            <div class="quiz-question" data-qi="${qi}">
                <p class="quiz-question-text">${esc(q.question)}</p>
                <div class="quiz-options">${optionsHtml}</div>
                ${feedbackHtml}
            </div>`;
    }).join('');

    let scoreHtml = '';
    if (allAnswered) {
        const correct = topic.quiz.filter((q, qi) => state[qi] === q.correct).length;
        const total = topic.quiz.length;
        const label = correct === total ? t.school.quizPerfect
            : correct >= total / 2 ? t.school.quizGood
            : t.school.quizTryAgain;
        scoreHtml = `
            <div class="quiz-score">
                <span>${t.school.quizScore} ${correct}/${total}</span>
                <span>${label}</span>
            </div>
            <button class="quiz-retry-btn" data-quiz-retry="${esc(topic.id)}">${t.school.quizRetryBtn}</button>`;
    }

    return `
        <div class="topic-quiz" data-quiz-topic-id="${esc(topic.id)}">
            <div class="quiz-header">${t.school.quizHeader}</div>
            ${questionsHtml}
            ${scoreHtml}
        </div>`;
}

function renderGame(topic) {
    if (!topic.game?.pairs?.length) return '';
    const pairs = topic.game.pairs;
    const topicId = topic.id;
    if (!_gameState[topicId]) {
        const n = pairs.length;
        const shuffledDefs = [...Array(n).keys()].sort(() => Math.random() - 0.5);
        _gameState[topicId] = { selected: null, matched: new Set(), shuffledDefs };
    }
    const state = _gameState[topicId];
    const allMatched = state.matched.size === pairs.length;
    const termsHtml = pairs.map((pair, ti) => {
        const isMatched = state.matched.has(ti);
        const isSelected = state.selected === ti;
        let cls = 'game-term';
        if (isMatched) cls += ' matched';
        else if (isSelected) cls += ' selected';
        return `<div class="${cls}" data-ti="${ti}">${esc(pair.term)}</div>`;
    }).join('');
    const defsHtml = state.shuffledDefs.map((originalTi, di) => {
        const isMatched = state.matched.has(originalTi);
        let cls = 'game-def';
        if (isMatched) cls += ' matched';
        return `<div class="${cls}" data-di="${di}">${esc(pairs[originalTi].definition)}</div>`;
    }).join('');
    return `
        <div class="topic-game" data-game-topic-id="${esc(topicId)}">
            <div class="game-header">${t.school.gameHeader}</div>
            ${!allMatched ? `<p class="game-instructions">${t.school.gameInstructions}</p>` : ''}
            <div class="game-board">
                <div class="game-column game-terms-col">${termsHtml}</div>
                <div class="game-column game-defs-col">${defsHtml}</div>
            </div>
            ${allMatched ? `
                <div class="game-complete">${t.school.gameComplete}</div>
                <button class="game-retry-btn" data-game-retry="${esc(topicId)}">${t.school.gameRetry}</button>
            ` : ''}
        </div>`;
}

function renderQuestions(topic, isManager, user) {
    const authorName = user?.role === 'manager'
        ? (store.get('family')?.family_name || t.school.parent)
        : (user?.kidName || t.school.kid);
    const questionsHtml = _questions.length === 0
        ? `<p class="school-no-questions">${t.school.noQuestions}</p>`
        : _questions.map(q => `
            <div class="question-item${q.answer ? ' answered' : ''}" data-question-id="${esc(q.id)}">
                <div class="question-row">
                    <span class="question-mark">❓</span>
                    <span class="question-author">${esc(q.author_name || '?')}:</span>
                    <span class="question-text-body">${esc(q.text)}</span>
                    ${isManager ? `<button class="question-delete-btn" data-question-id="${esc(q.id)}" title="${t.school.deleteQuestion}">✕</button>` : ''}
                </div>
                ${q.answer
                    ? `<div class="question-answer">
                           <span class="answer-label">${t.school.answerLabel}:</span>
                           <span class="answer-author">${esc(q.answer.author_name || '?')}:</span>
                           <span class="answer-text">${esc(q.answer.text)}</span>
                       </div>`
                    : (isManager ? `<div class="question-answer-form" id="answer-form-${esc(q.id)}">
                           <input class="school-comment-input answer-input" type="text"
                                  placeholder="${t.school.answerPlaceholder}" maxlength="300" />
                           <button class="btn btn-small btn-secondary answer-submit-btn"
                                   data-question-id="${esc(q.id)}">${t.school.answerSubmit}</button>
                       </div>` : '')
                }
            </div>`).join('');
    return `
        <div class="topic-questions" id="questions-${esc(topic.id)}">
            <div class="questions-section-header">${t.school.questionsHeader}</div>
            <div class="questions-list">${questionsHtml}</div>
            <div class="school-comment-form">
                <input class="school-comment-input" id="question-input-${esc(topic.id)}"
                       type="text" placeholder="${t.school.questionPlaceholder}" maxlength="300" />
                <button class="btn btn-small btn-primary" id="question-submit-${esc(topic.id)}">${t.school.questionSubmit}</button>
            </div>
        </div>`;
}

function categoryColor(cat) {
    const map = {
        'מניות':          '#3b82f6',
        'אג"ח':           '#8b5cf6',
        'קרנות':          '#10b981',
        'ריבית דריבית':   '#f59e0b',
        'פיזור':          '#ec4899',
        'שוק ההון':       '#06b6d4',
        'כלכלה':          '#f97316',
        'כללי':           '#6b7280',
    };
    return map[cat] || '#6b7280';
}

async function expandTopic(topicId) {
    if (_unsubComments) { _unsubComments(); _unsubComments = null; }
    if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
    _comments = [];
    _questions = [];
    _expandedTopicId = topicId;

    // Start listening to comments; on each update, re-render the discussion panel only
    _unsubComments = await schoolService.listenComments(_familyId, topicId, (comments) => {
        _comments = comments;
        if (!_container) return;
        const discussion = _container.querySelector(`#discussion-${CSS.escape(topicId)}`);
        if (discussion) {
            const user = store.get('user');
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(t => t.id === topicId);
            if (topic) {
                discussion.innerHTML = renderComments(topic, user?.role === 'manager', user);
                wireCommentFormEvents(topicId);
            }
        }
    });

    // Start listening to questions
    _unsubQuestions = await schoolService.listenQuestions(_familyId, topicId, (questions) => {
        _questions = questions;
        if (!_container) return;
        const questionsEl = _container.querySelector(`#questions-${CSS.escape(topicId)}`);
        if (questionsEl) {
            const user = store.get('user');
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(tp => tp.id === topicId);
            if (topic) {
                questionsEl.outerHTML = renderQuestions(topic, user?.role === 'manager', user);
                wireQuestionFormEvents(topicId);
            }
        }
    });

    debouncedRender();
}

function collapseTopic() {
    if (_unsubComments) { _unsubComments(); _unsubComments = null; }
    if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
    _comments = [];
    _questions = [];
    _expandedTopicId = null;
    debouncedRender();
}

function wireEvents() {
    if (!_container) return;
    const user = store.get('user');

    // Category filter pills
    _container.querySelectorAll('.school-filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            _activeFilter = pill.dataset.cat;
            _expandedTopicId = null;
            if (_unsubComments) { _unsubComments(); _unsubComments = null; }
            if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
            _comments = [];
            _questions = [];
            debouncedRender();
        });
    });

    // Topic cards: toggle expand / delete / edit
    _container.querySelectorAll('.topic-card').forEach(card => {
        const topicId = card.dataset.topicId;

        card.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="delete"]') || e.target.closest('[data-action="edit"]') || e.target.closest('[data-action="export"]')) return;
            if (_expandedTopicId === topicId) {
                collapseTopic();
            } else {
                expandTopic(topicId);
            }
        });

        card.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(t.school.confirmDeleteTopic)) return;
                try {
                    await schoolService.deleteTopic(_familyId, topicId);
                    if (_expandedTopicId === topicId) collapseTopic();
                } catch {
                    alert(t.school.deleteError);
                }
            });
        });

        card.querySelector('[data-action="edit"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(tp => tp.id === topicId);
            if (!topic) return;
            const { showTopicModal } = await import('../modals/topic-modal.js');
            showTopicModal(_familyId, user, topic);
        });

        card.querySelector('[data-action="export"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(tp => tp.id === topicId);
            if (!topic) return;
            exportTopic(topic);
        });
    });

    // Wire comment form if expanded
    if (_expandedTopicId) wireCommentFormEvents(_expandedTopicId);

    // Wire question form if expanded
    if (_expandedTopicId) wireQuestionFormEvents(_expandedTopicId);

    // Add topic button
    _container.querySelector('#school-add-topic-btn')?.addEventListener('click', async () => {
        const { showTopicModal } = await import('../modals/topic-modal.js');
        showTopicModal(_familyId, user);
    });

    // Seed topics button
    _container.querySelector('#school-seed-topics-btn')?.addEventListener('click', async () => {
        if (!confirm(t.school.seedTopicsConfirm)) return;
        const btn = _container.querySelector('#school-seed-topics-btn');
        if (btn) btn.disabled = true;
        try {
            const createdByName = user?.role === 'manager'
                ? (store.get('family')?.family_name || t.school.parent)
                : (user?.kidName || t.school.kid);
            await schoolService.seedDefaultTopics(_familyId, createdByName);
        } catch (err) {
            console.error(err);
            alert(t.school.seedTopicsError);
            if (btn) btn.disabled = false;
        }
    });

    // Import button
    _container.querySelector('#school-import-btn')?.addEventListener('click', async () => {
        const { showImportModal } = await import('../modals/import-modal.js');
        showImportModal(_familyId, user);
    });

    // Quiz interactions
    _container.querySelectorAll('.topic-quiz').forEach(quizEl => {
        wireQuizEvents(quizEl, quizEl.dataset.quizTopicId);
    });

    // Game interactions
    _container.querySelectorAll('.topic-game').forEach(gameEl => {
        wireGameEvents(gameEl, gameEl.dataset.gameTopicId);
    });
}

function wireQuizEvents(quizEl, topicId) {
    quizEl.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const qi = parseInt(btn.dataset.qi, 10);
            const oi = parseInt(btn.dataset.oi, 10);
            if (!_quizState[topicId]) _quizState[topicId] = {};
            _quizState[topicId][qi] = oi;
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(tp => tp.id === topicId);
            if (topic) {
                const newQuizHtml = renderQuiz(topic);
                const tmp = document.createElement('div');
                tmp.innerHTML = newQuizHtml;
                quizEl.replaceWith(tmp.firstElementChild);
                const newEl = _container?.querySelector(`.topic-quiz[data-quiz-topic-id="${CSS.escape(topicId)}"]`);
                if (newEl) wireQuizEvents(newEl, topicId);
            }
        });
    });

    quizEl.querySelector('.quiz-retry-btn')?.addEventListener('click', () => {
        delete _quizState[topicId];
        const topics = store.get('schoolTopics') || [];
        const topic = topics.find(tp => tp.id === topicId);
        if (topic) {
            const newQuizHtml = renderQuiz(topic);
            const tmp = document.createElement('div');
            tmp.innerHTML = newQuizHtml;
            quizEl.replaceWith(tmp.firstElementChild);
            const newEl = _container?.querySelector(`.topic-quiz[data-quiz-topic-id="${CSS.escape(topicId)}"]`);
            if (newEl) wireQuizEvents(newEl, topicId);
        }
    });
}

function wireGameEvents(gameEl, topicId) {
    const topics = store.get('schoolTopics') || [];
    const topic = topics.find(tp => tp.id === topicId);
    const pairs = topic?.game?.pairs;
    if (!pairs) return;
    const state = _gameState[topicId];
    if (!state) return;

    // Retry
    gameEl.querySelector(`[data-game-retry]`)?.addEventListener('click', () => {
        const n = pairs.length;
        _gameState[topicId] = { selected: null, matched: new Set(), shuffledDefs: [...Array(n).keys()].sort(() => Math.random() - 0.5) };
        const newHtml = renderGame(topic);
        const tmp = document.createElement('div');
        tmp.innerHTML = newHtml;
        gameEl.replaceWith(tmp.firstElementChild);
        const newEl = _container?.querySelector(`.topic-game[data-game-topic-id="${CSS.escape(topicId)}"]`);
        if (newEl) wireGameEvents(newEl, topicId);
    });

    // Term clicks
    gameEl.querySelectorAll('.game-term:not(.matched)').forEach(termEl => {
        termEl.addEventListener('click', () => {
            const ti = parseInt(termEl.dataset.ti, 10);
            if (state.selected === ti) {
                state.selected = null;
                termEl.classList.remove('selected');
                return;
            }
            gameEl.querySelectorAll('.game-term.selected').forEach(el => el.classList.remove('selected'));
            state.selected = ti;
            termEl.classList.add('selected');
        });
    });

    // Def clicks
    gameEl.querySelectorAll('.game-def:not(.matched)').forEach(defEl => {
        defEl.addEventListener('click', () => {
            if (state.selected === null) return;
            const di = parseInt(defEl.dataset.di, 10);
            const originalTi = state.shuffledDefs[di];
            const selectedTermEl = gameEl.querySelector(`.game-term[data-ti="${state.selected}"]`);
            if (originalTi === state.selected) {
                state.matched.add(originalTi);
                state.selected = null;
                selectedTermEl?.classList.remove('selected');
                selectedTermEl?.classList.add('matched');
                defEl.classList.add('matched');
                if (state.matched.size === pairs.length) {
                    const newHtml = renderGame(topic);
                    const tmp = document.createElement('div');
                    tmp.innerHTML = newHtml;
                    gameEl.replaceWith(tmp.firstElementChild);
                    const newEl = _container?.querySelector(`.topic-game[data-game-topic-id="${CSS.escape(topicId)}"]`);
                    if (newEl) wireGameEvents(newEl, topicId);
                }
            } else {
                selectedTermEl?.classList.add('wrong');
                defEl.classList.add('wrong');
                setTimeout(() => {
                    selectedTermEl?.classList.remove('wrong', 'selected');
                    defEl.classList.remove('wrong');
                    state.selected = null;
                }, 700);
            }
        });
    });
}

function exportTopic(topic) {
    const data = {
        title:    topic.title,
        category: topic.category,
        content:  topic.content || '',
        status:   topic.status || 'published',
    };
    if (topic.quiz?.length)       data.quiz = topic.quiz;
    if (topic.game?.pairs?.length) data.game = topic.game;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${topic.title.replace(/[^\w\u0590-\u05FF]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function wireCommentFormEvents(topicId) {
    const input = _container?.querySelector(`#comment-input-${CSS.escape(topicId)}`);
    const submit = _container?.querySelector(`#comment-submit-${CSS.escape(topicId)}`);
    if (!input || !submit) return;

    const user = store.get('user');
    const authorName = user?.role === 'manager'
        ? (store.get('family')?.family_name || t.school.parent)
        : (user?.kidName || t.school.kid);

    const doSubmit = async () => {
        const text = input.value.trim();
        if (!text) return;
        submit.disabled = true;
        try {
            await schoolService.addComment(_familyId, topicId, text, authorName);
            input.value = '';
        } catch {
            alert(t.school.commentError);
        } finally {
            submit.disabled = false;
            input.focus();
        }
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });

    // Delete comment buttons
    _container?.querySelectorAll('.school-comment-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const commentId = btn.dataset.commentId;
            try {
                await schoolService.deleteComment(_familyId, topicId, commentId);
            } catch {
                alert(t.school.deleteError);
            }
        });
    });
}

function wireQuestionFormEvents(topicId) {
    const input = _container?.querySelector(`#question-input-${CSS.escape(topicId)}`);
    const submit = _container?.querySelector(`#question-submit-${CSS.escape(topicId)}`);
    if (!input || !submit) return;

    const user = store.get('user');
    const authorName = user?.role === 'manager'
        ? (store.get('family')?.family_name || t.school.parent)
        : (user?.kidName || t.school.kid);

    const doSubmit = async () => {
        const text = input.value.trim();
        if (!text) return;
        submit.disabled = true;
        try {
            await schoolService.addQuestion(_familyId, topicId, text, authorName);
            input.value = '';
        } catch {
            alert(t.school.questionError);
        } finally {
            submit.disabled = false;
            input.focus();
        }
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });

    // Answer forms (manager only)
    _container?.querySelectorAll('.answer-submit-btn').forEach(btn => {
        const qId = btn.dataset.questionId;
        const answerInput = btn.closest('.question-answer-form')?.querySelector('.answer-input');
        if (!answerInput) return;
        const doAnswer = async () => {
            const text = answerInput.value.trim();
            if (!text) return;
            btn.disabled = true;
            try {
                await schoolService.answerQuestion(_familyId, topicId, qId, text, authorName);
            } catch {
                alert(t.school.answerError);
                btn.disabled = false;
            }
        };
        btn.addEventListener('click', doAnswer);
        answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAnswer(); });
    });

    // Delete question buttons
    _container?.querySelectorAll('.question-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await schoolService.deleteQuestion(_familyId, topicId, btn.dataset.questionId);
            } catch {
                alert(t.school.deleteError);
            }
        });
    });
}

function renderCommentsPanel(cardEl) {
    const topicId = cardEl.dataset.topicId;
    const discussion = cardEl.querySelector(`#discussion-${CSS.escape(topicId)}`);
    if (!discussion) return;
    const user = store.get('user');
    const topics = store.get('schoolTopics') || [];
    const topic = topics.find(tp => tp.id === topicId);
    if (topic) {
        discussion.innerHTML = renderComments(topic, user?.role === 'manager', user);
        wireCommentFormEvents(topicId);
    }
}
