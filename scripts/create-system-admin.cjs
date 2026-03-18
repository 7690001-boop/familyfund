#!/usr/bin/env node
// ============================================================
// One-time script: Create a system admin user
// Uses Firebase CLI refresh token + REST APIs (no service account needed)
// Usage: node scripts/create-system-admin.cjs <email> <password>
// ============================================================

const path = require('path');
const fs = require('fs');
const https = require('https');

const PROJECT_ID = 'savings-16206';
const FIREBASE_API_KEY = 'AIzaSyD4bIYfnx3Qg7gqDmlboShFjL-Tql65SUQ';
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.error('Usage: node scripts/create-system-admin.cjs <email> <password>');
    console.error('Example: node scripts/create-system-admin.cjs admin@saveing.app MySecurePass123');
    process.exit(1);
}

if (password.length < 6) {
    console.error('Error: password must be at least 6 characters');
    process.exit(1);
}

function httpsJson(method, hostname, urlPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname, path: urlPath, method,
            headers: { 'Content-Type': 'application/json', ...headers },
        };
        if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

        const req = https.request(opts, (res) => {
            let buf = '';
            res.on('data', d => buf += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
                catch { resolve({ status: res.statusCode, data: buf }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function httpsForm(hostname, urlPath, formData) {
    return new Promise((resolve, reject) => {
        const data = formData;
        const req = https.request({
            hostname, path: urlPath, method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
            let buf = '';
            res.on('data', d => buf += d);
            res.on('end', () => resolve(JSON.parse(buf)));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function getRefreshToken() {
    const configPath = path.join(process.env.HOME, '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const token = config.tokens?.refresh_token;
    if (!token) throw new Error('No refresh token found. Run: firebase login');
    return token;
}

async function getAccessToken(refreshToken) {
    const form = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${CLI_CLIENT_ID}&client_secret=${CLI_CLIENT_SECRET}`;
    const res = await httpsForm('oauth2.googleapis.com', '/token', form);
    if (!res.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(res));
    return res.access_token;
}

async function main() {
    console.log('Authenticating via Firebase CLI credentials...');
    const refreshToken = getRefreshToken();
    const accessToken = await getAccessToken(refreshToken);
    console.log('✓ Got access token');

    // 1. Create Firebase Auth user via Identity Toolkit REST API
    console.log(`\nCreating auth user: ${email} ...`);
    let uid;

    // Try creating via admin API (identitytoolkit)
    const createRes = await httpsJson('POST',
        'identitytoolkit.googleapis.com',
        `/v1/projects/${PROJECT_ID}/accounts`,
        { email, password, displayName: 'מנהל מערכת' },
        { Authorization: `Bearer ${accessToken}` }
    );

    if (createRes.status === 200 && createRes.data.localId) {
        uid = createRes.data.localId;
        console.log(`✓ Auth user created — UID: ${uid}`);
    } else if (createRes.data?.error?.message === 'EMAIL_EXISTS') {
        // Look up existing user
        console.log('User already exists, looking up UID...');
        const lookupRes = await httpsJson('POST',
            'identitytoolkit.googleapis.com',
            `/v1/projects/${PROJECT_ID}/accounts:lookup`,
            { email: [email] },
            { Authorization: `Bearer ${accessToken}` }
        );
        uid = lookupRes.data?.users?.[0]?.localId;
        if (!uid) throw new Error('Could not find existing user: ' + JSON.stringify(lookupRes.data));
        console.log(`✓ Existing user — UID: ${uid}`);
    } else {
        throw new Error('Failed to create user: ' + JSON.stringify(createRes.data));
    }

    // 2. Write Firestore document via REST API
    console.log(`\nWriting Firestore /users/${uid} ...`);
    const firestoreDoc = {
        fields: {
            uid: { stringValue: uid },
            email: { stringValue: email },
            displayName: { stringValue: 'מנהל מערכת' },
            role: { stringValue: 'system' },
            familyId: { nullValue: null },
            kidName: { nullValue: null },
            username: { nullValue: null },
            created_at: { stringValue: new Date().toISOString() },
        }
    };

    const docRes = await httpsJson('PATCH',
        'firestore.googleapis.com',
        `/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
        firestoreDoc,
        { Authorization: `Bearer ${accessToken}` }
    );

    if (docRes.status === 200) {
        console.log(`✓ Firestore /users/${uid} written with role: system`);
    } else {
        throw new Error('Failed to write Firestore doc: ' + JSON.stringify(docRes.data));
    }

    console.log('\n✅ Done! You can now log in as system admin with:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: (the one you provided)`);
}

main().catch(err => {
    console.error('\nFailed:', err.message);
    process.exit(1);
});
