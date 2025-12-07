import { admin } from '../firebaseAdmin.js';

export async function verifyBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    throw new Error('Missing Authorization header');
  }
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    throw new Error('Invalid or expired Firebase ID token');
  }
}
