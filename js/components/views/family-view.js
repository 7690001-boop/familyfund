// ============================================================
// Family View — family overview: comparison table + aggregate
// ============================================================

import * as store from '../../store.js';
import { calcInvestment, kidInvestments, computeSummary, computeMatching } from '../../utils/compute.js';
import { formatCurrency, formatPct } from '../../utils/format.js';
import { esc, cellGainLossClass } from '../../utils/dom-helpers.js';
import * as summaryCards from '../ui/summary-cards.js';
import { renderAvatar, DEFAULT_AVATAR } from '../ui/avatar.js';
import { isImpersonating, getParentUser } from '../../services/impersonate.js';
import t from '../../i18n.js';

let _unsubs = [];
let _container = null;
let _renderTimer = null;

function debouncedRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => { _renderTimer = null; renderView(); }, 50);
}

export function mount(container) {
    unmount();
    _container = container;
    renderView();

    _unsubs.push(
        store.subscribe('investments', debouncedRender),
        store.subscribe('goals', debouncedRender),
        store.subscribe('kids', debouncedRender),
        store.subscribe('exchangeRates', debouncedRender),
        store.subscribe('members', debouncedRender),
    );
}

export function unmount() {
    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _container = null;
}

function renderView() {
    if (!_container) return;

    const user = store.get('user');
    const family = store.get('family') || {};
    const kids = store.get('kids') || [];
    const rawInvestments = store.get('investments') || [];
    const sym = family.currency_symbol || '₪';

    // When impersonating, treat viewer as the kid (not a manager) so privacy is respected
    const isManager = !isImpersonating() && user?.role === 'manager';

    const members = store.get('members') || [];
    const hiddenLabel = '••••';

    // Build per-kid data and determine which kids are hidden
    let visibleInvestments = [];
    let totalMatched = 0;
    let totalMatchable = 0;

    let rows = '';
    let anyHiddenVisible = false;
    kids.forEach(kid => {
        const inv = kidInvestments(rawInvestments, kid, false);
        const sum = computeSummary(inv);
        const match = computeMatching(inv, family);
        const hiddenCount = rawInvestments.filter(i => i.kid === kid && i.hidden).length;

        const member = members.find(m => m.name === kid);
        const avatarCfg = member?.avatar || DEFAULT_AVATAR;
        const avatarSvg = renderAvatar(avatarCfg, 30);

        // Hide amounts if the kid is private and the viewer is another member (not the kid themselves and not a manager)
        const kidIsPrivate = member?.private === true;
        const isSelf = user?.kidName === kid;
        const hideAmounts = kidIsPrivate && !isManager && !isSelf;

        // Only include visible kids in the family totals so private amounts can't be reverse-calculated
        if (!hideAmounts) {
            visibleInvestments = visibleInvestments.concat(inv.map(calcInvestment));
            totalMatched += match.matched;
            totalMatchable += match.total;
            if (hiddenCount > 0) anyHiddenVisible = true;
        }

        const glClass = hideAmounts ? '' : cellGainLossClass(sum.gainLoss);
        const partialBadge = !hideAmounts && hiddenCount > 0
            ? ` <span class="partial-data-badge" title="${t.familyView.partialNote}">${t.familyView.partialBadge}</span>` : '';
        rows += `<tr>
            <td><span class="family-kid-cell">${avatarSvg}<span>${esc(kid)}</span>${kidIsPrivate ? ' <span class="private-badge">🔒</span>' : ''}${partialBadge}</span></td>
            <td class="cell-number">${hideAmounts ? hiddenLabel : formatCurrency(sum.totalInvested, sym)}</td>
            <td class="cell-number">${hideAmounts ? hiddenLabel : formatCurrency(sum.totalCurrent, sym)}</td>
            <td class="cell-number ${glClass}">${hideAmounts ? hiddenLabel : formatCurrency(sum.gainLoss, sym)}</td>
            <td class="cell-number ${glClass}">${hideAmounts ? hiddenLabel : formatPct(sum.gainLossPct)}</td>
            <td class="cell-number">${hideAmounts ? hiddenLabel : `${formatCurrency(match.matched, sym)} / ${formatCurrency(match.total, sym)}`}</td>
        </tr>`;
    });

    // Summary only includes visible kids' data
    const familySummary = computeSummary(visibleInvestments);
    const matchPct = totalMatchable > 0 ? totalMatched / totalMatchable : 0;

    _container.innerHTML = `
        <section class="summary-cards" data-slot="summary"></section>

        <section class="section">
            <h2>${t.familyView.kidsCompare}</h2>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${t.familyView.headerKid}</th>
                            <th>${t.familyView.headerInvested}</th>
                            <th>${t.familyView.headerCurrent}</th>
                            <th>${t.familyView.headerGainLoss}</th>
                            <th>${t.familyView.headerPct}</th>
                            <th>${t.familyView.headerMatching}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${anyHiddenVisible ? `<p class="partial-data-note">${t.familyView.partialNote}</p>` : ''}
        </section>

        <section class="section">
            <h2>${t.familyView.matchingSummary}</h2>
            <div class="matching-summary">
                <div class="matching-summary-text">
                    ${t.familyView.matchedTotal(formatCurrency(totalMatched, sym), formatCurrency(totalMatchable, sym))}
                </div>
                <div class="matching-progress-bar">
                    <div class="matching-progress-fill" style="width:${matchPct * 100}%"></div>
                </div>
            </div>
        </section>
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        familySummary, family, visibleInvestments, t.familyView.labelPrefixFamily
    );
}
