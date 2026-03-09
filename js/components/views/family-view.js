// ============================================================
// Family View — family overview: comparison table + aggregate
// ============================================================

import * as store from '../../store.js';
import { calcInvestment, kidInvestments, computeSummary, computeMatching } from '../../utils/compute.js';
import { formatCurrency, formatPct } from '../../utils/format.js';
import { esc, cellGainLossClass } from '../../utils/dom-helpers.js';
import * as summaryCards from '../ui/summary-cards.js';
import { renderAvatar, DEFAULT_AVATAR } from '../ui/avatar.js';

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

    const family = store.get('family') || {};
    const kids = store.get('kids') || [];
    const allInvestments = (store.get('investments') || []).map(calcInvestment);
    const sym = family.currency_symbol || '₪';
    const familySummary = computeSummary(allInvestments);

    let totalMatched = 0;
    let totalMatchable = 0;

    const members = store.get('members') || [];

    let rows = '';
    kids.forEach(kid => {
        const inv = kidInvestments(store.get('investments') || [], kid);
        const sum = computeSummary(inv);
        const match = computeMatching(inv, family);
        totalMatched += match.matched;
        totalMatchable += match.total;

        const member = members.find(m => m.name === kid);
        const avatarCfg = member?.avatar || DEFAULT_AVATAR;
        const avatarSvg = renderAvatar(avatarCfg, 30);

        const glClass = cellGainLossClass(sum.gainLoss);
        rows += `<tr>
            <td><span class="family-kid-cell">${avatarSvg}<span>${esc(kid)}</span></span></td>
            <td class="cell-number">${formatCurrency(sum.totalInvested, sym)}</td>
            <td class="cell-number">${formatCurrency(sum.totalCurrent, sym)}</td>
            <td class="cell-number ${glClass}">${formatCurrency(sum.gainLoss, sym)}</td>
            <td class="cell-number ${glClass}">${formatPct(sum.gainLossPct)}</td>
            <td class="cell-number">${formatCurrency(match.matched, sym)} / ${formatCurrency(match.total, sym)}</td>
        </tr>`;
    });

    const matchPct = totalMatchable > 0 ? totalMatched / totalMatchable : 0;

    _container.innerHTML = `
        <section class="summary-cards" data-slot="summary"></section>

        <section class="section">
            <h2>השוואת ילדים</h2>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ילד/ה</th>
                            <th>הושקע</th>
                            <th>שווי נוכחי</th>
                            <th>רווח/הפסד</th>
                            <th>%</th>
                            <th>התאמה (מתוך סה״כ)</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>

        <section class="section">
            <h2>סיכום התאמה משפחתי</h2>
            <div class="matching-summary">
                <div class="matching-summary-text">
                    סה״כ הותאם (משפחה): ${formatCurrency(totalMatched, sym)} מתוך ${formatCurrency(totalMatchable, sym)}
                </div>
                <div class="matching-progress-bar">
                    <div class="matching-progress-fill" style="width:${matchPct * 100}%"></div>
                </div>
            </div>
        </section>
    `;

    summaryCards.render(
        _container.querySelector('[data-slot="summary"]'),
        familySummary, family, '(משפחה) '
    );
}
