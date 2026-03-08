// ============================================================
// Member Modals — add/manage/remove family members
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';

export function showAddMemberModal() {
    const user = store.get('user');
    const familyCode = user.familyId;

    const html = `
        <h2>הוספת ילד/ה</h2>
        <div class="form-group">
            <label for="member-name">שם תצוגה</label>
            <input type="text" id="member-name" placeholder="למשל: דניאל">
        </div>
        <div class="form-group">
            <label for="member-username">שם משתמש (לכניסה)</label>
            <input type="text" id="member-username" dir="ltr" placeholder="למשל: daniel">
            <div class="form-hint">שם פשוט באנגלית או בעברית — בלי רווחים</div>
        </div>
        <div class="form-group">
            <label for="member-password">סיסמה</label>
            <input type="text" id="member-password" placeholder="לפחות 6 תווים">
        </div>
        <div style="background:var(--color-tab-hover);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-top:0.75rem">
            <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.25rem">קוד משפחה (לשתף עם הילד/ה):</div>
            <div dir="ltr" style="font-family:monospace;font-size:0.9rem;font-weight:600;user-select:all">${esc(familyCode)}</div>
        </div>
        <div id="member-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">הוסף</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const name = modal.querySelector('#member-name').value.trim();
        const username = modal.querySelector('#member-username').value.trim();
        const password = modal.querySelector('#member-password').value;
        const errorEl = modal.querySelector('#member-error');

        if (!name) { modal.querySelector('#member-name').focus(); return; }
        if (!username) { modal.querySelector('#member-username').focus(); return; }
        if (!password || password.length < 6) {
            errorEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = 'יוצר חשבון...';
        errorEl.hidden = true;

        try {
            await familyService.createMemberAccount(username, password, user.familyId, name);
            closeModal();
            emit('toast', { message: name + ' נוסף/ה בהצלחה', type: 'success' });
        } catch (e) {
            const msg = e.code === 'auth/email-already-in-use' ? 'שם משתמש כבר קיים'
                : 'שגיאה ביצירת חשבון: ' + e.message;
            errorEl.textContent = msg;
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = 'הוסף';
        }
    });
    modal.querySelector('#member-name').focus();
}

export function showManageMembersModal() {
    const members = store.get('members') || [];
    const user = store.get('user');
    const familyCode = user.familyId;

    let memberRows = '';
    members.forEach(m => {
        const isMe = m.uid === user.uid;
        const roleLabel = m.role === 'manager' ? 'מנהל' : 'ילד/ה';
        const identifier = m.username ? 'משתמש: ' + m.username : m.email || '';
        memberRows += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--color-border)">
                <div>
                    <strong>${esc(m.name)}</strong>
                    <span style="color:var(--color-text-muted);font-size:0.85rem"> (${roleLabel})</span>
                    <div style="font-size:0.82rem;color:var(--color-text-muted)">${esc(identifier)}</div>
                </div>
                ${!isMe && m.role !== 'manager' ? `
                    <div style="display:flex;gap:0.25rem">
                        <button class="btn btn-ghost reset-password-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="איפוס סיסמה">🔑</button>
                        <button class="btn btn-ghost danger remove-member-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="הסר">✕</button>
                    </div>
                ` : ''}
            </div>
        `;
    });

    const html = `
        <h2>ניהול חברי משפחה</h2>
        <div style="background:var(--color-tab-hover);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-bottom:1rem">
            <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.25rem">קוד משפחה (לשתף עם הילדים):</div>
            <div dir="ltr" style="font-family:monospace;font-size:0.9rem;font-weight:600;user-select:all">${esc(familyCode)}</div>
        </div>
        <div style="margin-bottom:1rem">${memberRows}</div>
        <div class="modal-actions">
            <button class="btn btn-primary" id="modal-add-member" style="margin-inline-end:auto">+ הוסף ילד/ה</button>
            <button class="btn btn-secondary" id="modal-cancel">סגור</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-add-member').addEventListener('click', () => {
        closeModal();
        showAddMemberModal();
    });

    modal.querySelectorAll('.reset-password-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal();
            showResetPasswordModal(btn.dataset.uid, btn.dataset.name);
        });
    });

    modal.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal();
            showRemoveMemberConfirm(btn.dataset.uid, btn.dataset.name);
        });
    });
}

function showResetPasswordModal(memberUid, memberName) {
    const html = `
        <h2>איפוס סיסמה — ${esc(memberName)}</h2>
        <div class="form-group">
            <label for="new-password">סיסמה חדשה</label>
            <input type="text" id="new-password" placeholder="לפחות 6 תווים">
        </div>
        <div id="reset-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">שמור סיסמה</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    const errorEl = modal.querySelector('#reset-error');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#new-password').focus();
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const newPassword = modal.querySelector('#new-password').value;
        if (!newPassword || newPassword.length < 6) {
            errorEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = 'שומר...';
        errorEl.hidden = true;

        try {
            await familyService.resetMemberPassword(memberUid, newPassword);
            closeModal();
            emit('toast', { message: 'סיסמת ' + memberName + ' אופסה בהצלחה', type: 'success' });
        } catch (e) {
            errorEl.textContent = 'שגיאה באיפוס הסיסמה: ' + (e.message || e);
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = 'שמור סיסמה';
        }
    });
}

function showRemoveMemberConfirm(memberUid, memberName) {
    const html = `
        <h2>הסרת ${esc(memberName)}?</h2>
        <p>פעולה זו תסיר את ${esc(memberName)} מהמשפחה. ההשקעות והיעדים שלו/ה יישארו.</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-danger" id="modal-delete">הסר</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-delete').addEventListener('click', async () => {
        try {
            const user = store.get('user');
            await familyService.removeMember(user.familyId, memberUid);
            closeModal();
            emit('toast', { message: memberName + ' הוסר/ה', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה בהסרת חבר/ה', type: 'error' });
            closeModal();
        }
    });
}
