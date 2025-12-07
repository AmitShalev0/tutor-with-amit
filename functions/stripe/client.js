import functions from 'firebase-functions';
import Stripe from 'stripe';

let stripeInstance = null;

export function getStripe() {
  if (stripeInstance) {
    return stripeInstance;
  }
  const secretKey = functions.config()?.stripe?.secret_key;
  if (!secretKey) {
    throw new Error('Stripe secret key missing. Set it with: firebase functions:config:set stripe.secret_key="sk_live_..."');
  }
  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2024-06-20'
  });
  return stripeInstance;
}
