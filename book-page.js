  import { CANONICAL_COURSES, buildCourseIndex, findCourseByLabel, sortCourses } from './course-catalog.js';
import { haversineDistanceKm, loadGoogleMapsApi, normalizeTutorLocation } from './maps-utils.js';

  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  const onAuth = window.firebaseOnAuth;
  const getDocs = window.firestoreGetDocs;
  const getDoc = window.firestoreGetDoc;
  const collection = window.firestoreCollection;
  const doc = window.firestoreDoc;
  const query = window.firestoreQuery;
  const where = window.firestoreWhere;

  const SITE_SETTINGS_COLLECTION = "siteSettings";
  const BOOKING_SETTINGS_DOC_ID = "booking";
  let bookingFormInitialized = false;

  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxKXmxMroW74nabysGBr4LDFhwkURxaBiDntFVnowpP5PN-Czy6cWYnfO5axE58x5_j/exec";

  let currentUser = null;
  let userProfile = null;
  let userStudents = [];
  const STUDENT_DROPDOWN_IDS = [
    "student-1",
    "student-2",
    "student-3",
    "student-4",
    "student-5",
    "student-6",
    "student-7",
    "student-8"
  ];
  let studentDropdowns = [];
  const tutorSelect = document.getElementById("tutor-select");
  const tutorSelectRow = document.getElementById("tutor-select-row");
  const tutorSelectHelp = document.getElementById("tutor-select-help");
  const meetingModeInputs = Array.from(document.querySelectorAll('input[name="meeting_mode"]'));
  const meetingModeHelp = document.getElementById('meeting-mode-help');
  const travelMeetingModeInput = meetingModeInputs.find((input) => input.value === 'travel' || input.id === 'meeting-mode-travel') || null;
  const travelMeetingModeLabel = travelMeetingModeInput ? travelMeetingModeInput.closest('label') : null;
  const travelFields = document.getElementById('travel-fields');
  const travelAddressInput = document.getElementById('travel-address');
  const travelInstructionsInput = document.getElementById('travel-instructions');
  const travelSurchargeInput = document.getElementById('travel-surcharge-value');
  const travelSurchargeDisplay = document.getElementById('travel-surcharge-display');
  const travelHelp = document.getElementById('travel-help');
  const addOnContainer = document.getElementById('add-on-checkboxes');
  const addOnsHelp = document.getElementById('add-ons-help');
  let activeAddOns = [];
  let mapsApiPromise = null;
  let travelAutocomplete = null;
  let travelCoords = null;
  let travelDistanceKm = null;
  const urlParams = new URLSearchParams(window.location.search);
  const tutorsById = new Map();
  // Expose for debugging only (read-only usage in console)
  window._tutorsById = tutorsById;
  const preselectedTutorQuery = sanitizeTutorId(urlParams.get('tutor'));
  let publishedTutors = [];

  const TUTOR_DIRECTORY_COLLECTION = 'tutors';
  const DEFAULT_TUTOR_DOC_ID = 'fUXnvGI024fYp4w1AvKUcbM7p8z2';
  let tutorDirectoryCache = null;
  let tutorDirectoryPromise = null;

  const COURSES_COLLECTION = 'courses';
  const COURSE_REQUESTS_COLLECTION = 'courseRequests';
  let canonicalCourses = [];
  let courseIndex = null;
  let courseLabelIndex = new Map();
  let studentCourseMap = new Map();
  let currentSubjectId = '';
  let currentSubjectLabel = '';
  const subjectInput = document.getElementById("subject");
  const subjectOptions = document.getElementById("subject-options");
  const subjectHelp = document.getElementById("subject-help");

  function normalizeLookupValue(value) {
    if (value == null) {
      return null;
    }
    const text = typeof value === 'string' ? value.trim() : String(value).trim();
    return text ? text.toLowerCase() : null;
  }

  function pickFirstValidId(values) {
    if (!Array.isArray(values)) {
      return null;
    }
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  }

  function normalizeAddOns(rawAddOns = []) {
    if (!Array.isArray(rawAddOns)) return [];
    return rawAddOns
      .map((addOn, index) => {
        if (!addOn) return null;
        const label = (addOn.label || addOn.name || '').trim();
        if (!label) return null;
        const priceDelta = Number(addOn.priceDelta ?? addOn.price ?? 0);
        const id = (addOn.id || `addon-${index + 1}`).toString();
        return {
          id,
          label,
          priceDelta: Number.isFinite(priceDelta) ? Number(priceDelta.toFixed(2)) : 0,
          defaultSelected: Boolean(addOn.defaultSelected)
        };
      })
      .filter(Boolean);
  }

  function getSelectedMeetingMode() {
    const checked = meetingModeInputs.find((input) => input.checked && !input.disabled);
    return checked ? checked.value : '';
  }

  function syncMeetingModeVisibility() {
    const mode = getSelectedMeetingMode();
    const isTravel = mode === 'travel';
    if (travelFields) {
      travelFields.classList.toggle('hidden', !isTravel);
    }
    if (travelAddressInput) {
      travelAddressInput.required = isTravel;
    }
    if (!isTravel && travelSurchargeInput) {
      travelSurchargeInput.value = 0;
      if (travelSurchargeDisplay) {
        travelSurchargeDisplay.value = '$0.00';
      }
    }
    if (typeof window.recalculateBookingCost === 'function') {
      window.recalculateBookingCost();
    }
  }

  function applyMeetingModeAvailability(settings = {}) {
    const rawModes = settings.meetingModes || {};
    const modes = {
      online: rawModes.online !== false,
      tutorsOffice: rawModes.tutorsOffice !== false,
      // Travel is allowed unless explicitly disabled; per-tutor gating happens elsewhere.
      travel: rawModes.travel !== false
    };
    const allowedInputs = [];
    meetingModeInputs.forEach((input) => {
      const allowed = Boolean(modes[input.value]);
      input.disabled = !allowed;
      if (!allowed) {
        input.checked = false;
      } else {
        allowedInputs.push(input);
      }
    });
    const current = getSelectedMeetingMode();
    if (!current && allowedInputs.length) {
      allowedInputs[0].checked = true;
    }
    syncMeetingModeVisibility();
    syncTravelMeetingModeOption();
  }

  function isTravelGloballyEnabled(settings = window.bookingSettings || {}) {
    const rawModes = settings?.meetingModes || {};
    const rawTravel = rawModes.travel;
    // Treat travel as OFF by default unless explicitly true.
    return rawTravel === true;
  }

  function isTutorTravelEnabled(tutorId) {
    if (!tutorId) return false;
    const location = getTutorTravelLocation(tutorId);
    const tutor = tutorsById.get(tutorId);
    if (tutor?.meetingModes && tutor.meetingModes.travel === false) {
      return false;
    }
    return Boolean(location && location.travelEnabled && location.basePlace && location.basePlace.location);
  }

  function isAnyTutorTravelEnabled() {
    if (!Array.isArray(publishedTutors) || publishedTutors.length === 0) {
      // Default to hidden until we know a tutor supports travel.
      return false;
    }
    return publishedTutors.some((tutor) => isTutorTravelEnabled(tutor.id));
  }

  function shouldShowTravelMeetingMode() {
    const bookingSettings = window.bookingSettings || {};
    const globalTravelSetting = bookingSettings.meetingModes?.travel;
    // Respect explicit off; otherwise allow if true OR unspecified (fall back to tutor availability).
    if (globalTravelSetting === false) {
      return false;
    }

    const tutorId = getSelectedTutorId();
    if (tutorId) {
      const tutorOk = isTutorTravelEnabled(tutorId);
      if (globalTravelSetting === true) {
        return tutorOk;
      }
      // If unspecified globally, allow when tutor supports travel.
      return tutorOk;
    }

    const anyTutorOk = isAnyTutorTravelEnabled();
    if (globalTravelSetting === true) {
      return anyTutorOk;
    }
    // If unspecified globally, show only if some tutor supports travel.
    return anyTutorOk;
  }

  function ensureMeetingModeSelected() {
    const current = getSelectedMeetingMode();
    if (current) {
      return;
    }

    const fallback = meetingModeInputs.find((input) => {
      if (!input || input.disabled) return false;
      const label = input.closest('label');
      return !(label && label.classList.contains('hidden'));
    });

    if (fallback) {
      fallback.checked = true;
    }
  }

  function syncTravelMeetingModeOption() {
    if (!travelMeetingModeInput || !travelMeetingModeLabel) {
      return;
    }

    const showTravel = shouldShowTravelMeetingMode();
    console.log('Travel visibility check', {
      showTravel,
      meetingModes: (window.bookingSettings || {}).meetingModes,
      tutorId: typeof getSelectedTutorId === 'function' ? getSelectedTutorId() : null,
      tutorTravelEnabled: typeof getSelectedTutorId === 'function' ? isTutorTravelEnabled(getSelectedTutorId()) : false
    });
    travelMeetingModeLabel.classList.toggle('hidden', !showTravel);
    travelMeetingModeLabel.style.setProperty('display', showTravel ? '' : 'none', 'important');
    travelMeetingModeInput.style.setProperty('display', showTravel ? '' : 'none', 'important');

    if (!showTravel) {
      if (travelMeetingModeInput.checked) {
        travelMeetingModeInput.checked = false;
      }
      // Disable only as a UI guard; re-enable when travel becomes available again.
      travelMeetingModeInput.dataset.disabledByTutor = 'true';
      travelMeetingModeInput.disabled = true;
      travelMeetingModeInput.required = false;
    } else {
      delete travelMeetingModeInput.dataset.disabledByTutor;
      travelMeetingModeInput.disabled = false;
      travelMeetingModeInput.required = true;
    }

    ensureMeetingModeSelected();
    syncMeetingModeVisibility();
  }

  // Helper to debug travel visibility in console
  window.getTravelDebugState = () => {
    const bookingSettings = window.bookingSettings || {};
    const tutorId = typeof getSelectedTutorId === 'function' ? getSelectedTutorId() : null;
    const tutor = tutorsById.get ? tutorsById.get(tutorId) : null;
    return {
      meetingModes: bookingSettings.meetingModes,
      isTravelGloballyEnabled: isTravelGloballyEnabled(bookingSettings),
      tutorId,
      tutorMeetingModes: tutor?.meetingModes,
      tutorTravelEnabled: isTutorTravelEnabled(tutorId),
      showTravel: shouldShowTravelMeetingMode()
    };
  };

  function renderAddOnsFromSettings(settings = {}) {
    if (!addOnContainer) return;
    const normalized = normalizeAddOns(settings.addOns || []);
    console.log('Rendering add-ons from settings', { raw: settings.addOns, normalized });

    // If we already rendered add-ons and the new settings contain none, keep the existing UI
    // instead of wiping it due to an empty/undefined payload from a later call.
    if (normalized.length === 0 && activeAddOns.length > 0) {
      console.warn('Skipping add-on clear because previous add-ons exist and new payload is empty.');
      return;
    }

    addOnContainer.innerHTML = '';
    activeAddOns = normalized;
    const addOnsRow = document.getElementById('add-ons-row');
    if (addOnsRow) {
      addOnsRow.classList.toggle('hidden', normalized.length === 0);
    }
    if (!normalized.length) {
      if (addOnsHelp) {
        addOnsHelp.textContent = 'No add-ons available for this session.';
      }
      if (typeof window.recalculateBookingCost === 'function') {
        window.recalculateBookingCost();
      }
      return;
    }
    if (addOnsHelp) {
      addOnsHelp.textContent = 'Select any add-ons you want included.';
    }
    normalized.forEach((addOn, index) => {
      const safeId = (addOn.id || `addon-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
      const label = document.createElement('label');
      label.className = 'checkbox-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `addon-${safeId}`;
      cb.name = `addon_${safeId}`;
      cb.dataset.addonId = safeId;
      cb.dataset.priceDelta = addOn.priceDelta;
      cb.checked = Boolean(addOn.defaultSelected);
      label.appendChild(cb);
      const priceLabel = Number(addOn.priceDelta) >= 0
        ? `+$${Number(addOn.priceDelta).toFixed(2)}`
        : `-$${Math.abs(Number(addOn.priceDelta)).toFixed(2)}`;
      label.appendChild(document.createTextNode(` ${addOn.label} (${priceLabel})`));
      addOnContainer.appendChild(label);
    });
    if (typeof window.recalculateBookingCost === 'function') {
      window.recalculateBookingCost();
    }
  }

  function setTravelCoords(latLng) {
    if (latLng && Number.isFinite(latLng.lat) && Number.isFinite(latLng.lng)) {
      travelCoords = { lat: Number(latLng.lat), lng: Number(latLng.lng) };
    } else {
      travelCoords = null;
    }
  }

  function formatMoney(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return '$0.00';
    return `$${value.toFixed(2)}`;
  }

  async function ensureMapsApi() {
    if (!mapsApiPromise) {
      mapsApiPromise = loadGoogleMapsApi({ libraries: 'places' });
    }
    return mapsApiPromise;
  }

  async function initTravelAutocomplete() {
    if (!travelAddressInput || travelAutocomplete) return;
    try {
      const maps = await ensureMapsApi();
      travelAutocomplete = new maps.places.Autocomplete(travelAddressInput, {
        fields: ['place_id', 'geometry', 'formatted_address', 'name']
      });
      travelAutocomplete.addListener('place_changed', () => {
        const place = travelAutocomplete.getPlace();
        const location = place?.geometry?.location;
        if (location) {
          setTravelCoords({ lat: location.lat(), lng: location.lng() });
        } else {
          setTravelCoords(null);
        }
        void updateTravelSurcharge();
      });
    } catch (error) {
      console.warn('Travel autocomplete unavailable', error);
      if (travelHelp) {
        travelHelp.textContent = 'Enter your address for travel sessions (autocomplete unavailable).';
      }
    }
  }

  async function geocodeTravelAddress() {
    if (!travelAddressInput) return null;
    const address = travelAddressInput.value?.trim();
    if (!address) {
      setTravelCoords(null);
      return null;
    }
    try {
      const maps = await ensureMapsApi();
      const geocoder = new maps.Geocoder();
      const result = await new Promise((resolve) => {
        geocoder.geocode({ address }, (results, status) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng(), formattedAddress: results[0].formatted_address });
          } else {
            resolve(null);
          }
        });
      });
      if (result) {
        setTravelCoords({ lat: result.lat, lng: result.lng });
        if (!travelAddressInput.value.includes(result.formattedAddress)) {
          travelAddressInput.value = result.formattedAddress;
        }
      } else {
        setTravelCoords(null);
      }
      return result;
    } catch (error) {
      console.warn('Geocoding failed', error);
      setTravelCoords(null);
      return null;
    }
  }

  function getTutorTravelLocation(tutorId) {
    const tutor = tutorsById.get(tutorId || '');
    if (!tutor) return null;
    if (tutor.normalizedLocation) return tutor.normalizedLocation;
    const normalized = normalizeTutorLocation(tutor.tutorLocation || tutor.location || {});
    tutor.normalizedLocation = normalized;
    return normalized;
  }

  function computeTravelSurchargeForDistance(distanceKm, location) {
    if (!location) return { surcharge: 0, allowed: false, reason: 'no-location' };
    const travelRadius = Number(location.travelRadiusKm) || 0;
    const pricing = Array.isArray(location.radiusPricing) ? location.radiusPricing : [];
    const withinRadius = travelRadius > 0 ? distanceKm <= travelRadius : true;
    if (!withinRadius) {
      return { surcharge: 0, allowed: false, reason: 'outside-radius', travelRadius };
    }
    if (!pricing.length) {
      return { surcharge: 0, allowed: true, reason: 'no-pricing' };
    }
    let matched = pricing.find((entry) => Number.isFinite(entry.upToKm) && distanceKm <= entry.upToKm);
    if (!matched) {
      matched = pricing[pricing.length - 1];
    }
    const surcharge = Number.isFinite(matched?.priceDelta) ? matched.priceDelta : 0;
    return { surcharge, allowed: true, reason: 'priced', upToKm: matched?.upToKm };
  }

  function updateTravelUiMessage(message, isError = false) {
    if (!travelHelp) return;
    travelHelp.textContent = message;
    travelHelp.classList.toggle('error', isError);
  }

  async function updateTravelSurcharge() {
    const mode = getSelectedMeetingMode();
    if (mode !== 'travel') {
      travelDistanceKm = null;
      if (travelSurchargeInput) travelSurchargeInput.value = 0;
      if (travelSurchargeDisplay) travelSurchargeDisplay.value = '$0.00';
      if (typeof window.setBookingPricingContext === 'function') {
        window.setBookingPricingContext({ travelSurcharge: 0 });
      }
      return;
    }

    const tutorId = getSelectedTutorId();
    const location = tutorId ? getTutorTravelLocation(tutorId) : null;
    if (!location || !location.travelEnabled || !location.basePlace?.location) {
      travelDistanceKm = null;
      updateTravelUiMessage('Travel is not available for this tutor.');
      if (travelSurchargeInput) travelSurchargeInput.value = 0;
      if (travelSurchargeDisplay) travelSurchargeDisplay.value = '$0.00';
      if (typeof window.setBookingPricingContext === 'function') {
        window.setBookingPricingContext({ travelSurcharge: 0 });
      }
      return;
    }

    if (!travelCoords) {
      await geocodeTravelAddress();
    }
    if (!travelCoords) {
      travelDistanceKm = null;
      updateTravelUiMessage('Enter your address to confirm travel availability and cost.', true);
      if (typeof window.setBookingPricingContext === 'function') {
        window.setBookingPricingContext({ travelSurcharge: 0 });
      }
      return;
    }

    const distanceKm = haversineDistanceKm(travelCoords, location.basePlace.location);
    travelDistanceKm = distanceKm;
    const result = computeTravelSurchargeForDistance(distanceKm, location);
    if (!result.allowed) {
      updateTravelUiMessage(`Outside travel radius (${distanceKm.toFixed(1)} km). Max ${result.travelRadius || location.travelRadiusKm || 0} km.`, true);
      if (travelSurchargeInput) travelSurchargeInput.value = 0;
      if (travelSurchargeDisplay) travelSurchargeDisplay.value = '$0.00';
      if (typeof window.setBookingPricingContext === 'function') {
        window.setBookingPricingContext({ travelSurcharge: 0 });
      }
      return;
    }

    const surcharge = Number(result.surcharge) || 0;
    if (travelSurchargeInput) {
      travelSurchargeInput.value = surcharge;
    }
    if (travelSurchargeDisplay) {
      travelSurchargeDisplay.value = formatMoney(surcharge);
    }
    const zoneText = result.upToKm ? `up to ${result.upToKm} km` : 'within travel radius';
    updateTravelUiMessage(`Travel distance: ${distanceKm.toFixed(1)} km, ${zoneText}.`);

    if (typeof window.setBookingPricingContext === 'function') {
      window.setBookingPricingContext({ travelSurcharge: surcharge });
    }
  }

  async function loadTutorDirectory() {
    if (tutorDirectoryCache) {
      return tutorDirectoryCache;
    }
    if (!tutorDirectoryPromise) {
      tutorDirectoryPromise = (async () => {
        if (!db || !collection || !getDocs) {
          return [];
        }
        try {
          const snapshot = await getDocs(collection(db, TUTOR_DIRECTORY_COLLECTION));
          tutorDirectoryCache = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            data: docSnap.data() || {}
          }));
        } catch (error) {
          console.warn('Unable to load tutors directory', error);
          tutorDirectoryCache = [];
        }
        return tutorDirectoryCache;
      })();
    }
    return tutorDirectoryPromise;
  }

  function matchByCandidate(fields, needle) {
    if (!needle || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((candidate) => normalizeLookupValue(candidate) === needle);
  }

  function resolveConfiguredTutorDocId({ bookingSettings, userProfile, directory }) {
    const configured = pickFirstValidId([
      bookingSettings?.defaultTutorDocId,
      bookingSettings?.primaryTutorDocId,
      bookingSettings?.tutorDocId,
      bookingSettings?.defaultTutorRecordId,
      bookingSettings?.primaryTutorRecordId,
      bookingSettings?.tutorRecordId,
      userProfile?.preferredTutorDocId,
      userProfile?.preferredTutorRecordId,
      userProfile?.tutorDocId
    ]);
    if (!configured) {
      return null;
    }
    const configuredNorm = normalizeLookupValue(configured);
    if (!configuredNorm || !Array.isArray(directory) || !directory.length) {
      return configured;
    }
    const matchingEntry = directory.find((entry) => normalizeLookupValue(entry.id) === configuredNorm);
    return matchingEntry ? matchingEntry.id : configured;
  }

  async function resolveTutorDocumentId({ tutorUid, tutorName, bookingSettings = {}, userProfile = null }) {
    const directory = await loadTutorDirectory();
    const uidNorm = normalizeLookupValue(tutorUid);
    if (uidNorm && uidNorm !== 'unassigned') {
      const directMatch = Array.isArray(directory)
        ? directory.find((entry) => normalizeLookupValue(entry.id) === uidNorm)
        : null;
      if (directMatch) {
        return directMatch.id;
      }
      const relatedMatch = Array.isArray(directory)
        ? directory.find((entry) => {
            const data = entry.data || {};
            const candidates = [
              data.uid,
              data.userId,
              data.userID,
              data.tutorUid,
              data.tutorID,
              data.ownerUid,
              data.ownerId,
              data.profile?.uid,
              data.profile?.userId,
              data.profile?.ownerUid,
              data.profile?.userID
            ];
            return matchByCandidate(candidates, uidNorm);
          })
        : null;
      if (relatedMatch) {
        return relatedMatch.id;
      }
    }

    const nameNorm = normalizeLookupValue(tutorName);
    if (nameNorm) {
      const nameMatch = Array.isArray(directory)
        ? directory.find((entry) => {
            const data = entry.data || {};
            const candidates = [
              data.fullName,
              data.displayName,
              data.legalName,
              data.preferredName,
              data.name,
              data.profile?.fullName,
              data.profile?.displayName,
              data.billing?.legalName
            ];
            return matchByCandidate(candidates, nameNorm);
          })
        : null;
      if (nameMatch) {
        return nameMatch.id;
      }
    }

    const configuredDocId = resolveConfiguredTutorDocId({ bookingSettings, userProfile, directory });
    if (configuredDocId) {
      return configuredDocId;
    }

    if (Array.isArray(directory) && directory.length === 1) {
      return directory[0].id;
    }

    if (uidNorm && uidNorm !== 'unassigned') {
      return tutorUid;
    }

    const fallback = bookingSettings?.defaultTutorUid
      || bookingSettings?.primaryTutorUid
      || userProfile?.preferredTutorUid
      || DEFAULT_TUTOR_DOC_ID;
    return fallback;
  }

  function getDefaultCourses() {
    return sortCourses(CANONICAL_COURSES.map((c) => ({ ...c })));
  }

  function setCourses(list) {
    canonicalCourses = sortCourses(list || []);
    courseIndex = buildCourseIndex(canonicalCourses);
    courseLabelIndex = new Map(canonicalCourses.map((c) => [((c.label || '').toLowerCase()), c]));
  }

  async function loadCoursesFromFirestore() {
    if (!db || !collection || !getDocs) {
      setCourses(getDefaultCourses());
      return canonicalCourses;
    }

    try {
      const snap = await getDocs(collection(db, COURSES_COLLECTION));
      const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      if (rows.length) {
        setCourses(rows);
        return canonicalCourses;
      }
    } catch (error) {
      console.warn('Courses: using defaults because Firestore fetch failed', error);
    }

    setCourses(getDefaultCourses());
    return canonicalCourses;
  }

  function courseById(courseId) {
    if (!courseId || !courseIndex) return null;
    return courseIndex.byId.get(courseId) || null;
  }

  function getCourseBySubjectAndLevel(subjectGroup, gradeCeiling) {
    if (!subjectGroup || !canonicalCourses.length) return null;
    const candidates = canonicalCourses
      .filter((c) => c.subjectGroup === subjectGroup)
      .sort((a, b) => (a.gradeCeiling || 0) - (b.gradeCeiling || 0));
    if (!candidates.length) return null;
    if (gradeCeiling) {
      const exact = candidates.find((c) => c.gradeCeiling === gradeCeiling);
      if (exact) return exact;
      const lower = candidates.filter((c) => c.gradeCeiling <= gradeCeiling);
      if (lower.length) return lower[lower.length - 1];
    }
    return candidates[candidates.length - 1];
  }

  function inferCourseFromText(value) {
    if (!value) return null;
    const text = value.toString().trim().toLowerCase();
    if (!text) return null;

    let subjectGroup = null;
    if (text.includes('math')) subjectGroup = 'math';
    else if (text.includes('english') || text.includes('ela')) subjectGroup = 'english';
    else if (text.includes('social')) subjectGroup = 'social';
    else if (text.includes('science')) subjectGroup = 'science';

    let gradeCeiling = null;
    if (/gr\s*12|grade\s*12|\b12\b/.test(text)) gradeCeiling = 12;
    else if (/gr\s*11|grade\s*11|\b11\b/.test(text)) gradeCeiling = 11;
    else if (/gr\s*10|grade\s*10|\b10\b/.test(text)) gradeCeiling = 10;
    else if (/jr|junior|grade\s*[7-9]|\b7\b|\b8\b|\b9\b/.test(text)) gradeCeiling = 9;
    else if (/elem|elementary|k-6|\bk\b|kindergarten|\b[1-6]\b/.test(text)) gradeCeiling = 6;

    if (!subjectGroup) return null;
    return getCourseBySubjectAndLevel(subjectGroup, gradeCeiling || undefined);
  }

  function findCourseFromInput(rawValue) {
    if (!rawValue) return null;
    const direct = courseIndex ? findCourseByLabel(rawValue, courseIndex) : null;
    if (direct) return direct;
    return inferCourseFromText(rawValue);
  }

  function expandCoverageFromSelections(selectionIds = []) {
    const maxBySubject = new Map();
    const ids = Array.isArray(selectionIds) ? selectionIds : [selectionIds];
    ids.forEach((rawId) => {
      const course = courseById(rawId) || findCourseFromInput(rawId);
      if (!course || !course.subjectGroup) return;
      const currentMax = maxBySubject.get(course.subjectGroup) || 0;
      const ceiling = Number(course.gradeCeiling) || 0;
      maxBySubject.set(course.subjectGroup, Math.max(currentMax, ceiling));
    });

    const coverage = new Set();
    canonicalCourses.forEach((course) => {
      const ceiling = maxBySubject.get(course.subjectGroup);
      if (ceiling && course.gradeCeiling <= ceiling) {
        coverage.add(course.id);
      }
    });
    return coverage;
  }

  function buildCourseOptions(priorityIds = [], allowedIds = null) {
    const allowed = allowedIds ? new Set(allowedIds) : null;
    const seen = new Set();
    const output = [];

    const addCourse = (courseId) => {
      const course = courseById(courseId);
      if (!course) return;
      if (allowed && !allowed.has(course.id)) return;
      if (seen.has(course.id)) return;
      seen.add(course.id);
      output.push(course);
    };

    priorityIds.forEach(addCourse);
    canonicalCourses.forEach((course) => {
      if (allowed && !allowed.has(course.id)) return;
      addCourse(course.id);
    });

    return sortCourses(output);
  }

  function collectTutorCourseSelections(tutor) {
    const selections = new Set();
    const catalogIds = Array.isArray(tutor?.catalogSubjectIds) ? tutor.catalogSubjectIds : [];
    catalogIds.forEach((id) => {
      const course = courseById(id) || findCourseFromInput(id);
      if (course) selections.add(course.id);
    });

    const offered = Array.isArray(tutor?.subjectsOffered) ? tutor.subjectsOffered : [];
    offered.forEach((label) => {
      const course = findCourseFromInput(label);
      if (course) selections.add(course.id);
    });

    return Array.from(selections);
  }

  function getTutorsForSubject(subjectId) {
    if (!subjectId) return publishedTutors;
    return publishedTutors.filter((tutor) => tutor.coverageCourseIds instanceof Set && tutor.coverageCourseIds.has(subjectId));
  }

  function resolveStudentCourse(student) {
    if (!student) return null;
    const course = courseById(student.subjectId) || findCourseFromInput(student.subject);
    studentCourseMap.set(student.id, course ? course.id : null);
    return course;
  }

  function refreshStudentCourseMap() {
    studentCourseMap = new Map();
    userStudents.forEach((student) => resolveStudentCourse(student));
  }

  function getPrimaryStudentCourseIds() {
    const primaryDropdown = studentDropdowns[0];
    if (!primaryDropdown || !primaryDropdown.value) return [];
    const courseId = studentCourseMap.get(primaryDropdown.value);
    return courseId ? [courseId] : [];
  }

  function getPrimaryStudentId() {
    const primaryDropdown = studentDropdowns[0];
    return primaryDropdown && primaryDropdown.value ? primaryDropdown.value : '';
  }

  function buildSubjectOptionsForContext() {
    const priorityIds = getPrimaryStudentCourseIds();
    const selectedTutorId = getSelectedTutorId();
    const tutor = selectedTutorId ? tutorsById.get(selectedTutorId) : null;
    const allowedIds = tutor?.coverageCourseIds instanceof Set ? Array.from(tutor.coverageCourseIds) : null;
    return buildCourseOptions(priorityIds, allowedIds);
  }

  function renderSubjectDropdown() {
    if (!subjectOptions) return;
    const options = buildSubjectOptionsForContext();
    subjectOptions.innerHTML = '';
    options.forEach((course) => {
      const option = document.createElement('option');
      option.value = course.label;
      subjectOptions.appendChild(option);
    });

    const hasStudentCourse = getPrimaryStudentCourseIds().length > 0;
    if (hasStudentCourse) {
      if (subjectHelp) {
        subjectHelp.innerHTML = 'Courses your student is registered for are shown first. Start typing to search.';
      }
    } else if (subjectHelp) {
      const primaryId = getPrimaryStudentId();
      const editHref = primaryId ? `edit-student.html?id=${encodeURIComponent(primaryId)}` : 'dashboard.html';
      subjectHelp.innerHTML = `You have not registered courses for this student yet. <a href="${editHref}">Edit Student Profile</a> to add one.`;
    }
  }

  function handleSubjectChange() {
    const value = subjectInput ? subjectInput.value : '';
    const match = findCourseFromInput(value);
    if (match) {
      currentSubjectId = match.id;
      currentSubjectLabel = match.label;
    } else {
      currentSubjectId = '';
      currentSubjectLabel = value || '';
    }
    refreshTutorSelectForSubject();
  }

  function refreshTutorSelectForSubject() {
    const subjectId = currentSubjectId || (getPrimaryStudentCourseIds()[0] || '');
    const favouriteSet = new Set((userProfile?.favoriteTutorIds || []).map((id) => sanitizeTutorId(id)).filter(Boolean));
    const availableTutors = subjectId ? getTutorsForSubject(subjectId) : publishedTutors;
    const currentSelection = getSelectedTutorId();
    const selectionStillValid = currentSelection && availableTutors.some((t) => t.id === currentSelection);
    const initialSelection = selectionStillValid ? currentSelection : pickInitialTutorSelection(favouriteSet, window.bookingSettings || {}, availableTutors);
    populateTutorSelect(availableTutors, favouriteSet, initialSelection);

    syncCalendarSourceToSelection();
    syncTravelMeetingModeOption();
    if (getSelectedMeetingMode() === 'travel') {
      void updateTravelSurcharge();
    }

    if (subjectId && availableTutors.length === 0 && subjectHelp) {
      subjectHelp.innerHTML = 'No published tutors currently cover this course. Please choose another course or check back soon.';
    }
  }

  function cacheStudentDropdowns() {
    studentDropdowns = STUDENT_DROPDOWN_IDS.map((id) => document.getElementById(id));
    window.bookingStudentDropdowns = studentDropdowns;
  }

  function handleStudentSelectionChange() {
    if (typeof window.recalculateBookingCost === 'function') {
      window.recalculateBookingCost();
    }
  }

  function attachStudentDropdownListeners() {
    studentDropdowns.forEach((dropdown) => {
      if (!dropdown) return;
      dropdown.addEventListener('change', handleStudentSelectionChange);
    });
  }

  function getConfiguredStudentLimit(settings) {
    const fallbackMax = (typeof DEFAULT_BOOKING_SETTINGS !== 'undefined'
      ? DEFAULT_BOOKING_SETTINGS.maxStudentsPerSession
      : STUDENT_DROPDOWN_IDS.length);
    const raw = Number(settings?.maxStudentsPerSession ?? fallbackMax);
    const parsed = Number.isFinite(raw) ? raw : fallbackMax;
    return Math.min(Math.max(Math.round(parsed) || 1, 1), STUDENT_DROPDOWN_IDS.length);
  }

  function applyBookingSettingsToStudentSelectors(settings, studentCount = null) {
    const limit = getConfiguredStudentLimit(settings || window.bookingSettings || {});
    const count = Number.isFinite(studentCount) ? Math.max(0, studentCount) : null;
    const maxVisible = Math.max(1, count == null ? limit : Math.min(limit, Math.max(1, count)));

    studentDropdowns.forEach((dropdown, index) => {
      if (!dropdown) return;
      const container = dropdown.closest('.field-row');
      const withinLimit = index < maxVisible;
      if (withinLimit) {
        dropdown.disabled = false;
        if (container) {
          container.classList.remove('hidden');
        }
      } else {
        dropdown.value = '';
        dropdown.disabled = true;
        if (container) {
          container.classList.add('hidden');
        }
      }
    });
    handleStudentSelectionChange();
  }

  function sanitizeTutorId(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    return trimmed || '';
  }

  function getSelectedTutorId() {
    if (!tutorSelect) {
      return '';
    }
    const value = tutorSelect.value;
    return typeof value === 'string' ? value.trim() : '';
  }

  function resolveTutorCalendarId(tutor) {
    if (!tutor) return null;
    const candidates = [
      tutor.calendarId,
      tutor.calendarEmail,
      tutor.calendarOwner,
      tutor.calendarOwnerEmail,
      tutor.googleCalendarId,
      tutor.email,
      tutor.ownerEmail,
      tutor.contactEmail
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      }
    }
    return null;
  }

  function resolveTutorScriptUrl(tutor) {
    if (!tutor) return null;
    const candidates = [
      tutor.calendarScriptUrl,
      tutor.availabilityScriptUrl,
      tutor.calendarUrl,
      tutor.availabilityUrl
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return trimmed;
        }
      }
    }
    return null;
  }

  function syncCalendarSourceToSelection() {
    const tutorId = getSelectedTutorId();
    const tutor = tutorId ? tutorsById.get(tutorId) : null;
    const source = {
      scriptUrl: resolveTutorScriptUrl(tutor) || APPS_SCRIPT_URL,
      calendarId: resolveTutorCalendarId(tutor)
    };
    if (typeof window.setBookingCalendarSource === 'function') {
      window.setBookingCalendarSource(source);
    }
  }

  function getTutorNameById(tutorId) {
    if (!tutorId) {
      return 'No preference';
    }
    const tutor = tutorsById.get(tutorId);
    if (!tutor) {
      return 'Tutor';
    }
    const baseName = tutor.fullName || 'Tutor';
    return baseName;
  }

  function buildTutorOption(tutor, isFavourite) {
    const option = document.createElement('option');
    option.value = tutor.id;
    const labelParts = [];
    const name = tutor.fullName || 'Tutor';
    labelParts.push(isFavourite ? `★ ${name}` : name);
    if (tutor.headline) {
      labelParts.push(tutor.headline);
    } else if (Array.isArray(tutor.subjectsOffered) && tutor.subjectsOffered.length) {
      labelParts.push(`Subjects: ${tutor.subjectsOffered.slice(0, 2).join(', ')}`);
    }
    option.textContent = labelParts.join(' • ');
    if (tutor.slug) {
      option.dataset.slug = tutor.slug;
    }
    return option;
  }

  function populateTutorSelect(tutors, favouriteSet, initialSelection) {
    if (!tutorSelect) {
      return;
    }

    tutorSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'No preference — assign best fit';
    tutorSelect.appendChild(placeholder);

    if (!Array.isArray(tutors) || tutors.length === 0) {
      const unavailableOption = document.createElement('option');
      unavailableOption.value = '';
      unavailableOption.textContent = 'Tutors are not available right now';
      unavailableOption.disabled = true;
      tutorSelect.appendChild(unavailableOption);
      tutorSelect.disabled = true;
      if (tutorSelectRow) {
        tutorSelectRow.classList.remove('hidden');
      }
      if (tutorSelectHelp) {
        tutorSelectHelp.textContent = 'Tutors are currently unavailable. Please reach out if you need assistance.';
      }
      return;
    }

    tutorSelect.disabled = false;
    if (tutorSelectRow) {
      tutorSelectRow.classList.remove('hidden');
    }

    const favourites = tutors.filter((tutor) => favouriteSet?.has(tutor.id));
    const others = tutors.filter((tutor) => !favouriteSet?.has(tutor.id));

    if (favourites.length) {
      const favGroup = document.createElement('optgroup');
      favGroup.label = 'Favourite tutors';
      favourites.forEach((tutor) => favGroup.appendChild(buildTutorOption(tutor, true)));
      tutorSelect.appendChild(favGroup);
    }

    if (others.length) {
      const otherGroup = document.createElement('optgroup');
      otherGroup.label = favourites.length ? 'Other tutors' : 'Available tutors';
      others.forEach((tutor) => otherGroup.appendChild(buildTutorOption(tutor, false)));
      tutorSelect.appendChild(otherGroup);
    }

    if (tutorSelectHelp) {
      tutorSelectHelp.textContent = favourites.length
        ? 'Your favourite tutors appear at the top of this list.'
        : 'No favourite tutors yet. Mark tutors as favourites from the search page to find them faster.';
    }

    if (initialSelection && tutorsById.has(initialSelection)) {
      tutorSelect.value = initialSelection;
    } else {
      tutorSelect.value = '';
    }
  }

  function pickInitialTutorSelection(favouriteSet, bookingSettingsData, availableTutors) {
    const candidateOrder = [
      preselectedTutorQuery,
      sanitizeTutorId(userProfile?.preferredTutorUid),
      sanitizeTutorId(userProfile?.preferredTutorId),
      sanitizeTutorId(bookingSettingsData?.defaultTutorUid),
      sanitizeTutorId(bookingSettingsData?.primaryTutorUid),
      sanitizeTutorId(bookingSettingsData?.tutorUid),
      sanitizeTutorId(bookingSettingsData?.defaultTutorId),
      sanitizeTutorId(bookingSettingsData?.primaryTutorId),
      sanitizeTutorId(bookingSettingsData?.tutorId)
    ];

    for (const candidate of candidateOrder) {
      if (candidate && tutorsById.has(candidate)) {
        return candidate;
      }
    }

    if (favouriteSet) {
      for (const favId of favouriteSet) {
        if (favId && tutorsById.has(favId)) {
          return favId;
        }
      }
    }

    if (preselectedTutorQuery && Array.isArray(availableTutors) && availableTutors.length) {
      const slugMatch = availableTutors.find((tutor) => sanitizeTutorId(tutor.slug) === preselectedTutorQuery);
      if (slugMatch && tutorsById.has(slugMatch.id)) {
        return slugMatch.id;
      }
    }

    return '';
  }

  async function loadTutorOptions(favoriteIds = [], bookingSettingsPromise = null, courses = canonicalCourses) {
    if (!tutorSelect || !db) {
      return;
    }

    try {
      const tutorQuery = query(
        collection(db, 'tutorProfiles'),
        where('status', '==', 'published')
      );
      const snapshot = await getDocs(tutorQuery);
      publishedTutors = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      publishedTutors.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

      // Attach derived coverage for each tutor
      publishedTutors = publishedTutors.map((tutor) => {
        const selections = collectTutorCourseSelections(tutor);
        const coverage = expandCoverageFromSelections(selections);
        const normalizedLocation = normalizeTutorLocation(tutor.tutorLocation || tutor.location || {});
        return { ...tutor, coverageCourseIds: coverage, normalizedLocation };
      });

      tutorsById.clear();
      publishedTutors.forEach((tutor) => {
        tutorsById.set(tutor.id, tutor);
      });

      let bookingSettingsData = window.bookingSettings || null;
      if (bookingSettingsPromise) {
        try {
          const resolvedSettings = await bookingSettingsPromise;
          if (resolvedSettings) {
            bookingSettingsData = resolvedSettings;
          }
        } catch (settingsErr) {
          console.warn('Tutor select: unable to use booking settings defaults', settingsErr);
        }
      }

      const favouriteSet = new Set((favoriteIds || []).map((id) => sanitizeTutorId(id)).filter(Boolean));
      const initialSelection = pickInitialTutorSelection(favouriteSet, bookingSettingsData || {}, publishedTutors);
      populateTutorSelect(publishedTutors, favouriteSet, initialSelection);
    } catch (error) {
      console.error('Error loading tutors for booking form:', error);
      if (tutorSelectRow) {
        tutorSelectRow.classList.add('hidden');
      }
    }
  }

  window.getBookingStudentCount = () => {
    let count = 0;
    studentDropdowns.forEach((dropdown) => {
      if (!dropdown || dropdown.disabled) {
        return;
      }
      const container = dropdown.closest('.field-row');
      if (container && container.classList.contains('hidden')) {
        return;
      }
      if (dropdown.value) {
        count += 1;
      }
    });
    return count;
  };

  cacheStudentDropdowns();
  attachStudentDropdownListeners();

  if (subjectInput) {
    subjectInput.addEventListener('change', handleSubjectChange);
    subjectInput.addEventListener('input', () => {
      currentSubjectId = '';
    });
  }

  if (tutorSelect) {
    tutorSelect.addEventListener('change', () => {
      renderSubjectDropdown();
      refreshTutorSelectForSubject();
      syncCalendarSourceToSelection();
      syncTravelMeetingModeOption();
      void updateTravelSurcharge();
    });
  }

  meetingModeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      syncMeetingModeVisibility();
      void updateTravelSurcharge();
    });
  });
  syncMeetingModeVisibility();

  if (travelAddressInput) {
    travelAddressInput.addEventListener('blur', () => {
      setTravelCoords(null);
      void updateTravelSurcharge();
    });
    travelAddressInput.addEventListener('input', () => {
      setTravelCoords(null);
    });
  }
  void initTravelAutocomplete();

  // Check authentication
  onAuth(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    
    // Wait a moment for Firebase to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentUser = user;
    await loadUserData();
  });

  async function loadBookingSettingsFromFirestore() {
    if (!db) {
      return null;
    }
    try {
      const settingsSnapshot = await getDoc(doc(db, SITE_SETTINGS_COLLECTION, BOOKING_SETTINGS_DOC_ID));
      if (settingsSnapshot?.exists()) {
        const data = settingsSnapshot.data();
        console.log("Loaded booking settings:", data);
        window.bookingSettings = data;
        return data;
      }
    } catch (error) {
      console.warn("Unable to fetch booking settings:", error);
    }
    return null;
  }

  async function loadUserData() {
    try {
      // Verify db is initialized
      if (!db) {
        console.error("Firestore database not initialized!");
        throw new Error("Database connection not available. Please refresh the page.");
      }
      
      console.log("Loading user data for:", currentUser.uid);
      const bookingSettingsPromise = loadBookingSettingsFromFirestore();
      const coursesPromise = loadCoursesFromFirestore();
      
      // Load user profile
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      let favoriteTutorIds = [];
      if (userDoc.exists()) {
        userProfile = userDoc.data();
        console.log("User profile loaded:", userProfile);

        favoriteTutorIds = Array.isArray(userProfile.favoriteTutorIds)
          ? userProfile.favoriteTutorIds.map((id) => sanitizeTutorId(id)).filter(Boolean)
          : [];
        userProfile.favoriteTutorIds = favoriteTutorIds;

        // Check sliding scale eligibility
        checkSlidingScaleEligibility();
      } else {
        console.warn("User profile not found in Firestore");
      }

      const coursesLoaded = await coursesPromise;

      const tutorOptionsPromise = loadTutorOptions(favoriteTutorIds, bookingSettingsPromise, coursesLoaded);

      // Load students
      console.log("Loading students...");
      const studentsQuery = query(
        collection(db, "students"),
        where("userId", "==", currentUser.uid)
      );
      const querySnapshot = await getDocs(studentsQuery);
      
      userStudents = [];
      querySnapshot.forEach((doc) => {
        userStudents.push({ id: doc.id, ...doc.data() });
      });
      
      console.log("Students loaded:", userStudents.length);

      displayStudentDropdowns();
      refreshStudentCourseMap();
      renderSubjectDropdown();
      refreshTutorSelectForSubject();

      if (typeof setupBookingForm === 'function') {
        const fetchedSettings = await bookingSettingsPromise;
        const resolvedBookingSettings = fetchedSettings || window.bookingSettings || {};
        window.bookingSettings = resolvedBookingSettings;
        setupBookingForm(resolvedBookingSettings);
        bookingFormInitialized = true;
        applyBookingSettingsToStudentSelectors(window.bookingSettings, userStudents.length);
        applyMeetingModeAvailability(resolvedBookingSettings);
        renderAddOnsFromSettings(resolvedBookingSettings);
        if (typeof window.setBookingPricingContext === 'function') {
          window.setBookingPricingContext({
            baseSessionCost: resolvedBookingSettings.baseSessionCost,
            extraStudentCost: resolvedBookingSettings.extraStudentCost
          });
        }
      } else {
        applyBookingSettingsToStudentSelectors(window.bookingSettings, userStudents.length);
      }

      await tutorOptionsPromise;
      refreshTutorSelectForSubject();
      renderSubjectDropdown();
      applyMeetingModeAvailability(window.bookingSettings || {});
      renderAddOnsFromSettings(window.bookingSettings || {});
      syncTravelMeetingModeOption();
      void updateTravelSurcharge();
      syncCalendarSourceToSelection();

    } catch (err) {
      console.error("Error loading user data:", err);
      if (!bookingFormInitialized && typeof setupBookingForm === 'function') {
        setupBookingForm();
        bookingFormInitialized = true;
        applyBookingSettingsToStudentSelectors(window.bookingSettings, userStudents.length);
        const settingsForUi = window.bookingSettings || {};
        applyMeetingModeAvailability(settingsForUi);
        renderAddOnsFromSettings(settingsForUi);
      }
      alert("Error loading your data: " + err.message + ". Please refresh the page.");
    }
  }
  
  function checkSlidingScaleEligibility() {
    // Check if user has sliding scale eligibility enabled
    const slidingScaleCheckbox = document.getElementById("sliding-scale-toggle");
    const slidingScaleLabel = slidingScaleCheckbox?.parentElement;
    
    if (!slidingScaleCheckbox) return;
    
    // Check if user has sliding_scale_eligible field (stored in Firestore users collection)
    const isEligible = userProfile?.slidingScaleEligible === true;
    
    if (!isEligible) {
      // Disable the checkbox and show why
      slidingScaleCheckbox.disabled = true;
      slidingScaleCheckbox.checked = false;
      
      if (slidingScaleLabel) {
        slidingScaleLabel.style.opacity = "0.5";
        slidingScaleLabel.style.cursor = "not-allowed";
        slidingScaleLabel.title = "Sliding scale discount is not available for your account. Please contact the tutor if you need assistance.";
      }
      
      // Hide the slider if it was visible
      const slidingScaleRow = document.getElementById("sliding-scale-row");
      if (slidingScaleRow) {
        slidingScaleRow.classList.add("hidden");
      }
    } else {
      // Enable the checkbox
      slidingScaleCheckbox.disabled = false;
      if (slidingScaleLabel) {
        slidingScaleLabel.style.opacity = "1";
        slidingScaleLabel.style.cursor = "pointer";
        slidingScaleLabel.title = "Apply sliding scale discount";
      }
    }
  }

  function displayStudentDropdowns() {
    cacheStudentDropdowns();

    const studentHasCourse = (student) => {
      if (!student) return false;
      const subject = typeof student.subject === 'string' ? student.subject.trim() : '';
      const subjectId = typeof student.subjectId === 'string' ? student.subjectId.trim() : '';
      return Boolean(subject || subjectId);
    };

    const eligibleStudents = userStudents.filter(studentHasCourse);

    if (eligibleStudents.length === 0) {
      // Show message and disable first dropdown
      const firstDropdown = studentDropdowns[0];
      if (firstDropdown) {
        firstDropdown.innerHTML = '<option value="">Add a subject in the student profile before booking</option>';
        firstDropdown.disabled = true;
      }
      applyBookingSettingsToStudentSelectors(window.bookingSettings, eligibleStudents.length);
      return;
    }

    // Populate each dropdown with user's students
    studentDropdowns.forEach((dropdown) => {
      if (!dropdown) {
        return;
      }
      const placeholder = dropdown.querySelector('option[value=""]');
      dropdown.innerHTML = '';
      if (placeholder) {
        dropdown.appendChild(placeholder);
      } else {
        const fallbackOption = document.createElement('option');
        fallbackOption.value = '';
        fallbackOption.textContent = 'Select student...';
        dropdown.appendChild(fallbackOption);
      }

      eligibleStudents.forEach((student) => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = student.studentName;
        dropdown.appendChild(option);
      });
    });
    
    if (window.bookingSettings) {
      applyBookingSettingsToStudentSelectors(window.bookingSettings, eligibleStudents.length);
    }
    handleStudentSelectionChange();
    
    // Add change event listener to Student 1 (Primary) to auto-populate subject
    const primaryStudentDropdown = studentDropdowns[0];
    
    if (primaryStudentDropdown && subjectInput) {
      primaryStudentDropdown.addEventListener('change', (e) => {
        const selectedStudentId = e.target.value;
        if (selectedStudentId) {
          const student = userStudents.find((s) => s.id === selectedStudentId);
          if (student) {
            const course = resolveStudentCourse(student);
            if (course) {
              subjectInput.value = course.label;
              currentSubjectId = course.id;
              currentSubjectLabel = course.label;
            } else {
              subjectInput.value = '';
              currentSubjectId = '';
              currentSubjectLabel = '';
            }
          }
        } else {
          subjectInput.value = '';
          currentSubjectId = '';
          currentSubjectLabel = '';
        }
        renderSubjectDropdown();
        refreshTutorSelectForSubject();
        handleSubjectChange();
      });
    }

    if (userStudents.length === 1 && primaryStudentDropdown && !primaryStudentDropdown.disabled) {
      const soleStudentId = userStudents[0]?.id;
      if (soleStudentId) {
        primaryStudentDropdown.value = soleStudentId;
        primaryStudentDropdown.dispatchEvent(new Event('change', { bubbles: true }));
        handleStudentSelectionChange();
      }
    }
  }

  // Initialize booking form (reuse existing main.js logic)
  // The form will be populated with user's email, phone, and name automatically
  let isSubmitting = false; // Prevent double submissions
  
  document.getElementById("booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) {
      console.log("Form already submitting, ignoring duplicate submission");
      return;
    }
    
    isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    
    const msg = document.getElementById("booking-form-message");
    msg.textContent = "Submitting booking request…";
    msg.className = "form-message";

    // Get selected students from dropdowns
    const selectedStudents = [];
    
    studentDropdowns.forEach((dropdown) => {
      if (!dropdown || dropdown.disabled || !dropdown.value) {
        return;
      }
      const container = dropdown.closest('.field-row');
      if (container && container.classList.contains('hidden')) {
        return;
      }
      const student = userStudents.find((s) => s.id === dropdown.value);
      if (student) {
        selectedStudents.push(student.studentName);
      }
    });

    if (selectedStudents.length === 0) {
      msg.textContent = "Please select at least one student.";
      msg.classList.add("error");
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      isSubmitting = false;
      return;
    }

    const formData = new FormData(e.target);
    const obj = Object.fromEntries(formData.entries());
    obj.type = "booking_request";
    
    // Add user profile data with fallbacks
    obj.guardian_full_name = (userProfile && userProfile.fullName) || "Guest User";
    obj.email = (userProfile && userProfile.email) || currentUser.email || "";
    obj.phone = (userProfile && userProfile.phone) || "";
    
    obj.num_students = selectedStudents.length;
    obj.student_names = selectedStudents.join(", ");
    const selectedCourse = findCourseFromInput(obj.subject);
    if (selectedCourse) {
      obj.subjectId = selectedCourse.id;
      obj.subject = selectedCourse.label;
    } else {
      obj.subjectId = null;
      // keep the typed subject as-is for legacy/unknown courses
    }
    obj.session_title = `${obj.subject} – ${selectedStudents.join(", ")}`;

    const favouriteTutorSet = new Set(userProfile?.favoriteTutorIds || []);
    const requestedTutorId = getSelectedTutorId();
    const requestedTutor = requestedTutorId ? tutorsById.get(requestedTutorId) : null;
    const requestedTutorName = requestedTutorId
      ? (requestedTutor?.fullName || 'Tutor')
      : 'No preference';
    const requestedTutorSlug = requestedTutor?.slug || '';
    const requestedTutorIsFavourite = requestedTutorId ? favouriteTutorSet.has(requestedTutorId) : false;
    const tutorNameForLookup = requestedTutorId ? requestedTutorName : null;

    obj.requested_tutor_id = requestedTutorId;
    obj.requested_tutor_name = requestedTutorName;
    obj.requested_tutor_slug = requestedTutorSlug;
    obj.requested_tutor_is_favourite = requestedTutorIsFavourite ? 'yes' : 'no';
    obj.tutor_preference = requestedTutorName;
    
    // Frontend validation: Check required fields before submitting
    const requiredFields = {
      'Subject': obj.subject,
      'Email': obj.email,
      'Name': obj.guardian_full_name,
      'Date': obj.selected_date,
      'Start Time': obj.selected_start,
      'Students': obj.student_names,
      'Meeting mode': getSelectedMeetingMode()
    };
    
    const missingFields = [];
    for (const [fieldName, value] of Object.entries(requiredFields)) {
      if (!value || value === "" || value === "Guest User" || value === "0") {
        missingFields.push(fieldName);
      }
    }
    
    const meetingMode = getSelectedMeetingMode();
    const isTravelMode = meetingMode === 'travel';
    if (isTravelMode && (!obj.travel_address || !obj.travel_address.trim())) {
      missingFields.push('Travel address');
    }

    if (missingFields.length > 0) {
      msg.textContent = `Please fill in all required fields: ${missingFields.join(", ")}`;
      msg.classList.add("error");
      msg.classList.remove("ok");
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      isSubmitting = false;
      return;
    }

    // Calculate final cost
    const duration = parseFloat(obj.duration_hours || "1");
    const selectedAddOns = activeAddOns.filter((addOn) => {
      const safeId = (addOn.id || addOn.label || '').replace(/[^a-zA-Z0-9_-]/g, '-');
      return formData.get(`addon_${safeId}`) === 'on';
    }).map((addOn) => ({
      id: addOn.id,
      label: addOn.label,
      priceDelta: Number(addOn.priceDelta) || 0
    }));
    obj.add_ons = selectedAddOns.map((addOn) => addOn.label).join(', ');
    obj.add_on_details = selectedAddOns;
    obj.meeting_mode = meetingMode || 'online';
    obj.travel_surcharge = Number(travelSurchargeInput?.value || 0) || 0;
    obj.travel_required = isTravelMode ? 'yes' : 'no';
    obj.travel_distance_km = Number.isFinite(travelDistanceKm) ? Number(travelDistanceKm.toFixed(2)) : '';
    const slidingScaleEnabled = obj.sliding_scale_toggle === "on";
    const discountSlider = document.getElementById("income-slider");
    
    const fallbackSettings = (typeof DEFAULT_BOOKING_SETTINGS !== 'undefined')
      ? DEFAULT_BOOKING_SETTINGS
      : { baseSessionCost: 50, extraStudentCost: 20 };
    const activeSettings = window.bookingSettings || fallbackSettings;
    const pricingContext = window.bookingPricingContext || {};
    const baseRate = Number(pricingContext.baseSessionCost ?? activeSettings.baseSessionCost ?? fallbackSettings.baseSessionCost);
    const additionalRate = Number(pricingContext.extraStudentCost ?? activeSettings.extraStudentCost ?? fallbackSettings.extraStudentCost);
    const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + (Number(addOn.priceDelta) || 0), 0);
    const travelSurcharge = Number(obj.travel_surcharge) || 0;
    const costPerHour = baseRate + ((selectedStudents.length - 1) * additionalRate);
    const standardTotal = (costPerHour * duration) + addOnTotal + travelSurcharge;
    
    let finalCost = standardTotal;
    if (slidingScaleEnabled && discountSlider) {
      const discountSteps = parseInt(discountSlider.value);
      const discountPerHour = discountSteps * 10;
      const discountAmount = discountPerHour * duration;
      finalCost = standardTotal - discountAmount;
    }

    if (finalCost < 0) {
      finalCost = 0;
    }

    const roundedFinalCost = Math.round(finalCost * 100) / 100;
    const amountCents = Math.round(roundedFinalCost * 100);
    obj.final_cost = roundedFinalCost.toFixed(2);
    obj.amount_cents = amountCents;
    obj.currency = 'cad';

    // Debug: Log what we're sending
    console.log("Booking data being sent:", obj);
    console.log("User profile:", userProfile);
    console.log("Selected students:", selectedStudents);

    try {
      // FIRST: Save to Firestore as PENDING booking (shows on user's sessions page immediately)
      
      // Calculate end time from start time + duration
      const startTime = obj.selected_start; // e.g., "09:15"
      const durationHours = parseFloat(obj.duration_hours || "1");
      
      // Parse start time and add duration
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(startHour, startMinute, 0, 0);
      
      const endDate = new Date(startDate.getTime() + (durationHours * 60 * 60 * 1000));
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
      
      const resolveTutorUid = () => {
        if (requestedTutorId) {
          return requestedTutorId;
        }
        const settings = window.bookingSettings || {};
        const candidate = settings.defaultTutorUid
          || settings.primaryTutorUid
          || settings.tutorUid
          || settings.defaultTutorId
          || settings.primaryTutorId
          || settings.tutorId;
        if (candidate) {
          return candidate;
        }
        if (userProfile?.preferredTutorUid) {
          return userProfile.preferredTutorUid;
        }
        return 'unassigned';
      };

      const tutorUid = resolveTutorUid();
      const resolvedTutorDocId = await resolveTutorDocumentId({
        tutorUid,
        tutorName: tutorNameForLookup || userProfile?.preferredTutorName || userProfile?.preferredTutor,
        bookingSettings: window.bookingSettings || {},
        userProfile
      });
      const tutorDocId = (typeof resolvedTutorDocId === 'string' && resolvedTutorDocId.trim())
        ? resolvedTutorDocId.trim()
        : (tutorUid && tutorUid !== 'unassigned' ? tutorUid : DEFAULT_TUTOR_DOC_ID);

      // Base booking data
      const baseBookingData = {
        userId: currentUser.uid,
        userID: currentUser.uid,
        tutorId: tutorUid,
        tutorUid,
        tutorID: tutorDocId,
        requestedTutorId: requestedTutorId || null,
        requestedTutorName,
        requestedTutorSlug: requestedTutorSlug || null,
        requestedTutorIsFavourite,
        studentNames: obj.student_names,
        students: obj.student_names,
        studentName: obj.student_names,  // Add this for consistency
        subject: obj.subject,
        subjectId: obj.subjectId || null,
        startTime: startTime,
        endTime: endTime,
        duration: durationHours,
        durationHours: durationHours,
        status: "pending_payment",
        comments: obj.questions || "",
        notes: obj.questions || "",
        additionalComments: obj.questions || "",
        guardianEmail: userProfile?.email || currentUser.email,
        guardianPhone: userProfile?.phone || "",
        guardianName: userProfile?.fullName || currentUser.displayName || "",
        meetingMode: obj.meeting_mode || 'online',
        travelAddress: obj.travel_address || '',
        travelInstructions: obj.travel_instructions || '',
        travelSurcharge: Number(obj.travel_surcharge) || 0,
        travelDistanceKm: Number.isFinite(Number(obj.travel_distance_km)) ? Number(obj.travel_distance_km) : null,
        addOns: selectedAddOns,
        createdAt: new Date().toISOString(),
        source: "WEBSITE_BOOKING_FORM",
        cost: obj.final_cost,
        approvalStatus: 'pending',
        currency: 'cad',
        amountCents,
        paymentStatusHistory: [
          {
            status: 'pending_payment',
            changedAt: new Date().toISOString(),
            changedBy: currentUser.uid,
            source: 'web:booking_form'
          }
        ]
      };
      
      // Add to Firestore bookings collection
      const addDoc = window.firestoreAddDoc;
      const collection = window.firestoreCollection;
      
      // Check if recurring
      const isRecurring = obj.recurring === "on";
      let bookingCount = 0; // Declare at outer scope so it's accessible later
      
      if (isRecurring && obj.recurring_end) {
        // Create multiple bookings - one for each week until recurring_end
        // Parse dates correctly in local time (avoid timezone issues)
        const [firstYear, firstMonth, firstDay] = obj.selected_date.split('-').map(Number);
        const firstDate = new Date(firstYear, firstMonth - 1, firstDay);
        
        const [lastYear, lastMonth, lastDay] = obj.recurring_end.split('-').map(Number);
        const lastDate = new Date(lastYear, lastMonth - 1, lastDay);
        
        let currentDate = new Date(firstDate);
        
        while (currentDate <= lastDate) {
          // Format date as YYYY-MM-DD
          const year = currentDate.getFullYear();
          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
          const day = String(currentDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          
          // Create booking for this date
          const bookingData = {
            ...baseBookingData,
            sessionDate: dateStr,
            isPartOfRecurringSeries: true,
            recurringSeriesStart: obj.selected_date,
            recurringSeriesEnd: obj.recurring_end
          };
          
          const bookingRef = await addDoc(collection(db, "bookings"), bookingData);
          console.log(`Saved recurring booking ${bookingCount + 1} to Firestore with ID:`, bookingRef.id, "for date:", dateStr);
          bookingCount++;
          
          // Move to next week
          currentDate.setDate(currentDate.getDate() + 7);
        }
        
        console.log(`Created ${bookingCount} recurring bookings from ${obj.selected_date} to ${obj.recurring_end}`);
      } else {
        // Single booking
        const bookingData = {
          ...baseBookingData,
          sessionDate: obj.selected_date
        };
        
        const bookingRef = await addDoc(collection(db, "bookings"), bookingData);
        console.log("Saved to Firestore with ID:", bookingRef.id);
        bookingCount = 1; // Single booking
      }
      
      // SECOND: Also send to Google Sheets via Apps Script (for your records)
      // Note: Using no-cors mode means we can't read the response, but submission still works
      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors", // Prevents CORS errors but we can't read response
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(obj),
        });
        console.log("Booking also sent to Google Sheets");
      } catch (sheetsError) {
        console.warn("Google Sheets submission warning (can ignore):", sheetsError);
        // Continue even if sheets fails - Firestore is the main storage
      }

      // Success! Show confirmation message
      const bookingCountMsg = isRecurring && obj.recurring_end 
        ? ` (${bookingCount} session${bookingCount !== 1 ? 's' : ''} from ${obj.selected_date} to ${obj.recurring_end})`
        : "";
      msg.textContent = `Thanks! Your booking request has been submitted${bookingCountMsg}. I will review it and email you with confirmation.`;
      msg.classList.add("ok");
      msg.classList.remove("error");
      
      // Don't call form.reset() or renderStudentFields() after successful submission
      // Just redirect to sessions page after 2 seconds
      setTimeout(() => {
        window.location.href = "sessions.html";  // Redirect to sessions page so they can see their pending booking
      }, 2500);

    } catch (err) {
      console.error("Booking submission error:", err);
      msg.textContent = "Something went wrong. Please try again or contact me directly.";
      msg.classList.add("error");
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      isSubmitting = false;
    }
  });
