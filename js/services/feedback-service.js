// ============================================================
// Feedback Service — allows users to send feedback to system admin
// ============================================================

import * as store from '../store.js';

let _db = null;

async function db() {
    if (!_db) {
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
        const { getApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
        _db = getFirestore(getApp());
    }
    return _db;
}

export async function sendFeedback({ text, type }) {
    const firestore = await db();
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const user = store.get('user');
    const family = store.get('family');

    await addDoc(collection(firestore, 'feedback'), {
        text,
        type: type || 'other',
        author_name: user.displayName || user.kidName || user.email,
        author_uid: user.uid,
        author_email: user.email,
        familyId: user.familyId || null,
        family_name: family?.family_name || null,
        status: 'new',
        created_at: serverTimestamp(),
        admin_notes: '',
    });
}
