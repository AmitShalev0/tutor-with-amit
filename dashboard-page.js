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

  const copyButtons = [copyTutorLinkBtn, copyTutorLinkBtnQA].filter(Boolean);

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

      if (editBookFormBtn) {
        editBookFormBtn.hidden = !isAdminUserData(userData);
      }
      
      // Display user info
      const fullName = userData.fullName || user.displayName || "Friend";
      if (userNameEl) userNameEl.textContent = fullName;
      if (profileHeadingEl) profileHeadingEl.textContent = fullName;
      if (profileEmailEl) profileEmailEl.textContent = userData.email || user.email;
      if (profilePhoneEl) profilePhoneEl.textContent = userData.phone || "Not provided";

      const hasTutorRole = !!(userData?.roles?.tutor);
      const hasStudentRole = !!(userData?.roles?.student);
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
