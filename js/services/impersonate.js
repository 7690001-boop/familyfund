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

export function switchToMember(kidName) {
    const user = store.get('user');
    if (!user || user.role !== 'manager') return;

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
