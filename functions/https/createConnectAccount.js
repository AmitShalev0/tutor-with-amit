import { onRequest } from 'firebase-functions/v2/https';
import { admin, db } from '../firebaseAdmin.js';
import { storeConnectedAccountId } from '../firestore/users.js';
import { getStripe } from '../stripe/client.js';
import { verifyBearerToken } from '../utils/auth.js';

function buildAccountStatusSnapshot(account) {
  if (!account) {
    return {
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
      requirementsEventuallyDue: [],
      futureRequirementsDue: [],
      disabledReason: null
    };
  }

  return {
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDue: account.requirements?.currently_due || [],
    requirementsEventuallyDue: account.requirements?.eventually_due || [],
    futureRequirementsDue: account.future_requirements?.currently_due || [],
    disabledReason: account.requirements?.disabled_reason || null
  };
}

export const createConnectAccount = onRequest({ cors: true }, async (req, res) => {
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
    const { tutorUid, country = 'US' } = req.body || {};
    if (!tutorUid) {
      res.status(400).json({ error: 'tutorUid is required' });
      return;
    }

    if (decodedToken.uid !== tutorUid && !decodedToken.admin) {
      res.status(403).json({ error: 'Not authorized to onboard this tutor' });
      return;
    }

    const stripe = getStripe();
    const origin = req.headers.origin || 'https://discovertutor.com';
    const refreshUrl = `${origin}/tutor-dashboard.html?connect=refresh`;
    const returnUrl = `${origin}/tutor-dashboard.html?connect=success`;

    const tutorRef = db.doc(`users/${tutorUid}`);
    const tutorSnap = await tutorRef.get();
    if (!tutorSnap.exists) {
      res.status(404).json({ error: 'Tutor not found' });
      return;
    }

    const existingAccountId = tutorSnap.data().stripeAccountId || null;

    if (existingAccountId) {
      await storeConnectedAccountId(tutorUid, existingAccountId);
      const account = await stripe.accounts.retrieve(existingAccountId);
      const accountStatus = buildAccountStatusSnapshot(account);

      await tutorRef.set({
        stripeAccountStatus: {
          ...accountStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });

      const requirementsOutstanding = (
        (Array.isArray(accountStatus.requirementsDue) && accountStatus.requirementsDue.length > 0) ||
        (Array.isArray(accountStatus.futureRequirementsDue) && accountStatus.futureRequirementsDue.length > 0)
      );

      const needsOnboarding = !accountStatus.detailsSubmitted || !accountStatus.chargesEnabled || !accountStatus.payoutsEnabled || requirementsOutstanding;

      let onboardingUrl = null;
      let dashboardUrl = null;

      if (needsOnboarding) {
        const link = await stripe.accountLinks.create({
          account: existingAccountId,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: 'account_onboarding'
        });
        onboardingUrl = link.url;
      } else {
        try {
          const loginLink = await stripe.accounts.createLoginLink(existingAccountId, {
            redirect_url: `${origin}/tutor-dashboard.html?connect=dashboard`
          });
          dashboardUrl = loginLink?.url || null;
        } catch (loginError) {
          console.warn('createConnectAccount: failed to create login link', loginError);
        }
      }

      res.json({ accountId: existingAccountId, onboardingUrl, dashboardUrl, accountStatus });
      return;
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: country === 'US' ? { requested: true } : undefined,
        acss_debit_payments: country === 'CA' ? { requested: true } : undefined,
        sepa_debit_payments: country === 'DE' || country === 'FR' ? { requested: true } : undefined
      },
      business_type: 'individual',
      metadata: { firebaseUid: tutorUid }
    });

    await storeConnectedAccountId(tutorUid, account.id);

    const accountStatus = buildAccountStatusSnapshot(account);
    await tutorRef.set({
      stripeAccountStatus: {
        ...accountStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });

    res.json({ accountId: account.id, onboardingUrl: link.url, dashboardUrl: null, accountStatus });
  } catch (error) {
    console.error('createConnectAccount error', error);
    res.status(500).json({ error: error.message });
  }
});
