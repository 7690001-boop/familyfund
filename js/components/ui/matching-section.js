// ============================================================
// Matching Section — S&P 500 matching program display
// ============================================================

import { formatCurrency, formatDate } from '../../utils/format.js';
import * as store from '../../store.js';

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
                <h2>תוכנית התאמת S&P 500</h2>
            </div>
            <div class="empty-state">אין השקעות S&P 500</div>
        `;
        return;
    }

    const pct = matching.total > 0 ? matching.matched / matching.total : 0;

    let rows = '';
    matching.deposits.forEach(dep => {
        const statusText = dep.eligible ? 'זכאי להתאמה' : 'עוד ' + dep.daysRemaining + ' ימים';
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
            <h2>תוכנית התאמת S&P 500</h2>
        </div>
        <div class="matching-summary">
            <div class="matching-summary-text">
                סה״כ הותאם: ${formatCurrency(matching.matched, sym)} מתוך ${formatCurrency(matching.total, sym)}
            </div>
            <div class="matching-progress-bar">
                <div class="matching-progress-fill" style="width:${pct * 100}%"></div>
            </div>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>תאריך הפקדה</th>
                        <th>סכום</th>
                        <th>ימים מוחזק</th>
                        <th>סטטוס</th>
                        <th>סכום מותאם</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}
