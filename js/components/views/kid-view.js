// ============================================================
// Kid View — per-kid dashboard: summary + assets + goals + matching
// Modal logic lives in components/modals/.
// ============================================================

import * as store from '../../store.js';
import { can } from '../../permissions.js';
import { kidInvestments, kidGoals, computeSummary, computeMatching } from '../../utils/compute.js';
import * as summaryCards from '../ui/summary-cards.js';
import * as assetTable from '../ui/asset-table.js';
import * as goalList from '../ui/goal-list.js';
import * as simulationSection from '../ui/simulation-section.js';
import * as matchingSection from '../ui/matching-section.js';
import { showInvestmentModal, deleteInvestment } from '../modals/investment-modal.js';
import { showGoalModal, deleteGoal } from '../modals/goal-modal.js';
import { showSimulationModal, deleteSimulation } from '../modals/simulation-modal.js';
import { renderAvatar, DEFAULT_AVATAR } from '../ui/avatar.js';
import { showAvatarModal } from '../modals/avatar-modal.js';
import { togglePrivacy } from '../../services/family-service.js';
import { showRenameMemberModal } from '../modals/member-modals.js';

let _unsubs = [];
let _container = null;
let _kidName = null;
let _renderTimer = null;

function debouncedRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => { _renderTimer = null; renderView(); }, 50);
}

export function mount(container, kidName) {
    unmount();
    _container = container;
    _kidName = kidName;
    renderView();

    _unsubs.push(
        store.subscribe('investments', debouncedRender),
        store.subscribe('goals', debouncedRender),
        store.subscribe('simulations', debouncedRender),
        store.subscribe('exchangeRates', debouncedRender),
        store.subscribe('members', debouncedRender),
    );
}

export function unmount() {
    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _container = null;
    _kidName = null;
}

function renderView() {
    if (!_container || !_kidName) return;

    const user = store.get('user');
    const family = store.get('family') || {};
    const allInvestments = store.get('investments') || [];
    const allGoals = store.get('goals') || [];

    const allSimulations = store.get('simulations') || [];

    const members = store.get('members') || [];
    const member = members.find(m => m.name === _kidName);
    const avatarCfg = member?.avatar || DEFAULT_AVATAR;

    const investments = kidInvestments(allInvestments, _kidName);
    const goals = kidGoals(allGoals, _kidName);
    const simulations = allSimulations.filter(s => s.kid === _kidName);
    const summary = computeSummary(investments);
    const matching = computeMatching(investments, family);

    const canEditAvatar = user.role === 'manager' || user.kidName === _kidName;
    const canEditName = user.role === 'manager';
    const isPrivate = member?.private === true;
    const canTogglePrivacy = user.kidName === _kidName || user.role === 'manager';

    const isMemberView = user.role === 'member';
    _container.innerHTML = `
        <section class="kid-header${isMemberView ? ' member-mode' : ''}">
            <div class="kid-avatar-display" id="kid-avatar">
                ${renderAvatar(avatarCfg, 72)}
                ${canEditAvatar ? '<button class="avatar-edit-btn" id="edit-avatar-btn" title="ערוך אווטאר">✏️</button>' : ''}
            </div>
            <h2 class="kid-header-name">${_kidName}${canEditName ? ` <button class="name-edit-btn" id="edit-name-btn" title="שנה שם">✏️</button>` : ''}</h2>
            ${canTogglePrivacy ? `
                <label class="privacy-toggle" title="${isPrivate ? 'הסכומים מוסתרים מחברי משפחה אחרים' : 'הסכומים גלויים לכל המשפחה'}">
                    <input type="checkbox" id="privacy-checkbox" ${isPrivate ? 'checked' : ''}>
                    <span class="privacy-toggle-label">${isPrivate ? '🔒 פרטי' : '🔓 גלוי'}</span>
                </label>
            ` : ''}
        </section>
        <section class="summary-cards" data-slot="summary"></section>
        <section class="section" data-slot="assets"></section>
        <section class="section" data-slot="goals"></section>
        <section class="section" data-slot="simulator"></section>
        <section class="section" data-slot="matching"></section>
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        summary, family, investments
    );

    assetTable.render(
        _container.querySelector('[data-slot="assets"]'),
        investments,
        {
            canEdit: can(user, 'investment:edit'),
            canAdd: can(user, 'investment:create'),
            onAdd: () => showInvestmentModal(_kidName),
            onEdit: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showInvestmentModal(_kidName, inv);
            },
            onDelete: (id) => deleteInvestment(id),
        }
    );

    goalList.render(
        _container.querySelector('[data-slot="goals"]'),
        goals, summary.totalCurrent,
        {
            canEdit: can(user, 'goal:edit', { kidName: _kidName }),
            canAdd: can(user, 'goal:create', { kidName: _kidName }),
            onAdd: () => showGoalModal(_kidName),
            onEdit: (id) => {
                const g = allGoals.find(g2 => g2.id === id);
                if (g) showGoalModal(_kidName, g);
            },
            onDelete: (id) => deleteGoal(id),
            onReorder: async (id, direction) => {
                const { reorder } = await import('../../services/goal-service.js');
                await reorder(user.familyId, id, direction, goals);
            },
        }
    );

    simulationSection.render(
        _container.querySelector('[data-slot="simulator"]'),
        simulations,
        {
            canAdd: can(user, 'simulation:create', { kidName: _kidName }),
            canEdit: can(user, 'simulation:edit', { kidName: _kidName }),
            canDelete: can(user, 'simulation:delete', { kidName: _kidName }),
            onAdd: () => showSimulationModal(_kidName),
            onEdit: (id) => {
                const sim = allSimulations.find(s => s.id === id);
                if (sim) showSimulationModal(_kidName, sim);
            },
            onDelete: (id) => deleteSimulation(id),
        }
    );

    matchingSection.render(
        _container.querySelector('[data-slot="matching"]'),
        matching, family
    );

    const editAvatarBtn = _container.querySelector('#edit-avatar-btn');
    if (editAvatarBtn) {
        editAvatarBtn.addEventListener('click', () => showAvatarModal(_kidName, avatarCfg));
    }

    const editNameBtn = _container.querySelector('#edit-name-btn');
    if (editNameBtn && member) {
        editNameBtn.addEventListener('click', () => showRenameMemberModal(member.uid || member.id, _kidName));
    }

    const privacyCheckbox = _container.querySelector('#privacy-checkbox');
    if (privacyCheckbox) {
        privacyCheckbox.addEventListener('change', async () => {
            const user = store.get('user');
            if (!user?.familyId || !member?.id) return;
            await togglePrivacy(user.familyId, member.id, privacyCheckbox.checked);
        });
    }
}
