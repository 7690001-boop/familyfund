// ============================================================
// Investment Service — Firestore CRUD for investments
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
    const ref = collection(db, 'families', familyId, 'investments');

    unsubscribe = onSnapshot(ref, (snapshot) => {
        const investments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        store.set('investments', investments);
    }, (err) => {
        console.error('Investments listener error:', err);
    });
}

export function stopListening() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    store.set('investments', []);
}

export async function add(familyId, investment) {
    const { collection, addDoc } = await fs();
    const db = getAppDb();
    const ref = collection(db, 'families', familyId, 'investments');
    await addDoc(ref, {
        ...investment,
        created_at: new Date().toISOString(),
    });
}

export async function update(familyId, investmentId, data) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'investments', investmentId), {
        ...data,
        updated_at: new Date().toISOString(),
    });
}

export async function remove(familyId, investmentId) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'investments', investmentId));
}

// Batch update prices (and optionally currencies) for all investments with matching tickers
export async function updatePrices(familyId, priceMap, currencyMap) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    const investments = store.get('investments') || [];

    const updates = investments
        .filter(inv => {
            if (!inv.ticker || !priceMap.has(inv.ticker.trim())) return false;
            const ticker = inv.ticker.trim();
            const newPrice = priceMap.get(ticker);
            const newCurrency = currencyMap?.get(ticker);
            // Skip write if price and currency haven't changed
            if (inv.current_price === newPrice && (!newCurrency || inv.currency === newCurrency)) return false;
            return true;
        })
        .map(inv => {
            const ticker = inv.ticker.trim();
            const data = { current_price: priceMap.get(ticker), updated_at: new Date().toISOString() };
            if (currencyMap && currencyMap.has(ticker)) {
                data.currency = currencyMap.get(ticker);
            }
            return updateDoc(doc(db, 'families', familyId, 'investments', inv.id), data);
        });

    await Promise.all(updates);
}
