// ============================================================
// Chat Panel — collapsible left-side family chat with topics
// Lazy-loaded (dynamic import), does not block dashboard.
// Messages paginated: latest 25 via real-time listener,
// older loaded on scroll-up via cursor-based getDocs.
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { renderAvatar, DEFAULT_AVATAR } from './avatar.js';
import t from '../../i18n.js';

let chatService = null;  // lazy-loaded

// Rotating palette for topic accent colors
const TOPIC_COLORS = [
    { border: '#6c5ce7', bg: '#f3f0ff' },
    { border: '#00b894', bg: '#e8faf4' },
    { border: '#fd79a8', bg: '#fff0f6' },
    { border: '#fdcb6e', bg: '#fff9e6' },
    { border: '#e17055', bg: '#fff1ee' },
    { border: '#0984e3', bg: '#eef6ff' },
    { border: '#a29bfe', bg: '#f5f3ff' },
    { border: '#55efc4', bg: '#eafff8' },
];

const VIEW_TOPICS = 'topics';
const VIEW_TOPIC = 'topic';
const VIEW_ANNOUNCEMENTS = 'announcements';

let _container = null;
let _unsubs = [];
let _currentTopicId = null;
let _currentView = VIEW_TOPICS;
let _collapsed = false;
let _creatingTopic = false;
let _editingMessageId = null;
let _listeningFamilyId = null;
let _scrollLocked = false;
let _announcements = null;      // cached from fetch

async function getChatService() {
    if (!chatService) chatService = await import('../../services/chat-service.js');
    return chatService;
}

async function loadAnnouncements() {
    if (_announcements) return _announcements;
    try {
        const { loadAnnouncements: load } = await import('../../services/announcement-service.js');
        _announcements = await load();
    } catch (e) {
        console.warn('Failed to load announcements:', e);
    }
    return _announcements || [];
}

export function mount(container) {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _container = container;

    const user = store.get('user');
    if (!user?.familyId) return;

    if (_listeningFamilyId !== user.familyId) {
        _currentTopicId = null;
        _currentView = VIEW_TOPICS;
        _collapsed = false;
        _listeningFamilyId = user.familyId;
        getChatService().then(svc => svc.listenTopics(user.familyId));
    }

    // Pre-fetch announcements in background
    loadAnnouncements();

    render();

    _unsubs.push(
        store.subscribe('chatTopics', () => render()),
        store.subscribe('chatMessages', () => renderMessagesUpdate()),
        store.subscribe('members', () => { if (_currentTopicId) renderMessagesUpdate(); }),
    );
}

export function unmount() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    if (chatService) chatService.stopTopics();
    _container = null;
    _currentTopicId = null;
    _currentView = VIEW_TOPICS;
    _collapsed = false;
    _editingMessageId = null;
    _listeningFamilyId = null;
}

function getMemberByUid(uid) {
    const members = store.get('members') || [];
    return members.find(m => m.id === uid || m.uid === uid) || null;
}

function getAuthorDisplayName(msg) {
    const member = getMemberByUid(msg.author_uid);
    return member?.name || msg.author_name;
}

function getAuthorAvatar(authorUid) {
    const member = getMemberByUid(authorUid);
    return renderAvatar(member?.avatar || DEFAULT_AVATAR, 28);
}

function formatTime(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

function topicColor(index) {
    return TOPIC_COLORS[index % TOPIC_COLORS.length];
}

// Determine which of the user's messages are editable/deletable:
// Only own messages that have no replies after them (consecutive tail from the end)
function getEditableIds(messages, uid) {
    const ids = new Set();
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].author_uid === uid) {
            ids.add(messages[i].id);
        } else {
            break;
        }
    }
    return ids;
}

// ── Rendering ──────────────────────────────────────────────

function render() {
    if (!_container) return;
    const topics = store.get('chatTopics') || [];

    let bodyHtml = '';
    if (!_collapsed) {
        if (_currentView === VIEW_ANNOUNCEMENTS) {
            bodyHtml = renderAnnouncementsView();
        } else if (_currentView === VIEW_TOPIC && _currentTopicId) {
            bodyHtml = renderTopicView();
        } else {
            bodyHtml = renderTopicList(topics);
        }
    }

    _container.innerHTML = `
        <div class="chat-panel${_collapsed ? ' collapsed' : ''}">
            <div class="chat-panel-header">
                <button class="chat-toggle-btn" id="chat-toggle" title="${_collapsed ? t.chat.toggleOpen : t.chat.toggleClose}">
                    <span class="chat-toggle-icon">${_collapsed ? '💬' : '✕'}</span>
                </button>
                ${!_collapsed ? `<h3 class="chat-title">${t.chat.title}</h3>` : ''}
            </div>
            ${!_collapsed ? `<div class="chat-body" id="chat-body">${bodyHtml}</div>` : ''}
        </div>
    `;

    wireEvents();
}

function renderTopicList(topics) {
    const latestAnnouncement = _announcements?.[0];
    const user = store.get('user');
    const isManager = user?.role === 'manager';

    return `
        <div class="chat-topic-list">
            <div class="chat-topic-item chat-announcements-item" id="announcements-btn">
                <div class="chat-topic-title chat-announcements-title">${t.chat.whatNew}</div>
                ${latestAnnouncement ? `<div class="chat-topic-preview">${esc(latestAnnouncement.title)} (${esc(latestAnnouncement.version)})</div>` : ''}
            </div>
            ${_creatingTopic ? `
                <div class="chat-new-topic-form">
                    <input type="text" class="chat-new-topic-input" id="new-topic-input"
                           placeholder="${t.chat.newTopicInput}" dir="rtl" autocomplete="off" maxlength="60">
                    <div class="chat-new-topic-actions">
                        <button class="chat-new-topic-submit" id="new-topic-submit">${t.chat.newTopicSubmit}</button>
                        <button class="chat-new-topic-cancel" id="new-topic-cancel">${t.chat.newTopicCancel}</button>
                    </div>
                </div>
            ` : `
                <button class="chat-new-topic-btn" id="new-topic-btn">${t.chat.newTopicBtn}</button>
            `}
            ${topics.length === 0 && !_creatingTopic ? `<p class="chat-empty">${t.chat.emptyTopics}</p>` : ''}
            ${topics.map((topic, i) => {
                const c = topicColor(i);
                const locked = !!topic.locked;
                const border = locked ? '#b2bec3' : c.border;
                const bg = locked ? '#f5f5f5' : c.bg;
                const titleColor = locked ? '#888' : c.border;
                return `
                <div class="chat-topic-item${locked ? ' chat-topic-item-locked' : ''}" data-topic-id="${esc(topic.id)}"
                     style="border-right: 4px solid ${border}; background: ${bg};">
                    <div class="chat-topic-header-row">
                        <div class="chat-topic-title" style="color: ${titleColor};">${locked ? '🔒 ' : ''}${esc(topic.title)}</div>
                        ${isManager ? `
                            <button class="chat-topic-lock-btn" data-action="lock" data-topic-id="${esc(topic.id)}" data-locked="${locked}"
                                    title="${locked ? t.chat.unlockTopic : t.chat.lockTopic}">
                                ${locked ? '🔓' : '🔒'}
                            </button>
                            <button class="chat-topic-lock-btn" data-action="delete-topic" data-topic-id="${esc(topic.id)}"
                                    title="${t.chat.deleteTopic}">
                                🗑
                            </button>
                        ` : ''}
                    </div>
                    <div class="chat-topic-meta">
                        <span class="chat-topic-author">${esc(topic.author_name)}</span>
                        <span class="chat-topic-time">${formatTime(topic.lastMessageAt)}</span>
                    </div>
                    ${topic.lastMessage ? `<div class="chat-topic-preview">${esc(topic.lastMessageAuthor)}: ${esc(topic.lastMessage)}</div>` : ''}
                </div>
            `}).join('')}
        </div>
    `;
}

function renderAnnouncementsView() {
    const announcements = _announcements || [];

    return `
        <div class="chat-topic-view">
            <div class="chat-topic-header chat-announcements-header">
                <button class="chat-back-btn" id="chat-back">→</button>
                <span class="chat-topic-name">${t.chat.whatNew}</span>
            </div>
            <div class="chat-messages chat-announcements-list" id="chat-announcements">
                ${announcements.length === 0 ? `<p class="chat-empty">${t.chat.emptyAnnouncements}</p>` : ''}
                ${announcements.map(a => `
                    <div class="chat-announcement">
                        <div class="chat-announcement-badge">${esc(a.version)}</div>
                        <div class="chat-announcement-content">
                            <div class="chat-announcement-title">${esc(a.title)}</div>
                            <div class="chat-announcement-date">${esc(a.date)}</div>
                            <ul class="chat-announcement-items">
                                ${a.items.map(item => `<li>${esc(item)}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderTopicView() {
    const topics = store.get('chatTopics') || [];
    const topicIdx = topics.findIndex(tp => tp.id === _currentTopicId);
    const topic = topicIdx >= 0 ? topics[topicIdx] : null;
    if (!topic) return '';
    const c = topicColor(topicIdx);
    const locked = !!topic.locked;

    return `
        <div class="chat-topic-view">
            <div class="chat-topic-header" style="border-bottom: 3px solid ${locked ? '#b2bec3' : c.border}; background: ${locked ? '#f5f5f5' : c.bg};">
                <button class="chat-back-btn" id="chat-back">→</button>
                <span class="chat-topic-name" style="color: ${locked ? '#888' : c.border};">${locked ? '🔒 ' : ''}${esc(topic.title)}</span>
            </div>
            <div class="chat-messages" id="chat-messages">
                ${renderLoadMoreIndicator()}
                ${renderMessagesList()}
            </div>
            ${locked
                ? `<div class="chat-locked-notice">${t.chat.lockedNotice}</div>`
                : `<div class="chat-input-area">
                    <input type="text" class="chat-input" id="chat-input" placeholder="${t.chat.inputPlaceholder}" dir="rtl" autocomplete="off">
                    <button class="chat-send-btn" id="chat-send">←</button>
                </div>`
            }
        </div>
    `;
}

function renderLoadMoreIndicator() {
    if (!chatService) return '';
    if (chatService.isLoadingMore()) {
        return `<div class="chat-load-more">${t.chat.loadingMore}</div>`;
    }
    if (chatService.hasMoreMessages()) {
        return '<div class="chat-load-more" id="chat-load-sentinel"></div>';
    }
    return '';
}

function renderMessagesList() {
    const messages = store.get('chatMessages') || [];
    const user = store.get('user');
    if (messages.length === 0) {
        return `<p class="chat-empty">${t.chat.emptyMessages}</p>`;
    }

    const editableIds = getEditableIds(messages, user?.uid);

    return messages.map(m => {
        const isMe = m.author_uid === user?.uid;
        const displayName = getAuthorDisplayName(m);
        const avatar = getAuthorAvatar(m.author_uid);
        const canEdit = isMe && editableIds.has(m.id);
        const isEditing = _editingMessageId === m.id;
        const editedTag = m.edited_at ? `<span class="chat-msg-edited">${t.chat.edited}</span>` : '';

        if (isEditing) {
            return `
                <div class="chat-message chat-message-me">
                    <div class="chat-msg-avatar">${avatar}</div>
                    <div class="chat-msg-bubble chat-msg-editing">
                        <input type="text" class="chat-edit-input" id="chat-edit-input"
                               value="${esc(m.text)}" dir="rtl" autocomplete="off">
                        <div class="chat-edit-actions">
                            <button class="chat-edit-save" data-msg-id="${esc(m.id)}">${t.chat.editSave}</button>
                            <button class="chat-edit-cancel">${t.chat.editCancel}</button>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="chat-message ${isMe ? 'chat-message-me' : 'chat-message-other'}">
                <div class="chat-msg-avatar">${avatar}</div>
                <div class="chat-msg-bubble">
                    <div class="chat-msg-author">${isMe ? t.chat.me : esc(displayName)}</div>
                    <div class="chat-msg-text">${esc(m.text)}</div>
                    <div class="chat-msg-footer">
                        <span class="chat-msg-time">${formatTime(m.created_at)}${editedTag}</span>
                        ${canEdit ? `
                            <span class="chat-msg-actions">
                                <button class="chat-msg-action-btn chat-msg-edit" data-msg-id="${esc(m.id)}" title="${t.chat.editTitle}">✎</button>
                                <button class="chat-msg-action-btn chat-msg-delete" data-msg-id="${esc(m.id)}" title="${t.chat.deleteTitle}">🗑</button>
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── Reactive updates ───────────────────────────────────────

function renderMessagesUpdate() {
    if (!_container || !_currentTopicId) return;
    const messagesEl = _container.querySelector('#chat-messages');
    if (!messagesEl) return;

    const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
    const prevScrollHeight = messagesEl.scrollHeight;

    _scrollLocked = true;
    messagesEl.innerHTML = renderLoadMoreIndicator() + renderMessagesList();

    if (wasAtBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
        messagesEl.scrollTop += messagesEl.scrollHeight - prevScrollHeight;
    }

    _scrollLocked = false;
    wireScrollLoad(messagesEl);
    wireMessageActions(messagesEl);
}

function wireScrollLoad(messagesEl) {
    if (!messagesEl || !chatService) return;
    const sentinel = messagesEl.querySelector('#chat-load-sentinel');
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
        if (_scrollLocked) return;
        if (!entries[0].isIntersecting) return;
        if (!chatService.hasMoreMessages() || chatService.isLoadingMore()) return;

        observer.disconnect();
        sentinel.textContent = t.chat.loadingMore;
        await chatService.loadMoreMessages();
    }, { root: messagesEl, threshold: 0.1 });

    observer.observe(sentinel);
}

function wireMessageActions(messagesEl) {
    if (!messagesEl) return;

    // Edit buttons
    messagesEl.querySelectorAll('.chat-msg-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _editingMessageId = btn.dataset.msgId;
            renderMessagesUpdate();
            setTimeout(() => {
                const input = messagesEl.querySelector('#chat-edit-input');
                if (input) { input.focus(); input.selectionStart = input.value.length; }
            }, 50);
        });
    });

    // Delete buttons
    messagesEl.querySelectorAll('.chat-msg-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const user = store.get('user');
            const svc = await getChatService();
            svc.deleteMessage(user.familyId, _currentTopicId, btn.dataset.msgId);
        });
    });

    // Edit form save/cancel
    const editInput = messagesEl.querySelector('#chat-edit-input');
    const saveBtn = messagesEl.querySelector('.chat-edit-save');
    const cancelBtn = messagesEl.querySelector('.chat-edit-cancel');

    if (editInput && saveBtn) {
        const save = async () => {
            const text = editInput.value.trim();
            if (!text) return;
            const msgId = saveBtn.dataset.msgId;
            _editingMessageId = null;
            const user = store.get('user');
            const svc = await getChatService();
            svc.editMessage(user.familyId, _currentTopicId, msgId, text);
        };

        saveBtn.addEventListener('click', save);
        editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { _editingMessageId = null; renderMessagesUpdate(); }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            _editingMessageId = null;
            renderMessagesUpdate();
        });
    }
}

// ── Wire all events ────────────────────────────────────────

function wireEvents() {
    if (!_container) return;

    const toggleBtn = _container.querySelector('#chat-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            _collapsed = !_collapsed;
            render();
        });
    }

    // New topic: show inline form
    const newTopicBtn = _container.querySelector('#new-topic-btn');
    if (newTopicBtn) {
        newTopicBtn.addEventListener('click', () => {
            _creatingTopic = true;
            render();
        });
    }

    // New topic form
    const newTopicInput = _container.querySelector('#new-topic-input');
    const newTopicSubmit = _container.querySelector('#new-topic-submit');
    const newTopicCancel = _container.querySelector('#new-topic-cancel');

    if (newTopicInput) {
        setTimeout(() => newTopicInput.focus(), 50);

        const submitTopic = async () => {
            const title = newTopicInput.value.trim();
            if (!title) return;
            newTopicSubmit.disabled = true;
            const user = store.get('user');
            const authorName = user.kidName || user.displayName || t.chat.parentFallback;
            const svc = await getChatService();
            await svc.createTopic(user.familyId, title, authorName, user.uid);
            _creatingTopic = false;
        };

        newTopicSubmit?.addEventListener('click', submitTopic);
        newTopicInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitTopic();
            if (e.key === 'Escape') { _creatingTopic = false; render(); }
        });
    }

    if (newTopicCancel) {
        newTopicCancel.addEventListener('click', () => {
            _creatingTopic = false;
            render();
        });
    }

    // Announcements item
    const announcementsBtn = _container.querySelector('#announcements-btn');
    if (announcementsBtn) {
        announcementsBtn.addEventListener('click', async () => {
            await loadAnnouncements();
            _currentView = VIEW_ANNOUNCEMENTS;
            render();
        });
    }

    // Lock/unlock buttons for managers
    _container.querySelectorAll('[data-action="lock"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const topicId = btn.dataset.topicId;
            const locked = btn.dataset.locked === 'true';
            const user = store.get('user');
            const svc = await getChatService();
            await svc.lockTopic(user.familyId, topicId, !locked);
        });
    });

    // Delete topic buttons for managers
    _container.querySelectorAll('[data-action="delete-topic"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(t.chat.deleteTopicConfirm)) return;
            const topicId = btn.dataset.topicId;
            const user = store.get('user');
            const svc = await getChatService();
            if (_currentTopicId === topicId) {
                svc.stopMessages();
                _currentTopicId = null;
                _currentView = VIEW_TOPICS;
            }
            await svc.deleteTopic(user.familyId, topicId);
        });
    });

    // Topic items (exclude announcements item)
    _container.querySelectorAll('.chat-topic-item[data-topic-id]').forEach(el => {
        el.addEventListener('click', async () => {
            _currentTopicId = el.dataset.topicId;
            _currentView = VIEW_TOPIC;
            const user = store.get('user');
            const svc = await getChatService();
            svc.listenMessages(user.familyId, _currentTopicId);
            render();
        });
    });

    // Back button — works for both topic view and announcements view
    const backBtn = _container.querySelector('#chat-back');
    if (backBtn) {
        backBtn.addEventListener('click', async () => {
            if (_currentView === VIEW_TOPIC) {
                const svc = await getChatService();
                svc.stopMessages();
            }
            _currentTopicId = null;
            _editingMessageId = null;
            _currentView = VIEW_TOPICS;
            render();
        });
    }

    // Send message
    const sendBtn = _container.querySelector('#chat-send');
    const inputEl = _container.querySelector('#chat-input');
    if (sendBtn && inputEl) {
        const sendMessage = async () => {
            const text = inputEl.value.trim();
            if (!text) return;
            const user = store.get('user');
            const authorName = user.kidName || user.displayName || t.chat.parentFallback;
            inputEl.value = '';
            inputEl.focus();
            const svc = await getChatService();
            svc.sendMessage(user.familyId, _currentTopicId, text, authorName, user.uid);
        };

        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        setTimeout(() => inputEl.focus(), 100);
    }

    // Scroll pagination + message actions
    const messagesEl = _container.querySelector('#chat-messages');
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
        wireScrollLoad(messagesEl);
        wireMessageActions(messagesEl);
    }
}
