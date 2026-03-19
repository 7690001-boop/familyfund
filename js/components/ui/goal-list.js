// ============================================================
// Goal List — savings goals section
// Priority-based allocation: portfolio value fills goals in order.
// ============================================================

import { formatCurrency, formatDate } from '../../utils/format.js';
import { esc } from '../../utils/dom-helpers.js';
import * as store from '../../store.js';
import t from '../../i18n.js';

export function render(container, goals, currentPortfolioValue, options = {}) {
    const { canEdit = false, canAdd = false, onAdd, onEdit, onDelete, onReorder } = options;
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="section-header">
                <h2>${t.goals.title}</h2>
                ${canAdd ? `<button class="btn btn-small btn-primary add-goal-btn">${t.goals.addBtn}</button>` : ''}
            </div>
            <div class="empty-state">
                <p>${t.goals.empty}</p>
                ${canAdd ? `<button class="btn btn-small btn-primary add-first-goal-btn">${t.goals.addFirst}</button>` : ''}
            </div>
        `;
        if (canAdd && onAdd) {
            const btns = container.querySelectorAll('.add-goal-btn, .add-first-goal-btn');
            btns.forEach(btn => btn.addEventListener('click', onAdd));
        }
        return;
    }

    // Sort goals by priority (lower = higher priority)
    const sorted = [...goals].sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    // Allocate portfolio value across goals in priority order
    let remaining = currentPortfolioValue;
    let goalsHtml = '';
    sorted.forEach((goal, idx) => {
        const target = Number(goal.target_amount) || 0;
        const allocated = target > 0 ? Math.min(remaining, target) : 0;
        remaining = Math.max(0, remaining - allocated);

        const pct = target > 0 ? Math.min(allocated / target, 1) : 0;
        const pctDisplay = target > 0 ? Math.round((allocated / target) * 100) : 0;
        const reached = target > 0 && allocated >= target;
        const deadline = goal.deadline ? new Date(goal.deadline) : null;
        const overdue = deadline && deadline < new Date() && !reached;

        let deadlineHtml = '';
        if (deadline && !isNaN(deadline.getTime())) {
            deadlineHtml = `<div class="goal-deadline${overdue ? ' overdue' : ''}">
                ${overdue ? t.goals.overdue : t.goals.deadline}${formatDate(deadline)}
            </div>`;
        }

        const reorderBtns = canEdit && sorted.length > 1 ? `
            <span class="goal-reorder-btns">
                <button class="btn btn-ghost goal-move-up" data-id="${esc(goal.id)}" ${idx === 0 ? 'disabled' : ''} title="${t.goals.moveUp}">▲</button>
                <button class="btn btn-ghost goal-move-down" data-id="${esc(goal.id)}" ${idx === sorted.length - 1 ? 'disabled' : ''} title="${t.goals.moveDown}">▼</button>
            </span>
        ` : '';

        const editBtns = canEdit ? `
            <button class="btn btn-ghost edit-goal-btn" data-id="${esc(goal.id)}" title="${t.common.edit}">✎</button>
            <button class="btn btn-ghost danger del-goal-btn" data-id="${esc(goal.id)}" title="${t.common.delete}">✕</button>
        ` : '';

        goalsHtml += `
            <div class="goal-card">
                <div class="goal-header">
                    <span class="goal-name">
                        ${reorderBtns}
                        <span class="goal-priority-num">${idx + 1}</span>
                        ${esc(goal.goal_name)}
                        ${reached ? ` <span class="goal-reached-badge">${t.goals.reached}</span>` : ''}
                    </span>
                    <span class="goal-right">
                        <span class="goal-amounts">
                            ${formatCurrency(allocated, sym)} / ${formatCurrency(target, sym)}
                            (${pctDisplay}%)
                        </span>
                        ${editBtns}
                    </span>
                </div>
                ${deadlineHtml}
                <div class="progress-bar">
                    <div class="progress-fill${reached ? ' reached' : ''}" style="width:${pct * 100}%"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="section-header">
            <h2>${t.goals.title}</h2>
            ${canAdd ? `<button class="btn btn-small btn-primary add-goal-btn">${t.goals.addBtn}</button>` : ''}
        </div>
        <div class="goals-container">${goalsHtml}</div>
    `;

    // Wire events
    if (canAdd && onAdd) {
        const addBtn = container.querySelector('.add-goal-btn');
        if (addBtn) addBtn.addEventListener('click', onAdd);
    }

    if (canEdit && onEdit) {
        container.querySelectorAll('.edit-goal-btn').forEach(btn => {
            btn.addEventListener('click', () => onEdit(btn.dataset.id));
        });
    }

    if (canEdit && onDelete) {
        container.querySelectorAll('.del-goal-btn').forEach(btn => {
            btn.addEventListener('click', () => onDelete(btn.dataset.id));
        });
    }

    if (canEdit && onReorder) {
        container.querySelectorAll('.goal-move-up').forEach(btn => {
            btn.addEventListener('click', () => onReorder(btn.dataset.id, 'up'));
        });
        container.querySelectorAll('.goal-move-down').forEach(btn => {
            btn.addEventListener('click', () => onReorder(btn.dataset.id, 'down'));
        });
    }
}
