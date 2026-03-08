// Yahoo Finance CORS proxy + Firebase admin operations — Cloudflare Worker
// Routes handled:
//   GET  /search?q=VOO&quotesCount=8&newsCount=0&listsCount=0
//   GET  /chart/AAPL?interval=1d&range=1d
//   GET  /chart/AAPL?period1=...&period2=...&interval=1d
//   POST /reset-password   { memberUid, newPassword }  Authorization: Bearer <idToken>
//
// Required Cloudflare secrets (set via: wrangler secret put NAME):
//   FIREBASE_SA_EMAIL       — service account email
//   FIREBASE_SA_PRIVATE_KEY — service account private key (PEM, with literal \n)
//   FIREBASE_API_KEY        — Firebase Web API key
//   FIREBASE_PROJECT_ID     — Firebase project ID
//   ALLOWED_ORIGIN          — allowed CORS origin (e.g. https://your-app.web.app)
//
// View live logs: wrangler tail

const YAHOO_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const YAHOO_CHART  = 'https://query2.finance.yahoo.com/v8/finance/chart';

const YAHOO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '(no origin)';
        const method = request.method;
        const allowedOrigin = env.ALLOWED_ORIGIN || '';

        console.log(`[${method}] ${url.pathname}${url.search} | origin: ${origin}`);

        // CORS preflight
        if (method === 'OPTIONS') {
            console.log('→ preflight OK');
            return corsResponse(null, 204, origin, allowedOrigin);
        }

        // Password reset — POST only
        if (url.pathname === '/reset-password') {
            if (method !== 'POST') return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin, allowedOrigin);
            return handleResetPassword(request, env, origin, allowedOrigin);
        }

        let upstreamUrl;

        if (url.pathname === '/search') {
            upstreamUrl = `${YAHOO_SEARCH}?${url.searchParams}`;
        } else if (url.pathname.startsWith('/chart/')) {
            // url.pathname keeps percent-encoding as-is (e.g. 'ILS%3DX').
            // Decode it so we get the real ticker string (e.g. 'ILS=X'),
            // then pass it directly — '=' is valid in URL paths and Yahoo requires it literal.
            const ticker = decodeURIComponent(url.pathname.slice('/chart/'.length));
            upstreamUrl = `${YAHOO_CHART}/${ticker}?${url.searchParams}`;
        } else {
            console.log(`→ 404 unknown path: ${url.pathname}`);
            return corsResponse(JSON.stringify({ error: 'Not found' }), 404, origin, allowedOrigin);
        }

        console.log(`→ upstream: ${upstreamUrl}`);

        try {
            const upstream = await fetch(upstreamUrl, { headers: YAHOO_HEADERS });
            const data = await upstream.text();
            console.log(`→ yahoo status: ${upstream.status} | response length: ${data.length}`);
            if (upstream.status !== 200) {
                console.log(`→ yahoo body: ${data.slice(0, 500)}`);
            }
            return corsResponse(data, upstream.status, origin, allowedOrigin, 'application/json');
        } catch (e) {
            console.log(`→ fetch error: ${e.message}`);
            return corsResponse(JSON.stringify({ error: e.message }), 502, origin, allowedOrigin);
        }
    },
};

// ─── Password Reset Handler ───────────────────────────────────────────────────

async function handleResetPassword(request, env, origin, allowedOrigin) {
    // 1. Extract ID token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return corsResponse(JSON.stringify({ error: 'Unauthorized' }), 401, origin, allowedOrigin);
    }
    const idToken = authHeader.slice(7);

    // 2. Parse body
    let body;
    try { body = await request.json(); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, origin, allowedOrigin); }

    const { memberUid, newPassword } = body;
    if (!memberUid || typeof newPassword !== 'string' || newPassword.length < 6) {
        return corsResponse(JSON.stringify({ error: 'memberUid and newPassword (min 6) required' }), 400, origin, allowedOrigin);
    }

    // 3. Verify ID token → get caller UID
    const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!lookupRes.ok) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401, origin, allowedOrigin);
    const lookupData = await lookupRes.json();
    const callerUid = lookupData.users?.[0]?.localId;
    if (!callerUid) return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401, origin, allowedOrigin);

    // 4. Get service account access token
    let accessToken;
    try { accessToken = await getServiceAccountToken(env); }
    catch (e) {
        console.error('SA token error:', e.message);
        return corsResponse(JSON.stringify({ error: 'Server config error — secrets not set' }), 500, origin, allowedOrigin);
    }

    // 5. Verify caller is a manager
    const callerDoc = await fetchFirestoreDoc(accessToken, env.FIREBASE_PROJECT_ID, 'users', callerUid);
    if (callerDoc?.role !== 'manager') {
        return corsResponse(JSON.stringify({ error: 'Permission denied: not a manager' }), 403, origin, allowedOrigin);
    }

    // 6. Verify target belongs to same family and is not a manager
    const memberDoc = await fetchFirestoreDoc(accessToken, env.FIREBASE_PROJECT_ID, 'users', memberUid);
    if (!memberDoc || memberDoc.familyId !== callerDoc.familyId || memberDoc.role === 'manager') {
        return corsResponse(JSON.stringify({ error: 'Permission denied: invalid target' }), 403, origin, allowedOrigin);
    }

    // 7. Reset password via Identity Toolkit Admin API
    const updateRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ localId: memberUid, password: newPassword }),
        }
    );
    if (!updateRes.ok) {
        const err = await updateRes.text();
        console.error('Identity Toolkit error:', err);
        return corsResponse(JSON.stringify({ error: 'Failed to update password' }), 500, origin, allowedOrigin);
    }

    console.log(`→ password reset OK for ${memberUid} by ${callerUid}`);
    return corsResponse(JSON.stringify({ success: true }), 200, origin, allowedOrigin);
}

// ─── Firestore REST helper ────────────────────────────────────────────────────

async function fetchFirestoreDoc(accessToken, projectId, collection, docId) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return parseFirestoreFields(data.fields);
}

function parseFirestoreFields(fields) {
    if (!fields) return null;
    const result = {};
    for (const [key, val] of Object.entries(fields)) {
        if ('stringValue'  in val) result[key] = val.stringValue;
        else if ('booleanValue' in val) result[key] = val.booleanValue;
        else if ('integerValue' in val) result[key] = parseInt(val.integerValue);
        else if ('doubleValue'  in val) result[key] = val.doubleValue;
        else result[key] = null;
    }
    return result;
}

// ─── Service Account JWT → OAuth2 token ──────────────────────────────────────

async function getServiceAccountToken(env) {
    const now = Math.floor(Date.now() / 1000);

    const b64url = (obj) =>
        btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const toSign = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
        iss: env.FIREBASE_SA_EMAIL,
        sub: env.FIREBASE_SA_EMAIL,
        aud: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        iat: now,
        exp: now + 3600,
    })}`;

    const pem = env.FIREBASE_SA_PRIVATE_KEY.replace(/\\n/g, '\n');
    const pemContent = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    const keyBytes = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyBytes.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(toSign));
    const encodedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${encodedSig}`,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));
    return tokenData.access_token;
}

// ─── CORS helper ──────────────────────────────────────────────────────────────

function corsResponse(body, status, origin, allowedOrigin, contentType = 'application/json') {
    const allowed = origin === allowedOrigin
        || origin === 'http://localhost'
        || origin.startsWith('http://localhost:')
        || origin.startsWith('http://127.0.0.1');

    console.log(`→ CORS: origin="${origin}" allowed=${allowed}`);

    return new Response(body, {
        status,
        headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': allowed ? origin : allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
