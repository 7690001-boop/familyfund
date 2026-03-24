// ============================================================
// Investment Heatmap — treemap-style tiles sized by current value
// Each tile = one aggregated position (all purchases of a ticker)
// ============================================================

import { aggregateByTicker } from '../../utils/compute.js';
import { formatCurrency, formatPct, currencySymbol } from '../../utils/format.js';
import { esc } from '../../utils/dom-helpers.js';
import { open as openModal, getContent, close as closeModal } from './modal.js';

// Happy pastel color palette — child-friendly, not P/L dependent
const TILE_COLORS = [
    { bg: '#FFF3CD', border: '#FFD57E', icon: '⭐' },
    { bg: '#D1F0FF', border: '#7DCFEE', icon: '🌊' },
    { bg: '#D4EDDA', border: '#8FD6A0', icon: '🌿' },
    { bg: '#FDE8FF', border: '#DDA0EE', icon: '🌸' },
    { bg: '#FFE5CC', border: '#FFBE88', icon: '🍊' },
    { bg: '#E8F4D9', border: '#B5D989', icon: '🍀' },
    { bg: '#D6F5F0', border: '#90DDD6', icon: '🦋' },
    { bg: '#F8D7DA', border: '#F5A8B0', icon: '🌺' },
    { bg: '#E2D9F3', border: '#C4AEE8', icon: '🔮' },
    { bg: '#FFFACD', border: '#F0D060', icon: '🌟' },
];

// ── Floating tooltip singleton ────────────────────────────────
let _tooltipEl = null;

function getTooltip() {
    if (!_tooltipEl) {
        _tooltipEl = document.createElement('div');
        _tooltipEl.className = 'heatmap-floating-tooltip';
        document.body.appendChild(_tooltipEl);
    }
    return _tooltipEl;
}

function showTooltip(e, html) {
    const t = getTooltip();
    t.innerHTML = html;
    t.classList.add('visible');
    moveTooltip(e);
}

function moveTooltip(e) {
    if (!_tooltipEl || !_tooltipEl.classList.contains('visible')) return;
    const margin = 14;
    let x = e.clientX + margin;
    let y = e.clientY + margin;
    const w = _tooltipEl.offsetWidth;
    const h = _tooltipEl.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - margin;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - margin;
    _tooltipEl.style.left = x + 'px';
    _tooltipEl.style.top = y + 'px';
}

function hideTooltip() {
    if (_tooltipEl) _tooltipEl.classList.remove('visible');
}

function buildTooltip(pos, { sym, pct }) {
    const value = pos.currentValueILS ?? pos.totalInvested;
    const avgCostSym = currencySymbol(pos.currency);
    const avgCost = pos.avgCostNative != null
        ? formatCurrency(pos.avgCostNative, avgCostSym, 2) : '—';
    const currPrice = pos.currentPrice != null
        ? formatCurrency(pos.currentPrice, avgCostSym, 2) : '—';
    const plPct = pos.gainLossPctILS != null ? formatPct(pos.gainLossPctILS) : null;
    const plAmt = pos.gainLossILS != null
        ? formatCurrency(Math.abs(pos.gainLossILS), sym) : null;
    const isPos = (pos.gainLossILS ?? 0) >= 0;
    const plSign = isPos ? '▲' : '▼';
    const plColor = isPos ? '#1a7a45' : '#c0392b';
    const name = pos.asset_name || pos.ticker || '—';
    const shares = pos.totalShares > 0
        ? pos.totalShares.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '—';
    const pctDisplay = (pct * 100).toFixed(1);
    const barWidth = Math.min(100, pct * 100).toFixed(1);

    return `
        <div class="hm-tt-header">
            <strong>${esc(name)}</strong>
            ${pos.ticker && pos.ticker !== pos.asset_name
                ? `<span class="hm-tt-ticker">${esc(pos.ticker)}</span>` : ''}
        </div>
        <div class="hm-tt-row">💰 שווי נוכחי: <strong>${formatCurrency(value, sym)}</strong></div>
        <div class="hm-tt-row hm-tt-pct-row">
            <span>📊 חלק מהתיק: <strong>${pctDisplay}%</strong></span>
            <span class="hm-tt-bar-wrap"><span class="hm-tt-bar" style="width:${barWidth}%"></span></span>
        </div>
        ${plPct && plAmt ? `<div class="hm-tt-row" style="color:${plColor}">${plSign} רווח/הפסד: <strong>${plAmt} (${plPct})</strong></div>` : ''}
        <div class="hm-tt-divider"></div>
        <div class="hm-tt-row">🛒 מחיר קנייה ממוצע: <strong>${avgCost}</strong></div>
        <div class="hm-tt-row">📈 מחיר נוכחי: <strong>${currPrice}</strong></div>
        <div class="hm-tt-row">📦 כמות יחידות: <strong>${shares}</strong></div>
        ${pos.note ? `<div class="hm-tt-note">📝 ${esc(pos.note)}</div>` : ''}
        <div class="hm-tt-hint">לחץ/י לפרטים מלאים 👆</div>
    `;
}

// ── Main render ───────────────────────────────────────────────
export function render(container, investments, { familyId, sym = '₪', canEdit = false, canNote = false, canRename = false, canSell = false, onEdit, onSell } = {}) {
    if (!container) return;

    const emptyFrame = `
        <div class="heatmap-frame">
            <div class="heatmap-header">
                <span class="heatmap-header-icon">🗺️</span>
                <div class="heatmap-header-text">
                    <span class="heatmap-header-title">מפת חום</span>
                    <span class="heatmap-header-sub">גודל כל קובייה = אחוז הנכס מהתיק</span>
                </div>
            </div>
            <div class="heatmap-empty">🌱<br>עוד אין השקעות</div>
        </div>`;

    if (!investments || investments.length === 0) { container.innerHTML = emptyFrame; return; }

    const positions = aggregateByTicker(investments)
        .filter(p => (p.currentValueILS ?? p.totalInvested) > 0)
        .sort((a, b) => (b.currentValueILS ?? b.totalInvested) - (a.currentValueILS ?? a.totalInvested));

    if (positions.length === 0) { container.innerHTML = emptyFrame; return; }

    const totalValue = positions.reduce((s, p) => s + (p.currentValueILS ?? p.totalInvested), 0);

    const tilesHtml = positions.map((pos, i) => {
        const value = pos.currentValueILS ?? pos.totalInvested;
        const pct = totalValue > 0 ? value / totalValue : 1 / positions.length;
        // Use the true portfolio percentage as the flex value — no artificial minimum
        // so that proportions are always accurate. CSS min-width handles visibility.
        const flexVal = pct * 100;
        const pctDisplay = (pct * 100).toFixed(1);

        const color = TILE_COLORS[i % TILE_COLORS.length];
        const name = pos.asset_name || pos.ticker || '—';
        const displayName = name.length > 18 ? name.slice(0, 16) + '…' : name;
        const plPct = pos.gainLossPctILS != null ? formatPct(pos.gainLossPctILS) : null;
        const avgCostSym = currencySymbol(pos.currency);
        const avgCost = pos.avgCostNative != null
            ? formatCurrency(pos.avgCostNative, avgCostSym, 2) : '—';
        const currentVal = formatCurrency(value, sym);

        return `<div class="heatmap-tile"
            style="flex: ${flexVal}; background: ${color.bg}; border-color: ${color.border};"
            data-pos-idx="${i}"
            data-pct="${pct}"
            role="button"
            tabindex="0"
            aria-label="${esc(name)}, ${pctDisplay}% מהתיק, שווי ${currentVal}">
            <div class="heatmap-tile-icon">${color.icon}</div>
            <div class="heatmap-tile-name">${esc(displayName)}</div>
            ${pos.ticker && pos.ticker !== pos.asset_name
                ? `<div class="heatmap-tile-ticker">${esc(pos.ticker)}</div>` : ''}
            <div class="heatmap-tile-value">${currentVal}</div>
            <div class="heatmap-tile-meta">
                ${plPct ? `<span class="heatmap-pl">${plPct}</span>` : ''}
                <span class="heatmap-avg">קנייה: ${avgCost}</span>
            </div>
            ${pos.note ? '<div class="heatmap-note-dot" title="יש הערה">📝</div>' : ''}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="heatmap-frame">
            <div class="heatmap-header">
                <span class="heatmap-header-icon">🗺️</span>
                <div class="heatmap-header-text">
                    <span class="heatmap-header-title">מפת חום</span>
                    <span class="heatmap-header-sub">גודל כל קובייה מייצג את חלק הנכס מהתיק</span>
                </div>
                <div class="heatmap-total-badge">
                    <span class="heatmap-total-label">סה״כ תיק</span>
                    <span class="heatmap-total-value">${formatCurrency(totalValue, sym)}</span>
                </div>
            </div>
            <div class="heatmap-grid">${tilesHtml}</div>
        </div>`;

    container.querySelectorAll('.heatmap-tile').forEach(tile => {
        const pos = positions[parseInt(tile.dataset.posIdx, 10)];
        const pct = parseFloat(tile.dataset.pct);
        const ttHtml = buildTooltip(pos, { sym, pct });

        tile.addEventListener('click', () => {
            hideTooltip();
            showDetail(pos, { familyId, sym, canEdit, canNote, canRename, canSell, onEdit, onSell });
        });
        tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                hideTooltip();
                showDetail(pos, { familyId, sym, canEdit, canNote, canRename, canSell, onEdit, onSell });
            }
        });
        tile.addEventListener('mouseenter', (e) => showTooltip(e, ttHtml));
        tile.addEventListener('mousemove', moveTooltip);
        tile.addEventListener('mouseleave', hideTooltip);
    });
}

// ── Detail modal ──────────────────────────────────────────────
export function showDetail(pos, { familyId, sym, canEdit, canNote, canRename, canSell, onEdit, onSell }) {
    const name = pos.asset_name || pos.ticker || '—';
    const value = pos.currentValueILS ?? pos.totalInvested;
    const avgCostSym = currencySymbol(pos.currency);
    const avgCost = pos.avgCostNative != null
        ? formatCurrency(pos.avgCostNative, avgCostSym, 2) : '—';
    const currPrice = pos.currentPrice != null
        ? formatCurrency(pos.currentPrice, avgCostSym, 2) : '—';
    const totalInv = formatCurrency(pos.totalInvested, sym);
    const currentVal = formatCurrency(value, sym);
    const plPct = pos.gainLossPctILS != null ? formatPct(pos.gainLossPctILS) : '—';
    const plAmt = pos.gainLossILS != null ? formatCurrency(Math.abs(pos.gainLossILS), sym) : '—';
    const plSign = (pos.gainLossILS ?? 0) >= 0 ? '▲' : '▼';
    const plClass = (pos.gainLossILS ?? 0) >= 0 ? 'heatmap-pl-pos' : 'heatmap-pl-neg';
    const shares = pos.totalShares > 0
        ? pos.totalShares.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '—';
    const note = pos.note || '';
    const noteReadonly = !canNote || !pos.firstId;
    const canRenamePos = canRename && !!pos.firstId;

    openModal(`
        <div class="heatmap-detail">
            <h2 class="heatmap-detail-title">
                ${esc(name)}
                ${pos.ticker ? `<span class="heatmap-ticker-lg">${esc(pos.ticker)}</span>` : ''}
            </h2>
            ${canRenamePos ? `
            <div class="heatmap-rename-section">
                <label class="heatmap-note-label" for="heatmap-display-name">✏️ שם תצוגה</label>
                <div class="heatmap-rename-row">
                    <input
                        type="text"
                        id="heatmap-display-name"
                        class="heatmap-rename-input"
                        value="${esc(pos.nickname)}"
                        placeholder="${esc(pos.baseAssetName)}"
                        maxlength="40"
                    >
                    <button class="btn btn-primary btn-sm" id="heatmap-save-name">שמור</button>
                </div>
            </div>
            ` : ''}
            <div class="heatmap-detail-grid">
                <div class="heatmap-detail-card" title="השווי הנוכחי של כל יחידות הנכס הזה בתיק שלך">
                    <div class="heatmap-detail-label">💰 שווי נוכחי</div>
                    <div class="heatmap-detail-big">${currentVal}</div>
                </div>
                <div class="heatmap-detail-card" title="סך הכסף שהושקע ברכישת הנכס הזה (ללא עמלות)">
                    <div class="heatmap-detail-label">🛒 סך השקעה</div>
                    <div class="heatmap-detail-val">${totalInv}</div>
                </div>
                <div class="heatmap-detail-card ${plClass}" title="ההפרש בין השווי הנוכחי לסכום שהושקע — חיובי = רווח, שלילי = הפסד">
                    <div class="heatmap-detail-label">📈 רווח / הפסד</div>
                    <div class="heatmap-detail-val">${plSign} ${plAmt}</div>
                    <div class="heatmap-detail-sub">${plPct}</div>
                </div>
                <div class="heatmap-detail-card" title="ממוצע המחירים ששולמו לכל יחידה (בחישוב כולל כל הרכישות)">
                    <div class="heatmap-detail-label">🏷️ מחיר קנייה ממוצע</div>
                    <div class="heatmap-detail-val">${avgCost}</div>
                </div>
                <div class="heatmap-detail-card" title="המחיר הנוכחי של יחידה אחת של הנכס בשוק">
                    <div class="heatmap-detail-label">📊 מחיר נוכחי</div>
                    <div class="heatmap-detail-val">${currPrice}</div>
                </div>
                <div class="heatmap-detail-card" title="מספר היחידות (מניות / יחידות קרן) שנמצאות בבעלותך">
                    <div class="heatmap-detail-label">📦 כמות יחידות</div>
                    <div class="heatmap-detail-val">${shares}</div>
                </div>
            </div>
            <div class="heatmap-note-section">
                <label class="heatmap-note-label" for="heatmap-note-input">📝 הערה שלי</label>
                <textarea
                    id="heatmap-note-input"
                    class="heatmap-note-textarea"
                    rows="3"
                    placeholder="כתוב/י כאן מה שחשוב לך לזכור על ההשקעה הזאת..."
                    ${noteReadonly ? 'readonly' : ''}
                >${esc(note)}</textarea>
                ${!noteReadonly ? `<button class="btn btn-primary btn-sm" id="heatmap-save-note">שמור הערה</button>` : ''}
            </div>
            <div class="heatmap-detail-actions">
                ${canEdit && pos.firstId && onEdit ? `<button class="btn btn-primary btn-sm" id="heatmap-edit-btn">✎ ערוך</button>` : ''}
                ${canSell && pos.firstId && onSell ? `<button class="btn btn-secondary btn-sm" id="heatmap-sell-btn">📉 מכור</button>` : ''}
                <button class="btn btn-ghost heatmap-detail-close-btn" id="heatmap-close">סגור</button>
            </div>
        </div>
    `);

    const mc = getContent();

    mc.querySelector('#heatmap-close')?.addEventListener('click', closeModal);
    mc.querySelector('#heatmap-edit-btn')?.addEventListener('click', () => { closeModal(); onEdit(pos.firstId); });
    mc.querySelector('#heatmap-sell-btn')?.addEventListener('click', () => { closeModal(); onSell(pos.firstId); });

    if (canRenamePos) {
        mc.querySelector('#heatmap-save-name')?.addEventListener('click', async () => {
            const nameVal = mc.querySelector('#heatmap-display-name')?.value?.trim() ?? '';
            const btn = mc.querySelector('#heatmap-save-name');
            btn.textContent = '...';
            btn.disabled = true;
            try {
                const { update } = await import('../../services/investment-service.js');
                await update(familyId, pos.firstId, { nickname: nameVal });
                btn.textContent = '✓';
                setTimeout(() => { btn.textContent = 'שמור'; btn.disabled = false; }, 1500);
            } catch {
                btn.textContent = '⚠';
                btn.disabled = false;
            }
        });
    }

    if (!noteReadonly) {
        mc.querySelector('#heatmap-save-note')?.addEventListener('click', async () => {
            const noteText = mc.querySelector('#heatmap-note-input')?.value ?? '';
            const btn = mc.querySelector('#heatmap-save-note');
            btn.textContent = 'שומר...';
            btn.disabled = true;
            try {
                const { update } = await import('../../services/investment-service.js');
                await update(familyId, pos.firstId, { note: noteText });
                btn.textContent = '✓ נשמר';
                setTimeout(() => { btn.textContent = 'שמור הערה'; btn.disabled = false; }, 1500);
            } catch {
                btn.textContent = '⚠ שגיאה';
                btn.disabled = false;
            }
        });
    }
}
