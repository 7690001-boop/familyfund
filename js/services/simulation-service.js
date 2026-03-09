// ============================================================
// Simulation Service — Firestore CRUD for investment simulations
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';

let unsubscribe = null;

export async function listen(familyId) {
    stopListening();

    const { collection, onSnapshot } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    const ref = collection(db, 'families', familyId, 'simulations');

    unsubscribe = onSnapshot(ref, (snapshot) => {
        const simulations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        store.set('simulations', simulations);
    }, (err) => {
        console.error('Simulations listener error:', err);
    });
}

export function stopListening() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    store.set('simulations', []);
}

export async function add(familyId, simulation) {
    const { collection, addDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    const ref = collection(db, 'families', familyId, 'simulations');
    await addDoc(ref, {
        ...simulation,
        created_at: new Date().toISOString(),
    });
}

export async function update(familyId, simulationId, data) {
    const { doc, updateDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'simulations', simulationId), {
        ...data,
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, simulationId) {
    const { doc, deleteDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'simulations', simulationId));
}
