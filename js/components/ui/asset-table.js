// ============================================================
// Asset Table — investment table component
// ============================================================

import { formatCurrency, formatPct, formatDate, currencySymbol } from '../../utils/format.js';
import { esc, cellGainLossClass } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import * as store from '../../store.js';
import { aggregateByTicker, getRewardMilestone } from '../../utils/compute.js';
import t from '../../i18n.js';

let _currentSort = { key: 'purchase_date', dir: 'desc' };

function sortInvestments(investments, sortKey, sortDir) {
    const sorted = [...investments];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        let va, vb;
        switch (sortKey) {
            case 'purchase_date':
                va = a.purchase_date || ''; vb = b.purchase_date || '';
                return dir * va.localeCompare(vb);
            case 'amount_invested':
                va = a.amountInvested ?? 0; vb = b.amountInvested ?? 0;
                return dir * (va - vb);
            case 'current_value':
                va = a.currentValueILS ?? 0; vb = b.currentValueILS ?? 0;
                return dir * (va - vb);
            case 'gain_loss':
                va = a.gainLossILS ?? 0; vb = b.gainLossILS ?? 0;
                return dir * (va - vb);
            case 'gain_loss_pct':
                va = a.gainLossPctILS ?? 0; vb = b.gainLossPctILS ?? 0;
                return dir * (va - vb);
            case 'name':
                va = a.asset_name || a.ticker || ''; vb = b.asset_name || b.ticker || '';
                return dir * va.localeCompare(vb, 'he');
            default:
                return 0;
        }
    });
    return sorted;
}

export function render(container, investments, options = {}) {
    const { canEdit = false, canAdd = false, showHiddenBadge = false, canToggleHidden = false,
            canRequestBuy = false, canRequestSell = false, canSell = false,
            canAddCash = false, canConvert = false,
            onAdd, onEdit, onDelete, onToggleHidden, onRequestBuy, onRequestSell,
            onSell, onAddCash, onConvert, onRowClick } = options;
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';

    if (investments.length === 0) {
        container.innerHTML = `
            <div class="section-header">
                <h2>${t.assets.title}</h2>
                <div class="section-actions">
                    ${canConvert ? `<button class="btn btn-small btn-secondary convert-btn">${t.cash.convertCurrencyBtn}</button>` : ''}
                    ${canAddCash ? `<button class="btn btn-small btn-secondary add-cash-btn">${t.cash.addCashBtn}</button>` : ''}
                    ${canRequestBuy ? `<button class="btn btn-small btn-primary req-buy-btn">${t.investmentRequest.requestBuyBtn}</button>` : ''}
                    ${canAdd ? `<button class="btn btn-small btn-primary add-inv-btn">${t.assets.addBtn}</button>` : ''}
                </div>
            </div>
            <div class="empty-state">
                <p>${t.assets.empty}</p>
                ${canAdd ? `<button class="btn btn-small btn-primary add-first-inv-btn">${t.assets.addFirst}</button>` : ''}
            </div>
        `;
        if (canAdd && onAdd) {
            const addBtn = container.querySelector('.add-inv-btn');
            const addFirstBtn = container.querySelector('.add-first-inv-btn');
            if (addBtn) addBtn.addEventListener('click', onAdd);
            if (addFirstBtn) addFirstBtn.addEventListener('click', onAdd);
        }
        if (canAddCash && onAddCash) {
            const addCashBtn = container.querySelector('.add-cash-btn');
            if (addCashBtn) addCashBtn.addEventListener('click', onAddCash);
        }
        if (canConvert && onConvert) {
            const convertBtn = container.querySelector('.convert-btn');
            if (convertBtn) convertBtn.addEventListener('click', onConvert);
        }
        if (canRequestBuy && onRequestBuy) {
            const reqBuyBtn = container.querySelector('.req-buy-btn');
            if (reqBuyBtn) reqBuyBtn.addEventListener('click', onRequestBuy);
        }
        return;
    }

    // Keep original for re-sort; work with sorted copy
    const originalInvestments = investments;
    investments = sortInvestments(investments, _currentSort.key, _currentSort.dir);

    // ── Consolidated positions (aggregate by ticker) ──────────────────────────
    const positions = aggregateByTicker(investments);
    const hasMultiPurchase = positions.some(p => p.purchaseCount > 1);
    let consolidatedHtml = '';

    if (hasMultiPurchase) {
        let posRows = '';
        positions.forEach(pos => {
            const currency = pos.currency || 'ILS';
            const nativeSym = currencySymbol(currency);
            const isFx = currency !== 'ILS';
            const natDec = isFx ? 2 : 0;
            const glClass = cellGainLossClass(pos.gainLossILS);

            const priceCell = pos.currentPrice != null
                ? `<span dir="ltr">${nativeSym}${pos.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
                : '—';

            let valueCell = '—';
            if (pos.currentValueNative != null) {
                valueCell = `<span class="cell-line-main">${formatCurrency(pos.currentValueNative, nativeSym, natDec)}</span>`;
                if (isFx && pos.currentValueILS != null) {
                    valueCell += `<span class="cell-line-sub">${formatCurrency(pos.currentValueILS, ilsSym)}</span>`;
                }
            }

            // P&L + % merged into one cell
            let plCell = '—';
            if (pos.gainLossNative != null) {
                plCell = `<span class="cell-line-main">${formatCurrency(pos.gainLossNative, nativeSym, natDec)}</span>`;
                if (isFx && pos.gainLossILS != null) {
                    plCell += `<span class="cell-line-sub">${formatCurrency(pos.gainLossILS, ilsSym)}</span>`;
                }
                plCell += `<span class="cell-line-sub">${formatPct(pos.gainLossPctILS)}</span>`;
            }

            // Invested + avg cost per unit in one cell
            let investedCell = formatCurrency(pos.totalInvested, ilsSym);
            if (isFx && pos.totalInvestedNative > 0) {
                investedCell = `<span class="cell-line-main">${formatCurrency(pos.totalInvested, ilsSym)}</span>`
                    + `<span class="cell-line-sub">${formatCurrency(pos.totalInvestedNative, nativeSym, natDec)}</span>`;
            }
            if (pos.avgCostNative != null) {
                investedCell += `<span class="cell-line-sub">${t.assets.perUnit}: ${nativeSym}${pos.avgCostNative.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
            }

            const countBadge = pos.purchaseCount > 1
                ? ` <span class="cell-line-sub">${t.assets.purchaseCount(pos.purchaseCount)}</span>` : '';
            const posHiddenBadge = showHiddenBadge && pos.someHidden
                ? ` <span class="hidden-asset-badge">👁 ${t.assets.hiddenBadge}</span>` : '';
            // Ticker + currency under the name
            const tickerLine = pos.ticker ? `<span class="cell-line-sub asset-ticker">${esc(pos.ticker)}${isFx ? ` · ${esc(currency)}` : ''}</span>` : '';
            const noteDot = pos.note ? ' <span class="note-dot" title="יש הערה">📝</span>' : '';
            const nameCell = `<span class="cell-line-main">${esc(pos.asset_name || pos.ticker || '—')}${posHiddenBadge}${noteDot}</span>${tickerLine}${countBadge}`;

            // Actions on consolidated row
            const isCash = (pos.ticker || '').toUpperCase() === 'CASH' || (pos.asset_name || '').includes('מזומן');
            let posActionsCol = '';
            if (canEdit || canToggleHidden || canRequestSell || canSell) {
                const hideBtn = canToggleHidden && pos.firstId
                    ? `<button class="btn btn-ghost toggle-hidden-btn" data-id="${esc(pos.firstId)}" data-hidden="${!!pos.someHidden}" title="${pos.someHidden ? 'הצג במבט המשפחה' : 'הסתר ממבט המשפחה'}">${pos.someHidden ? '👁' : '🙈'}</button>`
                    : '';
                const editDeleteBtns = canEdit && pos.firstId
                    ? `<button class="btn btn-ghost edit-inv-btn" data-id="${esc(pos.firstId)}" title="${t.common.edit}"${isCash ? ' style="display:none"' : ''}>✎</button>
                    <button class="btn btn-ghost danger del-inv-btn" data-id="${esc(pos.firstId)}" title="${t.common.delete}">✕</button>`
                    : '';
                const sellBtn = canSell && pos.firstId && !isCash
                    ? `<button class="btn btn-ghost sell-inv-btn" data-id="${esc(pos.firstId)}" title="${t.cash.sellTitle}" style="font-size:0.78rem">📉</button>`
                    : '';
                const reqSellBtn = canRequestSell && pos.firstId && !isCash
                    ? `<button class="btn btn-ghost req-sell-btn" data-id="${esc(pos.firstId)}" title="${t.investmentRequest.requestSellBtn}" style="font-size:0.78rem">📤</button>`
                    : '';
                posActionsCol = `<td class="cell-actions">${hideBtn}${reqSellBtn}${sellBtn}${editDeleteBtns}</td>`;
            }

            posRows += `<tr class="pos-row${pos.someHidden ? ' asset-row-hidden' : ''}" data-pos-id="${esc(pos.firstId || '')}">
                <td>${nameCell}</td>
                <td class="cell-number">${pos.totalShares > 0 ? pos.totalShares.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td>
                <td class="cell-number">${investedCell}</td>
                <td class="cell-number">${priceCell}</td>
                <td class="cell-number">${valueCell}</td>
                <td class="cell-number ${glClass}">${plCell}</td>
                ${posActionsCol}
            </tr>`;
        });

        let posActionsHeader = '';
        if (canEdit || canToggleHidden || canRequestSell || canSell) posActionsHeader = `<th>${t.assets.headerActions}</th>`;

        consolidatedHtml = `
            <h3 class="section-sub-header has-tip" title="${t.assets.tipConsolidated}">${t.assets.consolidatedTitle}</h3>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th title="${t.assets.tipAsset}">${t.assets.headerAsset}</th>
                            <th title="${t.assets.tipShares}">${t.assets.headerShares}</th>
                            <th title="${t.assets.tipInvested}">${t.assets.headerInvested}</th>
                            <th title="${t.assets.tipCurrentPrice}">${t.assets.headerCurrentPrice}</th>
                            <th title="${t.assets.tipCurrentValue}">${t.assets.headerCurrentValue}</th>
                            <th title="${t.assets.tipGainLoss}">${t.assets.headerGainLoss}</th>
                            ${posActionsHeader}
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
        const glClass = cellGainLossClass(inv.gainLossILS);

        // Current price cell — always in native currency
        const priceCell = inv.currentPrice != null
            ? `<span dir="ltr">${nativeSym}${inv.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
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

        // P&L + % merged into one cell
        let plCell = '—';
        if (inv.gainLossNative != null) {
            plCell = `<span class="cell-line-main">${formatCurrency(inv.gainLossNative, nativeSym, natDec)}</span>`;
            if (isFx && inv.gainLossILS != null) {
                plCell += `<span class="cell-line-sub">${formatCurrency(inv.gainLossILS, ilsSym)}</span>`;
            }
            plCell += `<span class="cell-line-sub">${formatPct(inv.gainLossPctILS)}</span>`;
        }

        // Invested cell — always ILS, but show native sub-line if FX, plus per-unit cost
        let investedCell = formatCurrency(inv.amountInvested, ilsSym);
        if (isFx && inv.amountInvestedNative != null && inv.amountInvestedNative > 0) {
            investedCell = `<span class="cell-line-main">${formatCurrency(inv.amountInvested, ilsSym)}</span>`
                + `<span class="cell-line-sub">${formatCurrency(inv.amountInvestedNative, nativeSym, natDec)}</span>`;
        }
        // Show per-unit cost
        if (typeof inv.shares === 'number' && inv.shares > 0) {
            const costPerUnit = (inv.amountInvestedNative != null && inv.amountInvestedNative > 0)
                ? inv.amountInvestedNative / inv.shares
                : inv.amountInvested / inv.shares;
            const costSym = (inv.amountInvestedNative != null && inv.amountInvestedNative > 0) ? nativeSym : ilsSym;
            investedCell += `<span class="cell-line-sub">${t.assets.perUnit}: ${costSym}${costPerUnit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
        }

        const isCash = inv.type === 'cash';
        const hiddenBadgeHtml = showHiddenBadge && inv.hidden
            ? `<span class="hidden-asset-badge">👁 ${t.assets.hiddenBadge}</span>` : '';
        const cashBadgeHtml = isCash
            ? `<span class="cash-type-badge">💵 ${t.cash.cashLabel}</span>` : '';
        const milestone = getRewardMilestone(inv, family);
        const rewardBadgeHtml = milestone
            ? `<span class="holding-reward-badge reward-${milestone.level}" title="${t.holdingReward.daysHeld(milestone.days)}">${milestone.icon} ${t.holdingReward[milestone.level]}</span>` : '';
        const sharesFormatted = typeof inv.shares === 'number'
            ? inv.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : (inv.shares || '—');
        // Ticker + currency under the name
        const tickerSub = inv.ticker ? `<span class="cell-line-sub asset-ticker">${esc(inv.ticker)}${isFx ? ` · ${esc(currency)}` : ''}</span>` : '';
        const noteDot = inv.note ? ' <span class="note-dot" title="יש הערה">📝</span>' : '';
        const nameCell = inv.nickname
            ? `<span class="cell-line-main">${esc(inv.nickname)}${cashBadgeHtml}${hiddenBadgeHtml}${rewardBadgeHtml}${noteDot}</span><span class="cell-line-sub">${esc(inv.asset_name || '')}</span>${tickerSub}`
            : `<span class="cell-line-main">${esc(inv.asset_name || '—')}${cashBadgeHtml}${hiddenBadgeHtml}${rewardBadgeHtml}${noteDot}</span>${tickerSub}`;

        rows += `<tr${inv.hidden ? ' class="asset-row-hidden"' : ''}>
            <td>${nameCell}</td>
            <td>${formatDate(inv.purchase_date)}</td>
            <td class="cell-number">${sharesFormatted}</td>
            <td class="cell-number">${investedCell}</td>
            <td class="cell-number">${priceCell}</td>
            <td class="cell-number">${valueCell}</td>
            <td class="cell-number ${glClass}">${plCell}</td>
        </tr>`;
    });

    const sortOptions = [
        { key: 'purchase_date', label: t.assets.sortDate },
        { key: 'name', label: t.assets.sortName },
        { key: 'amount_invested', label: t.assets.sortInvested },
        { key: 'current_value', label: t.assets.sortValue },
        { key: 'gain_loss', label: t.assets.sortGainLoss },
    ];
    const sortBarHtml = sortOptions.map(o => {
        const active = _currentSort.key === o.key;
        const arrow = active ? (_currentSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
        return `<button class="btn btn-ghost sort-btn${active ? ' active' : ''}" data-sort="${o.key}">${o.label}${arrow}</button>`;
    }).join('');

    container.innerHTML = `
        <div class="section-header">
            <h2>${t.assets.title}</h2>
            <div class="section-actions">
                ${canConvert ? `<button class="btn btn-small btn-secondary convert-btn">${t.cash.convertCurrencyBtn}</button>` : ''}
                ${canAddCash ? `<button class="btn btn-small btn-secondary add-cash-btn">${t.cash.addCashBtn}</button>` : ''}
                ${canRequestBuy ? `<button class="btn btn-small btn-primary req-buy-btn">${t.investmentRequest.requestBuyBtn}</button>` : ''}
                ${canAdd ? `<button class="btn btn-small btn-primary add-inv-btn">${t.assets.addBtn}</button>` : ''}
            </div>
        </div>
        <div class="sort-bar"><span class="sort-label">${t.assets.sortLabel}</span> ${sortBarHtml}</div>
        ${consolidatedHtml}
        ${hasMultiPurchase ? `<h3 class="section-sub-header has-tip" title="${t.assets.tipTransactions}">${t.assets.transactionsTitle}</h3>` : ''}
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th title="${t.assets.tipAsset}">${t.assets.headerAsset}</th>
                        <th title="${t.assets.tipDate}">${t.assets.headerDate}</th>
                        <th title="${t.assets.tipShares}">${t.assets.headerShares}</th>
                        <th title="${t.assets.tipInvested}">${t.assets.headerInvested}</th>
                        <th title="${t.assets.tipCurrentPrice}">${t.assets.headerCurrentPrice}</th>
                        <th title="${t.assets.tipCurrentValue}">${t.assets.headerCurrentValue}</th>
                        <th title="${t.assets.tipGainLoss}">${t.assets.headerGainLoss}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    // Wire events
    if (canRequestBuy && onRequestBuy) {
        const reqBuyBtn = container.querySelector('.req-buy-btn');
        if (reqBuyBtn) reqBuyBtn.addEventListener('click', onRequestBuy);
    }

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

    if (canToggleHidden && onToggleHidden) {
        container.querySelectorAll('.toggle-hidden-btn').forEach(btn => {
            btn.addEventListener('click', () => onToggleHidden(btn.dataset.id, btn.dataset.hidden !== 'true'));
        });
    }

    if (canRequestSell && onRequestSell) {
        container.querySelectorAll('.req-sell-btn').forEach(btn => {
            btn.addEventListener('click', () => onRequestSell(btn.dataset.id));
        });
    }

    if (canSell && onSell) {
        container.querySelectorAll('.sell-inv-btn').forEach(btn => {
            btn.addEventListener('click', () => onSell(btn.dataset.id));
        });
    }

    if (canAddCash && onAddCash) {
        const addCashBtn = container.querySelector('.add-cash-btn');
        if (addCashBtn) addCashBtn.addEventListener('click', onAddCash);
    }

    if (canConvert && onConvert) {
        const convertBtn = container.querySelector('.convert-btn');
        if (convertBtn) convertBtn.addEventListener('click', onConvert);
    }

    // Sort buttons
    container.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.sort;
            if (_currentSort.key === key) {
                _currentSort.dir = _currentSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                _currentSort = { key, dir: 'desc' };
            }
            render(container, originalInvestments, options);
        });
    });

    // Row click → open detail modal (same as heatmap)
    if (onRowClick) {
        container.querySelectorAll('.pos-row').forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking an action button
                if (e.target.closest('.cell-actions')) return;
                const posId = row.dataset.posId;
                const pos = positions.find(p => p.firstId === posId);
                if (pos) onRowClick(pos);
            });
        });
    }
}
