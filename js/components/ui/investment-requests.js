// ============================================================
// Investment Requests — shows pending/resolved buy-sell requests.
// Managers see requests for a specific kid with approve/reject.
// Kids see their own requests and their statuses.
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { formatDate } from '../../utils/format.js';
import t from '../../i18n.js';

let _container = null;
let _kidName = null;
let _unsubs = [];

export function mount(container, kidName) {
    unmount();
    _container = container;
    _kidName = kidName;
    render();
    _unsubs.push(store.subscribe('investmentRequests', render));
}

export function unmount() {
    _unsubs.forEach(fn => fn());
    _unsubs = [];
    _container = null;
    _kidName = null;
}

function render() {
    if (!_container) return;

    const user = store.get('user');
    const isManager = user?.role === 'manager';
    const allRequests = store.get('investmentRequests') || [];
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';

    // Managers see requests for this kid; kids see their own
    const requests = isManager
        ? allRequests.filter(r => r.kid === _kidName)
        : allRequests.filter(r => r.kid_uid === user.uid);

    if (requests.length === 0 && !isManager) {
        _container.innerHTML = '';
        return;
    }

    const pending = requests.filter(r => r.status === 'pending');
    const resolved = requests.filter(r => r.status !== 'pending');

    const renderRequest = (req) => {
        const typeBadge = req.type === 'buy'
            ? `<span class="req-type-badge req-buy">${t.investmentRequest.typeBuy}</span>`
            : `<span class="req-type-badge req-sell">${t.investmentRequest.typeSell}</span>`;

        const statusBadge = req.status === 'pending'
            ? `<span class="req-status-badge req-pending">${t.investmentRequest.statusPending}</span>`
            : req.status === 'approved'
            ? `<span class="req-status-badge req-approved">${t.investmentRequest.statusApproved}</span>`
            : `<span class="req-status-badge req-rejected">${t.investmentRequest.statusRejected}</span>`;

        const details = [];
        if (req.asset_name) details.push(`<strong>${esc(req.asset_name)}</strong>`);
        if (req.ticker && req.ticker !== req.asset_name) {
            details.push(`<span class="currency-badge" dir="ltr">${esc(req.ticker)}</span>`);
        }
        if (req.shares != null) details.push(`${req.shares.toLocaleString()} ${t.investmentRequest.units}`);
        if (req.amount_ils != null) details.push(`${sym}${req.amount_ils.toLocaleString()}`);
        if (req.note) details.push(`<em class="req-note">${esc(req.note)}</em>`);
        if (req.created_at) details.push(`<span class="req-date">${formatDate(req.created_at.slice(0, 10))}</span>`);

        const managerActions = isManager && req.status === 'pending' ? `
            <div class="req-actions">
                <button class="btn btn-small btn-primary settle-req-btn" data-id="${esc(req.id)}">${t.settlement.settleBtn}</button>
                <button class="btn btn-small btn-danger reject-req-btn" data-id="${esc(req.id)}">${t.investmentRequest.rejectBtn}</button>
            </div>
        ` : '';

        const deleteBtn = !isManager && req.status !== 'pending' ? `
            <button class="btn btn-ghost delete-req-btn" data-id="${esc(req.id)}" title="${t.common.delete}" style="font-size:0.8rem;padding:0.15rem 0.4rem">✕</button>
        ` : '';

        return `
            <div class="investment-request-item${req.status !== 'pending' ? ' req-resolved' : ''}">
                <div class="req-header">
                    <span class="req-badges">${typeBadge}${statusBadge}</span>
                    ${deleteBtn}
                </div>
                <div class="req-details">${details.join(' · ')}</div>
                ${managerActions}
            </div>
        `;
    };

    let html = `
        <div class="section-header">
            <h2>${isManager ? t.investmentRequest.managerTitle : t.investmentRequest.kidTitle}</h2>
        </div>
    `;

    if (requests.length === 0) {
        html += `<p class="req-empty">${t.investmentRequest.empty}</p>`;
    } else {
        if (pending.length > 0) {
            html += pending.map(renderRequest).join('');
        }
        if (resolved.length > 0) {
            html += `
                <details class="req-resolved-section">
                    <summary>${t.investmentRequest.resolvedTitle} (${resolved.length})</summary>
                    ${resolved.map(renderRequest).join('')}
                </details>
            `;
        }
    }

    _container.innerHTML = html;

    _container.querySelectorAll('.settle-req-btn').forEach(btn => {
        btn.addEventListener('click', () => handleSettle(btn.dataset.id));
    });
    _container.querySelectorAll('.reject-req-btn').forEach(btn => {
        btn.addEventListener('click', () => handleReject(btn.dataset.id));
    });
    _container.querySelectorAll('.delete-req-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
}

async function handleSettle(requestId) {
    const allRequests = store.get('investmentRequests') || [];
    const req = allRequests.find(r => r.id === requestId);
    if (!req) return;
    const { showSettleBuyModal, showSettleSellModal } = await import('../modals/settlement-modal.js');
    if (req.type === 'buy') {
        showSettleBuyModal(req);
    } else {
        showSettleSellModal(req);
    }
}

async function handleReject(requestId) {
    const user = store.get('user');
    try {
        const { reject } = await import('../../services/investment-request-service.js');
        await reject(user.familyId, requestId);
        emit('toast', { message: t.investmentRequest.rejectedToast, type: 'success' });
    } catch {
        emit('toast', { message: t.investmentRequest.actionErrorToast, type: 'error' });
    }
}

async function handleDelete(requestId) {
    const user = store.get('user');
    try {
        const { remove } = await import('../../services/investment-request-service.js');
        await remove(user.familyId, requestId);
    } catch {
        emit('toast', { message: t.investmentRequest.actionErrorToast, type: 'error' });
    }
}
