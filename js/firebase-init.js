// ============================================================
// Firebase Initialization
// Imports Firebase SDK from CDN and exports app/auth/db instances
// ============================================================

import { firebaseConfig, FIREBASE_CDN } from './config.js';

let app, auth, db;
let initialized = false;

export async function init() {
    if (initialized) return;

    const { initializeApp } = await import(`${FIREBASE_CDN}/firebase-app.js`);
    const { getAuth } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
    const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    // Initialize Firestore with persistent cache (v10+ API)
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
    } catch (e) {
        const { getFirestore } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
        db = getFirestore(app);
        console.warn('Firestore persistence not available:', e.message);
    }

    // Set Hebrew locale for auth
    auth.languageCode = 'he';

    initialized = true;
}

export function getAppAuth() {
    return auth;
}

export function getAppDb() {
    return db;
}

export function getApp() {
    return app;
}
