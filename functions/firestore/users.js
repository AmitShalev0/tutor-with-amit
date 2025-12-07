import { db } from '../firebaseAdmin.js';
import { getStripe } from '../stripe/client.js';

export async function ensureStripeCustomerForUser(uid) {
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error(`User ${uid} not found`);
  }
  const data = userSnap.data();
  if (data?.stripeCustomerId) {
    return data.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: data.email || undefined,
    name: data.fullName || undefined,
    metadata: { firebaseUid: uid }
  });

  await userRef.update({ stripeCustomerId: customer.id });
  return customer.id;
}

export async function storeConnectedAccountId(uid, accountId) {
  const userRef = db.doc(`users/${uid}`);
  await userRef.set({ stripeAccountId: accountId }, { merge: true });
}
