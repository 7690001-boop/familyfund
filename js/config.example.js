// ============================================================
// Firebase Configuration — copy this file to config.js and fill in your values
// Get these from Firebase Console → Project Settings → Your apps → Web app
// ============================================================

export const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase CDN ESM URLs (v10.14.1)
export const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.14.1';

// Yahoo Finance — routed through Cloudflare Worker proxy to avoid CORS
// After deploying cloudflare-worker/worker.js, replace the URL below with your worker URL
// e.g. https://yahoo-proxy.YOUR-NAME.workers.dev
export const YAHOO_PROXY = 'https://yahoo-proxy.YOUR-NAME.workers.dev';
export const YAHOO_CHART_URL  = YAHOO_PROXY + '/chart';
export const YAHOO_SEARCH_URL = YAHOO_PROXY + '/search';
