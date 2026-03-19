// ============================================================
// Matching Section — S&P 500 matching program display
// ============================================================

import { formatCurrency, formatDate } from '../../utils/format.js';
import * as store from '../../store.js';
import t from '../../i18n.js';

export function render(container, matching, family) {
    if (!family?.sp500_ticker) {
        container.innerHTML = '';
        container.hidden = true;
        return;
    }
    container.hidden = false;

    const sym = family.currency_symbol || '₪';

    if (matching.deposits.length === 0) {
        container.innerHTML = `
            <div class="section-header">
                <h2>${t.matching.title}</h2>
            </div>
            <div class="empty-state">${t.matching.empty}</div>
        `;
        return;
    }

    const pct = matching.total > 0 ? matching.matched / matching.total : 0;

    let rows = '';
    matching.deposits.forEach(dep => {
        const statusText = dep.eligible ? t.matching.eligible : t.matching.daysLeft(dep.daysRemaining);
        const statusClass = dep.eligible ? 'status-eligible' : 'status-pending';

        rows += `<tr>
            <td>${formatDate(dep.purchase_date)}</td>
            <td class="cell-number">${formatCurrency(dep.amountInvested, sym)}</td>
            <td class="cell-number">${dep.daysHeld}</td>
            <td class="${statusClass}">${statusText}</td>
            <td class="cell-number">${formatCurrency(dep.matchedAmount, sym)}</td>
        </tr>`;
    });

    container.innerHTML = `
        <div class="section-header">
            <h2>${t.matching.title}</h2>
        </div>
        <div class="matching-summary">
            <div class="matching-summary-text">
                ${t.matching.totalMatched(formatCurrency(matching.matched, sym), formatCurrency(matching.total, sym))}
            </div>
            <div class="matching-progress-bar">
                <div class="matching-progress-fill" style="width:${pct * 100}%"></div>
            </div>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>${t.matching.headerDate}</th>
                        <th>${t.matching.headerAmount}</th>
                        <th>${t.matching.headerDays}</th>
                        <th>${t.matching.headerStatus}</th>
                        <th>${t.matching.headerMatched}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}
