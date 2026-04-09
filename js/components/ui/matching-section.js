// ============================================================
// Matching Section — matching program display
// ============================================================

import { formatCurrency, formatDate, formatShares } from '../../utils/format.js';
import { resolveTiers } from '../../utils/compute.js';
import t from '../../i18n.js';

export function render(container, matching, family, totalCurrent) {
    const hasTickers = family?.matching_tickers?.length || family?.sp500_ticker;
    if (!hasTickers) {
        container.innerHTML = '';
        container.hidden = true;
        return;
    }
    container.hidden = false;

    const sym = family.currency_symbol || '₪';
    const tiers = resolveTiers(family);
    const totalRatio = tiers.reduce((s, tier) => s + tier.ratio, 0);
    const ratioPct = Math.round(totalRatio * 100);

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

    const cardsHtml = matching.deposits.map(dep => {
        const ticker = (dep.ticker || '').replace(/^[^:]+:/, '');
        const isAllEligible = dep.allEligible ?? dep.eligible; // backward compat

        if (isAllEligible) {
            // All tiers earned — full celebration card
            return `
                <div class="deposit-card deposit-card--eligible">
                    <div class="deposit-card__icon">🔓</div>
                    <div class="deposit-card__body">
                        <div class="deposit-card__header-row">
                            <div class="deposit-card__amount">${formatCurrency(dep.amountInvested, sym)}</div>
                            <span class="deposit-card__ticker">${ticker}</span>
                        </div>
                        <div class="deposit-card__date">${formatDate(dep.purchase_date)}</div>
                        <div class="deposit-card__progress-wrap">
                            <div class="deposit-card__progress-bar">
                                <div class="deposit-card__progress-fill deposit-card__progress-fill--full" style="width:100%"></div>
                            </div>
                        </div>
                        <div class="deposit-card__match-earned">
                            ${t.matching.matchEarned(formatShares(dep.matchedShares))}
                        </div>
                    </div>
                </div>
            `;
        } else if (dep.eligible) {
            // Some tiers earned, more pending — partial card
            const window = dep.nextTierDays - dep.prevTierDays;
            const holdPct = window > 0
                ? Math.min(Math.round(((dep.daysHeld - dep.prevTierDays) / window) * 100), 100)
                : 100;
            return `
                <div class="deposit-card deposit-card--partial">
                    <div class="deposit-card__icon">🔓</div>
                    <div class="deposit-card__body">
                        <div class="deposit-card__header-row">
                            <div class="deposit-card__amount">${formatCurrency(dep.amountInvested, sym)}</div>
                            <span class="deposit-card__ticker">${ticker}</span>
                        </div>
                        <div class="deposit-card__date">${formatDate(dep.purchase_date)}</div>
                        <div class="deposit-card__match-earned deposit-card__match-earned--partial">
                            ${t.matching.matchEarned(formatShares(dep.matchedShares))}
                        </div>
                        <div class="deposit-card__progress-wrap">
                            <div class="deposit-card__progress-bar">
                                <div class="deposit-card__progress-fill" style="width:${holdPct}%"></div>
                            </div>
                            <span class="deposit-card__progress-label">
                                ${t.matching.holdingProgress(dep.daysHeld - dep.prevTierDays, dep.nextTierDays - dep.prevTierDays)}
                            </span>
                        </div>
                        <div class="deposit-card__match-locked">
                            ${t.matching.matchWillBe(formatShares(dep.nextTierShares ?? dep.potentialShares))}
                        </div>
                        <div class="deposit-card__unlock-row">
                            <span class="deposit-card__unlock-date">
                                ${dep.unlockDate ? t.matching.unlockDate(formatDate(dep.unlockDate)) : ''}
                            </span>
                            <span class="deposit-card__countdown-badge">
                                ${t.matching.daysCountdown(dep.daysRemaining)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // No tiers earned yet — locked card
            const holdPct = dep.nextTierDays > 0
                ? Math.min(Math.round((dep.daysHeld / dep.nextTierDays) * 100), 100)
                : 0;
            return `
                <div class="deposit-card deposit-card--locked">
                    <div class="deposit-card__icon deposit-card__icon--pulse">🔒</div>
                    <div class="deposit-card__body">
                        <div class="deposit-card__header-row">
                            <div class="deposit-card__amount">${formatCurrency(dep.amountInvested, sym)}</div>
                            <span class="deposit-card__ticker">${ticker}</span>
                        </div>
                        <div class="deposit-card__date">${formatDate(dep.purchase_date)}</div>
                        <div class="deposit-card__progress-wrap">
                            <div class="deposit-card__progress-bar">
                                <div class="deposit-card__progress-fill" style="width:${holdPct}%"></div>
                            </div>
                            <span class="deposit-card__progress-label">
                                ${t.matching.holdingProgress(dep.daysHeld, dep.nextTierDays)}
                            </span>
                        </div>
                        <div class="deposit-card__match-locked">
                            ${t.matching.matchWillBe(formatShares(dep.potentialShares))}
                        </div>
                        <div class="deposit-card__unlock-row">
                            <span class="deposit-card__unlock-date">
                                ${dep.unlockDate ? t.matching.unlockDate(formatDate(dep.unlockDate)) : ''}
                            </span>
                            <span class="deposit-card__countdown-badge">
                                ${t.matching.daysCountdown(dep.daysRemaining)}
                            </span>
                        </div>
                        <div class="deposit-card__pending-note">${t.matching.pendingNote}</div>
                    </div>
                </div>
            `;
        }
    }).join('');

    const afterBonusHtml = totalCurrent != null && matching.total > 0 ? (() => {
        const portfolioVal = totalCurrent;
        const bonusVal = matching.total;
        const combined = portfolioVal + bonusVal;
        const noteText = matching.matched > 0 ? t.matching.afterBonusNotePartial : t.matching.afterBonusNote;
        return `
            <div class="after-bonus-total">
                <div class="after-bonus-total__title">${t.matching.afterBonusTitle}</div>
                <div class="after-bonus-total__rows">
                    <div class="after-bonus-total__row">
                        <span class="after-bonus-total__label">${t.matching.afterBonusPortfolio}</span>
                        <span class="after-bonus-total__value">${formatCurrency(portfolioVal, sym)}</span>
                    </div>
                    <div class="after-bonus-total__row after-bonus-total__row--bonus">
                        <span class="after-bonus-total__label">
                            <span class="after-bonus-total__lock">🔒</span>
                            ${t.matching.afterBonusPotential}
                            <span class="after-bonus-total__at-price">(${t.matching.afterBonusAtPrice})</span>
                        </span>
                        <span class="after-bonus-total__value after-bonus-total__value--locked">+${formatCurrency(bonusVal, sym)}</span>
                    </div>
                    <div class="after-bonus-total__divider"></div>
                    <div class="after-bonus-total__row after-bonus-total__row--combined">
                        <span class="after-bonus-total__label">${t.matching.afterBonusTotal}</span>
                        <span class="after-bonus-total__value after-bonus-total__value--combined">${formatCurrency(combined, sym)}</span>
                    </div>
                </div>
                <div class="after-bonus-total__note">⏳ ${noteText}</div>
            </div>
        `;
    })() : '';

    container.innerHTML = `
        <div class="section-header">
            <h2>${t.matching.title}</h2>
            <span class="matching-ratio-badge">${t.matching.ratioLabel(ratioPct)}</span>
        </div>
        <div class="matching-summary">
            <div class="matching-summary-text">
                ${t.matching.totalMatched(formatCurrency(matching.matched, sym), formatCurrency(matching.total, sym))}
            </div>
            <div class="matching-progress-bar">
                <div class="matching-progress-fill" style="width:${pct * 100}%"></div>
            </div>
        </div>
        <div class="deposit-cards-grid">${cardsHtml}</div>
        ${afterBonusHtml}
    `;
}
