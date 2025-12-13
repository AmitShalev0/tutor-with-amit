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

const fullNameInput = document.getElementById('settings-full-name');
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

const newEmailInput = document.getElementById('settings-new-email');
const emailPasswordInput = document.getElementById('settings-email-password');
const currentPasswordInput = document.getElementById('settings-current-password');
const newPasswordInput = document.getElementById('settings-new-password');
const confirmPasswordInput = document.getElementById('settings-confirm-password');

const deleteConfirmInput = document.getElementById('delete-confirm');
const deleteEmailInput = document.getElementById('delete-email');
const deletePasswordInput = document.getElementById('delete-password');

let currentUser = null;
let currentUserDoc = null;
let autoThemeIntervalId = null;

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
        if (themeToggle) themeToggle.disabled = true;
        applyAutoTheme();
        startAutoThemeInterval();
      } else {
        localStorage.setItem(THEME_MODE_KEY, 'manual');
        stopAutoThemeInterval();
        if (themeToggle) {
          themeToggle.disabled = false;
          const next = themeToggle.checked ? 'light' : 'dark';
          setManualTheme(next);
        }
      }
    });
  }

  if (themeToggle) {
    themeToggle.checked = storedTheme === 'light';
    themeToggle.addEventListener('change', () => {
      if (themeAutoToggle?.checked) {
        themeAutoToggle.checked = false;
        localStorage.setItem(THEME_MODE_KEY, 'manual');
        stopAutoThemeInterval();
      }
      const next = themeToggle.checked ? 'light' : 'dark';
      setManualTheme(next);
    });
  }

  if (mode === 'auto') {
    if (themeToggle) themeToggle.disabled = true;
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
}

function setManualTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(THEME_MODE_KEY, 'manual');
  if (themeAutoToggle) themeAutoToggle.checked = false;
  if (themeToggle) {
    themeToggle.disabled = false;
    themeToggle.checked = theme === 'light';
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
  fullNameInput.value = data.fullName || '';
  emailInput.value = currentUser?.email || data.email || '';
  phoneInput.value = data.phone || '';
  notifyApproved.checked = data.notifyBookingApproved === true;
  notifySessionDeleted.checked = data.notifySessionDeleted === true;
  notifyInvoice.checked = data.notifyInvoiceEmail === true;
  notifyReceipt.checked = data.notifyReceiptEmail === true;
  deleteEmailInput.value = currentUser?.email || '';
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
  const payload = {
    fullName: fullNameInput.value.trim(),
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
