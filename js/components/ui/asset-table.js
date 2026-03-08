// ============================================================
// Asset Table — investment table component
// ============================================================

import { formatCurrency, formatPct, formatDate, currencySymbol } from '../../utils/format.js';
import { esc, cellGainLossClass } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import * as store from '../../store.js';
import { aggregateByTicker } from '../../utils/compute.js';

export function render(container, investments, options = {}) {
    const { canEdit = false, canAdd = false, onAdd, onEdit, onDelete } = options;
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';

    // Are there any non-ILS investments? If so, show native columns.
    const hasFx = investments.some(inv => (inv.currency || 'ILS') !== 'ILS');

    if (investments.length === 0) {
        container.innerHTML = `
            <div class="section-header">
                <h2>פירוט נכסים</h2>
                ${canAdd ? '<div class="section-actions"><button class="btn btn-small btn-primary add-inv-btn">+ השקעה</button></div>' : ''}
            </div>
            <div class="empty-state">
                <p>אין השקעות להצגה</p>
                ${canAdd ? '<button class="btn btn-small btn-primary add-first-inv-btn">+ הוסף השקעה ראשונה</button>' : ''}
            </div>
        `;
        if (canAdd) {
            const addBtn = container.querySelector('.add-inv-btn');
            const addFirstBtn = container.querySelector('.add-first-inv-btn');
            if (addBtn && onAdd) addBtn.addEventListener('click', onAdd);
            if (addFirstBtn && onAdd) addFirstBtn.addEventListener('click', onAdd);
        }
        return;
    }

    let actionsHeader = '';
    if (canEdit) actionsHeader = '<th>פעולות</th>';

    // ── Consolidated positions (aggregate by ticker) ──────────────────────────
    const positions = aggregateByTicker(investments);
    const hasMultiPurchase = positions.some(p => p.purchaseCount > 1);
    let consolidatedHtml = '';

    if (hasMultiPurchase) {
        const posFx = positions.some(p => (p.currency || 'ILS') !== 'ILS');
        let posRows = '';
        positions.forEach(pos => {
            const currency = pos.currency || 'ILS';
            const nativeSym = currencySymbol(currency);
            const isFx = currency !== 'ILS';
            const natDec = isFx ? 2 : 0;
            const glClass = cellGainLossClass(pos.gainLossILS);

            const avgCell = pos.avgCostNative != null
                ? `<span dir="ltr">${nativeSym}${pos.avgCostNative.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>`
                : '—';

            const priceCell = pos.currentPrice != null
                ? `<span dir="ltr">${nativeSym}${pos.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>`
                : '—';

            let valueCell = '—';
            if (pos.currentValueNative != null) {
                valueCell = `<span class="cell-line-main">${formatCurrency(pos.currentValueNative, nativeSym, natDec)}</span>`;
                if (isFx && pos.currentValueILS != null) {
                    valueCell += `<span class="cell-line-sub">${formatCurrency(pos.currentValueILS, ilsSym)}</span>`;
                }
            }

            let plCell = '—';
            let plPctCell = '—';
            if (pos.gainLossNative != null) {
                plCell = `<span class="cell-line-main">${formatCurrency(pos.gainLossNative, nativeSym, natDec)}</span>`;
                if (isFx && pos.gainLossILS != null) {
                    plCell += `<span class="cell-line-sub">${formatCurrency(pos.gainLossILS, ilsSym)}</span>`;
                }
                plPctCell = formatPct(pos.gainLossPctILS);
            }

            let investedCell = formatCurrency(pos.totalInvested, ilsSym);
            if (isFx && pos.totalInvestedNative > 0) {
                investedCell = `<span class="cell-line-main">${formatCurrency(pos.totalInvested, ilsSym)}</span>`
                    + `<span class="cell-line-sub">${formatCurrency(pos.totalInvestedNative, nativeSym, natDec)}</span>`;
            }

            const countBadge = pos.purchaseCount > 1
                ? ` <span class="cell-line-sub">${pos.purchaseCount} רכישות</span>` : '';
            const nameCell = `<span class="cell-line-main">${esc(pos.asset_name || pos.ticker || '—')}</span>${countBadge}`;

            posRows += `<tr>
                <td>${nameCell}</td>
                <td class="cell-number">${esc(pos.ticker || '—')}</td>
                ${posFx ? `<td class="cell-currency-badge"><span class="currency-badge">${esc(currency)}</span></td>` : ''}
                <td class="cell-number">${pos.totalShares > 0 ? pos.totalShares.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'}</td>
                <td class="cell-number">${investedCell}</td>
                <td class="cell-number">${avgCell}</td>
                <td class="cell-number">${priceCell}</td>
                <td class="cell-number">${valueCell}</td>
                <td class="cell-number ${glClass}">${plCell}</td>
                <td class="cell-number ${glClass}">${plPctCell}</td>
            </tr>`;
        });

        consolidatedHtml = `
            <h3 class="section-sub-header">פוזיציות מאוחדות</h3>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>נכס</th>
                            <th>טיקר</th>
                            ${posFx ? '<th>מטבע</th>' : ''}
                            <th>יחידות</th>
                            <th>הושקע</th>
                            <th>עלות ממוצעת</th>
                            <th>מחיר נוכחי</th>
                            <th>שווי נוכחי</th>
                            <th>רווח/הפסד</th>
                            <th>%</th>
                        </tr>
                    </thead>
                    <tbody>${posRows}</tbody>
                </table>
            </div>
        `;
    }

    // ── Individual transaction rows ───────────────────────────────────────────
    let rows = '';
    investments.forEach(inv => {
        const currency = inv.currency || 'ILS';
        const nativeSym = currencySymbol(currency);
        const isFx = currency !== 'ILS';
        // Color based on ILS gain/loss (home currency perspective)
        const glClass = cellGainLossClass(inv.gainLossILS);

        let actionsCol = '';
        if (canEdit) {
            actionsCol = `<td class="cell-actions">
                <button class="btn btn-ghost edit-inv-btn" data-id="${esc(inv.id)}" title="ערוך">✎</button>
                <button class="btn btn-ghost danger del-inv-btn" data-id="${esc(inv.id)}" title="מחק">✕</button>
            </td>`;
        }

        // Current price cell — always in native currency
        const priceCell = inv.currentPrice != null
            ? `<span dir="ltr">${nativeSym}${inv.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>`
            : '—';

        // Current value cell — native, and ILS sub-line if FX
        const natDec = isFx ? 2 : 0;
        let valueCell = '—';
        if (inv.currentValueNative != null) {
            valueCell = `<span class="cell-line-main">${formatCurrency(inv.currentValueNative, nativeSym, natDec)}</span>`;
            if (isFx && inv.currentValueILS != null) {
                valueCell += `<span class="cell-line-sub">${formatCurrency(inv.currentValueILS, ilsSym)}</span>`;
            }
        }

        // P&L cell — native as main line, ILS as sub-line for FX
        // % uses ILS-based return (home currency perspective)
        let plCell = '—';
        let plPctCell = '—';
        if (inv.gainLossNative != null) {
            plCell = `<span class="cell-line-main">${formatCurrency(inv.gainLossNative, nativeSym, natDec)}</span>`;
            if (isFx && inv.gainLossILS != null) {
                plCell += `<span class="cell-line-sub">${formatCurrency(inv.gainLossILS, ilsSym)}</span>`;
            }
            // % is ILS-based so it's consistent with cell color
            plPctCell = formatPct(inv.gainLossPctILS);
        }

        // Invested cell — always ILS, but show native sub-line if FX
        let investedCell = formatCurrency(inv.amountInvested, ilsSym);
        if (isFx && inv.amountInvestedNative != null && inv.amountInvestedNative > 0) {
            investedCell = `<span class="cell-line-main">${formatCurrency(inv.amountInvested, ilsSym)}</span>`
                + `<span class="cell-line-sub">${formatCurrency(inv.amountInvestedNative, nativeSym, natDec)}</span>`;
        }

        const nameCell = inv.nickname
            ? `<span class="cell-line-main">${esc(inv.nickname)}</span><span class="cell-line-sub">${esc(inv.asset_name || '')}</span>`
            : esc(inv.asset_name || '—');

        rows += `<tr>
            <td>${nameCell}</td>
            <td class="cell-number">${esc(inv.ticker || '—')}</td>
            ${hasFx ? `<td class="cell-currency-badge"><span class="currency-badge">${esc(currency)}</span></td>` : ''}
            <td>${formatDate(inv.purchase_date)}</td>
            <td class="cell-number">${inv.shares || '—'}</td>
            <td class="cell-number">${investedCell}</td>
            <td class="cell-number">${priceCell}</td>
            <td class="cell-number">${valueCell}</td>
            <td class="cell-number ${glClass}">${plCell}</td>
            <td class="cell-number ${glClass}">${plPctCell}</td>
            ${actionsCol}
        </tr>`;
    });

    container.innerHTML = `
        <div class="section-header">
            <h2>פירוט נכסים</h2>
            <div class="section-actions">
                <button class="btn btn-small btn-secondary fetch-prices-btn" title="עדכן מחירים מהאינטרנט">עדכן מחירים</button>
                ${canAdd ? '<button class="btn btn-small btn-primary add-inv-btn">+ השקעה</button>' : ''}
            </div>
        </div>
        ${consolidatedHtml}
        ${hasMultiPurchase ? '<h3 class="section-sub-header">עסקאות</h3>' : ''}
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>נכס</th>
                        <th>טיקר</th>
                        ${hasFx ? '<th>מטבע</th>' : ''}
                        <th>תאריך רכישה</th>
                        <th>יחידות</th>
                        <th>הושקע</th>
                        <th>מחיר נוכחי</th>
                        <th>שווי נוכחי</th>
                        <th>רווח/הפסד</th>
                        <th>%</th>
                        ${actionsHeader}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    // Wire events
    if (canAdd && onAdd) {
        const addBtn = container.querySelector('.add-inv-btn');
        if (addBtn) addBtn.addEventListener('click', onAdd);
    }

    if (canEdit && onEdit) {
        container.querySelectorAll('.edit-inv-btn').forEach(btn => {
            btn.addEventListener('click', () => onEdit(btn.dataset.id));
        });
    }

    if (canEdit && onDelete) {
        container.querySelectorAll('.del-inv-btn').forEach(btn => {
            btn.addEventListener('click', () => onDelete(btn.dataset.id));
        });
    }

    const fetchBtn = container.querySelector('.fetch-prices-btn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', async () => {
            const { fetchPrices } = await import('../../services/price-service.js');
            fetchPrices(false);
        });
    }
}
