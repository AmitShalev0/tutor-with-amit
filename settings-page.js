import './firebase-config.js';

const auth = window.firebaseAuth;
const onAuth = window.firebaseOnAuth;
const signOut = window.firebaseSignOut;
const db = window.firebaseDb;
const getDoc = window.firestoreGetDoc;
const setDoc = window.firestoreSetDoc;
const updateDoc = window.firestoreUpdateDoc;
const docFn = window.firestoreDoc;
const reauth = window.firebaseReauthenticateWithCredential;
const emailProvider = window.firebaseEmailAuthProvider;
const updateEmail = window.firebaseUpdateEmail;
const updatePassword = window.firebaseUpdatePassword;
const deleteUser = window.firebaseDeleteUser;
const deleteDoc = window.firestoreDeleteDoc;
const getDocs = window.firestoreGetDocs;
const query = window.firestoreQuery;
const where = window.firestoreWhere;
const collection = window.firestoreCollection;

const profileForm = document.getElementById('profile-form');
const emailForm = document.getElementById('email-form');
const passwordForm = document.getElementById('password-form');
const deleteForm = document.getElementById('delete-form');

const profileStatus = document.getElementById('profile-status');
const emailStatus = document.getElementById('email-status');
const passwordStatus = document.getElementById('password-status');
const deleteStatus = document.getElementById('delete-status');

const firstNameInput = document.getElementById('settings-first-name');
const middleNameInput = document.getElementById('settings-middle-name');
const lastNameInput = document.getElementById('settings-last-name');
const emailInput = document.getElementById('settings-email');
const phoneInput = document.getElementById('settings-phone');
const notifyApproved = document.getElementById('settings-notify-approved');
const notifySessionDeleted = document.getElementById('settings-notify-session-deleted');
const notifyInvoice = document.getElementById('settings-notify-invoice');
const notifyReceipt = document.getElementById('settings-notify-receipt');
const themeToggle = document.getElementById('settings-theme-toggle');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const themeAutoToggle = document.getElementById('settings-theme-auto');
const lightTimeInput = document.getElementById('settings-light-time');
const darkTimeInput = document.getElementById('settings-dark-time');
const pauseTutorToggle = document.getElementById('pause-tutor-toggle');
const pauseStudentToggle = document.getElementById('pause-student-toggle');
const pausePasswordInput = document.getElementById('pause-password');
const pauseApplyBtn = document.getElementById('pause-apply-btn');
const pauseStatus = document.getElementById('pause-status');
const deleteTutorBtn = document.getElementById('delete-tutor-btn');
const deleteStudentBtn = document.getElementById('delete-student-btn');

const newEmailInput = document.getElementById('settings-new-email');
const emailPasswordInput = document.getElementById('settings-email-password');
const currentPasswordInput = document.getElementById('settings-current-password');
const newPasswordInput = document.getElementById('settings-new-password');
const confirmPasswordInput = document.getElementById('settings-confirm-password');

const deleteConfirmInput = document.getElementById('delete-confirm');
const deleteEmailInput = document.getElementById('delete-email');
const deletePasswordInput = document.getElementById('delete-password');
const serverTimestamp = window.firestoreServerTimestamp;
const arrayRemove = window.firestoreArrayRemove;
const statsEmailEndpoint = window.statsEmailEndpoint || window.STATS_EMAIL_ENDPOINT || null;

let currentUser = null;
let currentUserDoc = null;
let autoThemeIntervalId = null;

function splitNameParts(name = '') {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', middle: '', last: 'last name' };
  if (parts.length === 1) return { first: parts[0], middle: '', last: 'last name' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] };
}

function buildFullName(first, middle, last) {
  return [first, middle, last].filter(Boolean).join(' ');
}

function setThemeToggleState(isLight) {
  if (!themeToggle) return;
  themeToggle.dataset.state = isLight ? 'on' : 'off';
  themeToggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  themeToggle.classList.toggle('is-on', isLight);
}

function getThemeToggleState() {
  if (!themeToggle) return false;
  return themeToggle.dataset.state === 'on';
}

const THEME_KEY = 'site-theme';
const THEME_MODE_KEY = 'site-theme-mode';
const THEME_LIGHT_KEY = 'site-theme-light-time';
const THEME_DARK_KEY = 'site-theme-dark-time';
const DEFAULT_LIGHT_TIME = '07:00';
const DEFAULT_DARK_TIME = '19:00';

function setStatus(el, message, tone = 'muted') {
  if (!el) return;
  el.textContent = message || '';
  el.style.color = tone === 'error' ? '#fecaca' : tone === 'success' ? '#bbf7d0' : '';
}

function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      button.textContent = isHidden ? '👀' : '🙈';
    });
  });
}

function ensureTheme() {
  if (!themeToggle) return;

  const mode = localStorage.getItem(THEME_MODE_KEY) || 'manual';
  const storedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  const lightTime = localStorage.getItem(THEME_LIGHT_KEY) || DEFAULT_LIGHT_TIME;
  const darkTime = localStorage.getItem(THEME_DARK_KEY) || DEFAULT_DARK_TIME;

  if (lightTimeInput) {
    lightTimeInput.value = lightTime;
    lightTimeInput.addEventListener('change', () => {
      const value = lightTimeInput.value || DEFAULT_LIGHT_TIME;
      localStorage.setItem(THEME_LIGHT_KEY, value);
      if (themeAutoToggle?.checked) applyAutoTheme();
    });
  }

  if (darkTimeInput) {
    darkTimeInput.value = darkTime;
    darkTimeInput.addEventListener('change', () => {
      const value = darkTimeInput.value || DEFAULT_DARK_TIME;
      localStorage.setItem(THEME_DARK_KEY, value);
      if (themeAutoToggle?.checked) applyAutoTheme();
    });
  }

  if (themeAutoToggle) {
    themeAutoToggle.checked = mode === 'auto';
    themeAutoToggle.addEventListener('change', () => {
      if (themeAutoToggle.checked) {
        localStorage.setItem(THEME_MODE_KEY, 'auto');
        if (themeToggle) {
          themeToggle.disabled = true;
          themeToggle.classList.add('is-disabled');
        }
        applyAutoTheme();
        startAutoThemeInterval();
      } else {
        localStorage.setItem(THEME_MODE_KEY, 'manual');
        stopAutoThemeInterval();
        if (themeToggle) {
          themeToggle.disabled = false;
          themeToggle.classList.remove('is-disabled');
          const next = getThemeToggleState() ? 'light' : 'dark';
          setManualTheme(next);
        }
      }
    });
  }

  if (themeToggle) {
    setThemeToggleState(storedTheme === 'light');
    themeToggle.addEventListener('click', () => {
      if (themeToggle.disabled) return;
      if (themeAutoToggle?.checked) {
        themeAutoToggle.checked = false;
        localStorage.setItem(THEME_MODE_KEY, 'manual');
        stopAutoThemeInterval();
      }
      const next = !getThemeToggleState();
      setThemeToggleState(next);
      const themeValue = next ? 'light' : 'dark';
      setManualTheme(themeValue);
    });
  }

  if (mode === 'auto') {
    if (themeToggle) {
      themeToggle.disabled = true;
      themeToggle.classList.add('is-disabled');
    }
    applyAutoTheme();
    startAutoThemeInterval();
  } else {
    setManualTheme(storedTheme === 'light' ? 'light' : 'dark');
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light-theme');
    document.body.classList.add('light-theme');
  } else {
    document.documentElement.classList.remove('light-theme');
    document.body.classList.remove('light-theme');
  }
  if (themeToggleLabel) {
    themeToggleLabel.textContent = theme === 'light' ? '🌞 Light mode' : '🌙 Dark mode';
  }
  if (themeToggle) {
    setThemeToggleState(theme === 'light');
  }
}

function setManualTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(THEME_MODE_KEY, 'manual');
  if (themeAutoToggle) themeAutoToggle.checked = false;
  if (themeToggle) {
    themeToggle.disabled = false;
    themeToggle.classList.remove('is-disabled');
    setThemeToggleState(theme === 'light');
  }
}

function parseTimeToMinutes(value, fallback) {
  const [h, m] = (value || '').split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function applyAutoTheme() {
  const lightValue = (lightTimeInput && lightTimeInput.value) || DEFAULT_LIGHT_TIME;
  const darkValue = (darkTimeInput && darkTimeInput.value) || DEFAULT_DARK_TIME;
  localStorage.setItem(THEME_LIGHT_KEY, lightValue);
  localStorage.setItem(THEME_DARK_KEY, darkValue);

  const lightStart = parseTimeToMinutes(lightValue, parseTimeToMinutes(DEFAULT_LIGHT_TIME, 420));
  const darkStart = parseTimeToMinutes(darkValue, parseTimeToMinutes(DEFAULT_DARK_TIME, 1140));
  const now = currentMinutes();

  let useLight = true;
  if (lightStart === darkStart) {
    useLight = true;
  } else if (lightStart < darkStart) {
    useLight = now >= lightStart && now < darkStart;
  } else {
    // Light period wraps past midnight
    useLight = now >= lightStart || now < darkStart;
  }

  const theme = useLight ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
}

function startAutoThemeInterval() {
  stopAutoThemeInterval();
  autoThemeIntervalId = setInterval(applyAutoTheme, 60000);
}

function stopAutoThemeInterval() {
  if (autoThemeIntervalId) {
    clearInterval(autoThemeIntervalId);
    autoThemeIntervalId = null;
  }
}

function hydrateProfile(data = {}) {
  const nameParts = data.firstName || data.lastName
    ? { first: data.firstName || '', middle: data.middleName || '', last: data.lastName || 'last name' }
    : splitNameParts(data.fullName || currentUser?.displayName || '');

  if (firstNameInput) firstNameInput.value = nameParts.first;
  if (middleNameInput) middleNameInput.value = nameParts.middle;
  if (lastNameInput) lastNameInput.value = nameParts.last || 'last name';
  emailInput.value = currentUser?.email || data.email || '';
  phoneInput.value = data.phone || '';
  notifyApproved.checked = data.notifyBookingApproved === true;
  notifySessionDeleted.checked = data.notifySessionDeleted === true;
  notifyInvoice.checked = data.notifyInvoiceEmail === true;
  notifyReceipt.checked = data.notifyReceiptEmail === true;
  deleteEmailInput.value = currentUser?.email || '';

  const pause = data.pause || {};
  const pauseTutor = pause.tutor || {};
  const pauseStudent = pause.student || {};
  if (pauseTutorToggle) {
    pauseTutorToggle.checked = pauseTutor.active === true;
    pauseTutorToggle.disabled = !hasRoleFlag('tutor', data);
  }
  if (pauseStudentToggle) {
    pauseStudentToggle.checked = pauseStudent.active === true;
    pauseStudentToggle.disabled = !hasRoleFlag('student', data);
  }
  if (deleteTutorBtn) deleteTutorBtn.disabled = !hasRoleFlag('tutor', data);
  if (deleteStudentBtn) deleteStudentBtn.disabled = !hasRoleFlag('student', data);
}

async function loadProfile() {
  if (!currentUser) return;
  const userRef = docFn(db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    currentUserDoc = snap.data() || {};
    hydrateProfile(currentUserDoc);
  } else {
    currentUserDoc = {};
    hydrateProfile({});
  }
}

async function saveProfile(event) {
  event.preventDefault();
  setStatus(profileStatus, 'Saving...');

   const firstName = firstNameInput?.value.trim();
   const middleName = middleNameInput?.value.trim();
   const lastName = (lastNameInput?.value.trim() || 'last name');

   if (!firstName || !lastName) {
     setStatus(profileStatus, 'First and last name are required.', 'error');
     return;
   }

   const fullName = buildFullName(firstName, middleName, lastName);

  const payload = {
    fullName,
    firstName,
    middleName: middleName || null,
    lastName,
    phone: phoneInput.value.trim(),
    notifyBookingApproved: notifyApproved.checked,
    notifySessionDeleted: notifySessionDeleted.checked,
    notifyInvoiceEmail: notifyInvoice.checked,
    notifyReceiptEmail: notifyReceipt.checked
  };
  try {
    const userRef = docFn(db, 'users', currentUser.uid);
    await setDoc(userRef, payload, { merge: true });
    setStatus(profileStatus, 'Saved.', 'success');
  } catch (error) {
    console.error('Profile save failed', error);
    setStatus(profileStatus, 'Could not save profile.', 'error');
  }
}

function requirePassword(value) {
  return value && value.length >= 6;
}

async function reauthWithPassword(password, statusEl = pauseStatus) {
  if (!currentUser || !emailProvider || !reauth) return false;
  if (!password) {
    setStatus(statusEl, 'Password required to continue.', 'error');
    return false;
  }
  try {
    const cred = emailProvider.credential(currentUser.email, password);
    await reauth(currentUser, cred);
    return true;
  } catch (error) {
    console.error('Reauth failed', error);
    setStatus(statusEl, 'Incorrect password.', 'error');
    return false;
  }
}

async function fetchSessionsForRole(roleField) {
  const sessionsCol = collection(db, 'sessions');
  const now = new Date();

  const pendingSnap = await getDocs(query(sessionsCol, where(roleField, '==', currentUser.uid), where('status', '==', 'pending')));
  const approvedSnap = await getDocs(query(sessionsCol, where(roleField, '==', currentUser.uid), where('status', '==', 'approved')));

  const pendingDocs = pendingSnap.docs || [];
  const upcoming = (approvedSnap.docs || []).filter((docSnap) => {
    const data = docSnap.data() || {};
    const start = data.startTime?.toDate?.();
    return start && start.getTime() > now.getTime();
  });

  return { pendingDocs, upcoming };
}

async function fetchSessionsForStats(fields) {
  const results = new Map();
  for (const field of fields) {
    try {
      const snap = await getDocs(query(collection(db, 'sessions'), where(field, '==', currentUser.uid)));
      snap.forEach((docSnap) => {
        results.set(docSnap.id, { ...(docSnap.data() || {}), id: docSnap.id });
      });
    } catch (error) {
      console.warn('Stats fetch skipped', field, error?.message || error);
    }
  }
  return Array.from(results.values());
}

async function buildStatsSummary() {
  const summaries = {};
  const tutorFields = ['tutorId', 'tutorUID', 'tutorUserId', 'primaryTutorId', 'primaryTutorUid'];
  const studentFields = ['studentId', 'studentUID', 'studentUserId', 'studentAccountId', 'userId'];

  if (hasRoleFlag('tutor')) {
    const sessions = await fetchSessionsForStats(tutorFields);
    summaries.tutor = aggregateStats(sessions, 'tutor');
  }
  if (hasRoleFlag('student')) {
    const sessions = await fetchSessionsForStats(studentFields);
    summaries.student = aggregateStats(sessions, 'student');
  }
  return summaries;
}

async function sendStatsEmail(reason) {
  if (!statsEmailEndpoint) {
    console.warn('Stats email endpoint is not configured. Skipping stats email.');
    return false;
  }
  try {
    const summaries = await buildStatsSummary();
    const payload = {
      reason,
      userId: currentUser?.uid,
      email: currentUser?.email,
      summaries,
      generatedAt: new Date().toISOString()
    };
    await fetch(statsEmailEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Failed to send stats email', error);
    return false;
  }
}

async function deletePendingSessions(pendingDocs) {
  const deletions = pendingDocs.map((docSnap) => deleteDoc(docSnap.ref));
  await Promise.allSettled(deletions);
}

function setRoleDeleteBusy(isBusy) {
  if (deleteTutorBtn) deleteTutorBtn.disabled = isBusy || !hasRoleFlag('tutor');
  if (deleteStudentBtn) deleteStudentBtn.disabled = isBusy || !hasRoleFlag('student');
}

function isCompletedSession(session = {}) {
  const status = String(session.status || session.state || '').toLowerCase();
  if (!status) return session.completed === true || session.isCompleted === true || session.paid === true;
  const doneStatuses = ['completed', 'complete', 'finished', 'approved', 'paid', 'closed', 'done', 'confirmed'];
  return doneStatuses.includes(status);
}

function readNumber(source, keyPath) {
  if (!source) return null;
  const parts = keyPath.split('.');
  let cursor = source;
  for (const part of parts) {
    if (cursor && Object.prototype.hasOwnProperty.call(cursor, part)) {
      cursor = cursor[part];
    } else {
      return null;
    }
  }
  const num = Number(cursor);
  return Number.isFinite(num) ? num : null;
}

function collectIds(session, fields) {
  const ids = [];
  fields.forEach((field) => {
    const val = session[field];
    if (Array.isArray(val)) {
      val.forEach((entry) => {
        if (entry) ids.push(String(entry));
      });
    } else if (val) {
      ids.push(String(val));
    }
  });
  return ids;
}

function extractSubjects(session = {}) {
  const subjects = new Set();
  const candidates = [session.subject, session.subjectName, session.course, session.courseName, session.className, session.topic, session.primaryTopic];
  candidates.forEach((value) => {
    if (typeof value === 'string' && value.trim()) {
      subjects.add(value.trim());
    }
  });
  const arrays = [session.subjects, session.subjectList, session.subjectsOffered, session.topics];
  arrays.forEach((list) => {
    if (Array.isArray(list)) {
      list.filter((v) => typeof v === 'string' && v.trim()).forEach((v) => subjects.add(v.trim()));
    }
  });
  return Array.from(subjects);
}

function durationHours(session = {}) {
  const start = session.startTime?.toDate?.() || (session.startTime instanceof Date ? session.startTime : null);
  const end = session.endTime?.toDate?.() || (session.endTime instanceof Date ? session.endTime : null);
  if (start && end && end > start) {
    return (end.getTime() - start.getTime()) / 3600000;
  }
  const durationCandidates = [session.durationMinutes, session.duration, session.lengthMinutes, session.minutes, session.sessionMinutes];
  for (const value of durationCandidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num / 60;
    }
  }
  const hourCandidates = [session.hours, session.lengthHours, session.sessionHours];
  for (const value of hourCandidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }
  return 0;
}

function resolveAmount(session = {}, role, hours) {
  const tutorAmountKeys = ['tutorAmount', 'tutorPayout', 'payoutAmount', 'payAmount', 'tutorPay', 'earnings', 'netEarnings', 'payout'];
  const studentAmountKeys = ['totalAmount', 'amountPaid', 'studentPaid', 'price', 'cost', 'sessionPrice', 'chargeAmount', 'invoiceTotal'];
  const nestedKeysTutor = ['paySummary.tutor', 'paySummary.tutorTotal', 'payment.tutor', 'payment.tutorTotal'];
  const nestedKeysStudent = ['paySummary.total', 'paySummary.student', 'payment.total', 'payment.amount'];
  const keys = role === 'tutor' ? tutorAmountKeys : studentAmountKeys;
  const nested = role === 'tutor' ? nestedKeysTutor : nestedKeysStudent;

  for (const key of keys) {
    const num = readNumber(session, key);
    if (Number.isFinite(num) && num > 0) return num;
  }
  for (const key of nested) {
    const num = readNumber(session, key);
    if (Number.isFinite(num) && num > 0) return num;
  }
  const rateKeys = ['hourlyRate', 'rate', 'tutorRate', 'studentRate', 'pricePerHour'];
  for (const key of rateKeys) {
    const rate = readNumber(session, key);
    if (Number.isFinite(rate) && rate > 0 && Number.isFinite(hours) && hours > 0) {
      return rate * hours;
    }
  }
  return 0;
}

function aggregateStats(sessions, role) {
  const completed = sessions.filter((session) => isCompletedSession(session));
  const totalSessions = completed.length;
  let totalHours = 0;
  let totalAmount = 0;
  const counterpartSet = new Set();
  const durations = [];
  const subjectCounts = new Map();
  let firstDate = null;

  completed.forEach((session) => {
    const hours = durationHours(session);
    if (hours > 0) {
      totalHours += hours;
      durations.push(hours);
    }
    const amount = resolveAmount(session, role, hours);
    if (Number.isFinite(amount)) {
      totalAmount += amount;
    }

    const counterparts = role === 'tutor'
      ? collectIds(session, ['studentId', 'studentUID', 'studentUserId', 'studentProfileId', 'student'])
      : collectIds(session, ['tutorId', 'tutorUID', 'tutorUserId', 'tutorProfileId', 'tutor']);
    counterparts.forEach((id) => counterpartSet.add(id));

    const subjects = extractSubjects(session);
    subjects.forEach((subject) => {
      const key = subject.toLowerCase();
      subjectCounts.set(key, (subjectCounts.get(key) || 0) + 1);
    });

    const startDate = session.startTime?.toDate?.() || (session.startTime instanceof Date ? session.startTime : null);
    if (startDate && (!firstDate || startDate < firstDate)) {
      firstDate = startDate;
    }
  });

  const avgLength = durations.length ? totalHours / durations.length : 0;
  let topSubject = '—';
  if (subjectCounts.size) {
    const [winner] = Array.from(subjectCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    topSubject = winner ? winner.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
  }

  return {
    totalSessions,
    totalHours,
    totalAmount,
    uniqueCounterparts: counterpartSet.size,
    avgLength,
    firstDate,
    topSubject
  };
}

function hasRoleFlag(role, data = currentUserDoc) {
  const roles = data?.roles;
  if (!roles) return false;
  if (typeof roles === 'string') return roles.toLowerCase().includes(role);
  if (Array.isArray(roles)) return roles.some((r) => String(r || '').toLowerCase().includes(role));
  if (typeof roles === 'object') {
    const value = roles[role];
    if (value === true) return true;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      return normalized.includes('active') || normalized.includes('true');
    }
  }
  return false;
}

async function cleanupTutorRecords() {
  const deletions = [
    deleteDoc(docFn(db, 'tutorProfiles', currentUser.uid)),
    deleteDoc(docFn(db, 'tutors', currentUser.uid))
  ];

  try {
    const favoritesSnap = await getDocs(query(collection(db, 'users'), where('favoriteTutorIds', 'array-contains', currentUser.uid)));
    if (arrayRemove) {
      const favoriteUpdates = (favoritesSnap.docs || []).map((docSnap) => updateDoc(docSnap.ref, { favoriteTutorIds: arrayRemove(currentUser.uid) }));
      await Promise.allSettled(favoriteUpdates);
    }
  } catch (error) {
    console.warn('Failed to clean up tutor favorites', error);
  }

  await Promise.allSettled(deletions);
}

async function cleanupStudentRecords() {
  try {
    const studentsSnap = await getDocs(query(collection(db, 'students'), where('userId', '==', currentUser.uid)));
    const deletions = (studentsSnap.docs || []).map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.allSettled(deletions);
  } catch (error) {
    console.warn('Failed to clean up student records', error);
  }
}

async function deleteRole(role) {
  setStatus(deleteStatus, '');
  if (!currentUser) {
    setStatus(deleteStatus, 'Sign in again to manage roles.', 'error');
    return;
  }
  if (!currentUserDoc) {
    setStatus(deleteStatus, 'Still loading your account. Try again.', 'error');
    return;
  }

  const label = role === 'tutor' ? 'Tutor' : role === 'student' ? 'Student' : 'Role';
  const hasRole = hasRoleFlag(role, currentUserDoc);
  if (!hasRole) {
    setStatus(deleteStatus, `${label} role is already removed.`, 'error');
    return;
  }

  const password = window.prompt(`Enter your password to delete your ${label.toLowerCase()} role. This keeps your account active.`) || '';
  const authed = await reauthWithPassword(password, deleteStatus);
  if (!authed) return;

  setRoleDeleteBusy(true);
  try {
    setStatus(deleteStatus, `Checking ${label.toLowerCase()} sessions...`);

    const roleField = role === 'tutor' ? 'tutorId' : 'studentId';
    const { pendingDocs, upcoming } = await fetchSessionsForRole(roleField);
    if (upcoming.length) {
      setStatus(deleteStatus, `Cannot delete ${label.toLowerCase()} role with approved upcoming sessions.`, 'error');
      return;
    }

    if (pendingDocs.length) {
      await deletePendingSessions(pendingDocs);
    }

    if (role === 'tutor') {
      await cleanupTutorRecords();
    }
    if (role === 'student') {
      await cleanupStudentRecords();
    }

    await sendStatsEmail(`delete-${role}-role`);

    const payload = {
      [`roles.${role}`]: false,
      [`pause.${role}.active`]: false,
      [`pause.${role}.setAt`]: serverTimestamp ? serverTimestamp() : new Date()
    };
    await updateDoc(docFn(db, 'users', currentUser.uid), payload);

    currentUserDoc = {
      ...(currentUserDoc || {}),
      roles: { ...(currentUserDoc?.roles || {}), [role]: false },
      pause: {
        ...(currentUserDoc?.pause || {}),
        [role]: { ...(currentUserDoc?.pause?.[role] || {}), active: false, setAt: new Date() }
      }
    };

    if (role === 'tutor' && pauseTutorToggle) pauseTutorToggle.checked = false;
    if (role === 'student' && pauseStudentToggle) pauseStudentToggle.checked = false;
    if (deleteTutorBtn && role === 'tutor') deleteTutorBtn.disabled = true;
    if (deleteStudentBtn && role === 'student') deleteStudentBtn.disabled = true;

    setStatus(deleteStatus, `${label} role deleted. Account remains active.`, 'success');
  } catch (error) {
    console.error(`${label} role delete failed`, error);
    setStatus(deleteStatus, `Unable to delete ${label.toLowerCase()} role right now.`, 'error');
  } finally {
    setRoleDeleteBusy(false);
  }
}

async function updateTutorProfilePause(active) {
  try {
    const profileId = currentUserDoc?.tutorProfileId || null;
    let profileRef = profileId ? docFn(db, 'tutorProfiles', profileId) : null;
    if (!profileRef) {
      const snap = await getDocs(query(collection(db, 'tutorProfiles'), where('userId', '==', currentUser.uid)));
      const first = snap.docs[0];
      if (first) profileRef = first.ref;
    }
    if (profileRef) {
      await updateDoc(profileRef, { isPaused: active === true });
    }
  } catch (error) {
    console.warn('Unable to mirror pause to tutor profile', error);
  }
}

async function applyPauseChanges(event) {
  if (event) event.preventDefault();
  setStatus(pauseStatus, '');
  if (!currentUser) {
    setStatus(pauseStatus, 'Sign in again to update.', 'error');
    return;
  }

  const desiredTutorPause = pauseTutorToggle?.checked === true;
  const desiredStudentPause = pauseStudentToggle?.checked === true;
  const password = pausePasswordInput?.value || '';

  const hasTutorRole = !!currentUserDoc?.roles?.tutor;
  const hasStudentRole = !!currentUserDoc?.roles?.student;

  if (!hasTutorRole && !hasStudentRole) {
    setStatus(pauseStatus, 'No roles to pause.', 'error');
    return;
  }

  const authed = await reauthWithPassword(password);
  if (!authed) return;

  setStatus(pauseStatus, 'Checking sessions...');

  const updates = [];

  if (hasTutorRole) {
    const { pendingDocs, upcoming } = await fetchSessionsForRole('tutorId');
    if (desiredTutorPause && upcoming.length) {
      setStatus(pauseStatus, 'Cannot pause tutor role with approved upcoming sessions.', 'error');
      return;
    }
    if (desiredTutorPause && pendingDocs.length) {
      await deletePendingSessions(pendingDocs);
    }
    updates.push({ path: 'pause.tutor', active: desiredTutorPause });
  }

  if (hasStudentRole) {
    const { pendingDocs, upcoming } = await fetchSessionsForRole('studentId');
    if (desiredStudentPause && upcoming.length) {
      setStatus(pauseStatus, 'Cannot pause student role with approved upcoming sessions.', 'error');
      return;
    }
    if (desiredStudentPause && pendingDocs.length) {
      await deletePendingSessions(pendingDocs);
    }
    updates.push({ path: 'pause.student', active: desiredStudentPause });
  }

  try {
    const payload = updates.reduce((acc, item) => {
      if (item.path === 'pause.tutor') {
        acc['pause.tutor.active'] = item.active;
        acc['pause.tutor.setAt'] = serverTimestamp ? serverTimestamp() : new Date();
      }
      if (item.path === 'pause.student') {
        acc['pause.student.active'] = item.active;
        acc['pause.student.setAt'] = serverTimestamp ? serverTimestamp() : new Date();
      }
      return acc;
    }, {});

    await updateDoc(docFn(db, 'users', currentUser.uid), payload);
    if (hasTutorRole) {
      await updateTutorProfilePause(desiredTutorPause);
    }
    currentUserDoc = {
      ...(currentUserDoc || {}),
      pause: {
        ...(currentUserDoc?.pause || {}),
        tutor: { ...(currentUserDoc?.pause?.tutor || {}), active: desiredTutorPause },
        student: { ...(currentUserDoc?.pause?.student || {}), active: desiredStudentPause }
      }
    };

    setStatus(pauseStatus, 'Pause preferences updated.', 'success');
    pausePasswordInput.value = '';
  } catch (error) {
    console.error('Pause update failed', error);
    setStatus(pauseStatus, 'Could not update pause settings.', 'error');
  }
}

async function updateEmailFlow(event) {
  event.preventDefault();
  setStatus(emailStatus, '');
  const newEmail = newEmailInput.value.trim();
  const password = emailPasswordInput.value;
  if (!newEmail || !password) {
    setStatus(emailStatus, 'Enter new email and current password.', 'error');
    return;
  }
  try {
    const cred = emailProvider.credential(currentUser.email, password);
    await reauth(currentUser, cred);
    await updateEmail(currentUser, newEmail);
    const userRef = docFn(db, 'users', currentUser.uid);
    await setDoc(userRef, { email: newEmail }, { merge: true });
    setStatus(emailStatus, 'Email updated.', 'success');
    emailInput.value = newEmail;
    deleteEmailInput.value = newEmail;
    newEmailInput.value = '';
    emailPasswordInput.value = '';
  } catch (error) {
    console.error('Email update failed', error);
    setStatus(emailStatus, 'Unable to update email. Check password.', 'error');
  }
}

async function updatePasswordFlow(event) {
  event.preventDefault();
  setStatus(passwordStatus, '');
  const currentPw = currentPasswordInput.value;
  const newPw = newPasswordInput.value;
  const confirmPw = confirmPasswordInput.value;
  if (!requirePassword(currentPw) || !requirePassword(newPw)) {
    setStatus(passwordStatus, 'Passwords must be at least 6 characters.', 'error');
    return;
  }
  if (newPw !== confirmPw) {
    setStatus(passwordStatus, 'New passwords do not match.', 'error');
    return;
  }
  try {
    const cred = emailProvider.credential(currentUser.email, currentPw);
    await reauth(currentUser, cred);
    await updatePassword(currentUser, newPw);
    setStatus(passwordStatus, 'Password updated.', 'success');
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
  } catch (error) {
    console.error('Password update failed', error);
    setStatus(passwordStatus, 'Unable to update password. Check your current password.', 'error');
  }
}

async function deleteAccount(event) {
  event.preventDefault();
  setStatus(deleteStatus, '');
  if ((deleteConfirmInput.value || '').trim().toUpperCase() !== 'DELETE') {
    setStatus(deleteStatus, 'Type DELETE to confirm.', 'error');
    return;
  }
  const email = deleteEmailInput.value.trim();
  const password = deletePasswordInput.value;
  if (!email || !password) {
    setStatus(deleteStatus, 'Email and password are required.', 'error');
    return;
  }
  if (!currentUser || currentUser.email !== email) {
    setStatus(deleteStatus, 'Email must match your current login email.', 'error');
    return;
  }
  setStatus(deleteStatus, 'Deleting account...');
  try {
    const cred = emailProvider.credential(email, password);
    await reauth(currentUser, cred);

    await sendStatsEmail('delete-account');

    const userData = currentUserDoc || {};
    const roles = userData.roles || {};
    const isTutor = (() => {
      if (typeof roles === 'string') return roles.toLowerCase().includes('tutor');
      if (Array.isArray(roles)) return roles.some((r) => String(r || '').toLowerCase().includes('tutor'));
      if (typeof roles === 'object') return roles.tutor === true || String(roles.tutor || '').toLowerCase().includes('active');
      return false;
    })();

    if (isTutor) {
      const tutorProfileRef = docFn(db, 'tutorProfiles', currentUser.uid);
      const tutorTravelRef = docFn(db, 'tutors', currentUser.uid);
      await Promise.allSettled([
        deleteDoc(tutorProfileRef),
        deleteDoc(tutorTravelRef)
      ]);
    }

    // Remove user-owned students
    const studentsSnap = await getDocs(query(collection(db, 'students'), where('userId', '==', currentUser.uid)));
    const studentDeletes = [];
    studentsSnap.forEach((snap) => studentDeletes.push(deleteDoc(snap.ref)));
    await Promise.allSettled(studentDeletes);

    const userRef = docFn(db, 'users', currentUser.uid);
    await deleteDoc(userRef);
    await deleteUser(currentUser);
    await signOut(auth);
    setStatus(deleteStatus, 'Account deleted. Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = '/';
    }, 1200);
  } catch (error) {
    console.error('Account deletion failed', error);
    setStatus(deleteStatus, 'Deletion failed. Check your password.', 'error');
  }
}

function bindEvents() {
  ensureTheme();
  initPasswordToggles();
  profileForm.addEventListener('submit', saveProfile);
  emailForm.addEventListener('submit', updateEmailFlow);
  passwordForm.addEventListener('submit', updatePasswordFlow);
  deleteForm.addEventListener('submit', deleteAccount);
  if (pauseApplyBtn) pauseApplyBtn.addEventListener('click', applyPauseChanges);
  if (deleteTutorBtn) deleteTutorBtn.addEventListener('click', () => deleteRole('tutor'));
  if (deleteStudentBtn) deleteStudentBtn.addEventListener('click', () => deleteRole('student'));
}

function requireAuth() {
  onAuth(auth, async (user) => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = user;
    await loadProfile();
  });
}

bindEvents();
requireAuth();
