  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  const onAuth = window.firebaseOnAuth;
  const signOut = window.firebaseSignOut;
  const getDoc = window.firestoreGetDoc;
  const getDocs = window.firestoreGetDocs;
  const doc = window.firestoreDoc;
  const collection = window.firestoreCollection;
  const query = window.firestoreQuery;
  const where = window.firestoreWhere;
  const deleteDoc = window.firestoreDeleteDoc;
  const updateDoc = window.firestoreUpdateDoc;
  const arrayRemove = window.firestoreArrayRemove;

  const loadingEl = document.getElementById("loading");
  const contentEl = document.getElementById("dashboard-content");
  const userNameEl = document.getElementById("user-name");
  const profileHeadingEl = document.getElementById("profile-heading");
  const profileEmailEl = document.getElementById("profile-email");
  const profilePhoneEl = document.getElementById("profile-phone");
  const studentsContainer = document.getElementById("students-container");
  const tutorCardEl = document.getElementById("tutor-card");
  const tutorCardMessageEl = document.getElementById("tutor-card-message");
  const tutorCardDetailsEl = document.getElementById("tutor-card-details");
  const tutorStatusEl = document.getElementById("tutor-status");
  const tutorLinkDisplayEl = document.getElementById("tutor-link-display");
  const copyTutorLinkBtn = document.getElementById("copy-tutor-link");
  const copyTutorLinkBtnQA = document.getElementById("copy-tutor-link-qa");
  const qaStudentActionsEl = document.getElementById("qa-student-actions");
  const qaTutorActionsEl = document.getElementById("qa-tutor-actions");
  const qaStudentAddBtn = document.getElementById("qa-student-add-btn");
  const qaTutorAddBtn = document.getElementById("qa-tutor-add-btn");
  const qaStudentRemoveBtn = document.getElementById("qa-student-remove-btn");
  const qaTutorRemoveBtn = document.getElementById("qa-tutor-remove-btn");
  const qaStudentMenu = document.getElementById("qa-student-menu");
  const qaTutorMenu = document.getElementById("qa-tutor-menu");
  const quickActionsStudentCard = document.getElementById("quick-actions-student");
  const quickActionsTutorCard = document.getElementById("quick-actions-tutor");
  const homeLinkBtn = document.getElementById("home-link-btn");
  const editBookFormBtn = document.getElementById("edit-book-form-btn");
  const subjectRequestForm = document.getElementById("subject-request-form");
  const subjectRequestInput = document.getElementById("subject-request-input");
  const subjectRequestMessage = document.getElementById("subject-request-message");
  const dashboardViewToggleBtn = document.getElementById("dashboard-view-toggle");
  const hybridViewportQuery = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(max-width: 768px)")
    : null;
  const favoriteTutorsContainer = document.getElementById("favorite-tutors-content");
  const DEFAULT_HOME_PATH = "/home/amitshalev/";
  const SUBJECT_INTEREST_ENDPOINT = "https://script.google.com/macros/s/AKfycbxKXmxMroW74nabysGBr4LDFhwkURxaBiDntFVnowpP5PN-Czy6cWYnfO5axE58x5_j/exec";

  let currentUser = null;
  let tutorProfileData = null;
  let hybridAccountEnabled = false;
  let favoriteTutorProfiles = [];
  let isAdminUser = false;
  const qaSelections = { student: new Set(), tutor: new Set() };
  const QA_STORAGE_KEYS = { student: 'qa_student_selection', tutor: 'qa_tutor_selection' };
  const qaRemoveMode = { student: false, tutor: false };

  const copyButtons = [copyTutorLinkBtn, copyTutorLinkBtnQA].filter(Boolean);

  function getActionCatalog() {
    const catalog = { student: new Map(), tutor: new Map() };

    const studentActions = [
      { id: 'add-student', label: '+ Add Student', type: 'link', href: 'add-student.html', role: 'student' },
      { id: 'book-session', label: '📅 Book Sessions', type: 'link', href: 'book.html', role: 'student' },
      { id: 'booking-info', label: '📄 Booking info', type: 'link', href: 'booking-settings.html', role: 'student', adminOnly: true }
    ];

    const tutorActions = [
      { id: 'open-tutor-hub', label: 'Open Tutor Hub', type: 'link', href: 'tutor-dashboard.html', role: 'tutor' },
      { id: 'copy-profile', label: 'Copy Profile Link', type: 'copyProfile', role: 'tutor' },
      { id: 'open-statistics', label: 'Statistics', type: 'link', href: 'statistics.html', role: 'tutor' }
    ];

    studentActions.forEach((action) => {
      if (action.adminOnly && !isAdminUser) return;
      catalog.student.set(action.id, action);
    });
    tutorActions.forEach((action) => catalog.tutor.set(action.id, action));

    favoriteTutorProfiles.forEach((tutor) => {
      const name = tutor.fullName || 'Tutor';
      const action = {
        id: `book-fav-${tutor.id}`,
        label: `Book ${name}`,
        type: 'link',
        href: `book.html?tutor=${encodeURIComponent(tutor.id)}`,
        role: 'student',
        note: 'From favourites'
      };
      catalog.student.set(action.id, action);
    });

    return catalog;
  }

  function loadQaSelections() {
    ['student', 'tutor'].forEach((role) => {
      const raw = localStorage.getItem(QA_STORAGE_KEYS[role]);
      const set = new Set();
      try {
        const parsed = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
        parsed.forEach((id) => set.add(id));
      } catch (err) {
        /* ignore */
      }
      qaSelections[role] = set;
    });
  }

  function persistQaSelections(role) {
    const arr = Array.from(qaSelections[role] || []);
    localStorage.setItem(QA_STORAGE_KEYS[role], JSON.stringify(arr));
  }

  function ensureQaDefaults(catalog) {
    if (!qaSelections.student.size) {
      ['add-student', 'book-session'].forEach((id) => {
        if (catalog.student.has(id)) qaSelections.student.add(id);
      });
    }
    if (!qaSelections.tutor.size) {
      ['open-tutor-hub', 'copy-profile'].forEach((id) => {
        if (catalog.tutor.has(id)) qaSelections.tutor.add(id);
      });
    }
  }

  function pruneMissingSelections(catalog) {
    ['student', 'tutor'].forEach((role) => {
      const set = qaSelections[role];
      Array.from(set).forEach((id) => {
        if (!catalog[role].has(id)) set.delete(id);
      });
    });
  }

  function executeAction(action) {
    if (!action) return;
    if (action.type === 'link' && action.href) {
      window.location.href = action.href;
      return;
    }
    if (action.type === 'copyProfile') {
      const btn = copyTutorLinkBtn || copyTutorLinkBtnQA;
      if (!btn || !btn.dataset.profileUrl) {
        alert('Your profile link will be available once you publish your tutor page.');
        return;
      }
      const url = btn.dataset.profileUrl;
      navigator.clipboard?.writeText(url).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Profile Link'; }, 1600);
      }).catch(() => {
        prompt('Copy this link', url);
      });
    }
  }

  function renderQuickActions(role) {
    const catalog = getActionCatalog();
    pruneMissingSelections(catalog);
    const target = role === 'student' ? qaStudentActionsEl : qaTutorActionsEl;
    if (!target) return;
    target.innerHTML = '';
    qaSelections[role].forEach((id) => {
      const action = catalog[role].get(id);
      if (!action) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (action.type === 'link' ? 'primary' : 'secondary');
      btn.textContent = action.label;

      if (qaRemoveMode[role]) {
        const badge = document.createElement('span');
        badge.className = 'qa-remove-badge';
        badge.textContent = '-';
        btn.appendChild(badge);
        btn.addEventListener('click', () => handleRemoveAction(role, action.id, btn));
      } else {
        btn.addEventListener('click', () => executeAction(action));
      }
      target.appendChild(btn);
    });
    persistQaSelections(role);
    buildQaMenu(role);
  }

  function handleRemoveAction(role, actionId, btn) {
    if (!qaRemoveMode[role]) return;
    if (btn) {
      btn.classList.add('qa-action-poof');
      setTimeout(() => finishRemove(role, actionId), 150);
    } else {
      finishRemove(role, actionId);
    }
  }

  function finishRemove(role, actionId) {
    qaSelections[role].delete(actionId);
    renderQuickActions(role);
  }

  function buildQaMenu(role) {
    const catalog = getActionCatalog();
    const menu = role === 'student' ? qaStudentMenu : qaTutorMenu;
    if (!menu) return;
    menu.innerHTML = '';
    const available = Array.from(catalog[role].values()).filter((a) => !qaSelections[role].has(a.id));
    if (!available.length) {
      const empty = document.createElement('div');
      empty.textContent = 'All actions added.';
      empty.className = 'qa-meta';
      menu.appendChild(empty);
      return;
    }
    available.forEach((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      if (action.note) {
        const span = document.createElement('span');
        span.className = 'qa-meta';
        span.textContent = action.note;
        btn.appendChild(document.createElement('br'));
        btn.appendChild(span);
      }
      btn.addEventListener('click', () => {
        qaSelections[role].add(action.id);
        renderQuickActions(role);
        toggleQaMenu(role, false);
      });
      menu.appendChild(btn);
    });
  }

  function toggleQaMenu(role, open) {
    const menu = role === 'student' ? qaStudentMenu : qaTutorMenu;
    const btn = role === 'student' ? qaStudentAddBtn : qaTutorAddBtn;
    if (qaRemoveMode[role]) return;
    if (!menu || !btn) return;
    const shouldOpen = typeof open === 'boolean' ? open : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !shouldOpen);
    btn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    if (shouldOpen) {
      document.addEventListener('click', handleOutsideMenuClick);
      document.addEventListener('focusin', handleOutsideMenuFocus, true);
    } else {
      document.removeEventListener('click', handleOutsideMenuClick);
      document.removeEventListener('focusin', handleOutsideMenuFocus, true);
    }
  }

  function handleOutsideMenuClick(event) {
    const targets = [qaStudentMenu, qaTutorMenu, qaStudentAddBtn, qaTutorAddBtn].filter(Boolean);
    if (targets.some((el) => el === event.target || el.contains(event.target))) {
      return;
    }
    toggleQaMenu('student', false);
    toggleQaMenu('tutor', false);
  }

  function handleOutsideMenuFocus(event) {
    const targets = [qaStudentMenu, qaTutorMenu, qaStudentAddBtn, qaTutorAddBtn].filter(Boolean);
    if (targets.some((el) => el && el.contains(event.target))) {
      return;
    }
    toggleQaMenu('student', false);
    toggleQaMenu('tutor', false);
  }

  function refreshAllQuickActions() {
    const catalog = getActionCatalog();
    ensureQaDefaults(catalog);
    pruneMissingSelections(catalog);
    renderQuickActions('student');
    renderQuickActions('tutor');
  }

  function setRemoveMode(role, enabled) {
    qaRemoveMode[role] = !!enabled;
    const card = role === 'student' ? quickActionsStudentCard : quickActionsTutorCard;
    const addBtn = role === 'student' ? qaStudentAddBtn : qaTutorAddBtn;
    const removeBtn = role === 'student' ? qaStudentRemoveBtn : qaTutorRemoveBtn;
    const menu = role === 'student' ? qaStudentMenu : qaTutorMenu;

    if (card) {
      card.classList.toggle('qa-removal-mode', enabled);
    }
    if (addBtn) {
      addBtn.classList.toggle('is-disabled', enabled);
      addBtn.disabled = !!enabled;
    }
    if (removeBtn) {
      removeBtn.classList.toggle('is-active', enabled);
      removeBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    if (menu) {
      toggleQaMenu(role, false);
    }
    renderQuickActions(role);
  }

  loadQaSelections();

  function reconcileQuickActions(hasTutorRole, hasStudentRole) {
    const showStudentQA = hasStudentRole || (!hasStudentRole && !hasTutorRole);
    const showTutorQA = hasTutorRole && !hasStudentRole;

    if (quickActionsStudentCard) {
      quickActionsStudentCard.style.display = showStudentQA ? "block" : "none";
    }
    if (quickActionsTutorCard) {
      quickActionsTutorCard.style.display = showTutorQA ? "block" : "none";
    }

    if (!showStudentQA && qaRemoveMode.student) {
      setRemoveMode('student', false);
    }
    if (!showTutorQA && qaRemoveMode.tutor) {
      setRemoveMode('tutor', false);
    }
  }

  function setCopyButtons(url) {
    copyButtons.forEach((btn) => {
      if (!btn) return;
      if (url) {
        btn.disabled = false;
        btn.dataset.profileUrl = url;
      } else {
        btn.disabled = true;
        delete btn.dataset.profileUrl;
      }
    });
  }

  window.__latestUserData = window.__latestUserData || null;

  function setSubjectRequestMessage(text, state) {
    if (!subjectRequestMessage) {
      return;
    }
    const baseClass = "subject-request-message";
    subjectRequestMessage.className = state ? `${baseClass} ${state}` : baseClass;
    subjectRequestMessage.textContent = text || "";
  }

  function isAdminUserData(userData) {
    if (!userData) return false;
    const email = (userData.email || "").toLowerCase();
    if (email === "amitshalev1510@gmail.com") return true;
    if (userData.isAdmin === true || userData.admin === true) return true;
    if (userData.roles) {
      if (userData.roles.admin === true) return true;
      if (Array.isArray(userData.roles)) {
        const lowered = userData.roles.map((role) => (role || "").toLowerCase());
        if (lowered.includes("admin")) return true;
      }
      if (typeof userData.roles === "object" && !Array.isArray(userData.roles)) {
        const roleKeys = Object.keys(userData.roles).map((key) => key.toLowerCase());
        if (roleKeys.includes("admin")) return true;
      }
    }
    return false;
  }

  async function handleSubjectRequestSubmit(event) {
    event.preventDefault();
    if (!subjectRequestInput) {
      return;
    }
    const courseName = subjectRequestInput.value.trim();
    if (!courseName) {
      setSubjectRequestMessage("Please share the course you want help with.", "error");
      subjectRequestInput.focus();
      return;
    }
    if (!currentUser) {
      setSubjectRequestMessage("Please sign in again to send your request.", "error");
      return;
    }

    setSubjectRequestMessage("Sending your request...", "pending");

    const latestUser = window.__latestUserData || {};
    const payload = {
      type: "subject_interest",
      userId: currentUser.uid,
      courseName,
      userName: latestUser.fullName || currentUser.displayName || "",
      userEmail: latestUser.email || currentUser.email || "",
      submittedAt: new Date().toISOString()
    };

    try {
      await fetch(SUBJECT_INTEREST_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      setSubjectRequestMessage("Thanks! We'll notify you when that subject becomes available.", "ok");
      subjectRequestInput.value = "";
    } catch (err) {
      console.error("Subject request error:", err);
      setSubjectRequestMessage("We couldn't send that request. Please try again soon.", "error");
    }
  }

  function updateHybridToggleLabel() {
    if (!dashboardViewToggleBtn) {
      return;
    }
    const isMobileHybrid = hybridAccountEnabled && hybridViewportQuery && hybridViewportQuery.matches;
    if (!isMobileHybrid) {
      dashboardViewToggleBtn.hidden = true;
      return;
    }
    dashboardViewToggleBtn.hidden = false;
    const currentView = document.body.dataset.dashboardView === "student" ? "student" : "tutor";
    dashboardViewToggleBtn.textContent = currentView === "tutor" ? "Student Page ->" : "Tutor Page ->";
  }

  function handleHybridViewportChange() {
    if (!hybridAccountEnabled) {
      return;
    }
    if (hybridViewportQuery && hybridViewportQuery.matches) {
      document.body.dataset.dashboardHybrid = "true";
    } else {
      delete document.body.dataset.dashboardHybrid;
    }
    updateHybridToggleLabel();
  }

  function setHybridAccountState(enabled) {
    hybridAccountEnabled = enabled;
    if (!enabled) {
      delete document.body.dataset.dashboardHybrid;
      delete document.body.dataset.dashboardView;
      updateHybridToggleLabel();
      return;
    }
    if (!document.body.dataset.dashboardView) {
      document.body.dataset.dashboardView = "tutor";
    }
    handleHybridViewportChange();
  }

  function triggerHybridFlip() {
    if (!contentEl) {
      return;
    }
    contentEl.classList.remove("dashboard-flip");
    // Force reflow so the animation can replay
    void contentEl.offsetWidth;
    contentEl.classList.add("dashboard-flip");
  }

  if (dashboardViewToggleBtn) {
    dashboardViewToggleBtn.addEventListener("click", () => {
      if (!hybridAccountEnabled) {
        return;
      }
      const currentView = document.body.dataset.dashboardView === "student" ? "student" : "tutor";
      const nextView = currentView === "tutor" ? "student" : "tutor";
      document.body.dataset.dashboardView = nextView;
      updateHybridToggleLabel();
      triggerHybridFlip();
    });
  }

  if (hybridViewportQuery) {
    const viewportListener = () => handleHybridViewportChange();
    if (typeof hybridViewportQuery.addEventListener === "function") {
      hybridViewportQuery.addEventListener("change", viewportListener);
    } else if (typeof hybridViewportQuery.addListener === "function") {
      hybridViewportQuery.addListener(viewportListener);
    }
  }

  if (subjectRequestForm && subjectRequestInput) {
    subjectRequestForm.addEventListener("submit", handleSubjectRequestSubmit);
  }

  if (editBookFormBtn) {
    editBookFormBtn.addEventListener("click", () => {
      window.location.href = "booking-settings.html";
    });
  }

  // Check authentication
  onAuth(auth, async (user) => {
    if (!user) {
      // Not logged in, redirect to login
      window.location.href = "login.html";
      return;
    }

    currentUser = user;
    await loadDashboard(user);
  });

  async function loadDashboard(user) {
    try {
      // Load user profile
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        console.error("User profile not found");
        loadingEl.textContent = "Error loading profile. Please contact support.";
        return;
      }

      const userData = userDoc.data();
      userData.favoriteTutorIds = Array.isArray(userData.favoriteTutorIds)
        ? userData.favoriteTutorIds.filter((id) => typeof id === 'string' && id.trim())
        : [];
      window.__latestUserData = userData;

      isAdminUser = isAdminUserData(userData);
      if (editBookFormBtn) {
        editBookFormBtn.hidden = !isAdminUser;
      }
      
      // Display user info
      const fullName = userData.fullName || user.displayName || "Friend";
      if (userNameEl) userNameEl.textContent = fullName;
      if (profileHeadingEl) profileHeadingEl.textContent = fullName;
      if (profileEmailEl) profileEmailEl.textContent = userData.email || user.email;
      if (profilePhoneEl) profilePhoneEl.textContent = userData.phone || "Not provided";

      const hasTutorRole = !!(userData?.roles?.tutor);
      const hasStudentRole = !!(userData?.roles?.student);
      reconcileQuickActions(hasTutorRole, hasStudentRole);
      setHybridAccountState(hasTutorRole && hasStudentRole);
      if (hasTutorRole) {
        await loadTutorSummary(userData);
      } else if (tutorCardEl) {
        tutorCardEl.classList.add("hidden-card");
      }

      updateHomeLink(userData);

      await renderFavoriteTutors(userData);

      // Load students
      await loadStudents(user.uid);

      refreshAllQuickActions();

      // Show dashboard
      loadingEl.style.display = "none";
      contentEl.style.display = "block";

    } catch (err) {
      console.error("Error loading dashboard:", err);
      loadingEl.textContent = "Error loading dashboard. Please refresh the page.";
    }
  }

  async function loadTutorSummary(userData) {
    if (!tutorCardEl) {
      return;
    }

    tutorCardEl.classList.remove("hidden-card");
    tutorCardMessageEl.textContent = "Loading your tutor profile…";
    tutorCardDetailsEl.classList.add("hidden-card");
    tutorProfileData = null;

    try {
      const profileId = userData.tutorProfileId;
      let profileSnapshot = null;

      if (profileId) {
        profileSnapshot = await getDoc(doc(db, "tutorProfiles", profileId));
      }

      if (!profileSnapshot || !profileSnapshot.exists()) {
        const fallbackQuery = query(
          collection(db, "tutorProfiles"),
          where("userId", "==", currentUser.uid)
        );
        const profilesSnapshot = await getDocs(fallbackQuery);
        profileSnapshot = profilesSnapshot.docs[0];

        if (profileSnapshot && profileSnapshot.exists() && !profileId) {
          try {
            await updateDoc(doc(db, "users", currentUser.uid), {
              tutorProfileId: profileSnapshot.id
            });
          } catch (linkErr) {
            console.warn("Dashboard: unable to backfill tutorProfileId", linkErr);
          }
        }
      }

      if (!profileSnapshot || !profileSnapshot.exists()) {
        tutorCardMessageEl.textContent = "Tutor profile not created yet. Open the Tutor Hub to finish setup.";
        tutorCardDetailsEl.classList.add("hidden-card");
        setCopyButtons(null);
        updateHomeLink(window.__latestUserData);
        return;
      }

      tutorProfileData = { id: profileSnapshot.id, ...profileSnapshot.data() };
      const slug = tutorProfileData.slug || "pending";
      const status = tutorProfileData.status || "draft";
      const baseUrl = window.location.origin || "";
      const profileUrl = slug === "pending" ? null : `${baseUrl}/tutor-profile.html?slug=${encodeURIComponent(slug)}`;

      tutorStatusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      if (profileUrl) {
        tutorLinkDisplayEl.textContent = profileUrl;
        tutorCardMessageEl.textContent = "Share your link once your profile looks good.";
        setCopyButtons(profileUrl);
      } else {
        tutorLinkDisplayEl.textContent = "Your profile link will appear once you publish.";
        tutorCardMessageEl.textContent = "Open the Tutor Hub to finish completing your profile.";
        setCopyButtons(null);
      }

      tutorCardDetailsEl.classList.remove("hidden-card");
    } catch (err) {
      console.error("Error loading tutor summary:", err);
      tutorCardMessageEl.textContent = "We ran into an issue loading your tutor profile.";
      tutorCardDetailsEl.classList.add("hidden-card");
      setCopyButtons(null);
    }

    updateHomeLink(window.__latestUserData);
  }

  function sanitizeSlug(value) {
    if (!value) return null;
    const text = String(value).trim().toLowerCase();
    if (!text) return null;
    const cleaned = text.replace(/[^a-z0-9]+/g, "");
    if (!cleaned) return null;
    if (cleaned === "pending" || cleaned === "draft" || cleaned === "sample" || cleaned === "placeholder") {
      return null;
    }
    return cleaned;
  }

  function resolveHomeSlugFromSources(userData, tutorProfile) {
    const candidateKeys = [
      "homeSlug",
      "homePageSlug",
      "homepageSlug",
      "personalSlug",
      "username",
      "handle",
      "slug",
      "profileSlug"
    ];
    if (userData) {
      for (const key of candidateKeys) {
        const value = userData[key];
        if (typeof value === "string" && value.trim()) {
          const slug = sanitizeSlug(value);
          if (slug) return slug;
        }
      }
    }
    if (tutorProfile && typeof tutorProfile.slug === "string") {
      const slug = sanitizeSlug(tutorProfile.slug);
      if (slug) return slug;
    }
    return null;
  }

  function buildHomePath(slug) {
    if (!slug) return DEFAULT_HOME_PATH;
    return `/home/${encodeURIComponent(slug)}/`;
  }

  function updateHomeLink(userData) {
    if (!homeLinkBtn) return;
    if (userData) {
      window.__latestUserData = userData;
    }
    const effectiveUser = userData || window.__latestUserData || null;
    const slug = resolveHomeSlugFromSources(effectiveUser, tutorProfileData);
    const path = buildHomePath(slug);
    homeLinkBtn.dataset.homePath = path;
    homeLinkBtn.onclick = () => {
      window.location.href = path;
    };
    if (slug) {
      homeLinkBtn.textContent = "Open My Home Page";
      homeLinkBtn.disabled = false;
    } else {
      homeLinkBtn.textContent = "Visit Main Home Page";
      homeLinkBtn.disabled = false;
    }
  }

  async function renderFavoriteTutors(userData) {
    if (!favoriteTutorsContainer) {
      return;
    }

    favoriteTutorProfiles = [];

    const favoriteIds = Array.isArray(userData?.favoriteTutorIds)
      ? userData.favoriteTutorIds.filter((id) => typeof id === 'string' && id.trim())
      : [];

    if (!favoriteIds.length) {
      favoriteTutorsContainer.innerHTML = '<p class="empty-favorites">No favourite tutors yet. <a href="tutor-search.html">Find a tutor</a> to add one.</p>';
      return;
    }

    favoriteTutorsContainer.innerHTML = '<p class="loading">Loading favourite tutors…</p>';

    try {
      const snapshots = await Promise.all(
        favoriteIds.map((id) => getDoc(doc(db, 'tutorProfiles', id)))
      );

      const tutors = snapshots
        .filter((snap) => snap.exists())
        .map((snap) => ({ id: snap.id, ...snap.data() }));

      favoriteTutorProfiles = tutors;
      refreshAllQuickActions();

      if (!tutors.length) {
        favoriteTutorsContainer.innerHTML = '<p class="empty-favorites">No favourite tutors yet. <a href="tutor-search.html">Find a tutor</a> to add one.</p>';
        return;
      }

      const list = document.createElement('ul');
      list.className = 'favorite-tutor-list';

      tutors.forEach((tutor) => {
        const item = document.createElement('li');
        item.className = 'favorite-tutor-item';

        const info = document.createElement('div');
        info.className = 'favorite-tutor-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'favorite-tutor-name';
        nameEl.textContent = tutor.fullName || 'Tutor';
        info.appendChild(nameEl);

        const metaParts = [];
        if (tutor.headline) {
          metaParts.push(tutor.headline);
        }
        if (Array.isArray(tutor.subjectsOffered) && tutor.subjectsOffered.length) {
          metaParts.push(`Subjects: ${tutor.subjectsOffered.slice(0, 3).join(', ')}`);
        }

        if (metaParts.length) {
          const metaEl = document.createElement('p');
          metaEl.className = 'favorite-tutor-meta';
          metaEl.textContent = metaParts.join(' • ');
          info.appendChild(metaEl);
        }

        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'favorite-tutor-actions';

        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'btn secondary';
        viewBtn.textContent = 'View Profile';
        viewBtn.addEventListener('click', () => {
          const homeSlug = resolveHomeSlugFromSources(null, tutor);
          if (homeSlug) {
            window.location.href = `/home/${encodeURIComponent(homeSlug)}/`;
            return;
          }
          const slug = tutor.slug ? String(tutor.slug).trim() : '';
          const target = slug ? `tutor-profile.html?slug=${encodeURIComponent(slug)}` : 'tutor-profile.html';
          window.location.href = target;
        });
        actions.appendChild(viewBtn);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn secondary';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeFavoriteTutor(tutor.id));
        actions.appendChild(removeBtn);

        item.appendChild(actions);

        list.appendChild(item);
      });

      favoriteTutorsContainer.innerHTML = '';
      favoriteTutorsContainer.appendChild(list);
    } catch (err) {
      console.error('Error loading favourite tutors:', err);
      favoriteTutorsContainer.innerHTML = '<p class="error">Unable to load favourite tutors right now.</p>';
    }
  }

  async function removeFavoriteTutor(tutorId) {
    if (!currentUser || !tutorId) {
      return;
    }

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        favoriteTutorIds: arrayRemove(tutorId)
      });

      const nextFavorites = Array.isArray(window.__latestUserData?.favoriteTutorIds)
        ? window.__latestUserData.favoriteTutorIds.filter((id) => id !== tutorId)
        : [];

      window.__latestUserData = {
        ...window.__latestUserData,
        favoriteTutorIds: nextFavorites
      };

      await renderFavoriteTutors(window.__latestUserData);
    } catch (err) {
      console.error('Failed to remove favourite tutor:', err);
      alert('Could not remove this tutor from your favourites. Please try again.');
    }
  }

  copyButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.profileUrl;
      if (!url) {
        alert("Your profile link will be available once you publish your tutor page.");
        return;
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = "Copy Profile Link";
          }, 2000);
        } else {
          throw new Error("Clipboard API unavailable");
        }
      } catch (err) {
        console.warn("Clipboard copy failed", err);
        prompt("Copy this link", url);
      }
    });
  });

  if (qaStudentAddBtn) {
    qaStudentAddBtn.addEventListener('click', () => {
      buildQaMenu('student');
      toggleQaMenu('student');
    });
  }
  if (qaTutorAddBtn) {
    qaTutorAddBtn.addEventListener('click', () => {
      buildQaMenu('tutor');
      toggleQaMenu('tutor');
    });
  }
  if (qaStudentRemoveBtn) {
    qaStudentRemoveBtn.addEventListener('click', () => {
      setRemoveMode('student', !qaRemoveMode.student);
    });
  }
  if (qaTutorRemoveBtn) {
    qaTutorRemoveBtn.addEventListener('click', () => {
      setRemoveMode('tutor', !qaRemoveMode.tutor);
    });
  }

  async function loadStudents(userId) {
    try {
      const studentsQuery = query(
        collection(db, "students"),
        where("userId", "==", userId)
      );
      
      const querySnapshot = await getDocs(studentsQuery);
      
      if (querySnapshot.empty) {
        studentsContainer.innerHTML = `
          <div class="empty-state">
            <p>No students added yet.</p>
            <button class="btn primary" onclick="window.location.href='add-student.html'">Add Your First Student</button>
          </div>
        `;
        return;
      }

      // Build student list
      const studentList = document.createElement("ul");
      studentList.className = "student-list";

      querySnapshot.forEach((doc) => {
        const student = doc.data();
        const studentId = doc.id;
        
        const li = document.createElement("li");
        li.className = "student-item";
        li.innerHTML = `
          <div class="student-info">
            <div class="student-name">${student.studentName}</div>
            <div class="student-details">
              ${student.subject} • ${student.school}
              ${student.yearOfBirth ? ` • Born ${student.yearOfBirth}` : ''}
            </div>
          </div>
          <div class="student-actions">
            <button class="btn-small btn-edit" onclick="editStudent('${studentId}')">Edit</button>
            <button class="btn-small btn-delete" onclick="deleteStudent('${studentId}', '${student.studentName}')">Delete</button>
          </div>
        `;
        studentList.appendChild(li);
      });

      studentsContainer.innerHTML = "";
      studentsContainer.appendChild(studentList);

    } catch (err) {
      console.error("Error loading students:", err);
      studentsContainer.innerHTML = `<p class="error">Error loading students. Please refresh the page.</p>`;
    }
  }

  // Make functions globally accessible
  window.editStudent = function(studentId) {
    window.location.href = `edit-student.html?id=${studentId}`;
  };

  window.deleteStudent = async function(studentId, studentName) {
    if (!confirm(`Are you sure you want to delete ${studentName}'s profile? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "students", studentId));
      alert(`${studentName}'s profile has been deleted.`);
      await loadStudents(currentUser.uid);
    } catch (err) {
      console.error("Error deleting student:", err);
      alert("Failed to delete student. Please try again.");
    }
  };
