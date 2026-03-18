// ============================================================
// Admin Service — system-level queries across all families
// ============================================================

import * as store from '../store.js';

let _db = null;
let _unsubAnnouncements = null;
let _unsubFeedback = null;

async function db() {
    if (!_db) {
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
        const { getApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
        _db = getFirestore(getApp());
    }
    return _db;
}

// ── Families ──────────────────────────────────────────────

export async function loadFamilies() {
    const firestore = await db();
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const snap = await getDocs(collection(firestore, 'families'));
    const families = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort client-side — some docs may not have created_at
    families.sort((a, b) => {
        const ta = a.created_at?.seconds || 0;
        const tb = b.created_at?.seconds || 0;
        return tb - ta;
    });
    store.set('adminFamilies', families);
    return families;
}

export async function loadFamilyMembers(familyId) {
    const firestore = await db();
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const snap = await getDocs(collection(firestore, 'families', familyId, 'members'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Announcements ─────────────────────────────────────────

export async function listenAnnouncements() {
    stopAnnouncements();
    const firestore = await db();
    const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const q = query(collection(firestore, 'announcements'), orderBy('created_at', 'desc'));
    _unsubAnnouncements = onSnapshot(q, snap => {
        store.set('adminAnnouncements', snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

export function stopAnnouncements() {
    if (_unsubAnnouncements) { _unsubAnnouncements(); _unsubAnnouncements = null; }
}

export async function createAnnouncement({ version, title, date, items }) {
    const firestore = await db();
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const user = store.get('user');
    await addDoc(collection(firestore, 'announcements'), {
        version, title, date, items,
        created_by: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
}

export async function updateAnnouncement(id, data) {
    const firestore = await db();
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await updateDoc(doc(firestore, 'announcements', id), {
        ...data,
        updated_at: serverTimestamp(),
    });
}

export async function deleteAnnouncement(id) {
    const firestore = await db();
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await deleteDoc(doc(firestore, 'announcements', id));
}

// ── Feedback ──────────────────────────────────────────────

export async function listenFeedback() {
    stopFeedback();
    const firestore = await db();
    const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const q = query(collection(firestore, 'feedback'), orderBy('created_at', 'desc'));
    _unsubFeedback = onSnapshot(q, snap => {
        store.set('adminFeedback', snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

export function stopFeedback() {
    if (_unsubFeedback) { _unsubFeedback(); _unsubFeedback = null; }
}

export async function updateFeedbackStatus(id, status, adminNotes) {
    const firestore = await db();
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const data = { status, updated_at: serverTimestamp() };
    if (adminNotes !== undefined) data.admin_notes = adminNotes;
    await updateDoc(doc(firestore, 'feedback', id), data);
}

export async function deleteFeedback(id) {
    const firestore = await db();
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await deleteDoc(doc(firestore, 'feedback', id));
}

// ── Stats ─────────────────────────────────────────────────

export async function loadSystemStats() {
    const firestore = await db();
    const { collection, getCountFromServer, query, where } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');

    const [familiesSnap, usersSnap, feedbackSnap] = await Promise.all([
        getCountFromServer(collection(firestore, 'families')),
        getCountFromServer(collection(firestore, 'users')),
        getCountFromServer(query(collection(firestore, 'feedback'), where('status', '==', 'new'))),
    ]);

    return {
        familyCount: familiesSnap.data().count,
        userCount: usersSnap.data().count,
        pendingFeedback: feedbackSnap.data().count,
    };
}

// ── Cleanup ───────────────────────────────────────────────

export function stopAll() {
    stopAnnouncements();
    stopFeedback();
}
