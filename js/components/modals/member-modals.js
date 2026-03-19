// ============================================================
// Member Modals — add/manage/remove/rename family members
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';
import * as familyService from '../../services/family-service.js';
import * as authService from '../../services/auth-service.js';
import { renderAvatar, DEFAULT_AVATAR } from '../ui/avatar.js';
import { showAvatarModal } from './avatar-modal.js';
import t from '../../i18n.js';

export function showAddMemberModal() {
    const user = store.get('user');
    const familyCode = user.familyId;

    const html = `
        <h2>${t.members.addKidTitle}</h2>
        <div class="form-group">
            <label for="member-name">${t.members.displayNameLabel}</label>
            <input type="text" id="member-name" placeholder="${t.members.displayNamePlaceholder}">
        </div>
        <div class="form-group">
            <label for="member-username">${t.members.usernameLabel}</label>
            <input type="text" id="member-username" dir="ltr" placeholder="${t.members.usernamePlaceholder}">
            <div class="form-hint">${t.members.usernameHint}</div>
        </div>
        <div class="form-group">
            <label for="member-password">${t.members.passwordLabel}</label>
            <input type="text" id="member-password" placeholder="${t.common.passwordMin6}">
        </div>
        <div style="background:var(--color-tab-hover);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-top:0.75rem">
            <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.25rem">${t.common.familyCodeHint}</div>
            <div dir="ltr" style="font-family:monospace;font-size:0.9rem;font-weight:600;user-select:all">${esc(familyCode)}</div>
        </div>
        <div id="member-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.members.addBtn}</button>
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
            errorEl.textContent = t.errors.passwordTooShort;
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = t.common.creating;
        errorEl.hidden = true;

        try {
            await familyService.createMemberAccount(username, password, user.familyId, name);
            closeModal();
            emit('toast', { message: t.members.addedSuccess(name), type: 'success' });
        } catch (e) {
            const msg = e.code === 'auth/email-already-in-use' ? t.errors.usernameExists
                : t.errors.createAccountError(e.message);
            errorEl.textContent = msg;
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = t.members.addBtn;
        }
    });
    modal.querySelector('#member-name').focus();
}

export function showAddCoManagerModal() {
    const user = store.get('user');

    const html = `
        <h2>${t.members.addCoManagerTitle}</h2>
        <div class="form-group">
            <label for="comanager-name">${t.members.displayNameLabel}</label>
            <input type="text" id="comanager-name" placeholder="${t.members.coManagerNamePlaceholder}">
        </div>
        <div class="form-group">
            <label for="comanager-email">${t.members.coManagerEmailLabel}</label>
            <input type="email" id="comanager-email" dir="ltr" placeholder="${t.members.coManagerEmailPlaceholder}">
        </div>
        <div class="form-group">
            <label for="comanager-password">${t.members.passwordLabel}</label>
            <input type="text" id="comanager-password" placeholder="${t.common.passwordMin6}">
        </div>
        <div id="comanager-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.members.addCoManagerBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const name = modal.querySelector('#comanager-name').value.trim();
        const email = modal.querySelector('#comanager-email').value.trim();
        const password = modal.querySelector('#comanager-password').value;
        const errorEl = modal.querySelector('#comanager-error');

        if (!name) { modal.querySelector('#comanager-name').focus(); return; }
        if (!email) { modal.querySelector('#comanager-email').focus(); return; }
        if (!password || password.length < 6) {
            errorEl.textContent = t.errors.passwordTooShort;
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = t.common.creating;
        errorEl.hidden = true;

        try {
            await familyService.createCoManagerAccount(email, password, user.familyId, name);
            closeModal();
            emit('toast', { message: t.members.addedAsParent(name), type: 'success' });
        } catch (e) {
            const msg = e.code === 'auth/email-already-in-use' ? t.errors.emailAlreadyInSystem
                : t.errors.createAccountError(e.message);
            errorEl.textContent = msg;
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = t.members.addCoManagerBtn;
        }
    });
    modal.querySelector('#comanager-name').focus();
}

export function showRenameMemberModal(memberUid, currentName) {
    const html = `
        <h2>${t.members.renameTitle}</h2>
        <div class="form-group">
            <label for="rename-input">${t.members.newNameLabel}</label>
            <input type="text" id="rename-input" value="${esc(currentName)}">
        </div>
        <div id="rename-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.common.save}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#rename-input').focus();
    modal.querySelector('#rename-input').select();
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const newName = modal.querySelector('#rename-input').value.trim();
        const errorEl = modal.querySelector('#rename-error');
        if (!newName) { modal.querySelector('#rename-input').focus(); return; }
        if (newName === currentName) { closeModal(); return; }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = t.members.savingName;
        errorEl.hidden = true;

        try {
            await familyService.renameMember(memberUid, newName);
            closeModal();
            emit('toast', { message: t.members.nameUpdated, type: 'success' });
        } catch (e) {
            errorEl.textContent = t.errors.renameError(e.message || e);
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = t.common.save;
        }
    });
}

export function showManageMembersModal() {
    const members = store.get('members') || [];
    const user = store.get('user');
    const familyCode = user.familyId;

    let memberRows = '';
    members.forEach(m => {
        const isMe = m.uid === user.uid;
        const roleLabel = m.role === 'manager' ? t.members.roleParent : t.members.roleKid;
        const identifier = m.username ? t.members.identifierPrefix + m.username : m.email || '';
        const avatarSvg = renderAvatar(m.avatar || DEFAULT_AVATAR, 36);

        let actionBtns = '';
        // Rename — everyone (including self)
        actionBtns += `<button class="btn btn-ghost rename-member-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="${t.members.renameBtn}">✏️</button>`;
        // Avatar — everyone
        actionBtns += `<button class="btn btn-ghost edit-avatar-member-btn" data-name="${esc(m.name)}" title="${t.members.editAvatarBtn}">🎨</button>`;
        // Password reset — only for non-self members (not managers)
        if (!isMe && m.role !== 'manager') {
            actionBtns += `<button class="btn btn-ghost reset-password-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="${t.members.resetPasswordBtn}">🔑</button>`;
        }
        // Remove — only for non-self
        if (!isMe) {
            actionBtns += `<button class="btn btn-ghost danger remove-member-btn" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="${t.members.removeActionBtn}">✕</button>`;
        }

        memberRows += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--color-border)">
                <div style="display:flex;align-items:center;gap:0.6rem">
                    <div class="member-avatar-thumb" data-name="${esc(m.name)}" style="cursor:pointer;border-radius:50%;overflow:hidden;flex-shrink:0">${avatarSvg}</div>
                    <div>
                        <strong>${esc(m.name)}</strong>
                        <span style="color:var(--color-text-muted);font-size:0.85rem"> (${roleLabel}${isMe ? ' - ' + t.common.me : ''})</span>
                        <div style="font-size:0.82rem;color:var(--color-text-muted)">${esc(identifier)}</div>
                    </div>
                </div>
                <div style="display:flex;gap:0.25rem">
                    ${actionBtns}
                </div>
            </div>
        `;
    });

    const html = `
        <h2>${t.members.manageTitle}</h2>
        <div style="background:var(--color-tab-hover);padding:0.75rem 1rem;border-radius:var(--radius-sm);margin-bottom:1rem">
            <div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:0.25rem">${t.common.familyCodeHintKids}</div>
            <div dir="ltr" style="font-family:monospace;font-size:0.9rem;font-weight:600;user-select:all">${esc(familyCode)}</div>
        </div>
        <div style="margin-bottom:1rem">${memberRows}</div>
        <div class="modal-actions">
            <button class="btn btn-primary" id="modal-add-member" style="margin-inline-end:0.5rem">${t.members.addKidBtn}</button>
            <button class="btn btn-primary" id="modal-add-comanager" style="margin-inline-end:auto">${t.members.addParentBtn}</button>
            <button class="btn btn-secondary" id="modal-cancel">${t.common.close}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#modal-add-member').addEventListener('click', () => {
        closeModal();
        showAddMemberModal();
    });
    modal.querySelector('#modal-add-comanager').addEventListener('click', () => {
        closeModal();
        showAddCoManagerModal();
    });

    modal.querySelectorAll('.rename-member-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal();
            showRenameMemberModal(btn.dataset.uid, btn.dataset.name);
        });
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

    modal.querySelectorAll('.edit-avatar-member-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.name;
            const member = members.find(m => m.name === name);
            closeModal();
            showAvatarModal(name, member?.avatar || DEFAULT_AVATAR);
        });
    });

    modal.querySelectorAll('.member-avatar-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
            const name = thumb.dataset.name;
            const member = members.find(m => m.name === name);
            closeModal();
            showAvatarModal(name, member?.avatar || DEFAULT_AVATAR);
        });
    });
}

function showResetPasswordModal(memberUid, memberName) {
    const html = `
        <h2>${t.members.resetPasswordTitle(esc(memberName))}</h2>
        <div class="form-group">
            <label for="new-password">${t.members.newPasswordLabel}</label>
            <input type="text" id="new-password" placeholder="${t.common.passwordMin6}">
        </div>
        <div id="reset-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.members.savePasswordBtn}</button>
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
            errorEl.textContent = t.errors.passwordTooShort;
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = t.common.saving;
        errorEl.hidden = true;

        try {
            await familyService.resetMemberPassword(memberUid, newPassword);
            closeModal();
            emit('toast', { message: t.members.passwordReset(memberName), type: 'success' });
        } catch (e) {
            errorEl.textContent = t.errors.resetPasswordError(e.message || e);
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = t.members.savePasswordBtn;
        }
    });
}

export function showChangeSelfPasswordModal() {
    const html = `
        <h2>${t.members.changePasswordTitle}</h2>
        <div class="form-group">
            <label for="current-password">${t.members.currentPasswordLabel}</label>
            <input type="password" id="current-password" placeholder="${t.members.currentPasswordPlaceholder}" autocomplete="current-password">
        </div>
        <div class="form-group">
            <label for="new-password">${t.members.newPasswordLabel2}</label>
            <input type="password" id="new-password" placeholder="${t.members.newPasswordPlaceholder}" autocomplete="new-password">
        </div>
        <div class="form-group">
            <label for="new-password-confirm">${t.members.confirmPasswordLabel}</label>
            <input type="password" id="new-password-confirm" placeholder="${t.members.confirmPasswordPlaceholder}" autocomplete="new-password">
        </div>
        <div id="change-pw-error" class="auth-error" hidden></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-primary" id="modal-save">${t.members.changePasswordBtn}</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');
    const errorEl = modal.querySelector('#change-pw-error');
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('#current-password').focus();

    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const currentPassword = modal.querySelector('#current-password').value;
        const newPassword = modal.querySelector('#new-password').value;
        const confirmPassword = modal.querySelector('#new-password-confirm').value;

        if (!currentPassword) {
            errorEl.textContent = t.errors.enterCurrentPassword;
            errorEl.hidden = false;
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            errorEl.textContent = t.errors.passwordTooShortNew;
            errorEl.hidden = false;
            return;
        }
        if (newPassword !== confirmPassword) {
            errorEl.textContent = t.errors.passwordMismatch;
            errorEl.hidden = false;
            return;
        }

        const btn = modal.querySelector('#modal-save');
        btn.disabled = true;
        btn.textContent = t.common.saving;
        errorEl.hidden = true;

        try {
            await authService.changePasswordWithVerification(currentPassword, newPassword);
            closeModal();
            emit('toast', { message: t.members.passwordChanged, type: 'success' });
        } catch (e) {
            const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
                ? t.errors.passwordWrongCurrent
                : e.code === 'auth/weak-password' ? t.errors.passwordWeak
                : t.errors.changePasswordError(e.message);
            errorEl.textContent = msg;
            errorEl.hidden = false;
            btn.disabled = false;
            btn.textContent = t.members.changePasswordBtn;
        }
    });
}

function showRemoveMemberConfirm(memberUid, memberName) {
    const html = `
        <h2>${t.members.removeMemberTitle(esc(memberName))}</h2>
        <p>${t.members.removeMemberBody(esc(memberName))}</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${t.common.cancel}</button>
            <button class="btn btn-danger" id="modal-delete">${t.members.removeBtn}</button>
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
            emit('toast', { message: t.members.removed(memberName), type: 'success' });
        } catch (e) {
            emit('toast', { message: t.errors.removeMemberError, type: 'error' });
            closeModal();
        }
    });
}
