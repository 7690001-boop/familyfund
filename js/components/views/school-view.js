// ============================================================
// School Panel — Collapsible sidebar with topic carousel
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import * as schoolService from '../../services/school-service.js';
import t from '../../i18n.js';

const VISIBLE = 3; // topic bars shown at once

let _container = null;
let _unsubs = [];
let _renderTimer = null;
let _familyId = null;
let _userId = null;

// Panel state: 'collapsed' | 'sidebar' | 'expanded'
let _panelState = 'sidebar';

// Carousel state
let _carouselStart = 0;  // index of first visible topic bar
let _expandedTopicId = null;
let _searchQuery = '';

// Progress
let _progress = {};

// Topic interaction state
let _quizState = {};
let _gameState = {};
let _comments = [];
let _questions = [];
let _unsubComments = null;
let _unsubQuestions = null;

function debouncedRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(renderView, 50);
}

// ─── Public API ──────────────────────────────────────────────

export async function mount(container) {
    unmount();
    _container = container;

    const user = store.get('user');
    _familyId = user?.familyId;
    _userId = user?.uid;
    if (!_familyId || !_userId) return;

    await schoolService.listen(_familyId);
    await schoolService.listenProgress(_familyId, _userId, (prog) => {
        _progress = prog;
        debouncedRender();
    });

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
    schoolService.stopListeningProgress();
    _container = null;
    _expandedTopicId = null;
    _comments = [];
    _questions = [];
    _progress = {};
    _quizState = {};
    _gameState = {};
    _userId = null;
    _carouselStart = 0;
    _searchQuery = '';
}

export function setState(state) {
    if (['collapsed', 'sidebar', 'expanded'].includes(state)) {
        _panelState = state;
        renderView();
    }
}

// Kept for backward-compat with shell toggle
export function setOpen(val) {
    _panelState = val ? 'sidebar' : 'collapsed';
    renderView();
}

export function isOpen() {
    return _panelState !== 'collapsed';
}

export function getState() {
    return _panelState;
}

// ─── Rendering ───────────────────────────────────────────────

function renderView() {
    if (!_container) return;

    _container.classList.remove('collapsed', 'sidebar', 'expanded');
    _container.classList.add(_panelState);

    if (_panelState === 'collapsed') {
        _container.innerHTML = `
            <button class="sp-collapse-handle" id="sp-handle-btn" title="${t.school.title}">
                <span class="sp-handle-icon">📚</span>
                <span class="sp-handle-arrow" title="לחצו לפתוח את בית הספר להשקעות">‹</span>
            </button>`;
        _container.querySelector('#sp-handle-btn')?.addEventListener('click', () => setState('sidebar'));
        return;
    }

    const user = store.get('user');
    const isManager = user?.role === 'manager';
    const allTopics = store.get('schoolTopics') || [];

    // Filter: only published topics (unless manager sees drafts too)
    const publishedTopics = isManager ? allTopics : allTopics.filter(tp => tp.status !== 'draft');

    // Search filter
    let filtered = _searchQuery
        ? publishedTopics.filter(tp =>
            tp.title?.toLowerCase().includes(_searchQuery.toLowerCase()) ||
            tp.content?.toLowerCase().includes(_searchQuery.toLowerCase()) ||
            tp.category?.toLowerCase().includes(_searchQuery.toLowerCase())
          )
        : publishedTopics;

    // Clamp carousel start
    const maxStart = Math.max(0, filtered.length - VISIBLE);
    if (_carouselStart > maxStart) _carouselStart = maxStart;

    const visible = filtered.slice(_carouselStart, _carouselStart + VISIBLE);
    const canPrev = _carouselStart > 0;
    const canNext = _carouselStart < maxStart;

    // Progress stats (only on published)
    const total = publishedTopics.length;
    const doneCount = publishedTopics.filter(tp => isTopicDone(tp, _progress[tp.id])).length;
    const pct = total > 0 ? Math.round(doneCount / total * 100) : 0;

    // Dots (one per visible window position)
    const numDots = Math.max(1, filtered.length - VISIBLE + 1);
    const dotsHtml = numDots > 1
        ? Array.from({ length: numDots }, (_, i) =>
            `<span class="sp-dot${i === _carouselStart ? ' active' : ''}" data-idx="${i}"></span>`
          ).join('')
        : '';

    const topicBarsHtml = visible.length === 0
        ? `<div class="sp-empty">${_searchQuery ? t.school.searchEmpty : t.school.emptyTopics}</div>`
        : visible.map(tp => renderTopicBar(tp, isManager)).join('');

    const expandedTopic = _expandedTopicId ? allTopics.find(tp => tp.id === _expandedTopicId) : null;

    const handleGlyph = _panelState === 'sidebar' ? '«' : '»';
    const handleTitle = _panelState === 'sidebar' ? 'הרחב' : 'כווץ';

    _container.innerHTML = `
        <button class="sp-collapse-handle" id="sp-handle-btn" title="${handleTitle}">${handleGlyph}</button>
        <div class="school-panel">
            <div class="sp-header">
                <span class="sp-header-logo">📚</span>
                <span class="sp-header-title">${t.school.title}</span>
                <div class="sp-header-actions">
                    ${isManager ? `<button class="sp-btn sp-manage-btn" id="sp-manage-btn" title="ניהול">⚙️</button>` : ''}
                </div>
            </div>

            ${total > 0 ? `
            <div class="sp-progress-row">
                <div class="sp-prog-track"><div class="sp-prog-fill" style="width:${pct}%"></div></div>
                <span class="sp-prog-label">${doneCount}/${total} ${t.school.progressDone}</span>
            </div>` : ''}

            <div class="sp-search-row">
                <input class="sp-search-input" id="sp-search" type="search"
                       placeholder="${t.school.searchPlaceholder}" value="${esc(_searchQuery)}" />
            </div>

            ${_panelState === 'expanded' ? `
            <div class="sp-expanded-layout">
                <div class="sp-expanded-left">
                    <div class="sp-carousel-area">
                        <button class="sp-arrow sp-arrow-start" id="sp-prev" ${canPrev ? '' : 'disabled'}>›</button>
                        <div class="sp-topics-list">
                            ${topicBarsHtml}
                        </div>
                        <button class="sp-arrow sp-arrow-end" id="sp-next" ${canNext ? '' : 'disabled'}>‹</button>
                    </div>
                    ${dotsHtml ? `<div class="sp-dots">${dotsHtml}</div>` : ''}
                </div>
                <div class="sp-expanded-right" id="sp-detail">
                    ${expandedTopic
                        ? renderTopicDetail(expandedTopic, isManager, user)
                        : `<div class="sp-detail-placeholder"><p>📖</p><p>${t.school.expandedHint}</p></div>`}
                </div>
            </div>` : `
            <div class="sp-carousel-area">
                <button class="sp-arrow sp-arrow-start" id="sp-prev" ${canPrev ? '' : 'disabled'}>›</button>
                <div class="sp-topics-list">
                    ${topicBarsHtml}
                </div>
                <button class="sp-arrow sp-arrow-end" id="sp-next" ${canNext ? '' : 'disabled'}>‹</button>
            </div>
            ${dotsHtml ? `<div class="sp-dots">${dotsHtml}</div>` : ''}
            ${expandedTopic ? `
            <div class="sp-detail" id="sp-detail">
                ${renderTopicDetail(expandedTopic, isManager, user)}
            </div>` : ''}`}
        </div>`;

    wirePanelEvents(isManager, user, filtered);

    // Re-wire live listeners
    if (_expandedTopicId) {
        wireCommentFormEvents(_expandedTopicId);
        wireQuestionFormEvents(_expandedTopicId);
    }

    // Wire quiz/game in expanded detail
    _container.querySelectorAll('.topic-quiz').forEach(el => wireQuizEvents(el, el.dataset.quizTopicId));
    _container.querySelectorAll('.topic-game').forEach(el => wireGameEvents(el, el.dataset.gameTopicId));
}

function renderTopicBar(topic, isManager) {
    const catColor = categoryColor(topic.category);
    const prog = _progress[topic.id];
    const isDone = isTopicDone(topic, prog);
    const isRead = !!prog?.read;
    const hasNew = hasNewActivity(topic, prog);
    const isExpanded = topic.id === _expandedTopicId;
    const commentCount = topic.comment_count ?? 0;
    const preview = (topic.content || '').replace(/\n/g, ' ').slice(0, 55) + ((topic.content || '').length > 55 ? '…' : '');

    const badge = isDone
        ? `<span class="sp-bar-badge sp-badge-done">${t.school.badgeDone}</span>`
        : isRead
        ? `<span class="sp-bar-badge sp-badge-read">${t.school.badgeRead}</span>`
        : '';
    const newBadge = hasNew ? `<span class="sp-bar-badge sp-badge-new">${t.school.badgeNewActivity}</span>` : '';
    const draftBadge = topic.status === 'draft' ? `<span class="sp-bar-badge sp-badge-draft">${t.school.draftBadge}</span>` : '';

    return `
        <div class="sp-topic-bar${isExpanded ? ' active' : ''}" data-topic-id="${esc(topic.id)}" tabindex="0">
            <div class="sp-topic-color" style="background:${catColor}"></div>
            <div class="sp-topic-body">
                <div class="sp-topic-title">${esc(topic.title)}</div>
                <div class="sp-topic-preview">${esc(preview)}</div>
                <div class="sp-topic-meta">
                    <span class="sp-topic-cat" style="color:${catColor}">${esc(topic.category || t.school.categoryGeneral)}</span>
                    ${badge}${newBadge}${draftBadge}
                </div>
            </div>
            <div class="sp-topic-side">
                <span class="sp-topic-comments">💬 ${commentCount}</span>
            </div>
        </div>`;
}

function renderTopicDetail(topic, isManager, user) {
    const contentLines = (topic.content || '').split('\n').map(line => `<p>${esc(line)}</p>`).join('');
    const commentsHtml = renderComments(topic, isManager, user);

    return `
        <div class="sp-detail-inner">
            <div class="sp-detail-header">
                <h3 class="sp-detail-title">${esc(topic.title)}</h3>
                <button class="sp-btn sp-detail-close" id="sp-detail-close" title="סגור">✕</button>
            </div>
            <div class="sp-detail-content">${contentLines}</div>
            ${renderQuiz(topic)}
            ${renderGame(topic)}
            ${renderQuestions(topic, isManager, user)}
            <div class="topic-discussion" id="discussion-${esc(topic.id)}">${commentsHtml}</div>
            ${isManager ? `
            <div class="sp-detail-actions">
                <button class="btn btn-secondary-outline btn-small topic-edit-btn-sp" data-action="edit" data-topic-id="${esc(topic.id)}">${t.school.editTopicBtn}</button>
                <button class="btn btn-danger-outline btn-small topic-delete-btn-sp" data-action="delete" data-topic-id="${esc(topic.id)}">🗑 ${t.school.deleteTopic}</button>
            </div>` : ''}
        </div>`;
}

// ─── Existing render helpers (unchanged) ─────────────────────

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
        </div>`;
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

// ─── Helper functions ─────────────────────────────────────────

function isTopicDone(topic, prog) {
    if (!prog?.read) return false;
    if (topic.quiz?.length && !prog.quizDone) return false;
    if (topic.game?.pairs?.length && !prog.gameDone) return false;
    return true;
}

function hasNewActivity(topic, prog) {
    if (!prog?.lastSeen) return false;
    return (topic.last_question_at && topic.last_question_at > prog.lastSeen)
        || (topic.last_comment_at && topic.last_comment_at > prog.lastSeen);
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

// ─── Event wiring ─────────────────────────────────────────────

function wirePanelEvents(isManager, user, filteredTopics) {
    if (!_container) return;

    // Handle cycles: sidebar → expanded → collapsed → sidebar
    _container.querySelector('#sp-handle-btn')?.addEventListener('click', () => {
        setState(_panelState === 'sidebar' ? 'expanded' : 'collapsed');
    });

    // Manage button (managers only)
    _container.querySelector('#sp-manage-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showManageMenu(user);
    });

    // Search
    const searchInput = _container.querySelector('#sp-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            _searchQuery = searchInput.value;
            _carouselStart = 0;
            _expandedTopicId = null;
            if (_unsubComments) { _unsubComments(); _unsubComments = null; }
            if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
            _comments = [];
            _questions = [];
            renderView();
        });
    }

    // Carousel arrows
    _container.querySelector('#sp-prev')?.addEventListener('click', () => {
        if (_carouselStart > 0) { _carouselStart--; renderView(); }
    });
    _container.querySelector('#sp-next')?.addEventListener('click', () => {
        const maxStart = Math.max(0, filteredTopics.length - VISIBLE);
        if (_carouselStart < maxStart) { _carouselStart++; renderView(); }
    });

    // Dot navigation
    _container.querySelectorAll('.sp-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            _carouselStart = parseInt(dot.dataset.idx, 10);
            renderView();
        });
    });

    // Topic bars: click to expand
    _container.querySelectorAll('.sp-topic-bar').forEach(bar => {
        bar.addEventListener('click', () => {
            const topicId = bar.dataset.topicId;
            if (_expandedTopicId === topicId) {
                collapseDetail();
            } else {
                expandTopic(topicId);
            }
        });
    });

    // Detail close button
    _container.querySelector('#sp-detail-close')?.addEventListener('click', () => collapseDetail());

    // Manager: edit / delete in detail
    _container.querySelectorAll('.topic-edit-btn-sp').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const topicId = btn.dataset.topicId;
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(tp => tp.id === topicId);
            if (!topic) return;
            const { showTopicModal } = await import('../modals/topic-modal.js');
            showTopicModal(_familyId, user, topic);
        });
    });

    _container.querySelectorAll('.topic-delete-btn-sp').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(t.school.confirmDeleteTopic)) return;
            const topicId = btn.dataset.topicId;
            try {
                await schoolService.deleteTopic(_familyId, topicId);
                if (_expandedTopicId === topicId) collapseDetail();
            } catch {
                alert(t.school.deleteError);
            }
        });
    });
}

async function expandTopic(topicId) {
    if (_unsubComments) { _unsubComments(); _unsubComments = null; }
    if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
    _comments = [];
    _questions = [];
    _expandedTopicId = topicId;

    if (_familyId && _userId) {
        schoolService.markTopicRead(_familyId, _userId, topicId).catch(() => {});
    }

    _unsubComments = await schoolService.listenComments(_familyId, topicId, (comments) => {
        _comments = comments;
        if (!_container) return;
        const discussion = _container.querySelector(`#discussion-${CSS.escape(topicId)}`);
        if (discussion) {
            const user = store.get('user');
            const topics = store.get('schoolTopics') || [];
            const topic = topics.find(tp => tp.id === topicId);
            if (topic) {
                discussion.innerHTML = renderComments(topic, user?.role === 'manager', user);
                wireCommentFormEvents(topicId);
            }
        }
    });

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

    renderView();
}

function collapseDetail() {
    if (_unsubComments) { _unsubComments(); _unsubComments = null; }
    if (_unsubQuestions) { _unsubQuestions(); _unsubQuestions = null; }
    _comments = [];
    _questions = [];
    _expandedTopicId = null;
    renderView();
}

function showManageMenu(user) {
    // Remove any existing menu
    document.querySelector('.sp-manage-dropdown')?.remove();

    const menu = document.createElement('div');
    menu.className = 'sp-manage-dropdown';
    const isManager = user?.role === 'manager';
    menu.innerHTML = `
        ${isManager ? `<button class="sp-menu-item" id="spm-add">➕ ${t.school.addTopicBtn}</button>` : ''}
        ${isManager ? `<button class="sp-menu-item" id="spm-seed">${t.school.seedTopicsBtn}</button>` : ''}
        ${isManager ? `<button class="sp-menu-item" id="spm-import">${t.school.importTopicBtn}</button>` : ''}
        ${isManager ? `<button class="sp-menu-item" id="spm-export">${t.school.exportAllTopicsBtn}</button>` : ''}`;

    const btn = _container.querySelector('#sp-manage-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left - 120}px;z-index:9999;`;
    document.body.appendChild(menu);

    const close = () => menu.remove();
    setTimeout(() => document.addEventListener('click', close, { once: true }), 0);

    menu.querySelector('#spm-add')?.addEventListener('click', async () => {
        const { showTopicModal } = await import('../modals/topic-modal.js');
        showTopicModal(_familyId, user);
    });
    menu.querySelector('#spm-seed')?.addEventListener('click', async () => {
        if (!confirm(t.school.seedTopicsConfirm)) return;
        const name = user?.role === 'manager'
            ? (store.get('family')?.family_name || t.school.parent)
            : (user?.kidName || t.school.kid);
        try { await schoolService.seedDefaultTopics(_familyId, name); }
        catch { alert(t.school.seedTopicsError); }
    });
    menu.querySelector('#spm-import')?.addEventListener('click', async () => {
        const { showImportModal } = await import('../modals/import-modal.js');
        showImportModal(_familyId, user);
    });
    menu.querySelector('#spm-export')?.addEventListener('click', () => {
        const topics = store.get('schoolTopics') || [];
        if (!topics.length) return;
        exportAllTopics(topics);
    });
}

function exportAllTopics(topics) {
    const data = topics.map(topic => {
        const obj = { title: topic.title, category: topic.category, content: topic.content || '', status: topic.status || 'published' };
        if (topic.quiz?.length) obj.quiz = topic.quiz;
        if (topic.game?.pairs?.length) obj.game = topic.game;
        return obj;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'school-topics.json'; a.click();
    URL.revokeObjectURL(url);
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
                const state = _quizState[topicId];
                const allAnswered = Object.keys(state).length === topic.quiz.length;
                if (allAnswered && _familyId && _userId) {
                    schoolService.markQuizDone(_familyId, _userId, topicId).catch(() => {});
                }
                const newHtml = renderQuiz(topic);
                const tmp = document.createElement('div');
                tmp.innerHTML = newHtml;
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
            const newHtml = renderQuiz(topic);
            const tmp = document.createElement('div');
            tmp.innerHTML = newHtml;
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

    gameEl.querySelectorAll('.game-term:not(.matched)').forEach(termEl => {
        termEl.addEventListener('click', () => {
            const ti = parseInt(termEl.dataset.ti, 10);
            if (state.selected === ti) { state.selected = null; termEl.classList.remove('selected'); return; }
            gameEl.querySelectorAll('.game-term.selected').forEach(el => el.classList.remove('selected'));
            state.selected = ti;
            termEl.classList.add('selected');
        });
    });

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
                    if (_familyId && _userId) schoolService.markGameDone(_familyId, _userId, topicId).catch(() => {});
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
        } catch { alert(t.school.commentError); }
        finally { submit.disabled = false; input.focus(); }
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });

    _container?.querySelectorAll('.school-comment-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            try { await schoolService.deleteComment(_familyId, topicId, btn.dataset.commentId); }
            catch { alert(t.school.deleteError); }
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
        } catch { alert(t.school.questionError); }
        finally { submit.disabled = false; input.focus(); }
    };

    submit.addEventListener('click', doSubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });

    _container?.querySelectorAll('.answer-submit-btn').forEach(btn => {
        const qId = btn.dataset.questionId;
        const answerInput = btn.closest('.question-answer-form')?.querySelector('.answer-input');
        if (!answerInput) return;
        const doAnswer = async () => {
            const text = answerInput.value.trim();
            if (!text) return;
            btn.disabled = true;
            try { await schoolService.answerQuestion(_familyId, topicId, qId, text, authorName); }
            catch { alert(t.school.answerError); btn.disabled = false; }
        };
        btn.addEventListener('click', doAnswer);
        answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAnswer(); });
    });

    _container?.querySelectorAll('.question-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            try { await schoolService.deleteQuestion(_familyId, topicId, btn.dataset.questionId); }
            catch { alert(t.school.deleteError); }
        });
    });
}
