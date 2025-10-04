// functions/index.js
const functions = require('firebase-functions');
const admin    = require('firebase-admin');

admin.initializeApp();

/** SUPER only: set password for any user */
exports.adminSetPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const role = String(context.auth.token?.role || '').toLowerCase();
  if (role !== 'super') throw new functions.https.HttpsError('permission-denied', 'SUPER only.');

  const newPassword = String(data?.newPassword || '');
  if (newPassword.length < 8) {
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 chars.');
  }

  let uid = String(data?.uid || '');
  const email = String(data?.email || '');
  try {
    if (!uid) {
      if (!email) throw new Error('uid or email required');
      const u = await admin.auth().getUserByEmail(email);
      uid = u.uid;
    }
    await admin.auth().updateUser(uid, { password: newPassword });
    return { ok: true, uid };
  } catch (e) {
    console.error('adminSetPassword failed:', e);
    throw new functions.https.HttpsError('internal', e.message || 'updateUser failed');
  }
});

/** SUPER only: create auth user (optional) */
exports.adminCreateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const role = String(context.auth.token?.role || '').toLowerCase();
  if (role !== 'super') throw new functions.https.HttpsError('permission-denied', 'SUPER only.');

  const email = String(data?.email || '');
  const displayName = String(data?.displayName || '');
  if (!email) throw new functions.https.HttpsError('invalid-argument', 'email required');

  const tmp = (Math.random().toString(36)+Math.random().toString(36)).slice(2, 18); // temp password
  try {
    const u = await admin.auth().createUser({ email, password: tmp, displayName: displayName || undefined });
    return { ok: true, uid: u.uid };
  } catch (e) {
    console.error('adminCreateUser failed:', e);
    throw new functions.https.HttpsError('internal', e.message || 'createUser failed');
  }
});
