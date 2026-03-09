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

    const investments = kidInvestments(allInvestments, _kidName);
    const goals = kidGoals(allGoals, _kidName);
    const simulations = allSimulations.filter(s => s.kid === _kidName);
    const summary = computeSummary(investments);
    const matching = computeMatching(investments, family);

    _container.innerHTML = `
        <section class="summary-cards" data-slot="summary"></section>
        <section class="section" data-slot="assets"></section>
        <section class="section" data-slot="goals"></section>
        <section class="section" data-slot="simulator"></section>
        <section class="section" data-slot="matching"></section>
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        summary, family
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
        }
    );

    simulationSection.render(
        _container.querySelector('[data-slot="simulator"]'),
        simulations,
        {
            canAdd: can(user, 'simulation:create', { kidName: _kidName }),
            canDelete: can(user, 'simulation:delete', { kidName: _kidName }),
            onAdd: () => showSimulationModal(_kidName),
            onDelete: (id) => deleteSimulation(id),
        }
    );

    matchingSection.render(
        _container.querySelector('[data-slot="matching"]'),
        matching, family
    );
}
