// ============================================================
// Firebase Cloud Functions — admin operations
// ============================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

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
