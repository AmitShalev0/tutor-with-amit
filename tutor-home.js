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
  if (!stats || !Number.isFinite(stats.ratingCount) || stats.ratingCount < 5) {
    ratingPill.textContent = 'New tutor — building reviews';
    ratingPill.title = 'Fewer than 5 ratings so far';
    studentCountPill.hidden = true;
    return;
  }
  const avg = Number(stats.avgOverall || 0).toFixed(1);
  ratingPill.textContent = `${avg} / 10 overall`;
  ratingPill.title = `Based on ${stats.ratingCount} ratings`;
  studentCountPill.hidden = false;
  studentCountPill.textContent = `${stats.distinctStudentCount || 0} students rated`;
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
