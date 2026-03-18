// ============================================================
// Impersonate — lets a manager view the app as a member
// Stores the original parent user and swaps store.user
// ============================================================

import * as store from '../store.js';

let _parentUser = null;

export function isImpersonating() {
    return _parentUser !== null;
}

export function getParentUser() {
    return _parentUser;
}

export function clearImpersonation() {
    _parentUser = null;
}

export function switchToMember(kidName) {
    const user = store.get('user');
    if (!user || user.role !== 'manager') return;

    // Validate kidName belongs to current family
    const members = store.get('members') || [];
    if (!members.some(m => m.name === kidName || m.kidName === kidName)) return;

    _parentUser = { ...user };

    store.set('user', {
        ...user,
        role: 'member',
        kidName,
        displayName: kidName,
        _impersonating: true,
    });
}

export function switchBack() {
    if (!_parentUser) return;
    const parent = { ..._parentUser };
    _parentUser = null;
    store.set('user', parent);
}
