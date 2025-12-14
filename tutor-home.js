import './firebase-config.js';

const db = window.firebaseDb;
const collection = window.firestoreCollection;
const query = window.firestoreQuery;
const where = window.firestoreWhere;
const getDocs = window.firestoreGetDocs;
const getDoc = window.firestoreGetDoc;
const doc = window.firestoreDoc;

const heroStatus = document.getElementById('hero-status');
const tutorNameEl = document.getElementById('tutor-name');
const tutorHeadlineEl = document.getElementById('tutor-headline');
const ratingPill = document.getElementById('rating-pill');
const studentCountPill = document.getElementById('student-count-pill');
const commentsContent = document.getElementById('comments-content');
const ratingContent = document.getElementById('rating-content');

const METRICS = [
  { key: 'overall', label: 'Overall' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'helpfulness', label: 'Helpfulness' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'pacing', label: 'Pacing' }
];

function getSlugFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const homeIndex = parts.indexOf('home');
  if (homeIndex >= 0 && parts.length > homeIndex + 1) {
    return decodeURIComponent(parts[homeIndex + 1]);
  }
  const urlParams = new URLSearchParams(window.location.search);
  const slugParam = urlParams.get('slug');
  return slugParam ? decodeURIComponent(slugParam) : null;
}

async function fetchTutorBySlug(slug) {
  const q = query(collection(db, 'tutorProfiles'), where('slug', '==', slug));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

async function fetchTutorStats(tutorId) {
  const ref = doc(db, 'tutorStats', tutorId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function fetchSharedComments(tutorId) {
  const q = query(
    collection(db, 'sessionFeedback'),
    where('tutorId', '==', tutorId),
    where('status.shared', '==', true),
    where('status.reported', '==', false)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f?.status?.deletedByTutor !== true);
}

function renderRating(stats) {
  if (!stats || !Number.isFinite(stats.ratingCount) || stats.ratingCount <= 0) {
    ratingPill.textContent = 'New tutor — building reviews';
    ratingPill.title = 'No ratings yet';
    studentCountPill.hidden = true;
    renderRatingCards(null);
    return;
  }

  const avg = Number(stats.avgOverall || 0).toFixed(1);
  const ratingCount = Math.max(1, Math.floor(stats.ratingCount));
  const distinct = Number.isFinite(stats.distinctStudentCount) && stats.distinctStudentCount > 0
    ? Math.floor(stats.distinctStudentCount)
    : ratingCount;

  ratingPill.textContent = `${avg} / 10 overall`;
  ratingPill.title = ratingCount < 5
    ? `Early ratings (based on ${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'})`
    : `Based on ${ratingCount} ratings`;

  studentCountPill.hidden = false;
  studentCountPill.textContent = `${distinct} ${distinct === 1 ? 'student rated' : 'students rated'}`;

  renderRatingCards(stats);
}

function renderRatingCards(stats) {
  if (!ratingContent) return;

  if (!stats || !Number.isFinite(stats.ratingCount) || stats.ratingCount <= 0) {
    ratingContent.className = 'rating-empty';
    ratingContent.textContent = 'No ratings yet.';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'rating-grid';

  const makeCard = (title, value, subtitle) => {
    const card = document.createElement('div');
    card.className = 'rating-card';
    card.innerHTML = `
      <h3>${title}</h3>
      <div class="rating-value">${value}</div>
      <div class="rating-sub">${subtitle}</div>
    `;
    return card;
  };

  const overallValue = Number(stats.avgOverall || 0).toFixed(1);
  const ratingCount = Math.max(1, Math.floor(stats.ratingCount));
  const distinct = Number.isFinite(stats.distinctStudentCount) && stats.distinctStudentCount > 0
    ? Math.floor(stats.distinctStudentCount)
    : ratingCount;

  grid.appendChild(
    makeCard(
      'Overall',
      `${overallValue} / 10`,
      ratingCount < 5
        ? `Early ratings • ${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'}`
        : `${ratingCount} ratings • ${distinct} ${distinct === 1 ? 'student' : 'students'}`
    )
  );

  METRICS.filter((m) => m.key !== 'overall').forEach((metric) => {
    const field = `avg${metric.label}`;
    const raw = stats[field];
    const value = Number.isFinite(raw) ? Number(raw).toFixed(1) : '—';
    grid.appendChild(makeCard(metric.label, `${value} / 10`, ''));
  });

  ratingContent.className = '';
  ratingContent.innerHTML = '';
  ratingContent.appendChild(grid);
}

function renderComments(comments) {
  if (!commentsContent) return;
  if (!comments || !comments.length) {
    commentsContent.innerHTML = '<div class="empty-comments">You haven\'t made any memories with students yet.</div>';
    return;
  }
  const track = document.createElement('div');
  track.className = 'comments-track';
  comments.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'comment-card';
    const name = c.studentFirstName || 'Student';
    const mode = c.mode === 'in_person' ? 'In person' : 'Online';
    card.innerHTML = `
      <div class="comment-meta">${name} • ${mode} session</div>
      <div class="comment-body">${c.comment ? escapeHtml(c.comment) : 'No comment provided.'}</div>
    `;
    track.appendChild(card);
  });
  commentsContent.innerHTML = '';
  commentsContent.appendChild(track);
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function init() {
  if (!db) {
    heroStatus.textContent = 'Firestore not available.';
    return;
  }
  const slug = getSlugFromPath();
  if (!slug) {
    heroStatus.textContent = 'Missing tutor slug.';
    return;
  }
  heroStatus.textContent = `Loading ${slug}...`;
  try {
    const tutor = await fetchTutorBySlug(slug);
    if (!tutor) {
      heroStatus.textContent = 'Tutor not found.';
      tutorNameEl.textContent = 'Tutor not found';
      return;
    }
    const tutorId = tutor.id;
    tutorNameEl.textContent = tutor.fullName || 'Tutor';
    tutorHeadlineEl.textContent = tutor.headline || '';
    heroStatus.textContent = 'Verified tutor';

    const [stats, comments] = await Promise.all([
      fetchTutorStats(tutorId),
      fetchSharedComments(tutorId)
    ]);

    renderRating(stats);
    renderComments(comments);
  } catch (err) {
    console.error('Tutor home load failed:', err);
    heroStatus.textContent = 'Error loading tutor page.';
    if (commentsContent) {
      commentsContent.innerHTML = '<div class="empty-comments">You haven\'t made any memories with students yet.</div>';
    }
  }
}

init();
