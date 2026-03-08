// ============================================================
// Summary Cards — reusable summary card row
// ============================================================

import { formatCurrency, formatPct } from '../../utils/format.js';
import { gainLossClass } from '../../utils/dom-helpers.js';

export function render(container, summary, family, labelPrefix = '') {
    const sym = family?.currency_symbol || '₪';
    const glClass = gainLossClass(summary.gainLoss);

    container.innerHTML = `
        <div class="card card-invested">
            <div class="card-label">${labelPrefix}סה״כ הושקע</div>
            <div class="card-value">${formatCurrency(summary.totalInvested, sym)}</div>
        </div>
        <div class="card card-current">
            <div class="card-label">${labelPrefix}שווי נוכחי</div>
            <div class="card-value">${formatCurrency(summary.totalCurrent, sym)}</div>
        </div>
        <div class="card card-gain-loss ${glClass}">
            <div class="card-label">${labelPrefix}רווח / הפסד</div>
            <div class="card-value">${formatCurrency(summary.gainLoss, sym)}</div>
            <div class="card-sub">(${formatPct(summary.gainLossPct)})</div>
        </div>
    `;
}
