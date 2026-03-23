// ============================================================
// Bills Service — CRUD for family recurring bills/expenses
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
        collection(db, 'families', familyId, 'bills'),
        orderBy('created_at', 'asc')
    );
    _unsub = onSnapshot(q, (snap) => {
        store.set('bills', snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
        console.error('Bills listener error:', err);
    });
}

export function stopListening() {
    if (_unsub) { _unsub(); _unsub = null; }
}

export async function add(familyId, bill) {
    const { collection, addDoc } = await fs();
    const db = getAppDb();
    await addDoc(collection(db, 'families', familyId, 'bills'), {
        ...bill,
        active: bill.active !== false,
        created_at: new Date().toISOString(),
    });
}

export async function update(familyId, id, bill) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'bills', id), {
        ...bill,
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, id) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'bills', id));
}
