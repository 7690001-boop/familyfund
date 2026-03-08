// ============================================================
// Auth Service — Firebase Auth operations
// Supports email login (manager) and username login (members)
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppAuth, getAppDb } from '../firebase-init.js';
import * as store from '../store.js';
import { emit } from '../event-bus.js';

let unsubAuth = null;

// Synthetic email domain for username-based member accounts.
// Kids log in with just a username — we convert it to a fake email
// under the hood so Firebase Auth can handle it.
const SYNTHETIC_DOMAIN = 'member.saveing.local';

/**
 * Convert a kid username + familyId to a synthetic email.
 *   "daniel" + familyId "abc123" → "daniel__abc123@member.saveing.local"
 */
export function usernameToEmail(username, familyId) {
    const safeUser = username.toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]/g, '_');
    const safeFam = familyId.replace(/[^a-zA-Z0-9]/g, '_');
    return `${safeUser}__${safeFam}@${SYNTHETIC_DOMAIN}`;
}

export function isSyntheticEmail(email) {
    return email && email.endsWith('@' + SYNTHETIC_DOMAIN);
}

export async function init() {
    const { onAuthStateChanged } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const auth = getAppAuth();

    unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
            await loadUserProfile(firebaseUser);
        } else {
            store.set('user', null);
        }
    });
}

async function loadUserProfile(firebaseUser) {
    const { doc, getDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();

    try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            store.set('user', {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: data.displayName || data.kidName || firebaseUser.email,
                role: data.role,
                familyId: data.familyId || null,
                kidName: data.kidName || null,
                username: data.username || null,
            });
        } else {
            // User exists in Auth but has no profile — needs setup
            store.set('user', {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.email,
                role: null,
                familyId: null,
                kidName: null,
                username: null,
            });
        }
    } catch (e) {
        console.error('Failed to load user profile:', e);
        emit('toast', { message: 'שגיאה בטעינת פרופיל משתמש', type: 'error' });
    }
}

// Manager login — with real email
export async function login(email, password) {
    const { signInWithEmailAndPassword } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const auth = getAppAuth();
    return signInWithEmailAndPassword(auth, email, password);
}

// Member login — with username (converted to synthetic email internally)
export async function loginWithUsername(username, password, familyId) {
    const syntheticEmail = usernameToEmail(username, familyId);
    return login(syntheticEmail, password);
}

// Check if a family exists by its ID (used during kid login to validate family code)
export async function lookupFamilyId(familyCode) {
    const { doc, getDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    const famDoc = await getDoc(doc(db, 'families', familyCode));
    if (famDoc.exists()) return familyCode;
    return null;
}

// Look up a member's familyId by their username (no auth required — uses public usernames collection)
export async function lookupFamilyIdByUsername(username) {
    const { doc, getDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
    if (snap.exists()) return snap.data().familyId;
    return null;
}

export async function signup(email, password) {
    const { createUserWithEmailAndPassword } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const auth = getAppAuth();
    return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
    const { signOut } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const auth = getAppAuth();
    await signOut(auth);
    store.set('user', null);
    store.set('family', null);
    store.set('members', []);
    store.set('investments', []);
    store.set('goals', []);
}

export async function createUserProfile(uid, profileData) {
    const { doc, setDoc } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    const db = getAppDb();
    await setDoc(doc(db, 'users', uid), {
        ...profileData,
        created_at: new Date().toISOString(),
    });
}

export async function changePassword(newPassword) {
    const { updatePassword } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const auth = getAppAuth();
    if (!auth.currentUser) throw new Error('No authenticated user');
    await updatePassword(auth.currentUser, newPassword);
}

export function destroy() {
    if (unsubAuth) {
        unsubAuth();
        unsubAuth = null;
    }
}
