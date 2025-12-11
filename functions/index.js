import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import { getCoursesFromSource } from './course-sources/index.js';
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

const microsoftClientId = defineString('MICROSOFT_CLIENT_ID');
const microsoftClientSecret = defineString('MICROSOFT_CLIENT_SECRET');
const microsoftRedirectUri = defineString('MICROSOFT_REDIRECT_URI');
const microsoftTenant = defineString('MICROSOFT_TENANT', { default: 'common' });

const STATE_COLLECTION = 'linkedinAuthStates';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LINKEDIN_SCOPES = ['openid', 'profile', 'r_profile_basicinfo'];
const CALENDAR_STATE_COLLECTION = 'calendarAuthStates';
const CALENDAR_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MICROSOFT_STATE_COLLECTION = 'microsoftAuthStates';
const MICROSOFT_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
];

// Online meeting creation requires these.
const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'OnlineMeetings.ReadWrite'
];

function normalizeMeetingMode(raw) {
  if (!raw) {
    return null;
  }
  const value = String(raw).trim();
  if (!value) {
    return null;
  }
  const lowered = value.toLowerCase();
  if (lowered === 'online') return 'online';
  if (lowered === 'tutorsoffice' || lowered === "tutor's office" || lowered === 'office') return 'tutorsOffice';
  if (lowered === 'travel' || lowered === 'traveltome' || lowered === 'travel_to_me') return 'travel';
  return value;
}

async function refreshMicrosoftAccessTokenIfNeeded(uid) {
  const privateRef = db.collection('users').doc(uid).collection('private').doc('microsoft');
  const snap = await privateRef.get();
  if (!snap.exists) {
    return null;
  }
  const current = snap.data() || {};
  const accessToken = current.accessToken || null;
  const refreshToken = current.refreshToken || null;
  const expiresAt = typeof current.expiresAt === 'number' ? current.expiresAt : null;

  const needsRefresh = !accessToken || !expiresAt || (Date.now() + (5 * 60 * 1000) >= expiresAt);
  if (!needsRefresh) {
    return { accessToken, tokenType: current.tokenType || 'Bearer' };
  }

  if (!refreshToken) {
    return null;
  }

  const config = ensureMicrosoftOAuthConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: config.redirectUri
  });

  const response = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant || 'common')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error_description || json?.error || 'Microsoft token refresh failed.';
    throw new Error(message);
  }

  const expiresInSec = Number(json.expires_in || 0);
  const newExpiresAt = expiresInSec ? Date.now() + (expiresInSec * 1000) : null;

  await privateRef.set({
    accessToken: json.access_token || null,
    refreshToken: json.refresh_token || refreshToken,
    tokenType: json.token_type || 'Bearer',
    scope: json.scope || current.scope || MICROSOFT_SCOPES.join(' '),
    expiresAt: newExpiresAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { accessToken: json.access_token || null, tokenType: json.token_type || 'Bearer' };
}

async function createTeamsOnlineMeeting({ accessToken, startDateTime, endDateTime, subject }) {
  const body = {
    startDateTime,
    endDateTime,
    subject: subject || 'Tutoring Session'
  };
  const response = await fetchFn('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || 'Microsoft Graph meeting creation failed.';
    throw new Error(message);
  }
  return {
    id: json.id || null,
    joinUrl: json.joinWebUrl || null
  };
}

function buildTeamsSeriesKey({ tutorUid, guardianEmail, subject, startTime, recurringSeriesStart, recurringSeriesEnd }) {
  const raw = [tutorUid || '', guardianEmail || '', subject || '', startTime || '', recurringSeriesStart || '', recurringSeriesEnd || ''].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function getOrCreateTeamsMeetingForSeries({ tutorUid, seriesKey, startDateTime, endDateTime, subject }) {
  const seriesRef = db.collection('teamsMeetingSeries').doc(seriesKey);
  const existing = await seriesRef.get();
  if (existing.exists) {
    const data = existing.data() || {};
    if (data.joinUrl && data.meetingId && data.tutorUid === tutorUid) {
      return { meetingId: data.meetingId, joinUrl: data.joinUrl, reused: true };
    }
  }

  const token = await refreshMicrosoftAccessTokenIfNeeded(tutorUid);
  if (!token?.accessToken) {
    throw new Error('Tutor Microsoft Teams is not connected (missing access token).');
  }

  const created = await createTeamsOnlineMeeting({
    accessToken: token.accessToken,
    startDateTime,
    endDateTime,
    subject
  });

  await seriesRef.set({
    tutorUid,
    meetingId: created.id,
    joinUrl: created.joinUrl,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { meetingId: created.id, joinUrl: created.joinUrl, reused: false };
}

async function resolveTutorOfficeAddress(bookingData) {
  const tutorProfileId = bookingData?.tutorProfileId || bookingData?.tutorProfileID || bookingData?.tutorProfile || null;
  if (tutorProfileId) {
    const profileSnap = await db.collection('tutorProfiles').doc(String(tutorProfileId)).get();
    if (profileSnap.exists) {
      const profile = profileSnap.data() || {};
      const direct = profile.officeAddress || null;
      const formatted = profile?.tutorLocation?.basePlace?.formattedAddress || null;
      return direct || formatted || null;
    }
  }

  const tutorUid = bookingData?.tutorUid || bookingData?.tutorId || null;
  if (tutorUid) {
    const tutorSnap = await db.collection('tutors').doc(String(tutorUid)).get();
    if (tutorSnap.exists) {
      const data = tutorSnap.data() || {};
      return data.officeAddress || null;
    }
  }

  return null;
}

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

function ensureMicrosoftOAuthConfig() {
  const config = {
    clientId: microsoftClientId.value(),
    clientSecret: microsoftClientSecret.value(),
    redirectUri: microsoftRedirectUri.value(),
    tenant: microsoftTenant.value() || 'common'
  };

  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Missing Microsoft OAuth configuration. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.');
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

async function createMicrosoftState(state, uid) {
  await db.collection(MICROSOFT_STATE_COLLECTION).doc(state).set({
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

async function consumeMicrosoftState(state) {
  const ref = db.collection(MICROSOFT_STATE_COLLECTION).doc(state);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  const createdAt = data?.createdAt?.toDate?.();
  if (!createdAt || Date.now() - createdAt.getTime() > MICROSOFT_STATE_TTL_MS) {
    await ref.delete().catch((error) => logger.warn('Failed to delete expired Microsoft state', error));
    return null;
  }
  await ref.delete().catch((error) => logger.warn('Failed to delete Microsoft state doc', error));
  return data;
}

function renderMicrosoftCallbackPage(payload, errorMessage = null) {
  const safePayload = JSON.stringify(payload || {}).replace(/</g, '\\u003c');
  const safeError = errorMessage ? JSON.stringify(errorMessage).replace(/</g, '\\u003c') : 'null';
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Microsoft Teams Pairing</title>
  </head>
  <body>
    <script>
      (function() {
        const payload = ${safePayload};
        const errorMessage = ${safeError};
        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage({ provider: 'microsoft-teams', payload, errorMessage }, '*');
        }
        window.close();
      })();
    </script>
    <p>You can close this window.</p>
  </body>
</html>`;
}

function buildMicrosoftAuthorizeUrl({ tenant, clientId, redirectUri, state, scopes }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: (scopes || []).join(' '),
    state
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeMicrosoftCodeForTokens({ tenant, clientId, clientSecret, redirectUri, code }) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const response = await fetchFn(`https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error_description || json?.error || 'Microsoft token exchange failed.';
    throw new Error(message);
  }
  return json;
}

async function fetchMicrosoftMe(accessToken) {
  const response = await fetchFn('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('Unable to fetch Microsoft profile.');
  }
  return json;
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

export const startMicrosoftTeamsAuth = onRequest(async (req, res) => {
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
    logger.warn('Failed to verify ID token for Microsoft Teams start', error);
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  let config;
  try {
    config = ensureMicrosoftOAuthConfig();
  } catch (error) {
    logger.error('Microsoft OAuth config error', error);
    res.status(500).json({ error: error.message });
    return;
  }

  const state = randomState();
  await createMicrosoftState(state, uid);

  const url = buildMicrosoftAuthorizeUrl({
    tenant: config.tenant,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    scopes: MICROSOFT_SCOPES
  });

  res.json({ url, state, expiresIn: MICROSOFT_STATE_TTL_MS / 1000 });
});

export const microsoftTeamsCallback = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  const { state, code, error, error_description: errorDescription } = req.query;

  if (!state) {
    res.status(400).send(renderMicrosoftCallbackPage(null, 'Missing state.'));
    return;
  }

  const stateData = await consumeMicrosoftState(state);
  if (!stateData?.uid) {
    res.status(400).send(renderMicrosoftCallbackPage(null, 'Invalid or expired pairing attempt.'));
    return;
  }

  if (error) {
    const message = errorDescription || error;
    res.status(400).send(renderMicrosoftCallbackPage(null, message));
    return;
  }

  if (!code) {
    res.status(400).send(renderMicrosoftCallbackPage(null, 'Missing authorization code.'));
    return;
  }

  let config;
  try {
    config = ensureMicrosoftOAuthConfig();
  } catch (configError) {
    logger.error('Microsoft OAuth config error', configError);
    res.status(500).send(renderMicrosoftCallbackPage(null, 'Server configuration error.'));
    return;
  }

  try {
    const tokens = await exchangeMicrosoftCodeForTokens({
      tenant: config.tenant,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      code
    });

    const expiresInSec = Number(tokens.expires_in || 0);
    const expiresAt = expiresInSec ? Date.now() + (expiresInSec * 1000) : null;

    let me = null;
    try {
      me = await fetchMicrosoftMe(tokens.access_token);
    } catch (meError) {
      logger.warn('Failed to fetch Microsoft /me profile', meError);
    }

    const microsoftSummary = {
      connected: true,
      tenant: config.tenant,
      scopes: tokens.scope || MICROSOFT_SCOPES.join(' '),
      microsoftUserId: me?.id || null,
      email: me?.mail || me?.userPrincipalName || null,
      displayName: me?.displayName || null,
      syncedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Store secrets in a private subcollection to avoid exposing refresh tokens to clients.
    await db.collection('users').doc(stateData.uid)
      .collection('private').doc('microsoft')
      .set({
        accessToken: tokens.access_token || null,
        refreshToken: tokens.refresh_token || null,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope || MICROSOFT_SCOPES.join(' '),
        expiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    const userRef = db.collection('users').doc(stateData.uid);
    await userRef.set({
      microsoft: microsoftSummary
    }, { merge: true });

    const userDoc = await userRef.get();
    const tutorProfileId = userDoc.exists ? userDoc.data().tutorProfileId : null;
    if (tutorProfileId) {
      await db.collection('tutorProfiles').doc(tutorProfileId).set({
        microsoft: {
          connected: true,
          microsoftUserId: microsoftSummary.microsoftUserId,
          email: microsoftSummary.email,
          displayName: microsoftSummary.displayName,
          syncedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });
    }

    res.status(200).send(renderMicrosoftCallbackPage({ microsoft: { ...microsoftSummary, syncedAt: new Date().toISOString() } }, null));
  } catch (authError) {
    logger.error('Microsoft Teams callback error', authError);
    res.status(500).send(renderMicrosoftCallbackPage(null, 'Unable to complete Microsoft Teams pairing.'));
  }
});

export const onBookingApprovedCreateTeamsMeeting = onDocumentUpdated('bookings/{bookingId}', async (event) => {
  const before = event.data?.before?.data?.() || null;
  const after = event.data?.after?.data?.() || null;
  if (!after) {
    return;
  }

  const beforeApproval = (before?.approvalStatus || before?.status || '').toString().toLowerCase();
  const afterApproval = (after?.approvalStatus || after?.status || '').toString().toLowerCase();

  // Only act on transitions into approved.
  const becameApproved = (beforeApproval !== 'approved') && (afterApproval === 'approved');
  if (!becameApproved) {
    return;
  }

  // Idempotency: if we already wrote a meeting link, skip.
  if (after?.meetingLink || after?.teamsMeetingLink || after?.onlineMeetingUrl) {
    return;
  }

  const meetingMode = normalizeMeetingMode(after?.meetingMode || after?.meeting_mode || after?.locationChoice || after?.location_choice);
  if (meetingMode && meetingMode !== 'online') {
    // For now only create Teams meetings for online sessions.
    const resolvedLocation = meetingMode === 'tutorsOffice'
      ? await resolveTutorOfficeAddress(after)
      : (after?.travelAddress || after?.travel_address || after?.location || null);

    await event.data.after.ref.set({
      resolvedLocation: resolvedLocation || null,
      resolvedMeetingMode: meetingMode,
      meetingProvider: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return;
  }

  const tutorUid = after?.tutorUid || after?.tutorId || null;
  if (!tutorUid || tutorUid === 'unassigned') {
    logger.warn('Booking approved but tutorUid missing; skipping Teams creation', { bookingId: event.params.bookingId });
    return;
  }

  const sessionDate = after?.sessionDate || after?.selected_date || null;
  const startTime = after?.startTime || after?.selected_start || null;
  const endTime = after?.endTime || null;
  if (!sessionDate || !startTime || !endTime) {
    logger.warn('Booking missing sessionDate/startTime/endTime; skipping Teams creation', { bookingId: event.params.bookingId });
    return;
  }

  // Treat times as local naive and encode as ISO with no timezone offset.
  const startDateTime = `${sessionDate}T${startTime}:00`;
  const endDateTime = `${sessionDate}T${endTime}:00`;

  const guardianEmail = (after?.guardianEmail || after?.email || '').toString().trim().toLowerCase();
  const subject = (after?.subject || after?.sessionTitle || 'Tutoring Session').toString();
  const seriesKey = buildTeamsSeriesKey({
    tutorUid: String(tutorUid),
    guardianEmail,
    subject,
    startTime,
    recurringSeriesStart: after?.recurringSeriesStart || null,
    recurringSeriesEnd: after?.recurringSeriesEnd || null
  });

  try {
    const meeting = await getOrCreateTeamsMeetingForSeries({
      tutorUid: String(tutorUid),
      seriesKey,
      startDateTime,
      endDateTime,
      subject
    });

    await event.data.after.ref.set({
      meetingProvider: 'microsoft-teams',
      meetingLink: meeting.joinUrl || null,
      teamsMeetingId: meeting.meetingId || null,
      teamsSeriesKey: seriesKey,
      teamsMeetingReused: meeting.reused === true,
      resolvedMeetingMode: 'online',
      resolvedLocation: meeting.joinUrl ? 'Online (Microsoft Teams)' : 'Online',
      meetingCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    logger.error('Failed to create Teams meeting on approval', { bookingId: event.params.bookingId, error: error?.message || error });
    await event.data.after.ref.set({
      meetingProvider: 'microsoft-teams',
      meetingCreateError: error?.message || String(error),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
});

export const listCourses = onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const country = (req.query.country || 'ca').toString().toLowerCase();
  const subject = (req.query.subject || '').toString().toLowerCase() || null;
  const level = (req.query.level || '').toString().toLowerCase() || null;

  try {
    const courses = await getCoursesFromSource({ country, subject: subject || null, level: level || null });
    res.json({ country, count: courses.length, courses });
  } catch (error) {
    logger.error('listCourses failed', error);
    res.status(500).json({ error: 'Unable to list courses.' });
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

