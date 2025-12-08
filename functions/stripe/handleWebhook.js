// import functions from 'firebase-functions';
// import { onRequest } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";

import { onRequest } from 'firebase-functions/v2/https';
import { admin, db } from '../firebaseAdmin.js';
import { getStripe } from './client.js';

function getWebhookSecret() {
  const fromEnv = process.env.STRIPE_WEBHOOK_SECRET;
  const fromConfig = functions.config()?.stripe?.webhook_secret;
  return fromEnv || fromConfig || null;
}

async function upsertBookingPayment(bookingId, payload) {
  const bookingRef = db.doc(`bookings/${bookingId}`);
  const paymentsRef = db.collection('payments');
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const status = payload.status || null;
  const bookingUpdate = { ...payload, updatedAt: timestamp };
  if (status) {
    bookingUpdate.paymentStatusHistory = admin.firestore.FieldValue.arrayUnion({
      status,
      changedAt: timestamp,
      changedBy: 'stripe:webhook',
      source: 'stripe:webhook'
    });
    if (status === 'succeed_payment' || status === 'paid') {
      bookingUpdate.paidAt = timestamp;
    }
  }

  await bookingRef.set(bookingUpdate, { merge: true });
  const paymentDocId = payload.stripePaymentIntentId
    || payload.stripeCheckoutSessionId
    || payload.stripeChargeId
    || paymentsRef.doc().id;
  await paymentsRef.doc(paymentDocId).set({
    bookingId,
    ...payload,
    createdAt: timestamp
  }, { merge: true });
}

export const stripeWebhook = onRequest({ maxInstances: 2 }, async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = getWebhookSecret();
  if (!secret) {
    res.status(500).send('Stripe webhook secret not configured');
    return;
  }

  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
  } catch (error) {
    console.error('Stripe webhook verification failed', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSession(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntent(event.data.object, 'paid');
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntent(event.data.object, 'failed_payment');
        break;
      case 'payment_intent.canceled':
        await handlePaymentIntent(event.data.object, 'payment_cancelled');
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      default:
        console.log(`Unhandled Stripe event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error', error);
    res.status(500).send('Internal server error');
  }
});

async function handleCheckoutSession(session) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return;

  await upsertBookingPayment(bookingId, {
    status: 'paid',
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent,
    paymentMethodType: session.payment_method_types?.[0] || null,
    amountTotal: session.amount_total,
    currency: session.currency
  });
}

async function handlePaymentIntent(paymentIntent, status) {
  const bookingId = paymentIntent.metadata?.bookingId;
  if (!bookingId) return;

  const chargeId = paymentIntent.latest_charge || null;
  let fee = null;
  let net = null;
  let balanceTransactionId = null;

  if (chargeId) {
    const stripe = getStripe();
    const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    const balanceTx = charge.balance_transaction;
    if (balanceTx && typeof balanceTx === 'object') {
      balanceTransactionId = balanceTx.id || null;
      fee = balanceTx.fee ?? null;
      net = balanceTx.net ?? null;
    } else if (typeof balanceTx === 'string') {
      balanceTransactionId = balanceTx;
    }
  }

  await upsertBookingPayment(bookingId, {
    status,
    stripePaymentIntentId: paymentIntent.id,
    paymentMethodType: paymentIntent.payment_method_types?.[0] || null,
    amountReceived: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    applicationFeeAmount: paymentIntent.application_fee_amount,
    netAmount: net,
    stripeChargeId: chargeId,
    stripeBalanceTransactionId: balanceTransactionId,
    processingFeeAmount: fee,
    failureMessage: paymentIntent.last_payment_error?.message || null
  });
}

async function handleChargeRefunded(charge) {
  const bookingId = charge.metadata?.bookingId;
  if (!bookingId) return;

  await upsertBookingPayment(bookingId, {
    status: 'payment_refunded',
    stripeChargeId: charge.id,
    amountRefunded: charge.amount_refunded,
    paymentMethodType: charge.payment_method_details?.type || null
  });
}
