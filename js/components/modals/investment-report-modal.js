// ============================================================
// Investment Report Modal — Excel download (client-side) + email + schedule
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import t from '../../i18n.js';

function _round(n, d = 2) {
    return n != null ? +n.toFixed(d) : '';
}

function _computeInv(inv, exchangeRates) {
    const currency = inv.currency || 'ILS';
    const rate = currency === 'ILS' ? 1 : (exchangeRates[currency] || 1);
    const rateAtPurchase = Number(inv.exchange_rate_at_purchase) || rate || 1;
    const amountInvested = Number(inv.amount_invested) || 0;
    const shares = inv.shares != null && inv.shares !== '' ? Number(inv.shares) : null;
    const currentPrice = inv.current_price != null && inv.current_price !== '' ? Number(inv.current_price) : null;

    const amountInvestedNative = currency === 'ILS' ? amountInvested : amountInvested / rateAtPurchase;
    const purchasePrice = shares && amountInvestedNative > 0 ? amountInvestedNative / shares : null;
    const currentValueNative = currentPrice != null && shares != null ? shares * currentPrice : null;
    const currentValueILS = currentValueNative != null ? currentValueNative * rate : null;
    const gainLossILS = currentValueILS != null ? currentValueILS - amountInvested : null;
    const gainLossPct = gainLossILS != null && amountInvested > 0 ? (gainLossILS / amountInvested) * 100 : null;

    return { ...inv, currency, amountInvested, amountInvestedNative, purchasePrice, currentValueNative, currentValueILS, gainLossILS, gainLossPct };
}

function _buildWorkbook(investments, exchangeRates) {
    const XLSX = window.XLSX;
    const computed = investments.map(inv => _computeInv(inv, exchangeRates));
    const wb = XLSX.utils.book_new();

    // Map display name → username for each member
    const members = store.get('members') || [];
    const usernameByName = Object.fromEntries(members.map(m => [m.name, m.username || m.name]));
    const kidLabel = kid => usernameByName[kid] || kid;

    // Sheet 1 — Summary per kid
    const kidNames = [...new Set(computed.map(i => i.kid).filter(Boolean))].sort();
    const sumRows = [['שם', 'הושקע (₪)', 'שווי נוכחי (₪)', 'רווח/הפסד (₪)', 'תשואה %', 'מספר השקעות']];
    let totInv = 0, totCur = 0;
    for (const kid of kidNames) {
        const kidInvs = computed.filter(i => i.kid === kid);
        const inv = kidInvs.reduce((s, i) => s + i.amountInvested, 0);
        const cur = kidInvs.reduce((s, i) => s + (i.currentValueILS ?? i.amountInvested), 0);
        const gl = cur - inv;
        const pct = inv > 0 ? (gl / inv) * 100 : 0;
        sumRows.push([kidLabel(kid), _round(inv), _round(cur), _round(gl), _round(pct), kidInvs.length]);
        totInv += inv; totCur += cur;
    }
    const totGl = totCur - totInv;
    sumRows.push(['סה"כ', _round(totInv), _round(totCur), _round(totGl), _round(totInv > 0 ? (totGl / totInv) * 100 : 0), computed.length]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'סיכום');

    // Sheet 2 — All transactions
    const invRows = [['ילד/ה', 'שם נכס', 'טיקר', 'מטבע', 'תאריך רכישה', 'יחידות', 'מחיר רכישה', 'הושקע (₪)', 'מחיר נוכחי', 'שווי נוכחי (₪)', 'רווח/הפסד (₪)', 'תשואה %']];
    for (const i of computed) {
        invRows.push([
            kidLabel(i.kid) || '',
            i.asset_name || i.ticker || '',
            i.ticker || '',
            i.currency || 'ILS',
            i.purchase_date || '',
            i.shares != null ? _round(i.shares, 4) : '',
            _round(i.purchasePrice, 4),
            _round(i.amountInvested),
            i.current_price != null ? _round(Number(i.current_price), 4) : '',
            _round(i.currentValueILS),
            _round(i.gainLossILS),
            _round(i.gainLossPct),
        ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), 'עסקאות');
    return wb;
}

function generateAndDownload() {
    const investments = store.get('investments') || [];
    const exchangeRates = { ILS: 1, ...(store.get('exchangeRates') || {}) };
    const wb = _buildWorkbook(investments, exchangeRates);
    const dateStr = new Date().toISOString().slice(0, 10);
    window.XLSX.writeFile(wb, `investment-report-${dateStr}.xlsx`);
}

export function showInvestmentReportModal() {
    const family  = store.get('family') || {};
    const user    = store.get('user')   || {};
    const ownerEmail      = user.email || '';
    const savedBackupEmail = family.backupReportEmail || '';
    const savedSchedule    = family.reportSchedule    || 'off';
    const effectiveEmail   = savedBackupEmail || ownerEmail;

    const scheduleOptions = [
        { value: 'off',     label: t.report.scheduleOff },
        { value: 'weekly',  label: t.report.scheduleWeekly },
        { value: 'monthly', label: t.report.scheduleMonthly },
    ];
    const optionsHtml = scheduleOptions.map(o =>
        `<option value="${o.value}"${savedSchedule === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
    ).join('');

    const html = `
        <h2>${t.report.title}</h2>

        <div class="report-section">
            <h3>${t.report.downloadSection}</h3>
            <p class="form-hint">${t.report.downloadHint}</p>
            <button class="btn btn-primary" id="report-download-btn">${t.report.downloadBtn}</button>
        </div>

        <hr class="modal-divider">

        <div class="report-section">
            <h3>${t.report.emailSection}</h3>
            <div class="form-group">
                <label>${t.report.ownerEmailLabel}</label>
                <div class="email-locked" dir="ltr">${esc(ownerEmail)}</div>
            </div>
            <div class="form-group">
                <label for="backup-email">${t.report.backupEmailLabel}</label>
                <p class="form-hint">${t.report.backupEmailHint}</p>
                <div class="ticker-input-row">
                    <input type="email" id="backup-email" dir="ltr" placeholder="${t.report.backupEmailPlaceholder}" value="${esc(savedBackupEmail)}">
                    <button class="btn btn-secondary btn-sm" id="backup-email-save-btn">${t.report.backupEmailSaveBtn}</button>
                </div>
            </div>
            <p class="form-hint">${t.report.emailSendToHint}: <strong dir="ltr">${esc(effectiveEmail)}</strong></p>
            <button class="btn btn-secondary" id="report-send-btn">${t.report.sendNowBtn}</button>
        </div>

        <hr class="modal-divider">

        <div class="report-section">
            <h3>${t.report.scheduleSection}</h3>
            <p class="form-hint">${t.report.scheduleHint}</p>
            <div class="form-row">
                <div class="form-group">
                    <label for="report-schedule">${t.report.scheduleLabel}</label>
                    <select id="report-schedule">${optionsHtml}</select>
                </div>
            </div>
            <button class="btn btn-secondary" id="report-save-schedule-btn">${t.report.saveScheduleBtn}</button>
        </div>

        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.close}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

    // Download — client-side, no Cloud Function needed
    modal.querySelector('#report-download-btn').addEventListener('click', () => {
        const btn = modal.querySelector('#report-download-btn');
        btn.disabled = true;
        btn.textContent = t.common.loading;
        try {
            generateAndDownload();
            emit('toast', { message: t.report.downloadedToast, type: 'success' });
        } catch (e) {
            console.error('Excel export error:', e);
            emit('toast', { message: `${t.report.errorToast}: ${e?.message || e}`, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.downloadBtn;
        }
    });

    // Save backup email — direct Firestore write
    modal.querySelector('#backup-email-save-btn').addEventListener('click', async () => {
        const emailVal = modal.querySelector('#backup-email').value.trim();
        const btn = modal.querySelector('#backup-email-save-btn');
        btn.disabled = true;
        btn.textContent = t.common.saving;
        try {
            await familyService.updateFamily(user.familyId, { backupReportEmail: emailVal });
            emit('toast', { message: t.report.backupEmailSavedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: `${t.report.errorToast}: ${e?.message || e}`, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.backupEmailSaveBtn;
        }
    });

    // Send email — calls Cloudflare Worker directly (no Cloud Function needed)
    modal.querySelector('#report-send-btn').addEventListener('click', async () => {
        const btn = modal.querySelector('#report-send-btn');
        btn.disabled = true;
        btn.textContent = t.common.sending;
        try {
            const { FIREBASE_CDN, WORKER_SEND_EMAIL_URL } = await import('../../config.js');
            const { getApp } = await import('../../firebase-init.js');
            const { getAuth } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
            const idToken = await getAuth(getApp()).currentUser.getIdToken();

            const investments = store.get('investments') || [];
            const exchangeRates = { ILS: 1, ...(store.get('exchangeRates') || {}) };
            const wb = _buildWorkbook(investments, exchangeRates);
            const xlsxBase64 = window.XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const dateStr = new Date().toLocaleDateString('he-IL');

            const res = await fetch(WORKER_SEND_EMAIL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ to: effectiveEmail, familyName: family.family_name || '', xlsxBase64, dateStr }),
            });
            if (!res.ok) throw new Error((await res.json()).error || res.statusText);
            emit('toast', { message: t.report.sentToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: `${t.report.errorToast}: ${e?.message || e}`, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.sendNowBtn;
        }
    });

    // Save schedule only
    modal.querySelector('#report-save-schedule-btn').addEventListener('click', async () => {
        const schedule = modal.querySelector('#report-schedule').value;
        const btn = modal.querySelector('#report-save-schedule-btn');
        btn.disabled = true;
        btn.textContent = t.common.saving;
        try {
            await familyService.updateFamily(user.familyId, { reportSchedule: schedule });
            emit('toast', { message: t.report.scheduleSavedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.report.errorToast, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.saveScheduleBtn;
        }
    });
}
