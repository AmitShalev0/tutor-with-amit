import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import { admin, db } from './firebaseAdmin.js';

const fetchFn = (...args) => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args);
  }
  return import('node-fetch').then(({ default: fetch }) => fetch(...args));
};

setGlobalOptions({ region: 'us-central1' });


const linkedinClientId = defineString('LINKEDIN_CLIENT_ID');
const linkedinClientSecret = defineString('LINKEDIN_CLIENT_SECRET');
const linkedinRedirectUri = defineString('LINKEDIN_REDIRECT_URI');
const googlePlacesApiKey = defineString('GOOGLE_PLACES_API_KEY');
const appOriginsParam = defineString('APP_ORIGIN', {
  default: '*'
});
const googleOAuthClientId = defineString('GOOGLE_OAUTH_CLIENT_ID');
const googleOAuthClientSecret = defineString('GOOGLE_OAUTH_CLIENT_SECRET');
const googleOAuthRedirectUri = defineString('GOOGLE_OAUTH_REDIRECT_URI');

const STATE_COLLECTION = 'linkedinAuthStates';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LINKEDIN_SCOPES = ['r_liteprofile', 'r_emailaddress'];
const CALENDAR_STATE_COLLECTION = 'calendarAuthStates';
const CALENDAR_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
];

function getAllowedOrigins() {
  return appOriginsParam
    .value()
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch (error) {
    logger.debug('Failed to parse origin while checking dev allowance', { origin, error });
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigins = getAllowedOrigins();
  const allowAll = allowedOrigins.includes('*');
  const allowDev = isLocalDevOrigin(origin);

  if (origin && (allowAll || allowedOrigins.includes(origin) || allowDev)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else if (allowAll) {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.set('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  if (!allowAll && origin && !allowedOrigins.includes(origin) && !allowDev) {
    res.status(403).json({ error: 'Origin not allowed' });
    return true;
  }
  return false;
}

function ensureLinkedInConfig() {
  const config = {
    clientId: linkedinClientId.value(),
    clientSecret: linkedinClientSecret.value(),
    redirectUri: linkedinRedirectUri.value(),
  };
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Missing LinkedIn configuration. Set linkedin.client_id, linkedin.client_secret, and linkedin.redirect_uri.');
  }
  return config;
}

function ensureGooglePlacesKey() {
  const key = googlePlacesApiKey.value();
  if (!key) {
    throw new Error('Missing Google Places API key. Set google.places_api_key.');
  }
  return key;
}

function ensureGoogleOAuthConfig() {
  const config = {
    clientId: googleOAuthClientId.value(),
    clientSecret: googleOAuthClientSecret.value(),
    redirectUri: googleOAuthRedirectUri.value()
  };
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Missing Google OAuth configuration. Set google_oauth_client_id, google_oauth_client_secret, and google_oauth_redirect_uri.');
  }
  return config;
}

function createGoogleAuthClient() {
  const { clientId, clientSecret, redirectUri } = ensureGoogleOAuthConfig();
  return new google.auth.OAuth2({
    clientId,
    clientSecret,
    redirectUri
  });
}

function buildLinkedInAuthUrl(state, redirectUri, clientId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(' ')
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

function randomState() {
  return crypto.randomBytes(32).toString('hex');
}

function isStateExpired(stateDoc) {
  const createdAt = stateDoc?.createdAt;
  if (!createdAt || typeof createdAt.toDate !== 'function') {
    return true;
  }
  const createdDate = createdAt.toDate();
  return Date.now() - createdDate.getTime() > STATE_TTL_MS;
}

function extractPhotoUrl(profile) {
  const elements = profile?.profilePicture?.['displayImage~']?.elements;
  if (!Array.isArray(elements)) {
    return null;
  }
  const identifiers = elements.flatMap((element) => element?.identifiers || []);
  if (identifiers.length === 0) {
    return null;
  }
  identifiers.sort((a, b) => (b.height || 0) - (a.height || 0));
  return identifiers[0]?.identifier || null;
}

function extractHeadline(profile) {
  if (profile.localizedHeadline) {
    return profile.localizedHeadline;
  }
  const headline = profile.headline;
  if (headline?.localized && headline.preferredLocale) {
    const key = `${headline.preferredLocale.language}_${headline.preferredLocale.country}`;
    return headline.localized[key] || null;
  }
  return null;
}

function buildProfileUrl(profile) {
  const vanityName = profile.vanityName || profile.vanityNameV2;
  if (vanityName) {
    return `https://www.linkedin.com/in/${vanityName}/`;
  }
  if (profile.id) {
    return `https://www.linkedin.com/in/${profile.id}/`;
  }
  return null;
}

function sanitizeLinkedInData({ profile, email }) {
  const firstName = profile.localizedFirstName || profile.firstName?.localized?.en_US || '';
  const lastName = profile.localizedLastName || profile.lastName?.localized?.en_US || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  return {
    id: profile.id || null,
    vanityName: profile.vanityName || profile.vanityNameV2 || null,
    firstName: firstName || null,
    lastName: lastName || null,
    fullName,
    email: email || null,
    profileUrl: buildProfileUrl(profile),
    headline: extractHeadline(profile),
    photoURL: extractPhotoUrl(profile),
  };
}

async function createStateDocument({ state, mode, uid = null }) {
  await db.collection(STATE_COLLECTION).doc(state).set({
    mode,
    uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function consumeState(state) {
  const ref = db.collection(STATE_COLLECTION).doc(state);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  await ref.delete().catch((error) => logger.warn('Failed to delete state doc', error));
  return data;
}

async function createCalendarState(state, uid) {
  await db.collection(CALENDAR_STATE_COLLECTION).doc(state).set({
    uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function consumeCalendarState(state) {
  const ref = db.collection(CALENDAR_STATE_COLLECTION).doc(state);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  const createdAt = data?.createdAt?.toDate?.();
  if (!createdAt || Date.now() - createdAt.getTime() > CALENDAR_STATE_TTL_MS) {
    await ref.delete().catch((error) => logger.warn('Failed to delete expired calendar state', error));
    return null;
  }
  await ref.delete().catch((error) => logger.warn('Failed to delete calendar state doc', error));
  return data;
}

async function fetchLinkedInToken({ code, redirectUri, clientId, clientSecret }) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchFn('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn token request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  if (!json.access_token) {
    throw new Error('LinkedIn token response missing access_token');
  }

  return json.access_token;
}

async function fetchLinkedInProfile(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  const profileResponse = await fetchFn('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,vanityName,headline,localizedHeadline,profilePicture(displayImage~:playableStreams))', {
    headers
  });
  if (!profileResponse.ok) {
    const errorText = await profileResponse.text();
    throw new Error(`LinkedIn profile request failed: ${profileResponse.status} ${errorText}`);
  }
  const profile = await profileResponse.json();

  const emailResponse = await fetchFn('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
    headers
  });
  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    throw new Error(`LinkedIn email request failed: ${emailResponse.status} ${errorText}`);
  }
  const emailJson = await emailResponse.json();
  const email = emailJson?.elements?.[0]?.['handle~']?.emailAddress || null;

  return sanitizeLinkedInData({ profile, email });
}

async function ensureUserForLinkedIn(linkedinData) {
  if (!linkedinData.id) {
    throw new Error('LinkedIn profile missing member id.');
  }

  const existingByLinkedIn = await db
    .collection('users')
    .where('linkedin.id', '==', linkedinData.id)
    .limit(1)
    .get();

  if (!existingByLinkedIn.empty) {
    return existingByLinkedIn.docs[0].id;
  }

  if (linkedinData.email) {
    try {
      const userRecord = await admin.auth().getUserByEmail(linkedinData.email);
      return userRecord.uid;
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        logger.warn('getUserByEmail error', error);
      }
    }
  }

  const generatedUid = `linkedin:${linkedinData.id}`;
  const displayName = linkedinData.fullName || undefined;
  const photoURL = linkedinData.photoURL || undefined;

  try {
    await admin.auth().createUser({
      uid: generatedUid,
      displayName,
      photoURL,
      email: linkedinData.email || undefined,
      emailVerified: Boolean(linkedinData.email)
    });
  } catch (error) {
    if (error.code === 'auth/uid-already-exists') {
      logger.info('UID already exists for LinkedIn user', generatedUid);
    } else {
      throw error;
    }
  }

  return generatedUid;
}

async function storeLinkedInDataForUser(uid, linkedinData) {
  const userRef = db.collection('users').doc(uid);
  const payload = {
    linkedin: {
      id: linkedinData.id,
      vanityName: linkedinData.vanityName || null,
      profileUrl: linkedinData.profileUrl || null,
      headline: linkedinData.headline || null,
      email: linkedinData.email || null,
      fullName: linkedinData.fullName || null,
      photoURL: linkedinData.photoURL || null,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };

  if (linkedinData.fullName) {
    payload.fullName = linkedinData.fullName;
  }
  if (linkedinData.email) {
    payload.email = linkedinData.email;
  }

  await userRef.set(payload, { merge: true });

  const userDoc = await userRef.get();
  const tutorProfileId = userDoc.exists ? userDoc.data().tutorProfileId : null;
  if (tutorProfileId) {
    const tutorProfileRef = db.collection('tutorProfiles').doc(tutorProfileId);
    await tutorProfileRef.set({
      linkedin: {
        profileUrl: linkedinData.profileUrl || null,
        headline: linkedinData.headline || null,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true });
  }
}

function renderCallbackPage(payload, errorMessage = null) {
  const safePayload = JSON.stringify(payload || {}).replace(/</g, '\\u003c');
  const safeError = errorMessage ? JSON.stringify(errorMessage).replace(/</g, '\\u003c') : 'null';
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>LinkedIn Authentication</title>
  </head>
  <body>
    <script>
      (function() {
        const payload = ${safePayload};
        const errorMessage = ${safeError};
        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage({ provider: 'linkedin', payload, errorMessage }, '*');
        }
        window.close();
      })();
    </script>
    <p>You can close this window.</p>
  </body>
</html>`;
}

function renderCalendarCallbackPage(payload, errorMessage = null) {
  const safePayload = JSON.stringify(payload || {}).replace(/</g, '\u003c');
  const safeError = errorMessage ? JSON.stringify(errorMessage).replace(/</g, '\u003c') : 'null';
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google Calendar Pairing</title>
  </head>
  <body>
    <script>
      (function() {
        const payload = ${safePayload};
        const errorMessage = ${safeError};
        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage({ provider: 'google-calendar', payload, errorMessage }, '*');
        }
        window.close();
      })();
    </script>
    <p>You can close this window.</p>
  </body>
</html>`;
}

export const startLinkedInAuth = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let config;
  try {
    config = ensureLinkedInConfig();
  } catch (error) {
    logger.error(error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  const { mode = 'link' } = req.body || {};
  if (!['link', 'signIn'].includes(mode)) {
    res.status(400).json({ error: 'Invalid mode. Use "link" or "signIn".' });
    return;
  }

  let uid = null;
  if (mode === 'link') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Authorization token required.' });
      return;
    }
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (error) {
      logger.warn('Failed to verify ID token for LinkedIn start', error);
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }
  }

  const state = randomState();
  await createStateDocument({ state, mode, uid });
  const url = buildLinkedInAuthUrl(state, config.redirectUri, config.clientId);
  res.json({ url, state, expiresIn: STATE_TTL_MS / 1000 });
});

export const linkedinCallback = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  const { state, code, error, error_description: errorDescription } = req.query;

  if (!state) {
    res.status(400).send(renderCallbackPage(null, 'Missing state.'));
    return;
  }

  const stateData = await consumeState(state);
  if (!stateData) {
    res.status(400).send(renderCallbackPage(null, 'Invalid or expired sign-in attempt.'));
    return;
  }

  if (isStateExpired(stateData)) {
    res.status(400).send(renderCallbackPage(null, 'This sign-in attempt has expired. Please try again.'));
    return;
  }

  if (error) {
    const message = errorDescription || error;
    res.status(400).send(renderCallbackPage(null, message));
    return;
  }

  if (!code) {
    res.status(400).send(renderCallbackPage(null, 'Missing authorization code.'));
    return;
  }

  let config;
  try {
    config = ensureLinkedInConfig();
  } catch (configError) {
    logger.error(configError.message);
    res.status(500).send(renderCallbackPage(null, 'Server configuration error.'));
    return;
  }

  try {
    const accessToken = await fetchLinkedInToken({
      code,
      redirectUri: config.redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });

    const linkedinData = await fetchLinkedInProfile(accessToken);

    if (!linkedinData.id) {
      throw new Error('LinkedIn did not return a profile id.');
    }

    const responseLinkedInData = {
      ...linkedinData,
      syncedAt: new Date().toISOString(),
    };

    const payload = {
      mode: stateData.mode,
      linkedin: responseLinkedInData,
    };

    if (stateData.mode === 'link') {
      if (!stateData.uid) {
        throw new Error('Missing user context for LinkedIn linking.');
      }
      await storeLinkedInDataForUser(stateData.uid, linkedinData);
    } else if (stateData.mode === 'signIn') {
      const uid = await ensureUserForLinkedIn(linkedinData);
      await storeLinkedInDataForUser(uid, linkedinData);
      const customToken = await admin.auth().createCustomToken(uid, { provider: 'linkedin' });
      payload.customToken = customToken;
    }

    res.status(200).send(renderCallbackPage(payload, null));
  } catch (authError) {
    logger.error('LinkedIn callback error', authError);
    res.status(500).send(renderCallbackPage(null, 'Unable to complete LinkedIn authentication.'));
  }
});

export const unlinkLinkedIn = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authorization token required.' });
    return;
  }

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (error) {
    logger.warn('Failed to verify ID token for unlink', error);
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  try {
    const userRef = db.collection('users').doc(uid);
    await userRef.set({
      linkedin: admin.firestore.FieldValue.delete()
    }, { merge: true });

    const userDoc = await userRef.get();
    const tutorProfileId = userDoc.exists ? userDoc.data().tutorProfileId : null;
    if (tutorProfileId) {
      await db.collection('tutorProfiles').doc(tutorProfileId).set({
        linkedin: admin.firestore.FieldValue.delete()
      }, { merge: true });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to unlink LinkedIn data', error);
    res.status(500).json({ error: 'Failed to remove LinkedIn data.' });
  }
});

export const startGoogleCalendarAuth = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let uid;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authorization token required.' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (error) {
    logger.warn('Failed to verify ID token for Google Calendar start', error);
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  let oauthClient;
  try {
    oauthClient = createGoogleAuthClient();
  } catch (error) {
    logger.error('Google OAuth config error', error);
    res.status(500).json({ error: error.message });
    return;
  }

  const state = randomState();
  await createCalendarState(state, uid);

  const authUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: CALENDAR_SCOPES,
    state,
    include_granted_scopes: true
  });

  res.json({ url: authUrl, state, expiresIn: CALENDAR_STATE_TTL_MS / 1000 });
});

export const googleCalendarCallback = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  const { state, code, error, error_description: errorDescription } = req.query;

  if (!state) {
    res.status(400).send(renderCalendarCallbackPage(null, 'Missing state.'));
    return;
  }

  const stateData = await consumeCalendarState(state);
  if (!stateData?.uid) {
    res.status(400).send(renderCalendarCallbackPage(null, 'Invalid or expired pairing attempt.'));
    return;
  }

  if (error) {
    const message = errorDescription || error;
    res.status(400).send(renderCalendarCallbackPage(null, message));
    return;
  }

  if (!code) {
    res.status(400).send(renderCalendarCallbackPage(null, 'Missing authorization code.'));
    return;
  }

  let oauthClient;
  try {
    oauthClient = createGoogleAuthClient();
  } catch (configError) {
    logger.error('Google OAuth config error', configError);
    res.status(500).send(renderCalendarCallbackPage(null, 'Server configuration error.'));
    return;
  }

  try {
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    let email = null;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
      const { data: userInfo } = await oauth2.userinfo.get();
      email = userInfo?.email || null;
    } catch (infoError) {
      logger.warn('Failed to fetch Google userinfo', infoError);
    }

    let primaryCalendarId = 'primary';
    let primarySummary = null;
    try {
      const calendarApi = google.calendar({ version: 'v3', auth: oauthClient });
      const { data: primary } = await calendarApi.calendarList.get({ calendarId: 'primary' });
      primaryCalendarId = primary?.id || 'primary';
      primarySummary = primary?.summary || null;
    } catch (calendarError) {
      logger.warn('Failed to fetch primary calendar', calendarError);
    }

    const tokenPayload = {
      email: email || primaryCalendarId || null,
      primaryCalendarId,
      primaryCalendarSummary: primarySummary,
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || null,
      scope: tokens.scope || CALENDAR_SCOPES.join(' '),
      tokenType: tokens.token_type || 'Bearer',
      expiryDate: tokens.expiry_date || null,
      connected: true,
      syncedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const userRef = db.collection('users').doc(stateData.uid);
    await userRef.set({
      calendar: {
        google: tokenPayload
      }
    }, { merge: true });

    const userDoc = await userRef.get();
    const tutorProfileId = userDoc.exists ? userDoc.data().tutorProfileId : null;
    if (tutorProfileId) {
      await db.collection('tutorProfiles').doc(tutorProfileId).set({
        calendar: {
          google: {
            email: tokenPayload.email,
            primaryCalendarId,
            primaryCalendarSummary: primarySummary,
            connected: true,
            syncedAt: admin.firestore.FieldValue.serverTimestamp()
          }
        }
      }, { merge: true });
    }

    const responsePayload = {
      calendar: {
        email: tokenPayload.email,
        primaryCalendarId,
        primaryCalendarSummary: primarySummary,
        connected: true,
        syncedAt: new Date().toISOString()
      }
    };

    res.status(200).send(renderCalendarCallbackPage(responsePayload, null));
  } catch (authError) {
    logger.error('Google Calendar callback error', authError);
    res.status(500).send(renderCalendarCallbackPage(null, 'Unable to complete Google Calendar pairing.'));
  }
});

export const getPlaceDetails = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const placeId = (req.body && req.body.placeId) || null;
  if (!placeId || typeof placeId !== 'string') {
    res.status(400).json({ error: 'placeId is required' });
    return;
  }

  let apiKey;
  try {
    apiKey = ensureGooglePlacesKey();
  } catch (error) {
    logger.error(error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  try {
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', placeId);
    detailsUrl.searchParams.set('fields', 'name,formatted_address,geometry/location,url,place_id');
    detailsUrl.searchParams.set('key', apiKey);
    detailsUrl.searchParams.set('language', 'en');

    const response = await fetchFn(detailsUrl);
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Google Places HTTP error', response.status, errorText);
      res.status(502).json({ error: 'Failed to fetch place details.' });
      return;
    }

    const json = await response.json();
    if (json.status !== 'OK') {
      logger.warn('Google Places responded with non-OK status', json.status, json.error_message, placeId);
      res.status(502).json({ error: json.error_message || json.status || 'Google Places lookup failed.' });
      return;
    }

    const result = json.result || {};
    res.json({
      placeId: result.place_id || placeId,
      name: result.name || null,
      formattedAddress: result.formatted_address || null,
      location: result.geometry?.location || null,
      mapsUrl: result.url || null
    });
  } catch (error) {
    logger.error('Google Places lookup error', error);
    res.status(500).json({ error: 'Unable to retrieve Google Places details.' });
  }
});

export { createConnectAccount } from './https/createConnectAccount.js';
export { createCheckoutSession } from './stripe/createCheckoutSession.js';
export { createPaymentIntent } from './stripe/createPaymentIntent.js';
export { stripeWebhook } from './stripe/handleWebhook.js';

