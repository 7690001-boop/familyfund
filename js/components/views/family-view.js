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
import { isInCooldown, getCooldownRemaining, clearPrivacyCooldown } from '../../services/family-service.js';
import * as billsService from '../../services/bills-service.js';
import { emit } from '../../event-bus.js';
import t from '../../i18n.js';
import { can } from '../../permissions.js';

let _unsubs = [];
let _container = null;
let _renderTimer = null;
let _cooldownInterval = null;

function debouncedRender() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => { _renderTimer = null; renderView(); }, 50);
}

export async function mount(container) {
    unmount();
    _container = container;

    const user = store.get('user');
    if (user?.familyId) await billsService.listen(user.familyId);

    renderView();

    _unsubs.push(
        store.subscribe('investments', debouncedRender),
        store.subscribe('goals', debouncedRender),
        store.subscribe('kids', debouncedRender),
        store.subscribe('exchangeRates', debouncedRender),
        store.subscribe('members', debouncedRender),
        store.subscribe('bills', debouncedRender),
        store.subscribe('family', debouncedRender),
    );

    // Refresh countdown timers every 60 seconds
    _cooldownInterval = setInterval(debouncedRender, 60_000);
}

export function unmount() {
    if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null; }
    if (_cooldownInterval) { clearInterval(_cooldownInterval); _cooldownInterval = null; }
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    billsService.stopListening();
    _container = null;
}

function renderBillsSection(family, sym, isManager) {
    const bills = store.get('bills') || [];
    const monthlyIncome = family.monthly_income || 0;
    const monthlyBills = bills
        .filter(b => b.active !== false)
        .reduce((sum, b) => sum + (b.frequency === 'yearly' ? b.amount / 12 : b.amount), 0);
    const netFlow = monthlyIncome - monthlyBills;
    const netClass = netFlow >= 0 ? 'gain' : 'loss';

    const billRows = bills.map(b => {
        const monthly = b.frequency === 'yearly' ? b.amount / 12 : b.amount;
        return `<div class="bill-row${b.active === false ? ' bill-inactive' : ''}">
            <span class="bill-name">${esc(b.name)}</span>
            <span class="bill-amount">${formatCurrency(b.amount, sym)}${b.frequency === 'yearly' ? `/${t.bills.yearly}` : t.bills.monthly_suffix}</span>
            <span class="bill-monthly">(${formatCurrency(monthly, sym)}${t.bills.monthly_suffix})</span>
            ${isManager ? `<button class="btn btn-ghost btn-xs bill-edit-btn" data-id="${esc(b.id)}">${t.common.edit}</button>` : ''}
        </div>`;
    }).join('');

    return `
        <section class="section bills-section">
            <div class="section-header">
                <h2>${t.bills.title}</h2>
                ${isManager ? `<button class="btn btn-small" id="add-bill-btn">${t.bills.addBillBtn}</button>` : ''}
            </div>
            <div class="bills-summary-card">
                <div class="bills-row">
                    <span>${t.bills.income}</span>
                    <span class="cell-number">${formatCurrency(monthlyIncome, sym)}</span>
                </div>
                <div class="bills-row">
                    <span>${t.bills.totalBills}</span>
                    <span class="cell-number">${formatCurrency(monthlyBills, sym)}</span>
                </div>
                <div class="bills-row bills-net-row">
                    <span>${t.bills.netFlow}</span>
                    <span class="cell-number ${netClass}">${formatCurrency(netFlow, sym)}</span>
                </div>
            </div>
            ${bills.length > 0 ? `<div class="bills-list">${billRows}</div>` : ''}
        </section>
    `;
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

    // Check if current viewer is private or in cooldown
    const currentMember = members.find(m => m.name === user?.kidName);
    const viewerIsPrivate = !isManager && currentMember?.private === true;
    const viewerInCooldown = !isManager && isInCooldown(currentMember);
    const viewerCooldownRemaining = getCooldownRemaining(currentMember);

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
        // Also hide if viewer is private or in cooldown (they can't see others)
        const hideAmounts = (!isManager && !isSelf) && (kidIsPrivate || viewerIsPrivate || viewerInCooldown);

        // Cooldown info for this kid (visible to all)
        const kidInCooldown = isInCooldown(member);
        const kidCooldownRemaining = getCooldownRemaining(member);

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
        const cooldownBadge = kidInCooldown
            ? ` <span class="cooldown-label">${t.familyView.cooldownLabel(kidCooldownRemaining)}</span>${isManager ? ` <button class="clear-cooldown-btn" data-member-uid="${member?.id || ''}">${t.familyView.clearCooldownBtn}</button>` : ''}`
            : '';
        rows += `<tr>
            <td><span class="family-kid-cell">${avatarSvg}<span>${esc(kid)}</span>${kidIsPrivate ? ' <span class="private-badge">🔒</span>' : ''}${cooldownBadge}${partialBadge}</span></td>
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

    const banners = [];
    if (viewerIsPrivate) {
        banners.push(`<div class="privacy-banner">${t.familyView.privacyBanner}</div>`);
    }
    if (viewerInCooldown) {
        banners.push(`<div class="cooldown-banner">${t.familyView.cooldownBanner(viewerCooldownRemaining)}</div>`);
    }

    _container.innerHTML = `
        ${banners.join('')}
        <section class="summary-cards" data-slot="summary"></section>

        <section class="section">
            <h2>${t.familyView.kidsCompare}</h2>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th title="${t.familyView.tipKid}">${t.familyView.headerKid}</th>
                            <th title="${t.familyView.tipInvested}">${t.familyView.headerInvested}</th>
                            <th title="${t.familyView.tipCurrent}">${t.familyView.headerCurrent}</th>
                            <th title="${t.familyView.tipGainLoss}">${t.familyView.headerGainLoss}</th>
                            <th title="${t.familyView.tipPct}">${t.familyView.headerPct}</th>
                            <th title="${t.familyView.tipMatching}">${t.familyView.headerMatching}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${anyHiddenVisible ? `<p class="partial-data-note">${t.familyView.partialNote}</p>` : ''}
        </section>

        ${renderBillsSection(family, sym, isManager)}
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        familySummary, family, visibleInvestments, t.familyView.labelPrefixFamily
    );

    // Manager clear-cooldown buttons
    if (isManager) {
        _container.querySelectorAll('.clear-cooldown-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const memberUid = btn.dataset.memberUid;
                if (!memberUid || !confirm(t.familyView.clearCooldownConfirm)) return;
                try {
                    await clearPrivacyCooldown(user.familyId, memberUid);
                } catch (err) {
                    console.error('Clear cooldown error:', err);
                    emit('toast', { message: t.errors.updateError, type: 'error' });
                }
            });
        });

        // Bills buttons
        const addBillBtn = _container.querySelector('#add-bill-btn');
        if (addBillBtn) {
            addBillBtn.addEventListener('click', async () => {
                const { showBillsModal } = await import('../modals/bills-modal.js');
                showBillsModal();
            });
        }
        _container.querySelectorAll('.bill-edit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const bills = store.get('bills') || [];
                const bill = bills.find(b => b.id === btn.dataset.id);
                const { showBillsModal } = await import('../modals/bills-modal.js');
                showBillsModal(bill);
            });
        });
    }
}
