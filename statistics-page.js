import './firebase-config.js';

const auth = window.firebaseAuth;
const db = window.firebaseDb;
const onAuth = window.firebaseOnAuth;
const getDoc = window.firestoreGetDoc;
const getDocs = window.firestoreGetDocs;
const docFn = window.firestoreDoc;
const collection = window.firestoreCollection;
const query = window.firestoreQuery;
const where = window.firestoreWhere;

const loadingEl = document.getElementById('stats-loading');
const contentEl = document.getElementById('stats-content');
const errorEl = document.getElementById('stats-error');
const viewToggleBtn = document.getElementById('statistics-view-toggle');
const hybridViewportQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;

let currentUser = null;
let hasTutorRole = false;
let hasStudentRole = false;
let hybridAccountEnabled = false;

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('hidden', hidden);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return '—';
  const rounded = Math.max(0, amount);
  return `$${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatHours(hours) {
  if (!Number.isFinite(hours)) return '—';
  return `${hours.toFixed(1)} hrs`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (err) {
    return '—';
  }
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
  const candidates = [
    session.subject,
    session.subjectName,
    session.course,
    session.courseName,
    session.className,
    session.topic,
    session.primaryTopic
  ];
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

function buildFunFacts(stats, role) {
  const facts = [];
  if (stats.totalSessions > 0) {
    facts.push(`${stats.totalSessions} ${role === 'tutor' ? 'lessons taught' : 'lessons attended'} so far.`);
  }
  if (stats.uniqueCounterparts > 0) {
    const label = role === 'tutor' ? 'students' : 'tutors';
    facts.push(`Worked with ${stats.uniqueCounterparts} different ${label}.`);
  }
  if (Number.isFinite(stats.avgLength) && stats.avgLength > 0) {
    facts.push(`Average session length: ${stats.avgLength.toFixed(1)} hrs.`);
  }
  if (stats.topSubject && stats.topSubject !== '—') {
    const label = role === 'tutor' ? 'most booked' : 'most studied';
    facts.push(`${stats.topSubject} is your ${label} subject.`);
  }
  if (stats.firstDate) {
    facts.push(`First recorded session: ${formatDate(stats.firstDate)}.`);
  }
  if (!facts.length) {
    facts.push('No sessions yet—book or teach your first one to see stats!');
  }
  return facts;
}

function renderRoleStats(stats, role) {
  if (role === 'tutor') {
    setText('tutor-total-sessions', stats.totalSessions || '0');
    setText('tutor-total-hours', formatHours(stats.totalHours));
    setText('tutor-total-earnings', formatCurrency(stats.totalAmount));
    setText('tutor-unique-students', stats.uniqueCounterparts || '0');
    setText('tutor-avg-length', stats.avgLength ? `${stats.avgLength.toFixed(1)} hrs` : '—');
    setText('tutor-top-subject', stats.topSubject || '—');
    setText('tutor-first-session', formatDate(stats.firstDate));
    const funList = document.getElementById('tutor-fun-list');
    if (funList) {
      funList.innerHTML = '';
      buildFunFacts(stats, 'tutor').forEach((fact) => {
        const li = document.createElement('li');
        li.textContent = fact;
        funList.appendChild(li);
      });
    }
  }
  if (role === 'student') {
    setText('student-total-sessions', stats.totalSessions || '0');
    setText('student-total-hours', formatHours(stats.totalHours));
    setText('student-total-paid', formatCurrency(stats.totalAmount));
    setText('student-unique-tutors', stats.uniqueCounterparts || '0');
    setText('student-avg-length', stats.avgLength ? `${stats.avgLength.toFixed(1)} hrs` : '—');
    setText('student-top-subject', stats.topSubject || '—');
    setText('student-first-session', formatDate(stats.firstDate));
    const funList = document.getElementById('student-fun-list');
    if (funList) {
      funList.innerHTML = '';
      buildFunFacts(stats, 'student').forEach((fact) => {
        const li = document.createElement('li');
        li.textContent = fact;
        funList.appendChild(li);
      });
    }
  }
}

async function fetchSessionsForFields(fields) {
  const results = new Map();
  for (const field of fields) {
    try {
      const snap = await getDocs(query(collection(db, 'sessions'), where(field, '==', currentUser.uid)));
      snap.forEach((docSnap) => {
        results.set(docSnap.id, { ...(docSnap.data() || {}), id: docSnap.id });
      });
    } catch (error) {
      console.warn('Stats: query skipped for field', field, error?.message || error);
    }
  }
  return Array.from(results.values());
}

function updateHybridToggleLabel() {
  if (!viewToggleBtn) return;
  const isMobileHybrid = hybridAccountEnabled && hybridViewportQuery && hybridViewportQuery.matches;
  viewToggleBtn.hidden = !isMobileHybrid;
  if (!isMobileHybrid) return;
  const currentView = document.body.dataset.statisticsView === 'student' ? 'student' : 'tutor';
  viewToggleBtn.textContent = currentView === 'tutor' ? 'Student view ->' : 'Tutor view ->';
}

function handleHybridViewportChange() {
  if (!hybridAccountEnabled) return;
  if (hybridViewportQuery && hybridViewportQuery.matches) {
    document.body.dataset.statisticsHybrid = 'true';
  } else {
    delete document.body.dataset.statisticsHybrid;
  }
  updateHybridToggleLabel();
}

function setHybridAccountState(enabled) {
  hybridAccountEnabled = enabled;
  if (!enabled) {
    delete document.body.dataset.statisticsHybrid;
    delete document.body.dataset.statisticsView;
    updateHybridToggleLabel();
    return;
  }
  if (!document.body.dataset.statisticsView) {
    document.body.dataset.statisticsView = 'tutor';
  }
  handleHybridViewportChange();
}

async function loadStats() {
  setHidden(loadingEl, false);
  setHidden(contentEl, true);
  setHidden(errorEl, true);

  try {
    const userSnap = await getDoc(docFn(db, 'users', currentUser.uid));
    if (!userSnap.exists()) {
      setHidden(loadingEl, true);
      setHidden(errorEl, false);
      return;
    }

    const userData = userSnap.data() || {};
    hasTutorRole = !!userData?.roles?.tutor;
    hasStudentRole = !!userData?.roles?.student;
    setHybridAccountState(hasTutorRole && hasStudentRole);

    if (!hasTutorRole && !hasStudentRole) {
      setHidden(loadingEl, true);
      setHidden(errorEl, false);
      if (errorEl) errorEl.textContent = 'No stats available. Add a tutor or student role to see statistics.';
      return;
    }

    const tutorPromise = hasTutorRole ? fetchSessionsForFields(['tutorId', 'tutorUID', 'tutorUserId', 'primaryTutorId', 'primaryTutorUid']) : Promise.resolve([]);
    const studentPromise = hasStudentRole ? fetchSessionsForFields(['studentId', 'studentUID', 'studentUserId', 'studentAccountId', 'userId']) : Promise.resolve([]);

    const [tutorSessions, studentSessions] = await Promise.all([tutorPromise, studentPromise]);

    if (hasTutorRole) {
      const tutorStats = aggregateStats(tutorSessions, 'tutor');
      renderRoleStats(tutorStats, 'tutor');
    } else {
      const tutorSection = document.querySelector('[data-stat-section="tutor"]');
      if (tutorSection) tutorSection.classList.add('hidden');
    }

    if (hasStudentRole) {
      const studentStats = aggregateStats(studentSessions, 'student');
      renderRoleStats(studentStats, 'student');
    } else {
      const studentSection = document.querySelector('[data-stat-section="student"]');
      if (studentSection) studentSection.classList.add('hidden');
    }

    setHidden(loadingEl, true);
    setHidden(contentEl, false);
  } catch (error) {
    console.error('Stats load failed', error);
    setHidden(loadingEl, true);
    setHidden(errorEl, false);
  }
}

if (viewToggleBtn) {
  viewToggleBtn.addEventListener('click', () => {
    if (!hybridAccountEnabled) return;
    const currentView = document.body.dataset.statisticsView === 'student' ? 'student' : 'tutor';
    const next = currentView === 'tutor' ? 'student' : 'tutor';
    document.body.dataset.statisticsView = next;
    updateHybridToggleLabel();
  });
}

if (hybridViewportQuery) {
  const viewportListener = () => handleHybridViewportChange();
  if (typeof hybridViewportQuery.addEventListener === 'function') {
    hybridViewportQuery.addEventListener('change', viewportListener);
  } else if (typeof hybridViewportQuery.addListener === 'function') {
    hybridViewportQuery.addListener(viewportListener);
  }
}

onAuth(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;
  await loadStats();
});
