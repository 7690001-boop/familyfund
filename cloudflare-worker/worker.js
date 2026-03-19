// Yahoo Finance CORS proxy + Firebase admin operations — Cloudflare Worker
// Routes handled:
//   GET  /search?q=VOO&quotesCount=8&newsCount=0&listsCount=0
//   GET  /chart/AAPL?interval=1d&range=1d
//   GET  /chart/AAPL?period1=...&period2=...&interval=1d
//   GET  /globes/price?symbol=5137690          — Israeli mutual fund price via Globes API
//   GET  /globes/search?q=מיטב                — search Israeli funds by name/number
//   GET  /globes/history?symbol=5137690&date=2025-03-06 — historical NAV
//   POST /login             { email, password }                         — rate-limited auth proxy (managers)
//   POST /member-login      { username, password }                      — server-side username lookup + dual rate limiting (members)
//   POST /reset-password   { memberUid, newPassword }  Authorization: Bearer <idToken>
//
// Required Cloudflare secrets (set via: wrangler secret put NAME):
//   FIREBASE_SA_EMAIL       — service account email
//   FIREBASE_SA_PRIVATE_KEY — service account private key (PEM, with literal \n)
//   FIREBASE_API_KEY        — Firebase Web API key
//   FIREBASE_PROJECT_ID     — Firebase project ID
//   ALLOWED_ORIGIN          — allowed CORS origin (e.g. https://your-app.web.app)
//
// Required KV namespace binding (wrangler.toml):
//   RATE_LIMIT              — KV namespace for brute-force rate limiting
//
// View live logs: wrangler tail

const YAHOO_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const YAHOO_CHART  = 'https://query2.finance.yahoo.com/v8/finance/chart';
const GLOBES_API   = 'https://gnet.globes.co.il/data/webservices/financial.asmx';

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

        // Login — POST only (rate-limited)
        if (url.pathname === '/login') {
            if (method !== 'POST') return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin, allowedOrigin);
            return handleLogin(request, env, origin, allowedOrigin);
        }

        // Member login — POST only (server-side username lookup + dual rate limiting)
        if (url.pathname === '/member-login') {
            if (method !== 'POST') return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin, allowedOrigin);
            return handleMemberLogin(request, env, origin, allowedOrigin);
        }

        // Password reset — POST only
        if (url.pathname === '/reset-password') {
            if (method !== 'POST') return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin, allowedOrigin);
            return handleResetPassword(request, env, origin, allowedOrigin);
        }

        // Member rename — POST only
        if (url.pathname === '/rename-member') {
            if (method !== 'POST') return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin, allowedOrigin);
            return handleRenameMember(request, env, origin, allowedOrigin);
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
        } else if (url.pathname === '/globes/price') {
            return handleGlobesPrice(url, origin, allowedOrigin);
        } else if (url.pathname === '/globes/search') {
            return handleGlobesSearch(url, origin, allowedOrigin);
        } else if (url.pathname === '/globes/history') {
            return handleGlobesHistory(url, origin, allowedOrigin);
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

// ─── Globes API Handlers (Israeli mutual funds) ──────────────────────────────

function xmlText(xml, tag) {
    const re = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const m = xml.match(re);
    return m ? m[1].trim() : null;
}

function parseGlobesInstrument(xml) {
    const price = parseFloat(xmlText(xml, 'last'));
    const name = xmlText(xml, 'name') || xmlText(xml, 'name_en') || '';
    const symbol = xmlText(xml, 'symbol') || '';
    const instrumentId = xmlText(xml, 'id') || '';
    const currency = xmlText(xml, 'currency') || 'ILS';
    const change = parseFloat(xmlText(xml, 'change')) || 0;
    const changePercent = parseFloat(xmlText(xml, 'change_p')) || 0;

    if (isNaN(price)) return null;
    return { price, name, symbol, instrumentId, currency, change, changePercent };
}

async function handleGlobesPrice(url, origin, allowedOrigin) {
    const symbol = url.searchParams.get('symbol');
    if (!symbol) {
        return corsResponse(JSON.stringify({ error: 'symbol parameter required' }), 400, origin, allowedOrigin);
    }

    const apiUrl = `${GLOBES_API}/listBySymbol?exchange=TASE&symbols=${encodeURIComponent(symbol)}`;
    console.log(`→ globes price: ${apiUrl}`);

    try {
        const resp = await fetch(apiUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const xml = await resp.text();
        const data = parseGlobesInstrument(xml);
        if (!data) throw new Error('No price data in response');

        console.log(`→ globes price OK: ${symbol} = ${data.price} ${data.currency}`);
        return corsResponse(JSON.stringify(data), 200, origin, allowedOrigin);
    } catch (e) {
        console.log(`→ globes price error: ${e.message}`);
        return corsResponse(JSON.stringify({ error: e.message }), 502, origin, allowedOrigin);
    }
}

async function handleGlobesSearch(url, origin, allowedOrigin) {
    const query = url.searchParams.get('q');
    if (!query) {
        return corsResponse(JSON.stringify({ error: 'q parameter required' }), 400, origin, allowedOrigin);
    }

    // Try listBySymbol first (exact fund number match)
    const apiUrl = `${GLOBES_API}/listBySymbol?exchange=TASE&symbols=${encodeURIComponent(query)}`;
    console.log(`→ globes search: ${apiUrl}`);

    try {
        const resp = await fetch(apiUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const xml = await resp.text();
        const data = parseGlobesInstrument(xml);

        const results = data ? [{ symbol: data.symbol, name: data.name, exchange: 'TASE', type: 'MUTUALFUND', source: 'globes' }] : [];
        console.log(`→ globes search OK: ${results.length} results`);
        return corsResponse(JSON.stringify({ quotes: results }), 200, origin, allowedOrigin);
    } catch (e) {
        console.log(`→ globes search error: ${e.message}`);
        return corsResponse(JSON.stringify({ quotes: [] }), 200, origin, allowedOrigin);
    }
}

async function handleGlobesHistory(url, origin, allowedOrigin) {
    const symbol = url.searchParams.get('symbol');
    const date = url.searchParams.get('date'); // YYYY-MM-DD
    if (!symbol || !date) {
        return corsResponse(JSON.stringify({ error: 'symbol and date parameters required' }), 400, origin, allowedOrigin);
    }

    // Convert YYYY-MM-DD to yyyymmdd
    const dateStr = date.replace(/-/g, '');
    const apiUrl = `${GLOBES_API}/GetYieldBetweenDatesBySymbol?exchange=TASE&symbol=${encodeURIComponent(symbol)}&since=${dateStr}&until=${dateStr}`;
    console.log(`→ globes history: ${apiUrl}`);

    try {
        const resp = await fetch(apiUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const xml = await resp.text();

        const price = parseFloat(xmlText(xml, 'until_close_price'));
        if (isNaN(price)) throw new Error('No historical price data');

        console.log(`→ globes history OK: ${symbol} @ ${date} = ${price}`);
        return corsResponse(JSON.stringify({ price, currency: 'ILS', date }), 200, origin, allowedOrigin);
    } catch (e) {
        console.log(`→ globes history error: ${e.message}`);
        return corsResponse(JSON.stringify({ error: e.message }), 502, origin, allowedOrigin);
    }
}

// ─── Login Handler with Brute-Force Rate Limiting ────────────────────────────
//
// Tracks failed attempts per IP in KV.
// After MAX_ATTEMPTS failures the IP is locked with exponential backoff:
//   attempt 11 → 1 min, 12 → 2 min, 13 → 4 min … capped at 30 min.
// A successful login resets the counter.

const MAX_ATTEMPTS  = 10;
const MAX_BACKOFF_S = 30 * 60; // 30 minutes

function calcBackoffSeconds(failCount) {
    if (failCount <= MAX_ATTEMPTS) return 0;
    const extra = failCount - MAX_ATTEMPTS; // 1, 2, 3 …
    return Math.min(Math.pow(2, extra - 1) * 60, MAX_BACKOFF_S);
}

async function handleLogin(request, env, origin, allowedOrigin) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = `rl:${ip}`;

    // ── Rate-limit check ──
    if (env.RATE_LIMIT) {
        const rlData = await env.RATE_LIMIT.get(rlKey, 'json') || { failCount: 0, lockedUntil: 0 };
        const nowMs = Date.now();

        if (rlData.lockedUntil > nowMs) {
            const retryAfter = Math.ceil((rlData.lockedUntil - nowMs) / 1000);
            console.log(`→ login blocked: ip=${ip}, retryAfter=${retryAfter}s`);
            return new Response(
                JSON.stringify({ error: 'Too many attempts', retryAfter }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(retryAfter),
                        ...corsHeaders(origin, allowedOrigin),
                    },
                }
            );
        }
    } else {
        console.warn('→ RATE_LIMIT KV not configured — brute-force protection disabled');
    }

    // ── Parse body ──
    let body;
    try { body = await request.json(); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, origin, allowedOrigin); }

    const { email, password } = body;
    if (!email || !password) {
        return corsResponse(JSON.stringify({ error: 'email and password required' }), 400, origin, allowedOrigin);
    }

    // ── Call Firebase Auth REST API ──
    const authRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );

    if (!authRes.ok) {
        // ── Increment fail counter ──
        if (env.RATE_LIMIT) {
            const rlData = await env.RATE_LIMIT.get(rlKey, 'json') || { failCount: 0, lockedUntil: 0 };
            const newCount = rlData.failCount + 1;
            const backoffS = calcBackoffSeconds(newCount);
            const lockedUntil = backoffS > 0 ? Date.now() + backoffS * 1000 : 0;
            // Keep entry alive for at least the backoff duration (min 10 min)
            const ttl = Math.max(backoffS + 60, 600);
            await env.RATE_LIMIT.put(rlKey, JSON.stringify({ failCount: newCount, lockedUntil }), { expirationTtl: ttl });
            console.log(`→ login failed: ip=${ip}, failCount=${newCount}, backoff=${backoffS}s`);
        }

        const errBody = await authRes.json().catch(() => ({}));
        const code = errBody?.error?.message || 'INVALID_CREDENTIALS';
        console.log(`→ firebase auth error: ${code}`);
        // Return generic message to prevent user enumeration
        return corsResponse(JSON.stringify({ error: 'Invalid credentials' }), 401, origin, allowedOrigin);
    }

    // ── Success — reset counter and return custom token ──
    if (env.RATE_LIMIT) {
        await env.RATE_LIMIT.delete(rlKey);
    }

    const authData = await authRes.json();
    const uid = authData.localId;

    let customToken;
    try { customToken = await createCustomToken(env, uid); }
    catch (e) {
        console.error('Custom token error:', e.message);
        return corsResponse(JSON.stringify({ error: 'Server error' }), 500, origin, allowedOrigin);
    }

    console.log(`→ login OK: ip=${ip}, uid=${uid}`);
    return corsResponse(JSON.stringify({ customToken }), 200, origin, allowedOrigin);
}

// Creates a Firebase custom auth token (signed JWT) for signInWithCustomToken() on the client.
async function createCustomToken(env, uid) {
    const now = Math.floor(Date.now() / 1000);

    const b64url = (obj) =>
        btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const header  = b64url({ alg: 'RS256', typ: 'JWT' });
    const payload = b64url({
        iss: env.FIREBASE_SA_EMAIL,
        sub: env.FIREBASE_SA_EMAIL,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        uid,
        iat: now,
        exp: now + 3600,
    });

    const toSign = `${header}.${payload}`;

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

    return `${toSign}.${encodedSig}`;
}

// ─── Member Login Handler (server-side username lookup + dual rate limiting) ─

const MAX_USERNAME_ATTEMPTS = 5;
const USERNAME_BACKOFF_BASE_S = 120; // 2 minutes initial lockout

function calcUsernameBackoffSeconds(failCount) {
    if (failCount <= MAX_USERNAME_ATTEMPTS) return 0;
    const extra = failCount - MAX_USERNAME_ATTEMPTS;
    return Math.min(Math.pow(2, extra - 1) * USERNAME_BACKOFF_BASE_S, MAX_BACKOFF_S);
}

function usernameToEmail(username, familyId) {
    const safeUser = username.toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]/g, '_');
    const safeFam = familyId.replace(/[^a-zA-Z0-9]/g, '_');
    return `${safeUser}__${safeFam}@member.saveing.local`;
}

async function handleMemberLogin(request, env, origin, allowedOrigin) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // ── Parse body ──
    let body;
    try { body = await request.json(); }
    catch { return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, origin, allowedOrigin); }

    const { username, password } = body;
    if (!username || !password) {
        return corsResponse(JSON.stringify({ error: 'username and password required' }), 400, origin, allowedOrigin);
    }

    const normalizedUsername = username.toLowerCase().trim();
    const ipKey = `rl:${ip}`;
    const userKey = `rl:user:${normalizedUsername}`;

    // ── Dual rate-limit check (IP + username) ──
    if (env.RATE_LIMIT) {
        // Check IP-based rate limit
        const ipData = await env.RATE_LIMIT.get(ipKey, 'json') || { failCount: 0, lockedUntil: 0 };
        if (ipData.lockedUntil > Date.now()) {
            const retryAfter = Math.ceil((ipData.lockedUntil - Date.now()) / 1000);
            console.log(`→ member-login blocked (IP): ip=${ip}, retryAfter=${retryAfter}s`);
            return new Response(
                JSON.stringify({ error: 'Too many attempts', retryAfter }),
                { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter), ...corsHeaders(origin, allowedOrigin) } }
            );
        }

        // Check username-based rate limit (stricter)
        const userData = await env.RATE_LIMIT.get(userKey, 'json') || { failCount: 0, lockedUntil: 0 };
        if (userData.lockedUntil > Date.now()) {
            const retryAfter = Math.ceil((userData.lockedUntil - Date.now()) / 1000);
            console.log(`→ member-login blocked (username): user=${normalizedUsername}, retryAfter=${retryAfter}s`);
            return new Response(
                JSON.stringify({ error: 'Too many attempts', retryAfter }),
                { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter), ...corsHeaders(origin, allowedOrigin) } }
            );
        }
    } else {
        console.warn('→ RATE_LIMIT KV not configured — brute-force protection disabled');
    }

    // ── Server-side username lookup ──
    let accessToken;
    try { accessToken = await getServiceAccountToken(env); }
    catch (e) {
        console.error('SA token error:', e.message);
        return corsResponse(JSON.stringify({ error: 'Server error' }), 500, origin, allowedOrigin);
    }

    const usernameDoc = await fetchFirestoreDoc(accessToken, env.FIREBASE_PROJECT_ID, 'usernames', normalizedUsername);

    if (!usernameDoc || !usernameDoc.familyId) {
        // Username not found — increment rate limits but return specific error
        await incrementDualRateLimit(env, ipKey, userKey);
        console.log(`→ member-login: username not found: ${normalizedUsername}`);
        return corsResponse(JSON.stringify({ error: 'USERNAME_NOT_FOUND' }), 401, origin, allowedOrigin);
    }

    const familyId = usernameDoc.familyId;
    const syntheticEmail = usernameToEmail(normalizedUsername, familyId);

    // ── Authenticate via Firebase Identity Toolkit ──
    const authRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: syntheticEmail, password, returnSecureToken: true }),
        }
    );

    if (!authRes.ok) {
        await incrementDualRateLimit(env, ipKey, userKey);
        console.log(`→ member-login failed (wrong password): user=${normalizedUsername}, ip=${ip}`);
        return corsResponse(JSON.stringify({ error: 'INVALID_PASSWORD' }), 401, origin, allowedOrigin);
    }

    // ── Success — reset both counters ──
    if (env.RATE_LIMIT) {
        await Promise.all([
            env.RATE_LIMIT.delete(ipKey),
            env.RATE_LIMIT.delete(userKey),
        ]);
    }

    const authData = await authRes.json();
    const uid = authData.localId;

    let customToken;
    try { customToken = await createCustomToken(env, uid); }
    catch (e) {
        console.error('Custom token error:', e.message);
        return corsResponse(JSON.stringify({ error: 'Server error' }), 500, origin, allowedOrigin);
    }

    console.log(`→ member-login OK: user=${normalizedUsername}, ip=${ip}, uid=${uid}`);
    return corsResponse(JSON.stringify({ customToken }), 200, origin, allowedOrigin);
}

// Increment both IP and username rate-limit counters
async function incrementDualRateLimit(env, ipKey, userKey) {
    if (!env.RATE_LIMIT) return;

    // IP-based (standard limits)
    const ipData = await env.RATE_LIMIT.get(ipKey, 'json') || { failCount: 0, lockedUntil: 0 };
    const ipCount = ipData.failCount + 1;
    const ipBackoff = calcBackoffSeconds(ipCount);
    const ipLocked = ipBackoff > 0 ? Date.now() + ipBackoff * 1000 : 0;
    const ipTtl = Math.max(ipBackoff + 60, 600);

    // Username-based (stricter limits)
    const userData = await env.RATE_LIMIT.get(userKey, 'json') || { failCount: 0, lockedUntil: 0 };
    const userCount = userData.failCount + 1;
    const userBackoff = calcUsernameBackoffSeconds(userCount);
    const userLocked = userBackoff > 0 ? Date.now() + userBackoff * 1000 : 0;
    const userTtl = Math.max(userBackoff + 60, 600);

    await Promise.all([
        env.RATE_LIMIT.put(ipKey, JSON.stringify({ failCount: ipCount, lockedUntil: ipLocked }), { expirationTtl: ipTtl }),
        env.RATE_LIMIT.put(userKey, JSON.stringify({ failCount: userCount, lockedUntil: userLocked }), { expirationTtl: userTtl }),
    ]);
}

// ─── Rate-limit helper for password reset ────────────────────────────────────

async function incrementResetRateLimit(env, rlKey) {
    if (!env.RATE_LIMIT) return;
    const rlData = await env.RATE_LIMIT.get(rlKey, 'json') || { failCount: 0, lockedUntil: 0 };
    const newCount = rlData.failCount + 1;
    const backoffS = calcBackoffSeconds(newCount);
    const lockedUntil = backoffS > 0 ? Date.now() + backoffS * 1000 : 0;
    const ttl = Math.max(backoffS + 60, 600);
    await env.RATE_LIMIT.put(rlKey, JSON.stringify({ failCount: newCount, lockedUntil }), { expirationTtl: ttl });
}

// ─── Password Reset Handler ───────────────────────────────────────────────────

async function handleResetPassword(request, env, origin, allowedOrigin) {
    // 0. Rate-limit check (same mechanism as login)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = `rl:reset:${ip}`;
    if (env.RATE_LIMIT) {
        const rlData = await env.RATE_LIMIT.get(rlKey, 'json') || { failCount: 0, lockedUntil: 0 };
        if (rlData.lockedUntil > Date.now()) {
            const retryAfter = Math.ceil((rlData.lockedUntil - Date.now()) / 1000);
            return corsResponse(JSON.stringify({ error: 'Too many attempts', retryAfter }), 429, origin, allowedOrigin);
        }
    }

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
    if (!lookupRes.ok) {
        await incrementResetRateLimit(env, rlKey);
        return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401, origin, allowedOrigin);
    }
    const lookupData = await lookupRes.json();
    const callerUid = lookupData.users?.[0]?.localId;
    if (!callerUid) {
        await incrementResetRateLimit(env, rlKey);
        return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401, origin, allowedOrigin);
    }

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
        await incrementResetRateLimit(env, rlKey);
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

// ─── Member Rename Handler ────────────────────────────────────────────────────
//
// Renames a member across all documents: member doc, user doc,
// investments, goals, and simulations.
// Caller must be the member themselves or a manager in the same family.

async function handleRenameMember(request, env, origin, allowedOrigin) {
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

    const { memberUid, newName } = body;
    if (!memberUid || !newName?.trim()) {
        return corsResponse(JSON.stringify({ error: 'memberUid and newName required' }), 400, origin, allowedOrigin);
    }

    // 3. Verify caller
    const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!lookupRes.ok) {
        return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401, origin, allowedOrigin);
    }
    const lookupData = await lookupRes.json();
    const callerUid = lookupData.users?.[0]?.localId;
    if (!callerUid) {
        return corsResponse(JSON.stringify({ error: 'Invalid token' }), 401, origin, allowedOrigin);
    }

    // 4. Get service account access token
    let accessToken;
    try { accessToken = await getServiceAccountToken(env); }
    catch (e) {
        console.error('SA token error:', e.message);
        return corsResponse(JSON.stringify({ error: 'Server config error' }), 500, origin, allowedOrigin);
    }

    // 5. Get caller's user doc to find familyId and role
    const callerDoc = await fetchFirestoreDoc(accessToken, env.FIREBASE_PROJECT_ID, 'users', callerUid);
    if (!callerDoc?.familyId) {
        return corsResponse(JSON.stringify({ error: 'Caller has no family' }), 403, origin, allowedOrigin);
    }

    // 6. Permission check: caller is the member themselves OR a manager
    const isSelf = callerUid === memberUid;
    if (!isSelf && callerDoc.role !== 'manager') {
        return corsResponse(JSON.stringify({ error: 'Permission denied' }), 403, origin, allowedOrigin);
    }

    // If not self, verify target is in same family
    if (!isSelf) {
        const targetDoc = await fetchFirestoreDoc(accessToken, env.FIREBASE_PROJECT_ID, 'users', memberUid);
        if (!targetDoc || targetDoc.familyId !== callerDoc.familyId) {
            return corsResponse(JSON.stringify({ error: 'Target not in same family' }), 403, origin, allowedOrigin);
        }
    }

    const familyId = callerDoc.familyId;
    const projectId = env.FIREBASE_PROJECT_ID;
    const basePath = `projects/${projectId}/databases/(default)/documents`;
    const baseUrl = `https://firestore.googleapis.com/v1/${basePath}`;

    // 7. Get old name from member doc
    const memberDocUrl = `${baseUrl}/families/${familyId}/members/${memberUid}`;
    const memberRes = await fetch(memberDocUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!memberRes.ok) {
        return corsResponse(JSON.stringify({ error: 'Member not found' }), 404, origin, allowedOrigin);
    }
    const memberData = await memberRes.json();
    const oldName = memberData.fields?.name?.stringValue;
    if (!oldName) {
        return corsResponse(JSON.stringify({ error: 'Member has no name' }), 400, origin, allowedOrigin);
    }

    const trimmedName = newName.trim();
    if (oldName === trimmedName) {
        return corsResponse(JSON.stringify({ success: true }), 200, origin, allowedOrigin);
    }

    // 8. Build batch writes
    const writes = [];

    // Update member doc name
    writes.push({
        update: {
            name: `${basePath}/families/${familyId}/members/${memberUid}`,
            fields: {
                name: { stringValue: trimmedName },
                updated_at: { stringValue: new Date().toISOString() },
            },
        },
        updateMask: { fieldPaths: ['name', 'updated_at'] },
    });

    // Update user doc kidName + displayName
    writes.push({
        update: {
            name: `${basePath}/users/${memberUid}`,
            fields: {
                kidName: { stringValue: trimmedName },
                displayName: { stringValue: trimmedName },
            },
        },
        updateMask: { fieldPaths: ['kidName', 'displayName'] },
    });

    // 9. Query investments, goals, simulations where kid = oldName and update them
    for (const collectionId of ['investments', 'goals', 'simulations']) {
        const queryUrl = `${baseUrl}/families/${familyId}:runQuery`;
        const queryRes = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: 'kid' },
                            op: 'EQUAL',
                            value: { stringValue: oldName },
                        },
                    },
                },
            }),
        });
        if (queryRes.ok) {
            const results = await queryRes.json();
            for (const result of results) {
                if (result.document) {
                    writes.push({
                        update: {
                            name: result.document.name,
                            fields: { kid: { stringValue: trimmedName } },
                        },
                        updateMask: { fieldPaths: ['kid'] },
                    });
                }
            }
        }
    }

    // 10. Commit all writes atomically
    const commitUrl = `https://firestore.googleapis.com/v1/${basePath}:commit`;
    const commitRes = await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ writes }),
    });

    if (!commitRes.ok) {
        const err = await commitRes.text();
        console.error('Commit error:', err);
        return corsResponse(JSON.stringify({ error: 'Failed to rename' }), 500, origin, allowedOrigin);
    }

    console.log(`→ rename OK: "${oldName}" → "${trimmedName}" in family ${familyId} (${writes.length} writes)`);
    return corsResponse(JSON.stringify({ success: true, oldName, newName: trimmedName }), 200, origin, allowedOrigin);
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

// ─── CORS helpers ─────────────────────────────────────────────────────────────

function isAllowedOrigin(origin, allowedOrigin) {
    if (origin === allowedOrigin) return true;
    // Only allow localhost origins when the configured origin is also localhost (dev mode)
    const isDevMode = allowedOrigin.startsWith('http://localhost') || allowedOrigin.startsWith('http://127.0.0.1');
    if (isDevMode) {
        return origin === 'http://localhost'
            || origin.startsWith('http://localhost:')
            || origin.startsWith('http://127.0.0.1');
    }
    return false;
}

function corsHeaders(origin, allowedOrigin) {
    const allowed = isAllowedOrigin(origin, allowedOrigin);
    return {
        'Access-Control-Allow-Origin': allowed ? origin : allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
    };
}

function corsResponse(body, status, origin, allowedOrigin, contentType = 'application/json') {
    const allowed = isAllowedOrigin(origin, allowedOrigin);
    console.log(`→ CORS: origin="${origin}" allowed=${allowed}`);
    return new Response(body, {
        status,
        headers: {
            'Content-Type': contentType,
            ...corsHeaders(origin, allowedOrigin),
        },
    });
}
