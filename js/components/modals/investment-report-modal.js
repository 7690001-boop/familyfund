// ============================================================
// Investment Report Modal — Excel download + email + schedule
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import { FIREBASE_CDN } from '../../config.js';
import { getApp } from '../../firebase-init.js';
import t from '../../i18n.js';

async function callExportFn(data) {
    const { getFunctions, httpsCallable } = await import(`${FIREBASE_CDN}/firebase-functions.js`);
    const fn = httpsCallable(getFunctions(getApp()), 'exportInvestmentReport', { timeout: 120000 });
    return fn(data);
}

function downloadBase64Xlsx(base64, filename) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function showInvestmentReportModal() {
    const family = store.get('family') || {};
    const savedEmail    = family.reportEmail    || '';
    const savedSchedule = family.reportSchedule || 'off';

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
                <label for="report-email">${t.report.emailLabel}</label>
                <input type="email" id="report-email" dir="ltr" placeholder="${t.report.emailPlaceholder}" value="${esc(savedEmail)}">
            </div>
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

    // Download
    modal.querySelector('#report-download-btn').addEventListener('click', async () => {
        const btn = modal.querySelector('#report-download-btn');
        btn.disabled = true;
        btn.textContent = t.common.loading;
        try {
            const result = await callExportFn({ action: 'download' });
            downloadBase64Xlsx(result.data.data, result.data.filename);
            emit('toast', { message: t.report.downloadedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.report.errorToast, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.downloadBtn;
        }
    });

    // Send email
    modal.querySelector('#report-send-btn').addEventListener('click', async () => {
        const emailInput = modal.querySelector('#report-email');
        const emailVal = emailInput.value.trim();
        if (!emailVal) {
            emit('toast', { message: t.report.emailRequired, type: 'error' });
            return;
        }
        const btn = modal.querySelector('#report-send-btn');
        btn.disabled = true;
        btn.textContent = t.common.sending;
        try {
            await callExportFn({ action: 'email', email: emailVal });
            emit('toast', { message: t.report.sentToast, type: 'success' });
        } catch (e) {
            const msg = e?.message?.includes('SMTP') ? t.report.smtpNotConfigured : t.report.errorToast;
            emit('toast', { message: msg, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.sendNowBtn;
        }
    });

    // Save schedule
    modal.querySelector('#report-save-schedule-btn').addEventListener('click', async () => {
        const emailVal = modal.querySelector('#report-email').value.trim();
        const schedule = modal.querySelector('#report-schedule').value;
        const btn = modal.querySelector('#report-save-schedule-btn');
        btn.disabled = true;
        btn.textContent = t.common.saving;
        try {
            const user = store.get('user');
            await familyService.updateFamily(user.familyId, {
                reportEmail:    emailVal,
                reportSchedule: schedule,
            });
            emit('toast', { message: t.report.scheduleSavedToast, type: 'success' });
        } catch (e) {
            emit('toast', { message: t.report.errorToast, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.textContent = t.report.saveScheduleBtn;
        }
    });
}
