// ============================================================
// Family Announcement Service — CRUD for family announcements
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';

let _unsub = null;
let _fs = null;

async function fs() {
    if (!_fs) _fs = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    return _fs;
}

export async function listen(familyId) {
    stopListening();
    const { collection, onSnapshot, orderBy, query } = await fs();
    const db = getAppDb();
    const q = query(
        collection(db, 'families', familyId, 'announcements'),
        orderBy('created_at', 'desc')
    );
    _unsub = onSnapshot(q, (snap) => {
        store.set('familyAnnouncements', snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
        console.error('Family announcements listener error:', err);
    });
}

export function stopListening() {
    if (_unsub) { _unsub(); _unsub = null; }
}

export async function add(familyId, { title, text }) {
    const { collection, addDoc } = await fs();
    const db = getAppDb();
    await addDoc(collection(db, 'families', familyId, 'announcements'), {
        title: title || '',
        text,
        created_at: new Date().toISOString(),
    });
}

export async function update(familyId, id, { title, text }) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'announcements', id), {
        title: title || '',
        text,
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, id) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'announcements', id));
}
