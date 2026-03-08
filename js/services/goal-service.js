// ============================================================
// Goal Service — Firestore CRUD for savings goals
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';

let unsubscribe = null;

export async function listen(familyId) {
    stopListening();

    const { collection, onSnapshot } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    const ref = collection(db, 'families', familyId, 'goals');

    unsubscribe = onSnapshot(ref, (snapshot) => {
        const goals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        store.set('goals', goals);
    }, (err) => {
        console.error('Goals listener error:', err);
    });
}

export function stopListening() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    store.set('goals', []);
}

export async function add(familyId, goal) {
    const { collection, addDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    const ref = collection(db, 'families', familyId, 'goals');
    await addDoc(ref, {
        ...goal,
        created_at: new Date().toISOString(),
    });
}

export async function update(familyId, goalId, data) {
    const { doc, updateDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'goals', goalId), {
        ...data,
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, goalId) {
    const { doc, deleteDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'goals', goalId));
}
