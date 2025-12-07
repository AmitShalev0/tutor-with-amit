import { onRequest } from 'firebase-functions/v2/https';
import { admin, db } from '../firebaseAdmin.js';
import { ensureStripeCustomerForUser } from '../firestore/users.js';
import { verifyBearerToken } from '../utils/auth.js';
import { getStripe } from './client.js';

export const createCheckoutSession = onRequest(async (req, res) => {
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
      successUrl,
      cancelUrl,
      platformFeePercent = 10
    } = req.body || {};

    if (!bookingId || !studentUid || !tutorUid || !amountCents || !successUrl || !cancelUrl) {
      res.status(400).json({ error: 'bookingId, studentUid, tutorUid, amountCents, successUrl, and cancelUrl are required.' });
      return;
    }

    if (decodedToken.uid !== studentUid) {
      res.status(403).json({ error: 'Authenticated user does not match studentUid' });
      return;
    }

    const [bookingSnap, tutorSnap] = await Promise.all([
      db.doc(`bookings/${bookingId}`).get(),
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

    const checkoutPaymentMethodTypes = ['card'];
    const checkoutPaymentMethodOptions = {
      card: { setup_future_usage: 'off_session' }
    };

    if (currency === 'cad') {
      checkoutPaymentMethodTypes.push('acss_debit');
      checkoutPaymentMethodOptions.acss_debit = {
        currency,
        mandate_options: {
          payment_schedule: 'sporadic',
          transaction_type: 'personal'
        }
      };
    } else {
      checkoutPaymentMethodTypes.push('us_bank_account');
      checkoutPaymentMethodOptions.us_bank_account = {
        financial_connections: { permissions: ['payment_method'] },
        verification_method: 'instant'
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      currency,
      automatic_payment_methods: { enabled: true, allow_redirects: 'always' },
      payment_method_types: checkoutPaymentMethodTypes,
      payment_method_options: checkoutPaymentMethodOptions,
      payment_method_configuration: 'pmc_prefer_bank',
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: 'Tutoring Session',
              metadata: { bookingId }
            }
          },
          quantity: 1
        }
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: tutorAccountId },
        metadata: {
          bookingId,
          tutorUid,
          studentUid,
          platformFeeCents: applicationFeeCents
        }
      },
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        bookingId,
        tutorUid,
        studentUid,
        platformFeeCents: applicationFeeCents
      }
    });

    await bookingSnap.ref.update({
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent,
      status: 'pending_payment',
      paymentStatusHistory: admin.firestore.FieldValue.arrayUnion({
        status: 'pending_payment',
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        changedBy: 'stripe:createCheckoutSession',
        source: 'stripe:createCheckoutSession'
      })
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('createCheckoutSession error', error);
    res.status(500).json({ error: error.message });
  }
});
