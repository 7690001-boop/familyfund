// ============================================================
// Asset Table — investment table component
// ============================================================

import { formatCurrency, formatPct, formatDate, currencySymbol } from '../../utils/format.js';
import { esc, cellGainLossClass } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import * as store from '../../store.js';
import { aggregateByTicker } from '../../utils/compute.js';
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
            onSell, onAddCash, onConvert } = options;
    const family = store.get('family') || {};
    const ilsSym = family.currency_symbol || '₪';

    // Are there any non-ILS investments? If so, show native columns.
    const hasFx = investments.some(inv => (inv.currency || 'ILS') !== 'ILS');

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

    let actionsHeader = '';
    if (canEdit || canToggleHidden || canRequestSell || canSell) actionsHeader = `<th>${t.assets.headerActions}</th>`;

    // Keep original for re-sort; work with sorted copy
    const originalInvestments = investments;
    investments = sortInvestments(investments, _currentSort.key, _currentSort.dir);

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
                ? `<span dir="ltr">${nativeSym}${pos.avgCostNative.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
                : '—';

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
                ? ` <span class="cell-line-sub">${t.assets.purchaseCount(pos.purchaseCount)}</span>` : '';
            const posHiddenBadge = showHiddenBadge && pos.someHidden
                ? ` <span class="hidden-asset-badge">👁 ${t.assets.hiddenBadge}</span>` : '';
            const nameCell = `<span class="cell-line-main">${esc(pos.asset_name || pos.ticker || '—')}${posHiddenBadge}</span><span class="cell-line-sub asset-ticker">${esc(pos.ticker || '')}</span>${countBadge}`;

            posRows += `<tr${pos.someHidden ? ' class="asset-row-hidden"' : ''}>
                <td>${nameCell}</td>
                ${posFx ? `<td class="cell-currency-badge"><span class="currency-badge">${esc(currency)}</span></td>` : ''}
                <td class="cell-number">${pos.totalShares > 0 ? pos.totalShares.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td>
                <td class="cell-number">${investedCell}</td>
                <td class="cell-number">${avgCell}</td>
                <td class="cell-number">${priceCell}</td>
                <td class="cell-number">${valueCell}</td>
                <td class="cell-number ${glClass}">${plCell}</td>
                <td class="cell-number ${glClass}">${plPctCell}</td>
            </tr>`;
        });

        consolidatedHtml = `
            <h3 class="section-sub-header">${t.assets.consolidatedTitle}</h3>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t.assets.headerAsset}</th>
                            ${posFx ? `<th>${t.assets.headerCurrency}</th>` : ''}
                            <th>${t.assets.headerShares}</th>
                            <th>${t.assets.headerInvested}</th>
                            <th>${t.assets.headerAvgCost}</th>
                            <th>${t.assets.headerCurrentPrice}</th>
                            <th>${t.assets.headerCurrentValue}</th>
                            <th>${t.assets.headerGainLoss}</th>
                            <th>${t.assets.headerPct}</th>
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

        const isCash = inv.type === 'cash';
        let actionsCol = '';
        if (canEdit || canToggleHidden || canRequestSell || canSell) {
            const hideBtn = canToggleHidden
                ? `<button class="btn btn-ghost toggle-hidden-btn" data-id="${esc(inv.id)}" data-hidden="${!!inv.hidden}" title="${inv.hidden ? 'הצג במבט המשפחה' : 'הסתר ממבט המשפחה'}">${inv.hidden ? '👁' : '🙈'}</button>`
                : '';
            const editDeleteBtns = canEdit
                ? `<button class="btn btn-ghost edit-inv-btn" data-id="${esc(inv.id)}" title="${t.common.edit}"${isCash ? ' style="display:none"' : ''}>✎</button>
                <button class="btn btn-ghost danger del-inv-btn" data-id="${esc(inv.id)}" title="${t.common.delete}">✕</button>`
                : '';
            // Sell button only for non-cash securities
            const sellBtn = canSell && !isCash
                ? `<button class="btn btn-ghost sell-inv-btn" data-id="${esc(inv.id)}" title="${t.cash.sellTitle}" style="font-size:0.78rem">📉</button>`
                : '';
            // Sell-request button only for non-cash securities (member role)
            const reqSellBtn = canRequestSell && !isCash
                ? `<button class="btn btn-ghost req-sell-btn" data-id="${esc(inv.id)}" title="${t.investmentRequest.requestSellBtn}" style="font-size:0.78rem">📤</button>`
                : '';
            actionsCol = `<td class="cell-actions">${hideBtn}${reqSellBtn}${sellBtn}${editDeleteBtns}</td>`;
        }

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

        const hiddenBadgeHtml = showHiddenBadge && inv.hidden
            ? `<span class="hidden-asset-badge">👁 ${t.assets.hiddenBadge}</span>` : '';
        const cashBadgeHtml = isCash
            ? `<span class="cash-type-badge">💵 ${t.cash.cashLabel}</span>` : '';
        const sharesFormatted = typeof inv.shares === 'number'
            ? inv.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : (inv.shares || '—');
        const nameCell = inv.nickname
            ? `<span class="cell-line-main">${esc(inv.nickname)}${cashBadgeHtml}${hiddenBadgeHtml}</span><span class="cell-line-sub">${esc(inv.asset_name || '')}</span><span class="cell-line-sub asset-ticker">${esc(inv.ticker || '')}</span>`
            : `<span class="cell-line-main">${esc(inv.asset_name || '—')}${cashBadgeHtml}${hiddenBadgeHtml}</span><span class="cell-line-sub asset-ticker">${esc(inv.ticker || '')}</span>`;

        rows += `<tr${inv.hidden ? ' class="asset-row-hidden"' : ''}>
            <td>${nameCell}</td>
            ${hasFx ? `<td class="cell-currency-badge"><span class="currency-badge">${esc(currency)}</span></td>` : ''}
            <td>${formatDate(inv.purchase_date)}</td>
            <td class="cell-number">${sharesFormatted}</td>
            <td class="cell-number">${investedCell}</td>
            <td class="cell-number">${priceCell}</td>
            <td class="cell-number">${valueCell}</td>
            <td class="cell-number ${glClass}">${plCell}</td>
            <td class="cell-number ${glClass}">${plPctCell}</td>
            ${actionsCol}
        </tr>`;
    });

    const sortOptions = [
        { key: 'purchase_date', label: t.assets.sortDate },
        { key: 'name', label: t.assets.sortName },
        { key: 'amount_invested', label: t.assets.sortInvested },
        { key: 'current_value', label: t.assets.sortValue },
        { key: 'gain_loss', label: t.assets.sortGainLoss },
        { key: 'gain_loss_pct', label: t.assets.headerPct },
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
                <button class="btn btn-small btn-secondary fetch-prices-btn">${t.assets.updatePrices}</button>
                ${canConvert ? `<button class="btn btn-small btn-secondary convert-btn">${t.cash.convertCurrencyBtn}</button>` : ''}
                ${canAddCash ? `<button class="btn btn-small btn-secondary add-cash-btn">${t.cash.addCashBtn}</button>` : ''}
                ${canRequestBuy ? `<button class="btn btn-small btn-primary req-buy-btn">${t.investmentRequest.requestBuyBtn}</button>` : ''}
                ${canAdd ? `<button class="btn btn-small btn-primary add-inv-btn">${t.assets.addBtn}</button>` : ''}
            </div>
        </div>
        <div class="sort-bar"><span class="sort-label">${t.assets.sortLabel}</span> ${sortBarHtml}</div>
        ${consolidatedHtml}
        ${hasMultiPurchase ? `<h3 class="section-sub-header">${t.assets.transactionsTitle}</h3>` : ''}
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>${t.assets.headerAsset}</th>
                        ${hasFx ? `<th>${t.assets.headerCurrency}</th>` : ''}
                        <th>${t.assets.headerDate}</th>
                        <th>${t.assets.headerShares}</th>
                        <th>${t.assets.headerInvested}</th>
                        <th>${t.assets.headerCurrentPrice}</th>
                        <th>${t.assets.headerCurrentValue}</th>
                        <th>${t.assets.headerGainLoss}</th>
                        <th>${t.assets.headerPct}</th>
                        ${actionsHeader}
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

    const fetchBtn = container.querySelector('.fetch-prices-btn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', async () => {
            const { fetchPrices } = await import('../../services/price-service.js');
            fetchPrices(false);
        });
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
}
