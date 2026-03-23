// ============================================================
// Firebase Cloud Functions — admin operations
// ============================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
// ============================================================
// Investment Report — Excel generation + email
// Email is sent via the Cloudflare Worker (/send-report-email)
// which calls Resend API. Required environment variables (functions/.env):
//   WORKER_URL        — Cloudflare Worker base URL
//   FIREBASE_API_KEY  — Firebase Web API key (public, used to exchange custom token for ID token)
// ============================================================

function _computeInv(inv, exchangeRates) {
    const currency = inv.currency || 'ILS';
    const rate = currency === 'ILS' ? 1 : (exchangeRates[currency] || 1);
    const rateAtPurchase = Number(inv.exchange_rate_at_purchase) || rate || 1;
    const amountInvested = Number(inv.amount_invested) || 0;
    const shares = inv.shares != null && inv.shares !== '' ? Number(inv.shares) : null;
    const currentPrice = inv.current_price != null && inv.current_price !== '' ? Number(inv.current_price) : null;

    const amountInvestedNative = currency === 'ILS' ? amountInvested : amountInvested / rateAtPurchase;
    const purchasePrice = shares && amountInvestedNative > 0 ? amountInvestedNative / shares : null;
    const currentValueNative = currentPrice != null && shares != null ? shares * currentPrice : null;
    const currentValueILS = currentValueNative != null ? currentValueNative * rate : null;
    const gainLossILS = currentValueILS != null ? currentValueILS - amountInvested : null;
    const gainLossPct = gainLossILS != null && amountInvested > 0 ? (gainLossILS / amountInvested) * 100 : null;

    return { ...inv, currency, amountInvested, amountInvestedNative, purchasePrice, currentValueNative, currentValueILS, gainLossILS, gainLossPct };
}

function _round(n, d = 2) {
    return n != null ? +n.toFixed(d) : '';
}

function _generateExcel(familyData, investments, exchangeRates) {
    const wb = XLSX.utils.book_new();
    const computed = investments.map(inv => _computeInv(inv, exchangeRates));

    // Sheet 1 — Summary per kid
    const kidNames = [...new Set(computed.map(i => i.kid).filter(Boolean))].sort();
    const sumRows = [['שם', 'הושקע (₪)', 'שווי נוכחי (₪)', 'רווח/הפסד (₪)', 'תשואה %', 'מספר השקעות']];
    let totInv = 0, totCur = 0;
    for (const kid of kidNames) {
        const kidInvs = computed.filter(i => i.kid === kid);
        const inv = kidInvs.reduce((s, i) => s + i.amountInvested, 0);
        const cur = kidInvs.reduce((s, i) => s + (i.currentValueILS ?? i.amountInvested), 0);
        const gl = cur - inv;
        const pct = inv > 0 ? (gl / inv) * 100 : 0;
        sumRows.push([kid, _round(inv), _round(cur), _round(gl), _round(pct), kidInvs.length]);
        totInv += inv; totCur += cur;
    }
    const totGl = totCur - totInv;
    sumRows.push(['סה"כ', _round(totInv), _round(totCur), _round(totGl), _round(totInv > 0 ? (totGl / totInv) * 100 : 0), computed.length]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'סיכום');

    // Sheet 2 — All transactions
    const invRows = [['ילד/ה', 'שם נכס', 'טיקר', 'מטבע', 'תאריך רכישה', 'יחידות', 'מחיר רכישה', 'הושקע (₪)', 'מחיר נוכחי', 'שווי נוכחי (₪)', 'רווח/הפסד (₪)', 'תשואה %']];
    for (const i of computed) {
        invRows.push([
            i.kid || '',
            i.nickname || i.asset_name || i.ticker || '',
            i.ticker || '',
            i.currency || 'ILS',
            i.purchase_date || '',
            i.shares != null ? _round(i.shares, 4) : '',
            _round(i.purchasePrice, 4),
            _round(i.amountInvested),
            i.current_price != null ? _round(Number(i.current_price), 4) : '',
            _round(i.currentValueILS),
            _round(i.gainLossILS),
            _round(i.gainLossPct),
        ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), 'עסקאות');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function _getSystemIdToken() {
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) throw new HttpsError('failed-precondition', 'FIREBASE_API_KEY not configured');

    const customToken = await admin.auth().createCustomToken('email-sender');
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
    );
    if (!res.ok) throw new HttpsError('internal', 'Failed to exchange custom token');
    const { idToken } = await res.json();
    return idToken;
}

async function _sendReportEmail(recipientEmail, xlsxBuffer, familyName) {
    const workerUrl = process.env.WORKER_URL;
    if (!workerUrl) throw new HttpsError('failed-precondition', 'WORKER_URL not configured');

    const dateStr = new Date().toLocaleDateString('he-IL');
    const safeName = familyName || 'המשפחה שלנו';
    const idToken = await _getSystemIdToken();

    const res = await fetch(`${workerUrl}/send-report-email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
            to: recipientEmail,
            familyName: safeName,
            xlsxBase64: xlsxBuffer.toString('base64'),
            dateStr,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new HttpsError('internal', `Email delivery failed: ${err}`);
    }
}

async function _buildAndSendReport(familyId, db) {
    const familyRef = db.doc(`families/${familyId}`);
    const [familySnap, invSnap, priceSnap] = await Promise.all([
        familyRef.get(),
        db.collection(`families/${familyId}/investments`).get(),
        db.doc(`families/${familyId}/prices/latest`).get(),
    ]);
    if (!familySnap.exists) return;
    const familyData = familySnap.data();

    // Resolve recipient: backup email or owner's auth email (familyId === managerUid)
    let ownerEmail;
    try {
        const ownerUser = await admin.auth().getUser(familyId);
        ownerEmail = ownerUser.email;
    } catch (e) {
        console.error(`[scheduledReport] Could not fetch owner email for family ${familyId}:`, e.message);
    }
    const recipient = familyData.backupReportEmail || ownerEmail;
    if (!recipient) {
        console.error(`[scheduledReport] No recipient email for family ${familyId}`);
        return;
    }

    // Check and increment daily limit (10 emails/day)
    const today = new Date().toISOString().slice(0, 10);
    let allowed = false;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(familyRef);
        const data = snap.data() || {};
        const dailyCount = data.emailDailyDate === today ? (data.emailDailyCount || 0) : 0;
        if (dailyCount >= 10) return;
        tx.update(familyRef, { emailDailyDate: today, emailDailyCount: dailyCount + 1 });
        allowed = true;
    });
    if (!allowed) {
        console.log(`[scheduledReport] Daily limit reached for family ${familyId}`);
        return;
    }

    const investments = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const exchangeRates = { ILS: 1, ...(priceSnap.exists ? priceSnap.data().exchangeRates || {} : {}) };
    const buffer = _generateExcel(familyData, investments, exchangeRates);
    await _sendReportEmail(recipient, buffer, familyData.family_name);
}

/**
 * exportInvestmentReport — callable by manager.
 * Sends the Excel report to the owner's account email, or their backup email if set.
 * Rate-limited to 10 emails per day per family.
 */
exports.exportInvestmentReport = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

    const db = admin.firestore();

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'manager') {
        throw new HttpsError('permission-denied', 'Only managers can export reports');
    }
    const familyId = callerDoc.data().familyId;
    const familyRef = db.doc(`families/${familyId}`);

    const [familySnap, invSnap, priceSnap] = await Promise.all([
        familyRef.get(),
        db.collection(`families/${familyId}/investments`).get(),
        db.doc(`families/${familyId}/prices/latest`).get(),
    ]);

    const familyData = familySnap.data() || {};

    // Recipient must be owner's auth email or their saved backup email
    const ownerEmail = request.auth.token.email;
    const recipient = familyData.backupReportEmail || ownerEmail;
    if (!recipient) throw new HttpsError('invalid-argument', 'לא נמצאה כתובת מייל');

    // Atomically check and increment daily email count (limit: 10/day)
    const today = new Date().toISOString().slice(0, 10);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(familyRef);
        const data = snap.data() || {};
        const dailyCount = data.emailDailyDate === today ? (data.emailDailyCount || 0) : 0;
        if (dailyCount >= 10) {
            throw new HttpsError('resource-exhausted', 'הגעת למגבלת 10 מיילים ביום');
        }
        tx.update(familyRef, { emailDailyDate: today, emailDailyCount: dailyCount + 1 });
    });

    const investments = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const exchangeRates = { ILS: 1, ...(priceSnap.exists ? priceSnap.data().exchangeRates || {} : {}) };
    const buffer = _generateExcel(familyData, investments, exchangeRates);
    await _sendReportEmail(recipient, buffer, familyData.family_name);
    return { success: true };
});

/**
 * updateBackupReportEmail — callable by manager.
 * Updates the family's backup report email. Can only be changed once per 24 hours.
 * Pass empty string to clear the backup email.
 */
exports.updateBackupReportEmail = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

    const { email } = request.data;
    if (typeof email !== 'string') {
        throw new HttpsError('invalid-argument', 'email is required');
    }

    const db = admin.firestore();
    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'manager') {
        throw new HttpsError('permission-denied', 'Only managers can update backup email');
    }
    const familyId = callerDoc.data().familyId;

    const familyRef = db.doc(`families/${familyId}`);
    const familySnap = await familyRef.get();
    const familyData = familySnap.data() || {};

    // Enforce once-per-24h limit
    const changedAt = familyData.backupReportEmailChangedAt;
    if (changedAt) {
        const hoursSince = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
            throw new HttpsError('resource-exhausted', 'ניתן לשנות מייל גיבוי פעם אחת ביום');
        }
    }

    await familyRef.update({
        backupReportEmail: email || null,
        backupReportEmailChangedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
    return { success: true };
});

/**
 * scheduledInvestmentReport — runs daily at 08:00.
 * Sends reports to families with reportSchedule='weekly' (on Sunday) or 'monthly' (on 1st).
 */
exports.scheduledInvestmentReport = onSchedule('every day 08:00', async () => {
    const db = admin.firestore();
    const now = new Date();
    const snap = await db.collection('families').where('reportSchedule', 'in', ['weekly', 'monthly']).get();

    for (const doc of snap.docs) {
        const { reportSchedule, reportEmail } = doc.data();
        if (!reportEmail) continue;
        const shouldSend =
            (reportSchedule === 'weekly'  && now.getDay() === 0) ||   // Sunday
            (reportSchedule === 'monthly' && now.getDate() === 1);     // 1st of month
        if (!shouldSend) continue;
        try {
            await _buildAndSendReport(doc.id, db);
            console.log(`[scheduledReport] Sent for family ${doc.id}`);
        } catch (e) {
            console.error(`[scheduledReport] Failed for family ${doc.id}:`, e.message);
        }
    }
});

admin.initializeApp();

/**
 * resetMemberPassword — callable by manager to reset a member's password.
 * Uses Firebase Admin SDK so no current password is needed.
 */
exports.resetMemberPassword = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { memberUid, newPassword } = request.data;

    if (!memberUid || typeof newPassword !== 'string' || newPassword.length < 6) {
        throw new HttpsError('invalid-argument', 'memberUid and newPassword (min 6 chars) are required');
    }

    const db = admin.firestore();

    // Verify caller is a manager
    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'manager') {
        throw new HttpsError('permission-denied', 'Only managers can reset member passwords');
    }

    const callerFamilyId = callerDoc.data().familyId;

    // Verify target member belongs to the same family
    const memberDoc = await db.collection('users').doc(memberUid).get();
    if (!memberDoc.exists || memberDoc.data().familyId !== callerFamilyId) {
        throw new HttpsError('permission-denied', 'Member not found in your family');
    }

    // Prevent resetting another manager's password
    if (memberDoc.data().role === 'manager') {
        throw new HttpsError('permission-denied', 'Cannot reset a manager password');
    }

    await admin.auth().updateUser(memberUid, { password: newPassword });

    return { success: true };
});

// ============================================================
// Privacy — 48h cooldown helpers
// ============================================================

const COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * toggleMemberPrivacy — callable by the member themselves or a manager.
 * Sets the `private` flag and manages the 48h cooldown on going public.
 */
exports.toggleMemberPrivacy = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { familyId, memberUid, isPrivate } = request.data;
    if (!familyId || !memberUid || typeof isPrivate !== 'boolean') {
        throw new HttpsError('invalid-argument', 'familyId, memberUid and isPrivate are required');
    }

    const db = admin.firestore();

    // Verify caller belongs to the same family
    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().familyId !== familyId) {
        throw new HttpsError('permission-denied', 'Not a member of this family');
    }

    const isManager = callerDoc.data().role === 'manager';
    const isSelf = request.auth.uid === memberUid;

    if (!isManager && !isSelf) {
        throw new HttpsError('permission-denied', 'Only the member or a manager can toggle privacy');
    }

    const memberRef = db.doc(`families/${familyId}/members/${memberUid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
        throw new HttpsError('not-found', 'Member not found');
    }

    const memberData = memberSnap.data();

    // Block going public if auto-private (all investments hidden)
    if (!isPrivate && memberData.autoPrivate === true) {
        throw new HttpsError('failed-precondition', 'Cannot go public while all investments are hidden');
    }

    const updates = {
        private: isPrivate,
        updated_at: new Date().toISOString(),
    };

    if (isPrivate) {
        // Going private — no cooldown, clear any existing one
        updates.privacyCooldownUntil = null;
    } else {
        // Going public — set 48h cooldown (managers bypass)
        if (isManager) {
            updates.privacyCooldownUntil = null;
        } else {
            updates.privacyCooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
        }
    }

    await memberRef.update(updates);

    return { success: true, cooldownUntil: updates.privacyCooldownUntil || null };
});

/**
 * clearPrivacyCooldown — manager-only, clears the 48h cooldown for a member.
 */
exports.clearPrivacyCooldown = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { familyId, memberUid } = request.data;
    if (!familyId || !memberUid) {
        throw new HttpsError('invalid-argument', 'familyId and memberUid are required');
    }

    const db = admin.firestore();

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().familyId !== familyId || callerDoc.data().role !== 'manager') {
        throw new HttpsError('permission-denied', 'Only managers can clear cooldowns');
    }

    const memberRef = db.doc(`families/${familyId}/members/${memberUid}`);
    await memberRef.update({
        privacyCooldownUntil: null,
        updated_at: new Date().toISOString(),
    });

    return { success: true };
});

/**
 * onInvestmentWrite — Firestore trigger: auto-set member as private when all
 * their investments are hidden, and start cooldown when un-hiding.
 */
exports.onInvestmentWrite = onDocumentWritten(
    'families/{familyId}/investments/{investmentId}',
    async (event) => {
        const db = admin.firestore();
        const familyId = event.params.familyId;

        // Determine the kid name from before or after data
        const afterData = event.data?.after?.data?.();
        const beforeData = event.data?.before?.data?.();
        const kidName = afterData?.kid || beforeData?.kid;
        if (!kidName) return;

        // Get all investments for this kid in the family
        const investmentsSnap = await db
            .collection(`families/${familyId}/investments`)
            .where('kid', '==', kidName)
            .get();

        if (investmentsSnap.empty) return;

        const allHidden = investmentsSnap.docs.every(d => d.data().hidden === true);

        // Find the member doc by kid name
        const membersSnap = await db
            .collection(`families/${familyId}/members`)
            .where('name', '==', kidName)
            .limit(1)
            .get();

        if (membersSnap.empty) return;

        const memberRef = membersSnap.docs[0].ref;
        const memberData = membersSnap.docs[0].data();

        if (allHidden && !memberData.autoPrivate) {
            // All investments hidden → auto-private ON
            await memberRef.update({
                autoPrivate: true,
                private: true,
                updated_at: new Date().toISOString(),
            });
        } else if (!allHidden && memberData.autoPrivate === true) {
            // Some investment un-hidden → auto-private OFF, start 48h cooldown
            await memberRef.update({
                autoPrivate: false,
                privacyCooldownUntil: new Date(Date.now() + COOLDOWN_MS).toISOString(),
                updated_at: new Date().toISOString(),
            });
        }
    }
);
