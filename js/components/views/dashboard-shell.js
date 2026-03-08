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
import * as priceService from '../../services/price-service.js';
import { showAddMemberModal, showManageMembersModal } from '../modals/member-modals.js';
import { showKidContextMenu } from '../modals/kid-modals.js';
import { showSettingsModal } from '../modals/settings-modal.js';
import { exportData, importData } from '../modals/data-transfer.js';

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

    await familyService.listen(user.familyId);
    await investmentService.listen(user.familyId);
    await goalService.listen(user.familyId);

    await priceService.loadPriceCache(user.familyId);
    priceService.startAutoRefresh();

    renderShell();

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

    const title = family.family_name ? family.family_name + ' - Family Money' : 'Family Money';
    document.title = title;

    let visibleKids = kids;
    if (user.role === 'member') {
        visibleKids = kids.filter(k => k === user.kidName);
    }

    let headerActions = '';
    const lastUpdate = store.get('priceLastUpdate');
    if (lastUpdate) {
        const d = new Date(lastUpdate);
        headerActions += `<span class="price-status">מחירים: ${d.toLocaleTimeString('he-IL')}</span>`;
    }
    if (can(user, 'kid:create'))    headerActions += `<button id="add-kid-btn" class="btn btn-small" title="הוסף ילד/ה">+ ילד/ה</button>`;
    if (can(user, 'member:create')) headerActions += `<button id="manage-members-btn" class="btn btn-small" title="ניהול חברי משפחה">👥 חברים</button>`;
    if (can(user, 'settings:view')) headerActions += `<button id="settings-btn" class="btn btn-icon" title="הגדרות">⚙</button>`;
    if (can(user, 'data:export')) {
        headerActions += `<button id="export-btn" class="btn btn-icon" title="ייצוא נתונים">⤓</button>`;
        headerActions += `<button id="import-btn" class="btn btn-icon" title="ייבוא נתונים">⤒</button>`;
    }
    headerActions += `<button id="logout-btn" class="btn btn-icon" title="התנתק">🚪</button>`;

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

    _container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.kid));
        if (can(user, 'kid:rename') && btn.dataset.kid !== '__family__') {
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
            const { logout } = await import('../../services/auth-service.js');
            logout();
        });
    }

    const emptyAddBtn = _container.querySelector('#empty-add-member-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', showAddMemberModal);
}

async function switchTab(tabId) {
    _activeTab = tabId;
    store.set('activeTab', tabId);

    _container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.kid === tabId);
    });

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

function updateTitle() {
    const family = store.get('family') || {};
    const titleEl = _container?.querySelector('#family-title');
    if (titleEl) {
        const title = family.family_name ? family.family_name + ' - Family Money' : 'Family Money';
        titleEl.textContent = title;
        document.title = title;
    }
}
