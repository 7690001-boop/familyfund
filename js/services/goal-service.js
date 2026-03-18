// ============================================================
// Goal Service — Firestore CRUD for savings goals
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

    const { collection, onSnapshot } = await fs();
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
    const { collection, addDoc, getDocs, query, where } = await fs();
    const db = getAppDb();
    const ref = collection(db, 'families', familyId, 'goals');

    // Assign priority = next available for this kid
    const q = query(ref, where('kid', '==', goal.kid));
    const snap = await getDocs(q);
    const maxPri = snap.docs.reduce((max, d) => Math.max(max, d.data().priority ?? 0), 0);

    await addDoc(ref, {
        ...goal,
        priority: maxPri + 1,
        created_at: new Date().toISOString(),
    });
}

export async function update(familyId, goalId, data) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'goals', goalId), {
        ...data,
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, goalId) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'goals', goalId));
}

/**
 * Swap priority of goalId with the one above or below it.
 * @param {'up'|'down'} direction
 */
export async function reorder(familyId, goalId, direction, kidGoals) {
    const sorted = [...kidGoals].sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
    const idx = sorted.findIndex(g => g.id === goalId);
    if (idx < 0) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const { doc, updateDoc } = await fs();
    const db = getAppDb();

    const a = sorted[idx];
    const b = sorted[swapIdx];
    const priA = a.priority ?? idx;
    const priB = b.priority ?? swapIdx;

    await Promise.all([
        updateDoc(doc(db, 'families', familyId, 'goals', a.id), { priority: priB }),
        updateDoc(doc(db, 'families', familyId, 'goals', b.id), { priority: priA }),
    ]);
}
