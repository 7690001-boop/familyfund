// ============================================================
// Simulation Section — investment simulation visualization
// ============================================================

import { formatCurrency } from '../../utils/format.js';
import { esc } from '../../utils/dom-helpers.js';
import { computeFixedRate, computeHistorical, yearlyFromMonthly } from '../../utils/compound.js';
import * as store from '../../store.js';

let _historicalData = null;
let _inflationData = null;

async function ensureData() {
    if (!_historicalData) {
        try {
            const resp = await fetch('./js/data/historical-monthly.json');
            _historicalData = await resp.json();
        } catch (e) {
            console.error('Failed to load historical data:', e);
            _historicalData = {};
        }
    }
    if (!_inflationData) {
        try {
            const resp = await fetch('./js/data/us-inflation.json');
            _inflationData = await resp.json();
        } catch (e) {
            console.error('Failed to load inflation data:', e);
            _inflationData = {};
        }
    }
}

// Preload data on module init
ensureData();

// Track inflation toggle state per simulation
const _inflationState = {};

export function render(container, simulations, options = {}) {
    const { canAdd = false, canDelete = false, onAdd, onDelete } = options;
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    if (simulations.length === 0) {
        container.innerHTML = `
            <div class="section-header">
                <h2>סימולציית השקעה</h2>
                ${canAdd ? '<button class="btn btn-small btn-primary add-sim-btn">+ סימולציה</button>' : ''}
            </div>
            <div class="empty-state">
                <p>עדיין אין סימולציות — גלה את כוח הריבית דריבית!</p>
                ${canAdd ? '<button class="btn btn-small btn-primary add-first-sim-btn">+ צור סימולציה ראשונה</button>' : ''}
            </div>
        `;
        wireAddBtn(container, onAdd, canAdd);
        return;
    }

    let cardsHtml = '';
    for (const sim of simulations) {
        const inflationOn = _inflationState[sim.id] || false;
        cardsHtml += renderSimCard(sim, sym, inflationOn);
    }

    container.innerHTML = `
        <div class="section-header">
            <h2>סימולציית השקעה</h2>
            ${canAdd ? '<button class="btn btn-small btn-primary add-sim-btn">+ סימולציה</button>' : ''}
        </div>
        <div class="sim-cards-container">${cardsHtml}</div>
    `;

    wireAddBtn(container, onAdd, canAdd);
    wireSimEvents(container, simulations, sym, canDelete, onDelete);
}

function wireAddBtn(container, onAdd, canAdd) {
    if (!canAdd || !onAdd) return;
    container.querySelectorAll('.add-sim-btn, .add-first-sim-btn').forEach(btn =>
        btn.addEventListener('click', onAdd)
    );
}

function wireSimEvents(container, simulations, sym, canDelete, onDelete) {
    if (canDelete && onDelete) {
        container.querySelectorAll('.del-sim-btn').forEach(btn => {
            btn.addEventListener('click', () => onDelete(btn.dataset.id));
        });
    }

    container.querySelectorAll('.sim-inflation-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const simId = toggle.dataset.id;
            _inflationState[simId] = toggle.checked;
            const sim = simulations.find(s => s.id === simId);
            if (!sim) return;
            const card = container.querySelector(`.sim-card[data-id="${simId}"]`);
            if (!card) return;
            const bodyEl = card.querySelector('.sim-card-body');
            if (bodyEl) {
                bodyEl.innerHTML = renderSimBody(sim, sym, toggle.checked);
                wireTableToggle(card);
            }
        });
    });

    container.querySelectorAll('.sim-card').forEach(card => wireTableToggle(card));
}

function wireTableToggle(card) {
    card.querySelectorAll('.sim-table-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const table = card.querySelector('.sim-table-wrap');
            if (table) {
                table.classList.toggle('collapsed');
                btn.textContent = table.classList.contains('collapsed') ? 'הצג פירוט' : 'הסתר פירוט';
            }
        });
    });
}

function computeResults(sim, useRealInflation) {
    if (sim.type === 'historical' && _historicalData) {
        const indexData = _historicalData[sim.index_key];
        if (indexData?.monthly?.length) {
            return computeHistorical({
                initialAmount: sim.initial_amount || 0,
                monthlyContribution: sim.monthly_contribution || 0,
                priceData: indexData.monthly,
                startDate: `${sim.start_year || 2000}-01`,
                years: sim.years || 10,
                inflationPct: 0,
                inflationData: useRealInflation ? _inflationData : null,
            });
        }
    }
    return computeFixedRate({
        initialAmount: sim.initial_amount || 0,
        monthlyContribution: sim.monthly_contribution || 0,
        annualReturnPct: sim.annual_return_pct || 10,
        years: sim.years || 10,
        inflationPct: 0,
        inflationData: useRealInflation ? _inflationData : null,
        startYear: sim.type === 'historical' ? (sim.start_year || 2000) : null,
    });
}

function renderSimCard(sim, sym, inflationOn) {
    const deleteBtn = `<button class="btn btn-ghost danger del-sim-btn" data-id="${esc(sim.id)}" title="מחק">✕</button>`;

    let subtitle = '';
    if (sim.type === 'historical') {
        const names = { sp500: 'S&P 500', total_us: 'שוק אמריקאי מלא', world: 'מדד עולמי' };
        subtitle = `${names[sim.index_key] || sim.index_key} | ${sim.start_year || 2000}`;
    } else {
        subtitle = `תשואה ${sim.annual_return_pct}%`;
    }

    // Input summary
    const initial = sim.initial_amount || 0;
    const monthly = sim.monthly_contribution || 0;
    const years = sim.years || 0;
    const inputSummaryHtml = `
        <div class="sim-input-summary">
            <span>סכום התחלתי: <strong dir="ltr">${formatCurrency(initial, sym)}</strong></span>
            <span>הפקדה חודשית: <strong dir="ltr">${formatCurrency(monthly, sym)}</strong></span>
            <span>תקופה: <strong>${years} שנים</strong></span>
        </div>
    `;

    return `
        <div class="sim-card" data-id="${esc(sim.id)}">
            <div class="sim-card-header">
                <div>
                    <span class="sim-card-title">${esc(sim.name)}</span>
                    <span class="sim-card-subtitle">${subtitle}</span>
                </div>
                <div class="sim-card-actions">
                    <label class="sim-inflation-label" title="התאמה לאינפלציה אמריקאית אמיתית">
                        <input type="checkbox" class="sim-inflation-toggle" data-id="${esc(sim.id)}" ${inflationOn ? 'checked' : ''}>
                        <span>בניכוי אינפלציה</span>
                    </label>
                    ${deleteBtn}
                </div>
            </div>
            ${inputSummaryHtml}
            <div class="sim-card-body">
                ${renderSimBody(sim, sym, inflationOn)}
            </div>
        </div>
    `;
}

function renderSimBody(sim, sym, inflationOn) {
    const monthly = computeResults(sim, inflationOn);
    if (monthly.length === 0) return '<p class="empty-state">אין מספיק נתונים לתקופה הנבחרת</p>';

    const yearly = yearlyFromMonthly(monthly);
    const last = monthly[monthly.length - 1];
    const totalContributed = last.totalContributed;
    const totalValue = last.totalValue;
    const earnings = last.cumulativeEarnings;
    const earningsPositive = earnings > 0;

    // Summary cards
    const summaryHtml = `
        <div class="sim-summary">
            <div class="sim-summary-card">
                <span class="sim-summary-label">סה"כ הפקדות</span>
                <span class="sim-summary-value">${formatCurrency(totalContributed, sym)}</span>
            </div>
            <div class="sim-summary-card highlight">
                <span class="sim-summary-label">שווי סופי${inflationOn ? ' (ערך ריאלי)' : ''}</span>
                <span class="sim-summary-value">${formatCurrency(totalValue, sym)}</span>
            </div>
            <div class="sim-summary-card ${earningsPositive ? 'earnings-positive' : 'earnings-negative'}">
                <span class="sim-summary-label">רווח מריבית דריבית</span>
                <span class="sim-summary-value sim-wow-number">${formatCurrency(earnings, sym)}</span>
            </div>
        </div>
    `;

    // Wow text
    let wowHtml = '';
    if (earningsPositive && earnings > totalContributed * 0.1) {
        const pctOfTotal = Math.round((earnings / totalValue) * 100);
        wowHtml = `
            <div class="sim-wow">
                הכסף שלך עבד בשביליך! ${pctOfTotal}% מהסכום הסופי הגיע מריבית דריבית בלבד${inflationOn ? ' (בניכוי אינפלציה אמיתית)' : ''}!
            </div>
        `;
    }

    // Bar chart
    const maxVal = Math.max(...yearly.map(y => Math.max(y.totalValue, y.totalContributed)));
    let barsHtml = '';
    for (const y of yearly) {
        const contribPct = maxVal > 0 ? (y.totalContributed / maxVal * 100) : 0;
        const earningsPct = maxVal > 0 ? (Math.max(0, y.cumulativeEarnings) / maxVal * 100) : 0;
        const yearLabel = y.date ? y.date.slice(0, 4) : `שנה ${y.year}`;
        const showLabel = yearly.length <= 15 || y.year % Math.ceil(yearly.length / 15) === 0 || y.year === yearly.length;

        barsHtml += `
            <div class="sim-bar-col" title="שנה ${y.year}: ${formatCurrency(y.totalValue, sym)}">
                <div class="sim-bar-stack">
                    <div class="sim-bar-earnings" style="height:${earningsPct}%"></div>
                    <div class="sim-bar-contrib" style="height:${contribPct}%"></div>
                </div>
                ${showLabel ? `<span class="sim-bar-label">${yearLabel}</span>` : '<span class="sim-bar-label"></span>'}
            </div>
        `;
    }

    const chartHtml = `
        <div class="sim-chart-legend">
            <span class="sim-legend-item"><span class="sim-legend-dot contrib"></span>הפקדות</span>
            <span class="sim-legend-item"><span class="sim-legend-dot earnings"></span>ריבית דריבית</span>
        </div>
        <div class="sim-bar-chart">${barsHtml}</div>
    `;

    // Year-by-year table
    let tableRows = '';
    for (const y of yearly) {
        const yearLabel = y.date ? y.date.slice(0, 4) : `שנה ${y.year}`;
        tableRows += `
            <tr>
                <td>${yearLabel}</td>
                <td>${formatCurrency(y.totalContributed, sym)}</td>
                <td>${formatCurrency(y.totalValue, sym)}</td>
                <td class="${y.cumulativeEarnings >= 0 ? 'gain' : 'loss'}">${formatCurrency(y.cumulativeEarnings, sym)}</td>
            </tr>
        `;
    }

    const tableHtml = `
        <button class="btn btn-ghost sim-table-toggle">הצג פירוט</button>
        <div class="sim-table-wrap collapsed">
            <table class="sim-table">
                <thead>
                    <tr><th>שנה</th><th>הפקדות</th><th>שווי</th><th>רווח</th></tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;

    return summaryHtml + wowHtml + chartHtml + tableHtml;
}
