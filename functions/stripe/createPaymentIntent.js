import { onRequest } from 'firebase-functions/v2/https';
import { admin, db } from '../firebaseAdmin.js';
import { ensureStripeCustomerForUser } from '../firestore/users.js';
import { verifyBearerToken } from '../utils/auth.js';
import { getStripe } from './client.js';

export const createPaymentIntent = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let decodedToken;
  try {
    decodedToken = await verifyBearerToken(req);
  } catch (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  try {
    const {
      bookingId,
      studentUid,
      tutorUid,
      amountCents,
      currency = 'cad',
      platformFeePercent = 10
    } = req.body || {};

    if (!bookingId || !studentUid || !tutorUid || !amountCents) {
      res.status(400).json({ error: 'bookingId, studentUid, tutorUid, amountCents are required.' });
      return;
    }

    if (decodedToken.uid !== studentUid) {
      res.status(403).json({ error: 'Authenticated user does not match studentUid' });
      return;
    }

    const bookingRef = db.doc(`bookings/${bookingId}`);
    const [bookingSnap, tutorSnap] = await Promise.all([
      bookingRef.get(),
      db.doc(`users/${tutorUid}`).get()
    ]);

    if (!bookingSnap.exists) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (!tutorSnap.exists) {
      res.status(404).json({ error: 'Tutor not found' });
      return;
    }

    const tutorAccountId = tutorSnap.data().stripeAccountId;
    if (!tutorAccountId) {
      res.status(400).json({ error: 'Tutor has not completed Stripe onboarding' });
      return;
    }

    const customerId = await ensureStripeCustomerForUser(studentUid);
    const stripe = getStripe();
    const applicationFeeCents = Math.round((amountCents * platformFeePercent) / 100);

    const paymentMethodTypes = ['card'];
    const paymentMethodOptions = {
      card: { setup_future_usage: 'off_session' }
    };

    if (currency === 'cad') {
      paymentMethodTypes.push('acss_debit');
      paymentMethodOptions.acss_debit = {
        mandate_options: {
          payment_schedule: 'sporadic',
          transaction_type: 'personal'
        }
      };
    } else {
      paymentMethodTypes.push('us_bank_account');
      paymentMethodOptions.us_bank_account = {
        financial_connections: { permissions: ['payment_method'] },
        verification_method: 'automatic'
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      payment_method_configuration: 'pmc_prefer_bank',
      payment_method_types: paymentMethodTypes,
      payment_method_options: paymentMethodOptions,
      application_fee_amount: applicationFeeCents,
      transfer_data: {
        destination: tutorAccountId
      },
      metadata: {
        bookingId,
        tutorUid,
        studentUid,
        platformFeeCents: applicationFeeCents
      }
    });

    await bookingRef.update({
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending_payment',
      paymentStatusHistory: admin.firestore.FieldValue.arrayUnion({
        status: 'pending_payment',
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        changedBy: 'stripe:createPaymentIntent',
        source: 'stripe:createPaymentIntent'
      })
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('createPaymentIntent error', error);
    res.status(500).json({ error: error.message });
  }
});
