// ============================================================
// Firebase Cloud Functions — admin operations
// ============================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
