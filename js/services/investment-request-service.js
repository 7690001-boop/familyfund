// ============================================================
// Investment Request Service — Firestore CRUD for buy/sell requests
// Kids submit requests; managers approve or reject them.
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';

let unsubscribe = null;
let _fs = null;

async function fs() {
    if (!_fs) _fs = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    return _fs;
}

export async function listen(familyId) {
    stopListening();
    const { collection, onSnapshot, query, orderBy } = await fs();
    const db = getAppDb();
    const ref = query(
        collection(db, 'families', familyId, 'investmentRequests'),
        orderBy('created_at', 'desc')
    );
    unsubscribe = onSnapshot(ref, (snapshot) => {
        const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        store.set('investmentRequests', requests);
    }, (err) => {
        console.error('Investment requests listener error:', err);
    });
}

export function stopListening() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    store.set('investmentRequests', []);
}

export async function add(familyId, request) {
    const { collection, addDoc } = await fs();
    const db = getAppDb();
    await addDoc(collection(db, 'families', familyId, 'investmentRequests'), {
        ...request,
        status: 'pending',
        created_at: new Date().toISOString(),
    });
}

export async function approve(familyId, requestId) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'investmentRequests', requestId), {
        status: 'approved',
        updated_at: new Date().toISOString(),
    });
}

export async function reject(familyId, requestId) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'investmentRequests', requestId), {
        status: 'rejected',
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, requestId) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'investmentRequests', requestId));
}
