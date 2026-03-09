// ============================================================
// Family Service — Firestore CRUD for family config + members
// ============================================================

import { FIREBASE_CDN, firebaseConfig, YAHOO_PROXY } from '../config.js';
import { getAppDb, getApp } from '../firebase-init.js';
import * as store from '../store.js';
import { emit } from '../event-bus.js';

let unsubFamily = null;
let unsubMembers = null;

export async function listen(familyId) {
    stopListening();

    const { doc, collection, onSnapshot } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();

    // Listen to family doc
    unsubFamily = onSnapshot(doc(db, 'families', familyId), (snap) => {
        if (snap.exists()) {
            store.set('family', { id: snap.id, ...snap.data() });
        }
    }, (err) => {
        console.error('Family listener error:', err);
        emit('toast', { message: 'שגיאה בטעינת נתוני משפחה', type: 'error' });
    });

    // Listen to members
    unsubMembers = onSnapshot(collection(db, 'families', familyId, 'members'), async (snap) => {
        const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        store.set('members', members);

        // Derive kids list from members with role 'member'
        const kids = members.filter(m => m.role === 'member').map(m => m.name);
        store.set('kids', kids);

        // Backfill usernames lookup docs for any members that predate this feature
        const { getDoc, setDoc: setDocFn } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
        for (const member of members) {
            if (!member.username || member.role !== 'member') continue;
            const key = member.username.toLowerCase();
            const existing = await getDoc(doc(db, 'usernames', key));
            if (!existing.exists()) {
                await setDocFn(doc(db, 'usernames', key), { familyId, uid: member.uid || member.id });
            }
        }
    }, (err) => {
        console.error('Members listener error:', err);
    });
}

export function stopListening() {
    if (unsubFamily) { unsubFamily(); unsubFamily = null; }
    if (unsubMembers) { unsubMembers(); unsubMembers = null; }
}

export async function createFamily(familyData, managerUid) {
    const { doc, setDoc, collection: col } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();

    const familyId = managerUid; // Use manager UID as family ID for simplicity
    await setDoc(doc(db, 'families', familyId), {
        ...familyData,
        created_by: managerUid,
        created_at: new Date().toISOString(),
    });

    return familyId;
}

export async function updateFamily(familyId, updates) {
    const { doc, updateDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId), {
        ...updates,
        updated_at: new Date().toISOString(),
    });
}

export async function addMember(familyId, memberData) {
    const { doc, setDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await setDoc(doc(db, 'families', familyId, 'members', memberData.uid), memberData);
}

export async function updateMember(familyId, memberUid, updates) {
    const { doc, updateDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'members', memberUid), {
        ...updates,
        updated_at: new Date().toISOString(),
    });
}

export async function removeMember(familyId, memberUid) {
    const { doc, deleteDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'members', memberUid));
}

// Create a Firebase Auth account for a member using secondary app.
// Uses username-based auth: username is converted to a synthetic email.
export async function createMemberAccount(username, password, familyId, displayName) {
    const { initializeApp, deleteApp } = await import(`${FIREBASE_CDN}/firebase-app.js`);
    const { getAuth, createUserWithEmailAndPassword, signOut } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const { doc, setDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const { usernameToEmail } = await import('./auth-service.js');
    const db = getAppDb();

    const syntheticEmail = usernameToEmail(username, familyId);

    // Create secondary app to avoid signing out the manager
    const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, syntheticEmail, password);
        const newUid = cred.user.uid;

        // Write username lookup doc (publicly readable — allows login without family code)
        await setDoc(doc(db, 'usernames', username.toLowerCase()), {
            familyId,
            uid: newUid,
        });

        // Write user profile
        await setDoc(doc(db, 'users', newUid), {
            email: syntheticEmail,
            username,
            displayName,
            role: 'member',
            familyId,
            kidName: displayName,
            created_at: new Date().toISOString(),
        });

        // Write member doc under family
        await setDoc(doc(db, 'families', familyId, 'members', newUid), {
            name: displayName,
            username,
            email: syntheticEmail,
            role: 'member',
            uid: newUid,
            created_at: new Date().toISOString(),
        });

        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);

        return newUid;
    } catch (e) {
        // Clean up secondary app on error
        try { await signOut(secondaryAuth); } catch (_) {}
        try { await deleteApp(secondaryApp); } catch (_) {}
        throw e;
    }
}

// Reset a member's password — calls the Cloudflare Worker with the manager's ID token.
export async function resetMemberPassword(memberUid, newPassword) {
    const { getAppAuth } = await import('../firebase-init.js');
    const idToken = await getAppAuth().currentUser.getIdToken();

    const res = await fetch(`${YAHOO_PROXY}/reset-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ memberUid, newPassword }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to reset password');
    }
}
