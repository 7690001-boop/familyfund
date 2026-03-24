// ============================================================
// Kid View — per-kid dashboard: summary + assets + goals + matching
// Modal logic lives in components/modals/.
// ============================================================

import * as store from '../../store.js';
import { can } from '../../permissions.js';
import { kidInvestments, kidGoals, computeSummary, computeMatching } from '../../utils/compute.js';
import * as summaryCards from '../ui/summary-cards.js';
import * as investmentHeatmap from '../ui/investment-heatmap.js';
import * as assetTable from '../ui/asset-table.js';
import * as goalList from '../ui/goal-list.js';
import * as simulationSection from '../ui/simulation-section.js';
import * as matchingSection from '../ui/matching-section.js';
import * as investmentRequests from '../ui/investment-requests.js';
import { showInvestmentModal, deleteInvestment } from '../modals/investment-modal.js';
import { showBuyRequestModal, showSellRequestModal } from '../modals/investment-request-modal.js';
import { showAddCashModal, showConvertModal, showSellModal } from '../modals/cash-modal.js';
import { showGoalModal, deleteGoal } from '../modals/goal-modal.js';
import { showSimulationModal, deleteSimulation } from '../modals/simulation-modal.js';
import { renderAvatar, DEFAULT_AVATAR } from '../ui/avatar.js';
import { showAvatarModal } from '../modals/avatar-modal.js';
import { togglePrivacy, isInCooldown, getCooldownRemaining } from '../../services/family-service.js';
import { showRenameMemberModal } from '../modals/member-modals.js';
import { emit } from '../../event-bus.js';
import t from '../../i18n.js';

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
        store.subscribe('investmentRequests', debouncedRender),
    );
}

export function unmount() {
    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    investmentRequests.unmount();
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

    const isManager = user.role === 'manager';
    const isMember = user.role === 'member' && user.kidName === _kidName;
    const investments = kidInvestments(allInvestments, _kidName);
    const goals = kidGoals(allGoals, _kidName);
    const simulations = allSimulations.filter(s => s.kid === _kidName);
    const summary = computeSummary(investments);
    const matching = computeMatching(investments, family);

    const canEditAvatar = user.role === 'manager' || user.kidName === _kidName;
    const canEditName = user.role === 'manager';
    const isPrivate = member?.private === true;
    const isAutoPrivate = member?.autoPrivate === true;
    const inCooldown = isInCooldown(member);
    const cooldownRemaining = getCooldownRemaining(member);
    const canTogglePrivacy = user.kidName === _kidName || user.role === 'manager';

    // Investment request permissions
    const canRequestBuy = isMember;
    const canRequestSell = isMember;
    const canViewRequests = isManager || isMember;

    // Cash management — manager only
    const hasCash = investments.some(i => i.type === 'cash');
    const canAddCash = isManager;
    const canConvert = isManager;
    const canSell = isManager;

    const isMemberView = user.role === 'member';
    _container.innerHTML = `
        <section class="kid-header${isMemberView ? ' member-mode' : ''}">
            <div class="kid-avatar-display" id="kid-avatar">
                ${renderAvatar(avatarCfg, 72)}
                ${canEditAvatar ? `<button class="avatar-edit-btn" id="edit-avatar-btn" title="${t.kidView.editAvatarTitle}">✏️</button>` : ''}
            </div>
            <h2 class="kid-header-name">${_kidName}${canEditName ? ` <button class="name-edit-btn" id="edit-name-btn" title="${t.kidView.editNameTitle}">✏️</button>` : ''}</h2>
            ${canTogglePrivacy && !isMemberView ? `
                <label class="privacy-toggle${isAutoPrivate ? ' privacy-toggle-locked' : ''}" title="${isAutoPrivate ? t.kidView.autoPrivateHint : (isPrivate ? t.kidView.privateTitle : t.kidView.publicTitle)}">
                    <input type="checkbox" id="privacy-checkbox" ${isPrivate ? 'checked' : ''} ${isAutoPrivate ? 'disabled' : ''}>
                    <span class="privacy-toggle-label">${isAutoPrivate ? t.kidView.autoPrivateLabel : (isPrivate ? t.kidView.privateLabel : t.kidView.publicLabel)}</span>
                </label>
                ${isAutoPrivate ? `<span class="auto-private-hint">${t.kidView.autoPrivateHint}</span>` : ''}
            ` : ''}
            ${inCooldown && !isManager ? `<div class="cooldown-banner">${t.kidView.cooldownInfo(cooldownRemaining)}</div>` : ''}
        </section>
        <section class="summary-section">
            <div class="jar-side" data-slot="summary"></div>
            <div class="heatmap-main" data-slot="heatmap"></div>
        </section>
        <section class="section" data-slot="assets"></section>
        ${canViewRequests ? '<section class="section" data-slot="requests"></section>' : ''}
        <section class="section" data-slot="goals"></section>
        <section class="section" data-slot="simulator"></section>
        <section class="section" data-slot="matching"></section>
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        summary, family, investments
    );

    investmentHeatmap.render(
        _container.querySelector('[data-slot="heatmap"]'),
        investments,
        {
            familyId: user.familyId,
            sym: family.currency_symbol || '₪',
            canEdit: can(user, 'investment:edit'),
            canNote: can(user, 'investment:note', { kidName: _kidName }),
            canRename: can(user, 'investment:rename', { kidName: _kidName }),
            canSell,
            onEdit: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showInvestmentModal(_kidName, inv);
            },
            onSell: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showSellModal(_kidName, inv);
            },
        }
    );

    assetTable.render(
        _container.querySelector('[data-slot="assets"]'),
        investments,
        {
            canEdit: can(user, 'investment:edit'),
            canAdd: can(user, 'investment:create'),
            showHiddenBadge: true,
            canToggleHidden: can(user, 'investment:toggle-hidden', { kidName: _kidName }),
            canRequestBuy,
            canRequestSell,
            canSell,
            canAddCash,
            canConvert,
            onAdd: () => showInvestmentModal(_kidName),
            onEdit: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showInvestmentModal(_kidName, inv);
            },
            onDelete: (id) => deleteInvestment(id),
            onToggleHidden: async (id, hidden) => {
                const { updateHidden } = await import('../../services/investment-service.js');
                await updateHidden(user.familyId, id, hidden);
            },
            onRequestBuy: () => showBuyRequestModal(_kidName),
            onRequestSell: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showSellRequestModal(_kidName, inv);
            },
            onSell: (id) => {
                const inv = allInvestments.find(i => i.id === id);
                if (inv) showSellModal(_kidName, inv);
            },
            onAddCash: () => showAddCashModal(_kidName),
            onConvert: () => showConvertModal(_kidName),
            onRowClick: (pos) => investmentHeatmap.showDetail(pos, {
                familyId: user.familyId,
                sym: family.currency_symbol || '₪',
                canEdit: can(user, 'investment:edit'),
                canNote: can(user, 'investment:note', { kidName: _kidName }),
                canRename: can(user, 'investment:rename', { kidName: _kidName }),
                canSell,
                onEdit: (id) => {
                    const inv = allInvestments.find(i => i.id === id);
                    if (inv) showInvestmentModal(_kidName, inv);
                },
                onSell: (id) => {
                    const inv = allInvestments.find(i => i.id === id);
                    if (inv) showSellModal(_kidName, inv);
                },
            }),
        }
    );

    const requestsSlot = _container.querySelector('[data-slot="requests"]');
    if (requestsSlot) {
        investmentRequests.mount(requestsSlot, _kidName);
    }

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
    if (privacyCheckbox && !isAutoPrivate) {
        privacyCheckbox.addEventListener('change', async () => {
            const user = store.get('user');
            if (!user?.familyId || !member?.id) return;

            const goingPrivate = privacyCheckbox.checked;
            const confirmMsg = goingPrivate ? t.kidView.confirmGoPrivate : t.kidView.confirmGoPublic;

            if (!confirm(confirmMsg)) {
                privacyCheckbox.checked = !goingPrivate; // revert
                return;
            }

            try {
                await togglePrivacy(user.familyId, member.id, goingPrivate);
            } catch (e) {
                console.error('Privacy toggle error:', e);
                privacyCheckbox.checked = !goingPrivate; // revert on error
                emit('toast', { message: t.errors.updateError, type: 'error' });
            }
        });
    }
}
