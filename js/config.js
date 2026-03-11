// ============================================================
// Firebase Configuration
// ============================================================

export const firebaseConfig = {
    apiKey: "AIzaSyD4bIYfnx3Qg7gqDmlboShFjL-Tql65SUQ",
    authDomain: "savings-16206.firebaseapp.com",
    projectId: "savings-16206",
    storageBucket: "savings-16206.firebasestorage.app",
    messagingSenderId: "650022015240",
    appId: "1:650022015240:web:0ae07d907a695ce3d19cbd"
};

// Firebase CDN ESM URLs (v10.14.1)
export const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.14.1';

// Yahoo Finance — routed through Cloudflare Worker proxy to avoid CORS
// After deploying cloudflare-worker/worker.js, replace the URL below with your worker URL
// e.g. https://yahoo-proxy.YOUR-NAME.workers.dev
export const YAHOO_PROXY      = 'https://yahoo-proxy.7690001.workers.dev';
export const WORKER_LOGIN_URL = YAHOO_PROXY + '/login';
export const YAHOO_CHART_URL  = YAHOO_PROXY + '/chart';
export const YAHOO_SEARCH_URL = YAHOO_PROXY + '/search';

// Globes API — Israeli mutual funds not available on Yahoo Finance
export const GLOBES_PRICE_URL   = YAHOO_PROXY + '/globes/price';
export const GLOBES_SEARCH_URL  = YAHOO_PROXY + '/globes/search';
export const GLOBES_HISTORY_URL = YAHOO_PROXY + '/globes/history';
