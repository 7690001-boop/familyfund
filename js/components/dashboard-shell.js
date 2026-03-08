// ============================================================
// Dashboard Shell — header + tab bar + view container
// Manages sub-navigation between kid tabs and family view
// ============================================================

import * as store from '../store.js';
import { can } from '../permissions.js';
import { esc } from '../utils/dom-helpers.js';
import { formatCurrency, toDateStr } from '../utils/format.js';
import { emit } from '../event-bus.js';
import { open as openModal, close as closeModal } from './modal.js';
import * as familyService from '../services/family-service.js';
import * as investmentService from '../services/investment-service.js';
import * as goalService from '../services/goal-service.js';
import * as priceService from '../services/price-service.js';

let _container = null;
let _unsubs = [];
let _activeTab = null;
let _kidViewMod = null;
let _familyViewMod = null;

export async function mount(container) {
    unmount();
    _container = container;

    const user = store.get('user');
    if (!user?.familyId) return;

    // Start Firestore listeners
    await familyService.listen(user.familyId);
    await investmentService.listen(user.familyId);
    await goalService.listen(user.familyId);

    // Load cached exchange rates first (instant), then start live refresh
    await priceService.loadPriceCache(user.familyId);
    priceService.startAutoRefresh();

    renderShell();

    // Subscribe to data changes that affect shell (kids list, family config)
    _unsubs.push(
        store.subscribe('kids', () => renderShell()),
        store.subscribe('family', () => updateTitle()),
        store.subscribe('members', () => renderShell()),
    );
}

export function unmount() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    if (_kidViewMod) { _kidViewMod.unmount(); _kidViewMod = null; }
    if (_familyViewMod) { _familyViewMod.unmount(); _familyViewMod = null; }
    familyService.stopListening();
    investmentService.stopListening();
    goalService.stopListening();
    priceService.stopAutoRefresh();
    _container = null;
    _activeTab = null;
}

function renderShell() {
    if (!_container) return;

    const user = store.get('user');
    const family = store.get('family') || {};
    const kids = store.get('kids') || [];

    const title = family.family_name
        ? family.family_name + ' - Family Money'
        : 'Family Money';
    document.title = title;

    // Determine visible tabs for this user
    let visibleKids = kids;
    if (user.role === 'member') {
        // Members see only their own tab + family
        visibleKids = kids.filter(k => k === user.kidName);
    }

    // Build header actions based on permissions
    let headerActions = '';
    const lastUpdate = store.get('priceLastUpdate');
    if (lastUpdate) {
        const d = new Date(lastUpdate);
        headerActions += `<span class="price-status">מחירים: ${d.toLocaleTimeString('he-IL')}</span>`;
    }
    if (can(user, 'kid:create')) {
        headerActions += `<button id="add-kid-btn" class="btn btn-small" title="הוסף ילד/ה">+ ילד/ה</button>`;
    }
    if (can(user, 'member:create')) {
        headerActions += `<button id="manage-members-btn" class="btn btn-small" title="ניהול חברי משפחה">👥 חברים</button>`;
    }
    if (can(user, 'settings:view')) {
        headerActions += `<button id="settings-btn" class="btn btn-icon" title="הגדרות">⚙</button>`;
    }
    if (can(user, 'data:export')) {
        headerActions += `<button id="export-btn" class="btn btn-icon" title="ייצוא נתונים">⤓</button>`;
        headerActions += `<button id="import-btn" class="btn btn-icon" title="ייבוא נתונים">⤒</button>`;
    }
    headerActions += `<button id="logout-btn" class="btn btn-icon" title="התנתק">🚪</button>`;

    // Build tabs
    let tabsHtml = '';
    visibleKids.forEach(kid => {
        const active = _activeTab === kid ? ' active' : '';
        tabsHtml += `<button class="tab-btn${active}" data-kid="${esc(kid)}">${esc(kid)}</button>`;
    });
    if (visibleKids.length > 1 || (user.role === 'member' && kids.length > 1)) {
        const active = _activeTab === '__family__' ? ' active' : '';
        tabsHtml += `<button class="tab-btn${active}" data-kid="__family__">משפחה</button>`;
    }

    _container.innerHTML = `
        <header class="app-header">
            <div class="header-content">
                <h1 id="family-title">${esc(title)}</h1>
                <div class="header-actions">${headerActions}</div>
            </div>
        </header>
        <nav class="tabs-nav" id="dashboard-tabs">${tabsHtml}</nav>
        ${visibleKids.length === 0 && user.role === 'manager' ? `
            <div class="empty-app-state">
                <h2>ברוכים הבאים!</h2>
                <p>התחל בהוספת חבר משפחה כדי לעקוב אחרי ההשקעות</p>
                <button id="empty-add-member-btn" class="btn btn-primary btn-large">+ הוסף חבר משפחה</button>
            </div>
        ` : ''}
        <main id="view-container"></main>
        <input type="file" id="import-file" accept=".json" hidden>
    `;

    wireShellEvents();

    // Auto-select tab
    if (visibleKids.length > 0 && (!_activeTab || !visibleKids.includes(_activeTab))) {
        switchTab(visibleKids[0]);
    } else if (_activeTab === '__family__') {
        switchTab('__family__');
    } else if (_activeTab && visibleKids.includes(_activeTab)) {
        switchTab(_activeTab);
    }
}

function wireShellEvents() {
    const user = store.get('user');

    // Tab clicks
    _container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.kid));
        // Right-click for rename/delete (manager only)
        if (can(user, 'kid:rename') && btn.dataset.kid !== '__family__') {
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showKidContextMenu(btn.dataset.kid);
            });
        }
    });

    // Header buttons
    const addKidBtn = _container.querySelector('#add-kid-btn');
    if (addKidBtn) addKidBtn.addEventListener('click', showAddMemberModal);

    const manageMembersBtn = _container.querySelector('#manage-members-btn');
    if (manageMembersBtn) manageMembersBtn.addEventListener('click', showManageMembersModal);

    const settingsBtn = _container.querySelector('#settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);

    const exportBtn = _container.querySelector('#export-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportData);

    const importBtn = _container.querySelector('#import-btn');
    const importFile = _container.querySelector('#import-file');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                importData(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    const logoutBtn = _container.querySelector('#logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const { logout } = await import('../services/auth-service.js');
            logout();
        });
    }

    const emptyAddBtn = _container.querySelector('#empty-add-member-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', showAddMemberModal);
}

async function switchTab(tabId) {
    _activeTab = tabId;
    store.set('activeTab', tabId);

    // Update tab active state
    _container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.kid === tabId);
    });

    const viewContainer = _container.querySelector('#view-container');
    if (!viewContainer) return;

    // Unmount previous view
    if (_kidViewMod) { _kidViewMod.unmount(); _kidViewMod = null; }
    if (_familyViewMod) { _familyViewMod.unmount(); _familyViewMod = null; }

    if (tabId === '__family__') {
        _familyViewMod = await import('./family-view.js');
        _familyViewMod.mount(viewContainer);
    } else {
        _kidViewMod = await import('./kid-view.js');
        _kidViewMod.mount(viewContainer, tabId);
    }
}

function updateTitle() {
    const family = store.get('family') || {};
    const titleEl = _container?.querySelector('#family-title');
    if (titleEl) {
        const title = family.family_name
            ? family.family_name + ' - Family Money'
            : 'Family Money';
        titleEl.textContent = title;
        document.title = title;
    }
}

// --- Add Member Modal (creates kid with username) ---
function showAddMemberModal() {
    const user = store.get('user');
    const familyCode = user.familyId;

    const html = `
        <h2>הוספת ילד/ה</h2>
        <div class="form-group">
            <label for="member-name">שם תצוגה</label>
            <input type="text" id="member-name" placeholder="למשל: דניאל">
        </div>
        <div class="form-group">
            <label for="member-username">שם משתמש (לכניסה)</label>
            <input type="text" id="member-username" dir="ltr" placeholder="למשל: daniel">
            <div class="form-hint">שם פשוט באנגלית או בעברית — בלי רווחים</div>
        </div>
        <div class="form-group">
            <label for="member-password">סיסמה</label>
            <input type="text" id="member-password" placeholder="לפחות 6 תווים">
        </div>
        <div style="background:var(--color-tab-hover);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-top:0.75rem">
            <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.25rem">קוד משפחה (לשתף עם הילד/ה):</div>
            <div dir="ltr" style="font-family:monospace;font-size:0.9rem;font-weight:600;user-select:all">${esc(familyCode)}</div>
        </div>
        <div id="member-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">הוסף</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const name = modal.querySelector('#member-name').value.trim();
        const username = modal.querySelector('#member-username').value.trim();
        const password = modal.querySelector('#member-password').value;
        const errorEl = modal.querySelector('#member-error');

        if (!name) { modal.querySelector('#member-name').focus(); return; }
        if (!username) { modal.querySelector('#member-username').focus(); return; }
        if (!password || password.length < 6) {
            errorEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = 'יוצר חשבון...';
        errorEl.hidden = true;

        try {
            await familyService.createMemberAccount(username, password, user.familyId, name);
            closeModal();
            emit('toast', { message: name + ' נוסף/ה בהצלחה', type: 'success' });
        } catch (e) {
            const msg = e.code === 'auth/email-already-in-use' ? 'שם משתמש כבר קיים'
                : 'שגיאה ביצירת חשבון: ' + e.message;
            errorEl.textContent = msg;
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = 'הוסף';
        }
    });
    modal.querySelector('#member-name').focus();
}

// --- Manage Members Modal ---
function showManageMembersModal() {
    const members = store.get('members') || [];
    const user = store.get('user');
    const familyCode = user.familyId;

    let memberRows = '';
    members.forEach(m => {
        const isMe = m.uid === user.uid;
        const roleLabel = m.role === 'manager' ? 'מנהל' : 'ילד/ה';
        const identifier = m.username ? 'משתמש: ' + m.username : m.email || '';
        memberRows += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--color-border)">
                <div>
                    <strong>${esc(m.name)}</strong>
                    <span style="color:var(--color-text-muted);font-size:0.85rem"> (${roleLabel})</span>
                    <div style="font-size:0.82rem;color:var(--color-text-muted)">${esc(identifier)}</div>
                </div>
                ${!isMe && m.role !== 'manager' ? `
                    <div style="display:flex;gap:0.25rem">
                        <button class="btn btn-ghost reset-password-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="איפוס סיסמה">🔑</button>
                        <button class="btn btn-ghost danger remove-member-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="הסר">✕</button>
                    </div>
                ` : ''}
            </div>
        `;
    });

    const html = `
        <h2>ניהול חברי משפחה</h2>
        <div style="background:var(--color-tab-hover);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-bottom:1rem">
            <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.25rem">קוד משפחה (לשתף עם הילדים):</div>
            <div dir="ltr" style="font-family:monospace;font-size:0.9rem;font-weight:600;user-select:all">${esc(familyCode)}</div>
        </div>
        <div style="margin-bottom:1rem">${memberRows}</div>
        <div class="modal-actions">
            <button class="btn btn-primary" id="modal-add-member" style="margin-inline-end:auto">+ הוסף ילד/ה</button>
            <button class="btn btn-secondary" id="modal-cancel">סגור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-add-member').addEventListener('click', () => {
        closeModal();
        showAddMemberModal();
    });

    modal.querySelectorAll('.reset-password-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            const name = btn.dataset.name;
            closeModal();
            showResetPasswordModal(uid, name);
        });
    });

    modal.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            const name = btn.dataset.name;
            closeModal();
            showRemoveMemberConfirm(uid, name);
        });
    });
}

function showResetPasswordModal(memberUid, memberName) {
    const html = `
        <h2>איפוס סיסמה — ${esc(memberName)}</h2>
        <div class="form-group">
            <label for="new-password">סיסמה חדשה</label>
            <input type="text" id="new-password" placeholder="לפחות 6 תווים">
        </div>
        <div id="reset-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור סיסמה</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    const errorEl = modal.querySelector('#reset-error');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#new-password').focus();
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const newPassword = modal.querySelector('#new-password').value;
        if (!newPassword || newPassword.length < 6) {
            errorEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = 'שומר...';
        errorEl.hidden = true;

        try {
            await familyService.resetMemberPassword(memberUid, newPassword);
            closeModal();
            emit('toast', { message: 'סיסמת ' + memberName + ' אופסה בהצלחה', type: 'success' });
        } catch (e) {
            errorEl.textContent = 'שגיאה באיפוס הסיסמה: ' + (e.message || e);
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = 'שמור סיסמה';
        }
    });
}

function showRemoveMemberConfirm(memberUid, memberName) {
    const html = `
        <h2>הסרת ${esc(memberName)}?</h2>
        <p>פעולה זו תסיר את ${esc(memberName)} מהמשפחה. ההשקעות והיעדים שלו/ה יישארו.</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-danger" id="modal-delete">הסר</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-delete').addEventListener('click', async () => {
        try {
            const user = store.get('user');
            await familyService.removeMember(user.familyId, memberUid);
            closeModal();
            emit('toast', { message: memberName + ' הוסר/ה', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בהסרת חבר/ה', type: 'error' });
            closeModal();
        }
    });
}

// --- Kid Context Menu ---
function showKidContextMenu(kid) {
    const html = `
        <h2>${esc(kid)}</h2>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
            <button class="btn btn-secondary" id="ctx-rename">שנה שם</button>
            <button class="btn btn-danger" id="ctx-delete">מחק ילד/ה</button>
            <button class="btn btn-secondary" id="ctx-close">סגור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#ctx-rename').addEventListener('click', () => { closeModal(); showRenameKidModal(kid); });
    modal.querySelector('#ctx-delete').addEventListener('click', () => { closeModal(); showDeleteKidModal(kid); });
    modal.querySelector('#ctx-close').addEventListener('click', closeModal);
}

function showRenameKidModal(kid) {
    const html = `
        <h2>שינוי שם</h2>
        <div class="form-group">
            <label for="kid-new-name">שם חדש</label>
            <input type="text" id="kid-new-name" value="${esc(kid)}">
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const newName = modal.querySelector('#kid-new-name').value.trim();
        if (!newName) { modal.querySelector('#kid-new-name').focus(); return; }

        try {
            const user = store.get('user');
            const investments = store.get('investments') || [];
            const goals = store.get('goals') || [];

            // Update all investments and goals for this kid
            const invUpdates = investments.filter(i => i.kid === kid).map(i =>
                investmentService.update(user.familyId, i.id, { kid: newName })
            );
            const goalUpdates = goals.filter(g => g.kid === kid).map(g =>
                goalService.update(user.familyId, g.id, { kid: newName })
            );
            await Promise.all([...invUpdates, ...goalUpdates]);

            // Update member doc name
            const members = store.get('members') || [];
            const member = members.find(m => m.name === kid);
            if (member) {
                await familyService.updateMember(user.familyId, member.uid, { name: newName });
            }

            closeModal();
            _activeTab = newName;
            emit('toast', { message: 'שם עודכן', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בעדכון שם', type: 'error' });
        }
    });
    modal.querySelector('#kid-new-name').focus();
}

function showDeleteKidModal(kid) {
    const investments = (store.get('investments') || []).filter(i => i.kid === kid);
    const goals = (store.get('goals') || []).filter(g => g.kid === kid);

    const html = `
        <h2>מחיקת ${esc(kid)}?</h2>
        <p>פעולה זו תמחק את כל ההשקעות (${investments.length}) והיעדים (${goals.length}) של ${esc(kid)}.</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-danger" id="modal-delete">מחק</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-delete').addEventListener('click', async () => {
        try {
            const user = store.get('user');

            // Delete all investments and goals for this kid
            const delInv = investments.map(i => investmentService.remove(user.familyId, i.id));
            const delGoals = goals.map(g => goalService.remove(user.familyId, g.id));
            await Promise.all([...delInv, ...delGoals]);

            // Remove member doc
            const members = store.get('members') || [];
            const member = members.find(m => m.name === kid);
            if (member) {
                await familyService.removeMember(user.familyId, member.uid || member.id);
            }

            closeModal();
            _activeTab = null;
            emit('toast', { message: kid + ' נמחק/ה', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה במחיקה', type: 'error' });
            closeModal();
        }
    });
}

// --- Settings Modal ---
function showSettingsModal() {
    const family = store.get('family') || {};

    const html = `
        <h2>הגדרות</h2>
        <div class="form-group">
            <label for="cfg-family">שם המשפחה</label>
            <input type="text" id="cfg-family" value="${esc(family.family_name || '')}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="cfg-currency">סמל מטבע</label>
                <input type="text" id="cfg-currency" value="${esc(family.currency_symbol || '₪')}">
            </div>
            <div class="form-group">
                <label for="cfg-matching-days">ימים להתאמה</label>
                <input type="number" id="cfg-matching-days" min="1" value="${family.matching_days || 365}">
            </div>
        </div>
        <div class="form-group">
            <label for="cfg-sp500">טיקר S&P 500</label>
            <input type="text" id="cfg-sp500" dir="ltr" placeholder="למשל: VOO" value="${esc(family.sp500_ticker || '')}">
            <div class="form-hint">הטיקר שמשמש לתוכנית ההתאמה של ההורים</div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        try {
            const user = store.get('user');
            await familyService.updateFamily(user.familyId, {
                family_name: modal.querySelector('#cfg-family').value.trim(),
                currency_symbol: modal.querySelector('#cfg-currency').value.trim() || '₪',
                matching_days: parseInt(modal.querySelector('#cfg-matching-days').value) || 365,
                sp500_ticker: modal.querySelector('#cfg-sp500').value.trim(),
            });
            closeModal();
            emit('toast', { message: 'הגדרות נשמרו', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בשמירת הגדרות', type: 'error' });
        }
    });
}

// --- Export / Import ---
function exportData() {
    const data = {
        family: store.get('family'),
        members: store.get('members'),
        investments: store.get('investments'),
        goals: store.get('goals'),
        exported_at: new Date().toISOString(),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investments-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    emit('toast', { message: 'נתונים יוצאו בהצלחה', type: 'success' });
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            const user = store.get('user');
            if (!user?.familyId) return;

            // Import investments
            if (imported.investments) {
                for (const inv of imported.investments) {
                    const { id, ...data } = inv;
                    await investmentService.add(user.familyId, data);
                }
            }

            // Import goals
            if (imported.goals) {
                for (const goal of imported.goals) {
                    const { id, ...data } = goal;
                    await goalService.add(user.familyId, data);
                }
            }

            emit('toast', { message: 'נתונים יובאו בהצלחה', type: 'success' });
        } catch (err) {
            emit('toast', { message: 'שגיאה בקריאת הקובץ', type: 'error' });
        }
    };
    reader.readAsText(file);
}
