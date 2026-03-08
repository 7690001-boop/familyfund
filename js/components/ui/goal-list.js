// ============================================================
// Goal List — savings goals section
// ============================================================

import { formatCurrency, formatDate } from '../../utils/format.js';
import { esc } from '../../utils/dom-helpers.js';
import * as store from '../../store.js';

export function render(container, goals, currentPortfolioValue, options = {}) {
    const { canEdit = false, canAdd = false, onAdd, onEdit, onDelete } = options;
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="section-header">
                <h2>יעדי חיסכון</h2>
                ${canAdd ? '<button class="btn btn-small btn-primary add-goal-btn">+ יעד</button>' : ''}
            </div>
            <div class="empty-state">
                <p>לא הוגדרו יעדים</p>
                ${canAdd ? '<button class="btn btn-small btn-primary add-first-goal-btn">+ הוסף יעד ראשון</button>' : ''}
            </div>
        `;
        if (canAdd && onAdd) {
            const btns = container.querySelectorAll('.add-goal-btn, .add-first-goal-btn');
            btns.forEach(btn => btn.addEventListener('click', onAdd));
        }
        return;
    }

    let goalsHtml = '';
    goals.forEach(goal => {
        const target = Number(goal.target_amount) || 0;
        const pct = target > 0 ? Math.min(currentPortfolioValue / target, 1) : 0;
        const pctDisplay = target > 0 ? Math.round((currentPortfolioValue / target) * 100) : 0;
        const reached = target > 0 && currentPortfolioValue >= target;
        const deadline = goal.deadline ? new Date(goal.deadline) : null;
        const overdue = deadline && deadline < new Date() && !reached;

        let deadlineHtml = '';
        if (deadline && !isNaN(deadline.getTime())) {
            deadlineHtml = `<div class="goal-deadline${overdue ? ' overdue' : ''}">
                ${overdue ? 'עבר המועד! ' : 'מועד יעד: '}${formatDate(deadline)}
            </div>`;
        }

        const editBtns = canEdit ? `
            <button class="btn btn-ghost edit-goal-btn" data-id="${esc(goal.id)}" title="ערוך">✎</button>
            <button class="btn btn-ghost danger del-goal-btn" data-id="${esc(goal.id)}" title="מחק">✕</button>
        ` : '';

        goalsHtml += `
            <div class="goal-card">
                <div class="goal-header">
                    <span class="goal-name">${esc(goal.goal_name)}
                        ${reached ? ' <span class="goal-reached-badge">היעד הושג!</span>' : ''}
                    </span>
                    <span class="goal-right">
                        <span class="goal-amounts">
                            ${formatCurrency(currentPortfolioValue, sym)} / ${formatCurrency(target, sym)}
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
            <h2>יעדי חיסכון</h2>
            ${canAdd ? '<button class="btn btn-small btn-primary add-goal-btn">+ יעד</button>' : ''}
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
}
