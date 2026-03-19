// ============================================================
// Admin View — system-level management dashboard
// Accessible only to users with role === 'system'
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import * as adminService from '../../services/admin-service.js';
import t from '../../i18n.js';

let _container = null;
let _unsubs = [];
let _activeTab = 'overview';
let _stats = null;
let _familyMembers = {};  // familyId -> members[]
let _expandedFamilyId = null;
let _editingAnnouncementId = null;
let _expandedFeedbackId = null;
let _feedbackFilter = 'all';

export async function mount(container) {
    unmount();
    _container = container;

    // Start listeners
    await adminService.listenAnnouncements();
    await adminService.listenFeedback();
    adminService.loadFamilies();

    // Load stats
    try { _stats = await adminService.loadSystemStats(); } catch (e) { console.warn('Stats:', e); }

    renderShell();

    _unsubs.push(
        store.subscribe('adminFamilies', () => renderTabContent()),
        store.subscribe('adminAnnouncements', () => renderTabContent()),
        store.subscribe('adminFeedback', () => {
            updateFeedbackBadge();
            renderTabContent();
        }),
    );
}

export function unmount() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    adminService.stopAll();
    _container = null;
    _activeTab = 'overview';
    _stats = null;
    _familyMembers = {};
    _expandedFamilyId = null;
    _editingAnnouncementId = null;
    _expandedFeedbackId = null;
}

function getPendingCount() {
    const feedback = store.get('adminFeedback') || [];
    return feedback.filter(f => f.status === 'new').length;
}

function renderShell() {
    if (!_container) return;
    const pendingCount = getPendingCount();
    const pendingBadge = pendingCount > 0 ? `<span class="admin-badge" id="feedback-badge">${pendingCount}</span>` : '<span class="admin-badge" id="feedback-badge" hidden></span>';

    _container.innerHTML = `
        <div class="admin-view">
            <header class="admin-header">
                <div class="admin-header-content">
                    <h1 class="admin-title">${t.admin.title}</h1>
                    <button id="admin-logout-btn" class="btn btn-icon" title="${t.admin.logoutTitle}">🚪</button>
                </div>
            </header>
            <nav class="admin-tabs" id="admin-tabs">
                <button class="admin-tab${_activeTab === 'overview' ? ' active' : ''}" data-tab="overview">${t.admin.tabOverview}</button>
                <button class="admin-tab${_activeTab === 'families' ? ' active' : ''}" data-tab="families">${t.admin.tabFamilies}</button>
                <button class="admin-tab${_activeTab === 'announcements' ? ' active' : ''}" data-tab="announcements">${t.admin.tabAnnouncements}</button>
                <button class="admin-tab${_activeTab === 'feedback' ? ' active' : ''}" data-tab="feedback">${t.admin.tabFeedback} ${pendingBadge}</button>
            </nav>
            <main class="admin-content" id="admin-content"></main>
        </div>
    `;

    wireShellEvents();
    renderTabContent();
}

function wireShellEvents() {
    if (!_container) return;

    _container.querySelector('#admin-logout-btn')?.addEventListener('click', async () => {
        const { logout } = await import('../../services/auth-service.js');
        logout();
    });

    _container.querySelectorAll('.admin-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            _activeTab = btn.dataset.tab;
            _container.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
            renderTabContent();
        });
    });
}

function updateFeedbackBadge() {
    const badge = _container?.querySelector('#feedback-badge');
    if (!badge) return;
    const count = getPendingCount();
    badge.textContent = count;
    badge.hidden = count === 0;
}

function renderTabContent() {
    const contentEl = _container?.querySelector('#admin-content');
    if (!contentEl) return;

    switch (_activeTab) {
        case 'overview': contentEl.innerHTML = renderOverview(); wireOverviewEvents(contentEl); break;
        case 'families': contentEl.innerHTML = renderFamilies(); wireFamilyEvents(contentEl); break;
        case 'announcements': contentEl.innerHTML = renderAnnouncements(); wireAnnouncementEvents(contentEl); break;
        case 'feedback': contentEl.innerHTML = renderFeedback(); wireFeedbackEvents(contentEl); break;
    }
}

// ── Overview Tab ──────────────────────────────────────────

function renderOverview() {
    const families = store.get('adminFamilies') || [];
    const feedback = store.get('adminFeedback') || [];
    const pendingCount = feedback.filter(f => f.status === 'new').length;
    const announcements = store.get('adminAnnouncements') || [];

    return `
        <div class="admin-stats-grid">
            <div class="admin-stat-card">
                <div class="admin-stat-number">${_stats?.familyCount ?? families.length}</div>
                <div class="admin-stat-label">${t.admin.statFamilies}</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-number">${_stats?.userCount ?? '—'}</div>
                <div class="admin-stat-label">${t.admin.statUsers}</div>
            </div>
            <div class="admin-stat-card admin-stat-card-accent">
                <div class="admin-stat-number">${pendingCount}</div>
                <div class="admin-stat-label">${t.admin.statPendingFeedback}</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-number">${announcements.length}</div>
                <div class="admin-stat-label">${t.admin.statAnnouncements}</div>
            </div>
        </div>
        ${pendingCount > 0 ? `
            <div class="admin-section">
                <h3>${t.admin.latestFeedback}</h3>
                ${feedback.filter(f => f.status === 'new').slice(0, 5).map(f => `
                    <div class="admin-feedback-preview">
                        <span class="admin-feedback-type-badge admin-type-${esc(f.type)}">${typeLabel(f.type)}</span>
                        <span class="admin-feedback-preview-text">${esc(f.text?.substring(0, 80))}${f.text?.length > 80 ? '...' : ''}</span>
                        <span class="admin-feedback-preview-author">${esc(f.author_name)}</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

function wireOverviewEvents(_el) { /* no interactive elements yet */ }

// ── Families Tab ──────────────────────────────────────────

function renderFamilies() {
    const families = store.get('adminFamilies') || [];

    if (families.length === 0) {
        return `<p class="admin-empty">${t.admin.noFamilies}</p>`;
    }

    return `
        <div class="admin-families-list">
            ${families.map(f => {
                const isExpanded = _expandedFamilyId === f.id;
                const members = _familyMembers[f.id];
                const created = f.created_at ? formatDate(f.created_at) : '';
                return `
                    <div class="admin-family-card${isExpanded ? ' expanded' : ''}" data-family-id="${esc(f.id)}">
                        <div class="admin-family-header">
                            <div class="admin-family-info">
                                <span class="admin-family-name">${esc(f.family_name || f.id)}</span>
                                <span class="admin-family-meta">${created}</span>
                            </div>
                            <span class="admin-family-expand">${isExpanded ? '▲' : '▼'}</span>
                        </div>
                        ${isExpanded ? renderFamilyMembers(f.id, members) : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderFamilyMembers(familyId, members) {
    if (!members) return `<div class="admin-family-members"><p class="admin-loading">${t.admin.loadingMembers}</p></div>`;
    if (members.length === 0) return `<div class="admin-family-members"><p class="admin-empty">${t.admin.noMembers}</p></div>`;

    return `
        <div class="admin-family-members">
            <table class="admin-table">
                <thead><tr><th>${t.admin.memberColName}</th><th>${t.admin.memberColRole}</th><th>${t.admin.memberColEmail}</th><th>${t.admin.memberColUsername}</th></tr></thead>
                <tbody>
                    ${members.map(m => `
                        <tr>
                            <td>${esc(m.name || '—')}</td>
                            <td><span class="admin-role-badge admin-role-${esc(m.role)}">${m.role === 'manager' ? t.admin.roleParent : t.admin.roleKid}</span></td>
                            <td dir="ltr" style="font-size:0.8rem">${esc(m.email || '—')}</td>
                            <td dir="ltr">${esc(m.username || '—')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function wireFamilyEvents(el) {
    el.querySelectorAll('.admin-family-card').forEach(card => {
        card.querySelector('.admin-family-header')?.addEventListener('click', async () => {
            const fid = card.dataset.familyId;
            if (_expandedFamilyId === fid) {
                _expandedFamilyId = null;
            } else {
                _expandedFamilyId = fid;
                if (!_familyMembers[fid]) {
                    _familyMembers[fid] = await adminService.loadFamilyMembers(fid);
                }
            }
            renderTabContent();
        });
    });
}

// ── Announcements Tab ─────────────────────────────────────

function renderAnnouncements() {
    const announcements = store.get('adminAnnouncements') || [];
    const isNew = _editingAnnouncementId === '__new__';
    const editingAnn = _editingAnnouncementId && _editingAnnouncementId !== '__new__'
        ? announcements.find(a => a.id === _editingAnnouncementId) : null;

    return `
        <div class="admin-announcements">
            ${!_editingAnnouncementId ? `<button class="btn btn-primary admin-add-btn" id="add-announcement-btn">${t.admin.addAnnouncementBtn}</button>` : ''}
            ${isNew || editingAnn ? renderAnnouncementForm(editingAnn) : ''}
            ${announcements.map(a => `
                <div class="admin-announcement-card${_editingAnnouncementId === a.id ? ' editing' : ''}">
                    <div class="admin-announcement-header">
                        <span class="admin-announcement-version">${esc(a.version)}</span>
                        <span class="admin-announcement-title">${esc(a.title)}</span>
                        <span class="admin-announcement-date">${esc(a.date)}</span>
                    </div>
                    <ul class="admin-announcement-items">
                        ${(a.items || []).map(item => `<li>${esc(item)}</li>`).join('')}
                    </ul>
                    <div class="admin-announcement-actions">
                        <button class="btn btn-small admin-edit-ann" data-id="${esc(a.id)}">${t.admin.editBtn}</button>
                        <button class="btn btn-small btn-danger admin-delete-ann" data-id="${esc(a.id)}">${t.admin.deleteBtn}</button>
                    </div>
                </div>
            `).join('')}
            ${announcements.length === 0 && !_editingAnnouncementId ? `<p class="admin-empty">${t.admin.noAnnouncements}</p>` : ''}
        </div>
    `;
}

function renderAnnouncementForm(existing) {
    const v = existing || { version: '', title: '', date: new Date().toISOString().slice(0, 10), items: [] };
    return `
        <div class="admin-form-card" id="announcement-form">
            <h3>${existing ? t.admin.editAnnouncementTitle : t.admin.newAnnouncementTitle}</h3>
            <div class="admin-form-row">
                <div class="form-group">
                    <label>${t.admin.versionLabel}</label>
                    <input type="text" id="ann-version" value="${esc(v.version)}" placeholder="1.3.0" dir="ltr">
                </div>
                <div class="form-group">
                    <label>${t.admin.dateLabel}</label>
                    <input type="date" id="ann-date" value="${esc(v.date)}" dir="ltr">
                </div>
            </div>
            <div class="form-group">
                <label>${t.admin.titleLabel}</label>
                <input type="text" id="ann-title" value="${esc(v.title)}" placeholder="${t.admin.namePlaceholder}">
            </div>
            <div class="form-group">
                <label>${t.admin.itemsLabel}</label>
                <textarea id="ann-items" rows="4" placeholder="${t.admin.itemsPlaceholder}">${esc((v.items || []).join('\n'))}</textarea>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="ann-cancel">${t.common.cancel}</button>
                <button class="btn btn-primary" id="ann-save">${existing ? t.common.save : t.admin.createBtn}</button>
            </div>
        </div>
    `;
}

function wireAnnouncementEvents(el) {
    el.querySelector('#add-announcement-btn')?.addEventListener('click', () => {
        _editingAnnouncementId = '__new__';
        renderTabContent();
    });

    el.querySelector('#ann-cancel')?.addEventListener('click', () => {
        _editingAnnouncementId = null;
        renderTabContent();
    });

    el.querySelector('#ann-save')?.addEventListener('click', async () => {
        const version = el.querySelector('#ann-version').value.trim();
        const title = el.querySelector('#ann-title').value.trim();
        const date = el.querySelector('#ann-date').value;
        const items = el.querySelector('#ann-items').value.split('\n').map(s => s.trim()).filter(Boolean);

        if (!version || !title) {
            emit('toast', { message: t.errors.fillVersionAndTitle, type: 'error' });
            return;
        }

        const btn = el.querySelector('#ann-save');
        btn.disabled = true;

        try {
            if (_editingAnnouncementId === '__new__') {
                await adminService.createAnnouncement({ version, title, date, items });
                emit('toast', { message: t.admin.announcementCreated, type: 'success' });
            } else {
                await adminService.updateAnnouncement(_editingAnnouncementId, { version, title, date, items });
                emit('toast', { message: t.admin.announcementSaved, type: 'success' });
            }
            _editingAnnouncementId = null;
        } catch (e) {
            console.error('Save announcement failed:', e);
            emit('toast', { message: t.errors.announcementSaveError, type: 'error' });
            btn.disabled = false;
        }
    });

    el.querySelectorAll('.admin-edit-ann').forEach(btn => {
        btn.addEventListener('click', () => {
            _editingAnnouncementId = btn.dataset.id;
            renderTabContent();
        });
    });

    el.querySelectorAll('.admin-delete-ann').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm(t.admin.deleteAnnouncementConfirm)) return;
            try {
                await adminService.deleteAnnouncement(btn.dataset.id);
                emit('toast', { message: t.admin.announcementDeleted, type: 'success' });
            } catch (e) {
                emit('toast', { message: t.errors.deleteError, type: 'error' });
            }
        });
    });
}

// ── Feedback Tab ──────────────────────────────────────────

function typeLabel(type) {
    switch (type) {
        case 'idea': return t.admin.typeIdea;
        case 'bug': return t.admin.typeBug;
        case 'improvement': return t.admin.typeImprovement;
        default: return t.admin.typeOther;
    }
}

function statusLabel(status) {
    switch (status) {
        case 'new': return t.admin.statusNew;
        case 'read': return t.admin.statusRead;
        case 'resolved': return t.admin.statusResolved;
        default: return status;
    }
}

function renderFeedback() {
    const allFeedback = store.get('adminFeedback') || [];
    const feedback = _feedbackFilter === 'all' ? allFeedback : allFeedback.filter(f => f.status === _feedbackFilter);

    const counts = { all: allFeedback.length, new: 0, read: 0, resolved: 0 };
    allFeedback.forEach(f => { if (counts[f.status] !== undefined) counts[f.status]++; });

    return `
        <div class="admin-feedback">
            <div class="admin-feedback-filters">
                <button class="admin-filter-btn${_feedbackFilter === 'all' ? ' active' : ''}" data-filter="all">${t.admin.filterAll(counts.all)}</button>
                <button class="admin-filter-btn${_feedbackFilter === 'new' ? ' active' : ''}" data-filter="new">${t.admin.filterNew(counts.new)}</button>
                <button class="admin-filter-btn${_feedbackFilter === 'read' ? ' active' : ''}" data-filter="read">${t.admin.filterRead(counts.read)}</button>
                <button class="admin-filter-btn${_feedbackFilter === 'resolved' ? ' active' : ''}" data-filter="resolved">${t.admin.filterResolved(counts.resolved)}</button>
            </div>
            ${feedback.length === 0 ? `<p class="admin-empty">${t.admin.noFeedback}</p>` : ''}
            ${feedback.map(f => {
                const isExpanded = _expandedFeedbackId === f.id;
                return `
                    <div class="admin-feedback-card admin-feedback-${esc(f.status)}" data-feedback-id="${esc(f.id)}">
                        <div class="admin-feedback-header">
                            <span class="admin-feedback-type-badge admin-type-${esc(f.type)}">${typeLabel(f.type)}</span>
                            <span class="admin-feedback-text-preview">${esc(f.text?.substring(0, 100))}${f.text?.length > 100 ? '...' : ''}</span>
                            <span class="admin-feedback-status admin-status-${esc(f.status)}">${statusLabel(f.status)}</span>
                        </div>
                        <div class="admin-feedback-meta">
                            <span>${esc(f.author_name || '—')}</span>
                            ${f.family_name ? `<span>• ${esc(f.family_name)}</span>` : ''}
                            <span>• ${formatDate(f.created_at)}</span>
                        </div>
                        ${isExpanded ? `
                            <div class="admin-feedback-detail">
                                <div class="admin-feedback-full-text">${esc(f.text)}</div>
                                <div class="form-group" style="margin-top:0.75rem">
                                    <label>${t.admin.adminNotesLabel}</label>
                                    <textarea class="form-input admin-notes-input" rows="2" placeholder="${t.admin.adminNotesPlaceholder}">${esc(f.admin_notes || '')}</textarea>
                                </div>
                                <div class="admin-feedback-actions">
                                    <select class="form-input admin-status-select" style="width:auto">
                                        <option value="new"${f.status === 'new' ? ' selected' : ''}>${t.admin.statusNew}</option>
                                        <option value="read"${f.status === 'read' ? ' selected' : ''}>${t.admin.statusRead}</option>
                                        <option value="resolved"${f.status === 'resolved' ? ' selected' : ''}>${t.admin.statusResolved}</option>
                                    </select>
                                    <button class="btn btn-primary btn-small admin-save-feedback" data-id="${esc(f.id)}">${t.admin.saveFeedbackBtn}</button>
                                    <button class="btn btn-small btn-danger admin-delete-feedback" data-id="${esc(f.id)}">${t.admin.deleteFeedbackBtn}</button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function wireFeedbackEvents(el) {
    // Filter buttons
    el.querySelectorAll('.admin-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _feedbackFilter = btn.dataset.filter;
            renderTabContent();
        });
    });

    // Expand/collapse feedback cards
    el.querySelectorAll('.admin-feedback-card').forEach(card => {
        card.querySelector('.admin-feedback-header')?.addEventListener('click', () => {
            const fid = card.dataset.feedbackId;
            _expandedFeedbackId = _expandedFeedbackId === fid ? null : fid;
            renderTabContent();
        });
    });

    // Save feedback
    el.querySelectorAll('.admin-save-feedback').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const card = btn.closest('.admin-feedback-card');
            const id = btn.dataset.id;
            const status = card.querySelector('.admin-status-select').value;
            const notes = card.querySelector('.admin-notes-input').value;
            btn.disabled = true;
            try {
                await adminService.updateFeedbackStatus(id, status, notes);
                emit('toast', { message: t.admin.feedbackUpdated, type: 'success' });
            } catch (e) {
                emit('toast', { message: t.errors.feedbackUpdateError, type: 'error' });
                btn.disabled = false;
            }
        });
    });

    // Delete feedback
    el.querySelectorAll('.admin-delete-feedback').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(t.admin.deleteFeedbackConfirm)) return;
            try {
                await adminService.deleteFeedback(btn.dataset.id);
                _expandedFeedbackId = null;
                emit('toast', { message: t.admin.feedbackDeleted, type: 'success' });
            } catch (e) {
                emit('toast', { message: t.errors.deleteError, type: 'error' });
            }
        });
    });
}

// ── Helpers ───────────────────────────────────────────────

function formatDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}
