// ============================================================
// Dashboard Shell — header + tab bar + view container
// Manages sub-navigation between kid tabs and family view.
// Modal logic lives in components/modals/.
// ============================================================

import * as store from '../../store.js';
import { can } from '../../permissions.js';
import { esc } from '../../utils/dom-helpers.js';
import * as familyService from '../../services/family-service.js';
import * as investmentService from '../../services/investment-service.js';
import * as goalService from '../../services/goal-service.js';
import * as simulationService from '../../services/simulation-service.js';
import * as priceService from '../../services/price-service.js';
import { showAddMemberModal, showManageMembersModal } from '../modals/member-modals.js';
import { showKidContextMenu } from '../modals/kid-modals.js';
import { showSettingsModal } from '../modals/settings-modal.js';
import { exportData, importData } from '../modals/data-transfer.js';
import { renderAvatar, DEFAULT_AVATAR } from '../ui/avatar.js';
import { renderJar, JAR_LABELS } from '../ui/jar.js';
import { switchToMember, switchBack, isImpersonating, getParentUser } from '../../services/impersonate.js';

let _container = null;
let _unsubs = [];
let _activeTab = null;
let _kidViewMod = null;
let _familyViewMod = null;
let _renderTimer = null;

function debouncedRenderShell() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => { _renderTimer = null; renderShell(); }, 50);
}

export async function mount(container) {
    unmount();
    _container = container;

    const user = store.get('user');
    if (!user?.familyId) return;

    await familyService.listen(user.familyId);
    await investmentService.listen(user.familyId);
    await goalService.listen(user.familyId);
    await simulationService.listen(user.familyId);

    await priceService.loadPriceCache(user.familyId);
    priceService.startAutoRefresh();

    renderShell();

    let _lastRole = user.role;
    let _lastKidName = user.kidName;

    _unsubs.push(
        store.subscribe('kids', () => debouncedRenderShell()),
        store.subscribe('family', () => updateTitle()),
        store.subscribe('members', () => updateTabAvatars()),
        store.subscribe('priceLastUpdate', () => updatePriceStatus()),
        store.subscribe('user', (u) => {
            // Only re-render the shell when impersonation changes (role/kidName),
            // not on every user update (e.g. token refresh)
            if (u?.role !== _lastRole || u?.kidName !== _lastKidName) {
                _lastRole = u?.role;
                _lastKidName = u?.kidName;
                debouncedRenderShell();
            }
        }),
    );
}

export function unmount() {
    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    if (_kidViewMod) { _kidViewMod.unmount(); _kidViewMod = null; }
    if (_familyViewMod) { _familyViewMod.unmount(); _familyViewMod = null; }
    familyService.stopListening();
    investmentService.stopListening();
    goalService.stopListening();
    simulationService.stopListening();
    priceService.stopAutoRefresh();
    _container = null;
    _activeTab = null;
}

function renderShell() {
    if (!_container) return;

    const user = store.get('user');
    const family = store.get('family') || {};
    const kids = store.get('kids') || [];

    const title = family.family_name ? family.family_name + ' - Family Money' : 'Family Money';
    document.title = title;

    const impersonating = isImpersonating();
    const isKidMode = user.role === 'member';

    let visibleKids = kids;
    if (user.role === 'member') {
        visibleKids = kids.filter(k => k === user.kidName);
    }

    // When impersonating, use the parent's permissions for header actions
    const effectiveUser = isImpersonating() ? getParentUser() : user;

    let headerActions = '';
    const lastUpdate = store.get('priceLastUpdate');
    if (lastUpdate) {
        const d = new Date(lastUpdate);
        headerActions += `<span class="price-status">מחירים: ${d.toLocaleTimeString('he-IL')}</span>`;
    }

    // "View as" dropdown for managers (always visible, even while impersonating)
    if (effectiveUser.role === 'manager' && kids.length > 0) {
        const currentKid = impersonating ? user.kidName : '';
        let options = `<option value="">👁 תצוגת הורה</option>`;
        kids.forEach(kid => {
            const sel = kid === currentKid ? ' selected' : '';
            options += `<option value="${esc(kid)}"${sel}>👁 צפה כ-${esc(kid)}</option>`;
        });
        headerActions += `<select id="view-as-select" class="view-as-select" title="החלף תצוגה">${options}</select>`;
    }

    // When impersonating, hide all manager actions — show only the dropdown + logout
    // so the parent sees exactly what the kid sees
    if (!impersonating) {
        if (can(effectiveUser, 'kid:create'))    headerActions += `<button id="add-kid-btn" class="btn btn-small" title="הוסף ילד/ה">+ ילד/ה</button>`;
        if (can(effectiveUser, 'member:create')) headerActions += `<button id="manage-members-btn" class="btn btn-small" title="ניהול חברי משפחה">👥 חברים</button>`;
        if (can(effectiveUser, 'settings:view')) headerActions += `<button id="settings-btn" class="btn btn-icon" title="הגדרות">⚙</button>`;
        if (can(effectiveUser, 'data:export')) {
            headerActions += `<button id="export-btn" class="btn btn-icon" title="ייצוא נתונים">⤓</button>`;
            headerActions += `<button id="import-btn" class="btn btn-icon" title="ייבוא נתונים">⤒</button>`;
        }
    }
    headerActions += `<button id="logout-btn" class="btn btn-icon" title="התנתק">🚪</button>`;

    const members = store.get('members') || [];

    let headerHtml;
    let tabsHtml = '';

    if (isKidMode) {
        // Kid mode: slim colorful header — just actions
        headerHtml = `
        <header class="app-header kid-mode-header">
            <div class="header-actions">${headerActions}</div>
        </header>`;

        // Jar + Avatar centered together in the tabs-nav
        const member = members.find(m => m.name === user.kidName);
        const avatarCfg = member?.avatar || DEFAULT_AVATAR;
        const jarType = member?.jarType || 'glass';
        const bigAvatar = renderAvatar(avatarCfg, 92);
        const jarSvg = renderJar(jarType, 64);
        const jarLabel = JAR_LABELS[jarType] || JAR_LABELS.glass;
        const kidTabActive = (_activeTab !== '__family__') ? ' active' : '';

        tabsHtml = `
            <div class="kid-tab-area">
                <div class="kid-identity-card${kidTabActive}" id="kid-tab-identity" data-kid="${esc(user.kidName)}">
                    <div class="kid-id-graphics">
                        <div class="kid-id-jar" id="kid-jar-display" title="ערוך חסכון">
                            <div class="coin-jar-deco">
                                ${jarSvg}
                                <span class="drop-coin c1">🪙</span>
                                <span class="drop-coin c2">🪙</span>
                                <span class="drop-coin c3">🪙</span>
                            </div>
                            <button class="kid-id-edit-fab" id="edit-jar-btn" title="ערוך חסכון">✏️</button>
                        </div>
                        <div class="kid-id-avatar" id="kid-header-avatar" title="ערוך אווטאר">
                            ${bigAvatar}
                            <button class="kid-id-edit-fab" id="edit-avatar-fab" title="ערוך אווטאר">✏️</button>
                        </div>
                    </div>
                    <div class="kid-id-name">${esc(user.kidName)}</div>
                </div>
            </div>`;

        // Family tab on the far side — only if kid has siblings
        if (kids.length > 1) {
            const familyActive = _activeTab === '__family__' ? ' active' : '';
            tabsHtml += `<button class="tab-btn tab-btn-family${familyActive}" data-kid="__family__">🏠 משפחה</button>`;
        }
    } else {
        headerHtml = `
        <header class="app-header">
            <div class="header-content">
                <h1 id="family-title">${esc(title)}</h1>
                <div class="header-actions">${headerActions}</div>
            </div>
        </header>`;

        visibleKids.forEach(kid => {
            const active = _activeTab === kid ? ' active' : '';
            const member = members.find(m => m.name === kid);
            const avatarCfg = member?.avatar || DEFAULT_AVATAR;
            const avatarSvg = renderAvatar(avatarCfg, 28);
            tabsHtml += `<button class="tab-btn${active}" data-kid="${esc(kid)}"><span class="tab-avatar">${avatarSvg}</span>${esc(kid)}</button>`;
        });
        if (visibleKids.length > 1) {
            const active = _activeTab === '__family__' ? ' active' : '';
            tabsHtml += `<button class="tab-btn${active}" data-kid="__family__">משפחה</button>`;
        }
    }

    _container.innerHTML = `
        ${headerHtml}
        <nav class="tabs-nav${isKidMode ? ' kid-mode-tabs' : ''}" id="dashboard-tabs">${tabsHtml}</nav>
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
    const effectiveUser = isImpersonating() ? getParentUser() : user;

    // Kid mode: jar area click → jar modal (stop propagation so card doesn't also fire)
    const kidJarDisplay = _container.querySelector('#kid-jar-display');
    if (kidJarDisplay) {
        kidJarDisplay.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { showJarModal } = await import('../modals/jar-modal.js');
            const members = store.get('members') || [];
            const member = members.find(m => m.name === user.kidName);
            showJarModal(user.kidName, member?.jarType || 'glass');
        });
    }

    // Kid mode: avatar area click → avatar modal
    const kidAvatarArea = _container.querySelector('#kid-header-avatar');
    if (kidAvatarArea) {
        kidAvatarArea.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { showAvatarModal } = await import('../modals/avatar-modal.js');
            const members = store.get('members') || [];
            const member = members.find(m => m.name === user.kidName);
            showAvatarModal(user.kidName, member?.avatar);
        });
    }

    // Kid mode: clicking identity card (not jar/avatar) switches to kid's own view
    const kidIdentityCard = _container.querySelector('#kid-tab-identity');
    if (kidIdentityCard) {
        kidIdentityCard.addEventListener('click', (e) => {
            if (e.target.closest('#kid-jar-display') || e.target.closest('#kid-header-avatar')) return;
            switchTab(kidIdentityCard.dataset.kid);
        });
    }

    _container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.kid));
        if (!isImpersonating() && can(effectiveUser, 'kid:rename') && btn.dataset.kid !== '__family__') {
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showKidContextMenu(btn.dataset.kid, {
                    onRenamed: (newName) => { _activeTab = newName; },
                    onDeleted: () => { _activeTab = null; },
                });
            });
        }
    });

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
            if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
        });
    }

    const logoutBtn = _container.querySelector('#logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (isImpersonating()) switchBack();
            const { logout } = await import('../../services/auth-service.js');
            logout();
        });
    }

    const emptyAddBtn = _container.querySelector('#empty-add-member-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', showAddMemberModal);

    // Impersonation: "view as" dropdown
    const viewAsSelect = _container.querySelector('#view-as-select');
    if (viewAsSelect) {
        viewAsSelect.addEventListener('change', () => {
            const kidName = viewAsSelect.value;
            if (kidName) {
                if (isImpersonating()) switchBack();
                switchToMember(kidName);
            } else {
                switchBack();
            }
        });
    }
}

async function switchTab(tabId) {
    _activeTab = tabId;
    store.set('activeTab', tabId);

    _container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.kid === tabId);
    });

    // Kid-identity-card is not a .tab-btn — update its active state separately
    const kidIdentityCard = _container.querySelector('.kid-identity-card');
    if (kidIdentityCard) {
        kidIdentityCard.classList.toggle('active', tabId !== '__family__');
    }

    const viewContainer = _container.querySelector('#view-container');
    if (!viewContainer) return;

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

function updatePriceStatus() {
    const el = _container?.querySelector('.price-status');
    const lastUpdate = store.get('priceLastUpdate');
    if (el && lastUpdate) {
        const d = new Date(lastUpdate);
        el.textContent = 'מחירים: ' + d.toLocaleTimeString('he-IL');
    }
}

function updateTitle() {
    const family = store.get('family') || {};
    const titleEl = _container?.querySelector('#family-title');
    if (titleEl) {
        const title = family.family_name ? family.family_name + ' - Family Money' : 'Family Money';
        titleEl.textContent = title;
        document.title = title;
    }
}

function updateTabAvatars() {
    if (!_container) return;
    const members = store.get('members') || [];
    _container.querySelectorAll('.tab-btn[data-kid]').forEach(btn => {
        const kidName = btn.dataset.kid;
        if (kidName === '__family__') return;
        const member = members.find(m => m.name === kidName);
        const avatarCfg = member?.avatar || DEFAULT_AVATAR;
        const avatarEl = btn.querySelector('.tab-avatar');
        if (avatarEl) avatarEl.innerHTML = renderAvatar(avatarCfg, 28);
    });
    // Also update the kid-identity avatar and jar in the tabs-nav
    const user = store.get('user');
    const heroAvatarEl = _container.querySelector('#kid-header-avatar');
    if (heroAvatarEl) {
        const member = members.find(m => m.name === user?.kidName);
        const avatarCfg = member?.avatar || DEFAULT_AVATAR;
        heroAvatarEl.innerHTML = renderAvatar(avatarCfg, 92);
    }
    const jarDisplay = _container.querySelector('#kid-jar-display');
    if (jarDisplay) {
        const member = members.find(m => m.name === user?.kidName);
        const jarType = member?.jarType || 'glass';
        const jarDeco = jarDisplay.querySelector('.coin-jar-deco');
        if (jarDeco) {
            jarDeco.innerHTML = renderJar(jarType, 64) +
                '<span class="drop-coin c1">🪙</span>' +
                '<span class="drop-coin c2">🪙</span>' +
                '<span class="drop-coin c3">🪙</span>';
        }
        const jarNameEl = jarDisplay.querySelector('.kid-jar-name');
        if (jarNameEl) jarNameEl.textContent = JAR_LABELS[jarType] || JAR_LABELS.glass;
    }
}
