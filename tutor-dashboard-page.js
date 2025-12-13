    import { COURSE_CATALOG, COURSE_CATALOG_VERSION_VALUE, flattenCatalog, slugifyCourseLabel } from './course-catalog.js';
import { loadGoogleMapsApi, normalizeTutorLocation, parseTravelZoneBreaks, viewportToRectanglePath } from './maps-utils.js';

    const auth = window.firebaseAuth;
    const onAuth = window.firebaseOnAuth;
    const db = window.firebaseDb;
    const doc = window.firestoreDoc;
    const collection = window.firestoreCollection;
    const query = window.firestoreQuery;
    const where = window.firestoreWhere;
    const orderByFn = window.firestoreOrderBy;
    const limitFn = window.firestoreLimit;
    const getDoc = window.firestoreGetDoc;
    const getDocs = window.firestoreGetDocs;
    const addDoc = window.firestoreAddDoc;
    const updateDoc = window.firestoreUpdateDoc;
    const serverTimestamp = window.firestoreServerTimestamp;
    const storage = window.firebaseStorage;
    const storageRefFn = window.storageRef;
    const storageUploadBytes = window.storageUploadBytes;
    const storageGetDownloadURL = window.storageGetDownloadURL;
    const storageDeleteObject = window.storageDeleteObject;
    const functionsBase = window.firebaseFunctionsBase;

    const statusPill = document.getElementById('profile-status');
    const bookingInfoLink = document.getElementById('booking-info-link');
    const profileLinkEl = document.getElementById('profile-link');
    const copyLinkBtn = document.getElementById('copy-public-link');
    const profileForm = document.getElementById('tutor-profile-form');
    const meetingForm = document.getElementById('meeting-form');
    const profileMessage = document.getElementById('profile-message');
    const meetingMessage = document.getElementById('meeting-message');
    const photoPreview = document.getElementById('profile-photo-preview');
    const photoImg = document.getElementById('profile-photo-img');
    const photoInitials = document.getElementById('profile-photo-initials');
    const photoInput = document.getElementById('profile-photo-input');
    const removePhotoBtn = document.getElementById('remove-photo-btn');
    const photoMessage = document.getElementById('photo-message');
    const linkedinStatusBox = document.getElementById('linkedin-status');
    const linkedinConnectBtn = document.getElementById('linkedin-connect-btn');
    const linkedinRefreshBtn = document.getElementById('linkedin-refresh-btn');
    const linkedinDisconnectBtn = document.getElementById('linkedin-disconnect-btn');
    const linkedinMessage = document.getElementById('linkedin-message');
    const calendarPairBtn = document.getElementById('calendar-pair-btn');
    const teamsPairBtn = document.getElementById('teams-pair-btn');
    const calendarStatusText = document.getElementById('calendar-status-text');
    const calendarMessage = document.getElementById('calendar-message');
    const verificationMessage = document.getElementById('verification-message');
    const certificateMessage = document.getElementById('certificate-message');
    const certificateStatusDetail = document.getElementById('certificate-status-detail');
    const certificateInput = document.getElementById('certificate-upload-input');
    const verificationButtons = {
      stripe: document.querySelector('[data-verification="stripe"]'),
      linkedin: document.querySelector('[data-verification="linkedin"]'),
      certificate: document.querySelector('[data-verification="certificate"]')
    };

    const catalogSearchInput = document.getElementById('catalog-search');
    const catalogList = document.getElementById('catalog-list');
    const catalogEmptyState = document.getElementById('catalog-empty');
    const selectedSubjectsContainer = document.getElementById('selected-subjects');
    const selectedSubjectsHint = document.getElementById('selected-subjects-hint');
    const customSubjectsInput = document.getElementById('custom-subjects');

    const headlineInput = document.getElementById('profile-headline');
    const bioInput = document.getElementById('profile-bio');
    const gradesInput = document.getElementById('profile-grades');
    const statusSelect = document.getElementById('profile-status-select');

    const modeOnline = document.getElementById('mode-online');
    const modeInPerson = document.getElementById('mode-inperson');
    const modeHybrid = document.getElementById('mode-hybrid');
    const locationSearchInput = document.getElementById('location-search');
    const locationLabelInput = document.getElementById('location-label');
    const travelEnabledToggle = document.getElementById('travel-enabled');
    const travelRadiusInput = document.getElementById('travel-radius');
    const travelRadiusValue = document.getElementById('travel-radius-value');
    const travelZonesInput = document.getElementById('travel-zones');
    const travelFields = document.getElementById('travel-fields');
    const locationMapEl = document.getElementById('location-map');
    const locationStatusEl = document.getElementById('location-status');

    const catalogGroups = Array.isArray(COURSE_CATALOG) ? COURSE_CATALOG : [];
    const flatCatalog = flattenCatalog(catalogGroups);
    const catalogById = new Map();
    const catalogLabelIndex = new Map();
    const catalogSlugIndex = new Map();

    flatCatalog.forEach((item) => {
      catalogById.set(item.id, item);
      catalogLabelIndex.set((item.label || '').toLowerCase(), item);
      catalogSlugIndex.set(slugifyCourseLabel(item.label), item);
      catalogSlugIndex.set(item.id.toLowerCase(), item);
    });

    const selectedCatalogIds = new Set();
    const MAX_PHOTO_SIZE = 3 * 1024 * 1024;
    const MAX_CERTIFICATE_SIZE = 8 * 1024 * 1024;
    const ALLOWED_CERTIFICATE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    let isUploadingPhoto = false;

    const ADMIN_EMAILS = ["amitshalev1510@gmail.com"];

    let currentUser = null;
    let currentUserData = null;
    let tutorProfileRef = null;
    let tutorProfileData = null;
    let latestCertificate = null;
    let isStripeBusy = false;
    let isCalendarBusy = false;
    let isTeamsBusy = false;
    let isUploadingCertificate = false;

    let mapsApi = null;
    let locationMap = null;
    let locationMarker = null;
    let locationViewportShape = null;
    let travelOverlays = [];
    let locationAutocomplete = null;
    let currentLocationState = null;
    const mapDefaultCenter = { lat: 51.0447, lng: -114.0719 };

    function buildProfileUrl(slug) {
      if (!slug) return null;
      return `${window.location.origin}/tutor-profile.html?slug=${encodeURIComponent(slug)}`;
    }

    function parseList(value) {
      if (!value) return [];
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }

    function resolveProfileName() {
      if (tutorProfileData?.fullName) return tutorProfileData.fullName;
      if (currentUser?.displayName) return currentUser.displayName;
      if (currentUser?.email) return currentUser.email;
      return 'Tutor';
    }

    function getInitialsFromName(name) {
      const source = (name || '').replace(/[^a-zA-Z\s]/g, ' ').trim();
      if (!source) return 'TU';
      const parts = source.split(/\s+/).filter(Boolean);
      const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
      return initials || 'TU';
    }

    function setLocationStatus(message, type = 'neutral') {
      if (!locationStatusEl) return;
      locationStatusEl.textContent = message || '';
      locationStatusEl.classList.remove('ok', 'error');
      if (!message) return;
      if (type === 'error') {
        locationStatusEl.classList.add('error');
      } else if (type === 'success') {
        locationStatusEl.classList.add('ok');
      }
    }

    function clampTravelRadius(value) {
      const minValue = Number(travelRadiusInput?.min);
      const maxValue = Number(travelRadiusInput?.max);
      const min = Number.isFinite(minValue) ? minValue : 0;
      const max = Number.isFinite(maxValue) ? maxValue : 50;
      if (!Number.isFinite(value)) return min;
      return Math.min(max, Math.max(min, value));
    }

    function updateTravelRadiusDisplay() {
      if (!travelRadiusInput || !travelRadiusValue) return;
      const radius = clampTravelRadius(Number(travelRadiusInput.value) || 0);
      travelRadiusInput.value = radius;
      travelRadiusValue.value = radius;
      travelRadiusValue.textContent = radius;
    }

    function isTravelModeActive() {
      return Boolean(modeInPerson?.checked || modeHybrid?.checked);
    }

    function isTravelEnabled() {
      if (!isTravelModeActive()) return false;
      if (travelEnabledToggle) return travelEnabledToggle.checked;
      return true;
    }

    function applyTravelVisibility(options = {}) {
      const travelActive = isTravelEnabled();
      const skipSync = options.skipSync === true;

      if (travelFields) {
        travelFields.hidden = !travelActive;
      }
      if (travelRadiusInput) {
        travelRadiusInput.disabled = !travelActive;
      }
      if (travelZonesInput) {
        travelZonesInput.disabled = !travelActive;
      }

      if (!travelActive) {
        if (travelRadiusInput) {
          travelRadiusInput.value = '0';
          updateTravelRadiusDisplay();
        }
        if (travelZonesInput) {
          travelZonesInput.value = '';
        }
        if (currentLocationState) {
          currentLocationState = {
            ...currentLocationState,
            travelEnabled: false,
            travelRadiusKm: 0,
            travelZoneBreaksKm: []
          };
          clearTravelOverlays();
          void renderLocationOnMap(currentLocationState);
        } else {
          clearTravelOverlays();
        }
        return;
      }

      if (travelEnabledToggle) {
        travelEnabledToggle.checked = true;
      }
      if (!skipSync && currentLocationState?.basePlace) {
        syncLocationFromInputs();
      } else {
        updateTravelRadiusDisplay();
      }
    }

    function clearTravelOverlays() {
      travelOverlays.forEach((overlay) => overlay.setMap && overlay.setMap(null));
      travelOverlays = [];
      if (locationViewportShape) {
        locationViewportShape.setMap(null);
        locationViewportShape = null;
      }
    }

    async function ensureLocationMap() {
      if (!locationMapEl) return null;
      if (!mapsApi) {
        try {
          mapsApi = await loadGoogleMapsApi({ libraries: 'places' });
        } catch (error) {
          console.error('Google Maps failed to load in Tutor Hub', error);
          setLocationStatus('Map failed to load. Check your Google Maps API key.', 'error');
          return null;
        }
      }

      if (!locationMap) {
        locationMap = new mapsApi.Map(locationMapEl, {
          center: mapDefaultCenter,
          zoom: 11,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false
        });
      }

      if (!locationAutocomplete && locationSearchInput) {
        locationAutocomplete = new mapsApi.places.Autocomplete(locationSearchInput, {
          fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'url']
        });
        locationAutocomplete.addListener('place_changed', () => {
          const place = locationAutocomplete.getPlace();
          applyPlaceSelection(place);
        });
      }

      return locationMap;
    }

    function normalizePlaceViewport(geometryViewport) {
      if (!geometryViewport) return null;
      try {
        const ne = geometryViewport.getNorthEast();
        const sw = geometryViewport.getSouthWest();
        return {
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng()
        };
      } catch (error) {
        return normalizeTutorLocation({ viewport: geometryViewport }).basePlace?.viewport || null;
      }
    }

    function applyPlaceSelection(place) {
      if (!place || !place.geometry || !place.geometry.location) {
        setLocationStatus('Please choose a location from the suggestions.', 'error');
        return;
      }

      const location = {
        basePlace: {
          placeId: place.place_id || null,
          name: place.name || place.formatted_address || locationSearchInput?.value || 'Tutor base',
          primaryType: Array.isArray(place.types) && place.types.length ? place.types[0] : null,
          formattedAddress: place.formatted_address || place.name || null,
          mapsUrl: place.url || null,
          location: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
          },
          viewport: normalizePlaceViewport(place.geometry.viewport)
        },
        displayLocationLabel: (locationLabelInput?.value || '').trim() || place.name || place.formatted_address || null,
        travelEnabled: isTravelEnabled(),
        travelRadiusKm: clampTravelRadius(Number(travelRadiusInput?.value) || 0),
        travelZoneBreaksKm: parseTravelZoneBreaks(travelZonesInput?.value, Number(travelRadiusInput?.value) || undefined).value
      };

      currentLocationState = location;
      if (locationLabelInput && !locationLabelInput.value) {
        locationLabelInput.value = location.displayLocationLabel || '';
      }
      void renderLocationOnMap(currentLocationState);
      setLocationStatus('Location selected. Adjust travel radius and save.', 'success');
    }

    async function renderLocationOnMap(location) {
      const map = await ensureLocationMap();
      if (!map) return;
      clearTravelOverlays();

      if (!location || !location.basePlace || !location.basePlace.location) {
        map.setCenter(mapDefaultCenter);
        map.setZoom(11);
        if (locationMarker) {
          locationMarker.setMap(null);
          locationMarker = null;
        }
        return;
      }

      const position = location.basePlace.location;
      if (!locationMarker) {
        locationMarker = new mapsApi.Marker({
          map,
          position,
          title: location.basePlace.name || 'Tutor base'
        });
      } else {
        locationMarker.setPosition(position);
      }

      const bounds = new mapsApi.LatLngBounds();
      bounds.extend(position);

      const viewportPath = viewportToRectanglePath(location.basePlace.viewport);
      if (viewportPath) {
        locationViewportShape = new mapsApi.Polygon({
          map,
          paths: viewportPath,
          strokeColor: '#38bdf8',
          strokeOpacity: 0.45,
          strokeWeight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 0.12
        });
        viewportPath.forEach((point) => bounds.extend(point));
      }

      const radii = [];
      const totalRadius = clampTravelRadius(Number(location.travelRadiusKm) || 0);
      const travelActive = (location.travelEnabled !== false) && isTravelEnabled() && totalRadius > 0;

      if (travelActive && Array.isArray(location.travelZoneBreaksKm)) {
        radii.push(...location.travelZoneBreaksKm);
      }
      if (travelActive && totalRadius > 0) {
        radii.push(totalRadius);
      }
      const sortedRadii = radii.filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);
      const palette = ['#22d3ee', '#38bdf8', '#60a5fa', '#a5b4fc'];

      sortedRadii.forEach((radiusKm, index) => {
        const color = palette[index % palette.length];
        const circle = new mapsApi.Circle({
          map,
          center: position,
          radius: radiusKm * 1000,
          strokeColor: color,
          strokeOpacity: 0.4,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: Math.max(0.05, 0.15 - index * 0.02)
        });
        travelOverlays.push(circle);
        bounds.extend(circle.getBounds().getNorthEast());
        bounds.extend(circle.getBounds().getSouthWest());
      });

      map.fitBounds(bounds, 48);
      currentLocationState = {
        ...location,
        travelRadiusKm: totalRadius
      };
    }

    function syncLocationFromInputs() {
      if (!currentLocationState?.basePlace) {
        updateTravelRadiusDisplay();
        return;
      }
      const travelActive = isTravelEnabled();
      const radius = travelActive
        ? clampTravelRadius(Number(travelRadiusInput?.value) || currentLocationState.travelRadiusKm || 0)
        : 0;
      const { value: zones, errors } = parseTravelZoneBreaks(travelZonesInput?.value, radius || undefined);
      currentLocationState = {
        ...currentLocationState,
        displayLocationLabel: (locationLabelInput?.value || '').trim() || currentLocationState.displayLocationLabel || currentLocationState.basePlace?.formattedAddress || null,
        travelEnabled: travelActive,
        travelRadiusKm: radius,
        travelZoneBreaksKm: travelActive ? zones : []
      };
      if (errors.length) {
        setLocationStatus(errors.join(' '), 'error');
      } else {
        setLocationStatus('', 'neutral');
      }
      void renderLocationOnMap(currentLocationState);
    }

    function populateLocationFields(rawLocation) {
      const normalized = normalizeTutorLocation(rawLocation || {});
      const travelEnabledFromData = normalized.travelEnabled !== false
        ? Boolean(normalized.travelRadiusKm || (normalized.travelZoneBreaksKm || []).length)
        : false;
      if (travelEnabledToggle) {
        travelEnabledToggle.checked = travelEnabledFromData;
      }

      const radius = travelEnabledFromData
        ? clampTravelRadius(normalized.travelRadiusKm || Number(travelRadiusInput?.value) || 10)
        : 0;
      if (travelRadiusInput) {
        travelRadiusInput.value = radius;
        updateTravelRadiusDisplay();
      }
      if (travelZonesInput) {
        travelZonesInput.value = (normalized.travelZoneBreaksKm || []).join(', ');
      }
      if (locationLabelInput) {
        locationLabelInput.value = normalized.displayLocationLabel || '';
      }
      if (locationSearchInput && normalized.basePlace?.formattedAddress) {
        locationSearchInput.value = normalized.basePlace.formattedAddress;
      }

      const hasLocation = normalized.basePlace?.location || radius;
      currentLocationState = hasLocation ? { ...normalized, travelRadiusKm: radius, travelEnabled: travelEnabledFromData } : null;
      applyTravelVisibility({ skipSync: true });
      void renderLocationOnMap(currentLocationState);
    }

    function updatePhotoMessage(message, type = 'neutral') {
      if (!photoMessage) return;
      photoMessage.textContent = message || '';
      photoMessage.classList.remove('ok', 'error');
      if (type === 'success') {
        photoMessage.classList.add('ok');
      } else if (type === 'error') {
        photoMessage.classList.add('error');
      }
    }

    function setVerificationMessage(message, type = 'neutral') {
      if (!verificationMessage) return;
      verificationMessage.textContent = message || '';
      verificationMessage.classList.remove('ok', 'error');
      if (!message) return;
      if (type === 'success') {
        verificationMessage.classList.add('ok');
      } else if (type === 'error') {
        verificationMessage.classList.add('error');
      }
    }

    function setCertificateMessage(message, type = 'neutral') {
      if (!certificateMessage) return;
      certificateMessage.textContent = message || '';
      certificateMessage.classList.remove('ok', 'error');
      if (!message) return;
      if (type === 'success') {
        certificateMessage.classList.add('ok');
      } else if (type === 'error') {
        certificateMessage.classList.add('error');
      }
    }

    function setCertificateStatusDetail(text) {
      if (!certificateStatusDetail) return;
      if (!text) {
        certificateStatusDetail.textContent = '';
        certificateStatusDetail.hidden = true;
        return;
      }
      certificateStatusDetail.textContent = text;
      certificateStatusDetail.hidden = false;
    }

    function setPhotoPreview(photoUrl) {
      if (!photoPreview) return;
      const name = resolveProfileName();
      const initials = getInitialsFromName(name);
      if (photoImg) {
        if (photoUrl) {
          photoImg.src = photoUrl;
          photoImg.hidden = false;
        } else {
          photoImg.removeAttribute('src');
          photoImg.hidden = true;
        }
      }
      if (photoInitials) {
        photoInitials.textContent = initials;
        photoInitials.hidden = !!photoUrl;
      }
      if (removePhotoBtn) {
        removePhotoBtn.disabled = !photoUrl || isUploadingPhoto;
      }
    }

    function inferPhotoExtension(file) {
      const type = (file?.type || '').toLowerCase();
      if (type.includes('png')) return 'png';
      if (type.includes('webp')) return 'webp';
      return 'jpg';
    }

    function buildPhotoStoragePath(file) {
      const profileId = tutorProfileRef?.id;
      if (!profileId) return null;
      const extension = inferPhotoExtension(file);
      return `tutorProfiles/${profileId}/profile-${Date.now()}.${extension}`;
    }

    function sanitizeFileName(fileName) {
      return (fileName || 'certificate').replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    function buildCertificateStoragePath(file) {
      if (!currentUser?.uid) return null;
      const originalName = typeof file === 'string' ? file : file?.name;
      const safeName = sanitizeFileName(originalName || 'certificate');
      return `tutorCertificates/${currentUser.uid}/${Date.now()}-${safeName}`;
    }

    function createStorageRef(path) {
      if (!storage || !storageRefFn || !path) return null;
      try {
        return storageRefFn(storage, path);
      } catch (error) {
        console.warn('Tutor Hub: invalid storage path', error);
        return null;
      }
    }

    function setLinkedInMessage(message, isError = false) {
      if (!linkedinMessage) return;
      linkedinMessage.textContent = message || '';
      linkedinMessage.classList.remove('ok', 'error');
      if (!message) return;
      linkedinMessage.classList.add(isError ? 'error' : 'ok');
    }

    function setCalendarMessage(message, type = 'neutral') {
      if (!calendarMessage) return;
      calendarMessage.textContent = message || '';
      calendarMessage.classList.remove('ok', 'error');
      if (!message) return;
      if (type === 'success') {
        calendarMessage.classList.add('ok');
      } else if (type === 'error') {
        calendarMessage.classList.add('error');
      }
    }

    function toDateValue(value) {
      if (!value) return null;
      if (typeof value.toDate === 'function') {
        return value.toDate();
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatLinkedInTimestamp(value) {
      const date = toDateValue(value);
      if (!date) return 'just now';
      return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    function getLinkedInInitials(linkedinData) {
      return getInitialsFromName(linkedinData?.fullName || linkedinData?.headline || 'Tutor');
    }

    function setVerificationButton(button, config = {}) {
      if (!button) return;
      const { state, statusText, helperText } = config;
      if (state) {
        button.dataset.state = state;
      }
      const statusEl = button.querySelector('.verification-status');
      if (statusEl && typeof statusText === 'string') {
        statusEl.textContent = statusText;
      }
      const helperEl = button.querySelector('.verification-helper');
      if (helperEl && typeof helperText === 'string') {
        helperEl.textContent = helperText;
      }
    }

    function deriveStripeStatus(userData = currentUserData) {
      const status = userData?.stripeAccountStatus || {};
      const accountId = userData?.stripeAccountId;
      const disabledReason = status?.disabledReason;
      const chargesEnabled = status?.chargesEnabled === true;
      const payoutsEnabled = status?.payoutsEnabled === true;
      const detailsSubmitted = status?.detailsSubmitted === true;
      const requirementsDue = Array.isArray(status?.requirementsDue) ? status.requirementsDue : [];
      const futureRequirements = Array.isArray(status?.futureRequirementsDue) ? status.futureRequirementsDue : [];

      if (disabledReason) {
        return {
          state: 'action',
          statusText: 'Action required',
          helperText: 'Stripe needs more information.'
        };
      }

      if (accountId && chargesEnabled && payoutsEnabled && detailsSubmitted && requirementsDue.length === 0 && futureRequirements.length === 0) {
        return {
          state: 'complete',
          statusText: 'Verified',
          helperText: 'Payouts are enabled in Stripe.'
        };
      }

      if (accountId) {
        const helper = requirementsDue.length > 0
          ? 'Complete the outstanding Stripe tasks.'
          : 'Finish Stripe onboarding.';
        return {
          state: 'pending',
          statusText: 'In progress',
          helperText: helper
        };
      }

      return {
        state: 'action',
        statusText: 'Connect Stripe',
        helperText: 'Required to receive payouts.'
      };
    }

    function deriveLinkedInStatus(userData = currentUserData) {
      const linkedinData = userData?.linkedin || null;
      if (!linkedinData) {
        return {
          state: 'action',
          statusText: 'Not connected',
          helperText: 'Connect to show a verified profile.'
        };
      }
      return {
        state: 'complete',
        statusText: 'Connected',
        helperText: linkedinData.syncedAt ? `Synced ${formatLinkedInTimestamp(linkedinData.syncedAt)}` : 'Synced recently.'
      };
    }

    function deriveCalendarStatus(userData = currentUserData) {
      const calendar = userData?.calendar?.google || userData?.googleCalendar || null;
      const email = calendar?.email || calendar?.primaryEmail || null;
      const connected = calendar?.connected === true || calendar?.refreshToken || calendar?.accessToken;
      const syncedAt = calendar?.syncedAt || calendar?.updatedAt || null;

      if (connected) {
        const lastSync = syncedAt ? formatLinkedInTimestamp(syncedAt) : null;
        return {
          state: 'connected',
          helperText: email ? `Paired with ${email}${lastSync ? ` · ${lastSync}` : ''}` : 'Google Calendar paired.',
          buttonLabel: 'Re-pair Google Calendar'
        };
      }

      return {
        state: 'disconnected',
        helperText: 'Pair Google Calendar to auto-add confirmed sessions and block conflicts.',
        buttonLabel: 'Pair Google Calendar'
      };
    }

    function deriveTeamsStatus(userData = currentUserData) {
      const teams = userData?.microsoft || userData?.calendar?.microsoft || null;
      const connected = teams?.connected === true;
      const email = teams?.email || null;
      const syncedAt = teams?.syncedAt || teams?.updatedAt || null;

      if (connected) {
        const lastSync = syncedAt ? formatLinkedInTimestamp(syncedAt) : null;
        return {
          state: 'connected',
          helperText: email ? `Microsoft Teams connected (${email})${lastSync ? ` · ${lastSync}` : ''}` : 'Microsoft Teams connected.',
          buttonLabel: 'Reconnect Microsoft Teams'
        };
      }

      return {
        state: 'disconnected',
        helperText: 'Connect Microsoft Teams to auto-generate meeting links for online bookings.',
        buttonLabel: 'Connect Microsoft Teams'
      };
    }

    function renderCalendarStatus(userData = currentUserData) {
      if (!calendarStatusText || !calendarPairBtn) return;
      const googleStatus = deriveCalendarStatus(userData);
      const teamsStatus = deriveTeamsStatus(userData);
      calendarStatusText.textContent = `${googleStatus.helperText}  •  ${teamsStatus.helperText}`;
      calendarPairBtn.textContent = googleStatus.buttonLabel;
      if (teamsPairBtn) {
        teamsPairBtn.textContent = teamsStatus.buttonLabel;
      }
    }

    function deriveCertificateStatus(userData = currentUserData, certificateRecord = latestCertificate) {
      const userCertificate = userData?.certificateStatus || {};
      const record = certificateRecord || null;
      const statusValue = (userCertificate.status || record?.status || 'not_submitted').toLowerCase();
      const submittedAt = userCertificate.submittedAt || record?.submittedAt || null;
      const reviewedAt = userCertificate.reviewedAt || record?.reviewedAt || null;
      const reviewNote = userCertificate.reviewNote || record?.reviewNote || '';
      const fileName = userCertificate.fileName || record?.fileName || '';

      const details = [];
      if (submittedAt) {
        details.push(`Submitted ${formatLinkedInTimestamp(submittedAt)}`);
      }
      if (statusValue === 'approved' && reviewedAt) {
        details.push(`Approved ${formatLinkedInTimestamp(reviewedAt)}`);
      }
      if (statusValue === 'rejected' && reviewedAt) {
        details.push(`Reviewed ${formatLinkedInTimestamp(reviewedAt)}`);
      }
      if (statusValue === 'rejected' && reviewNote) {
        details.push(`Notes: ${reviewNote}`);
      }
      if (fileName) {
        details.push(`File: ${fileName}`);
      }

      let detailText = details.join(' · ');
      if (!detailText && statusValue === 'not_submitted') {
        detailText = 'No certification on file yet.';
      }

      if (statusValue === 'approved') {
        return {
          button: {
            state: 'complete',
            statusText: 'Approved',
            helperText: 'Families can see your certification.'
          },
          detailText
        };
      }

      if (statusValue === 'pending') {
        return {
          button: {
            state: 'pending',
            statusText: 'Under review',
            helperText: 'We\'re reviewing your submission.'
          },
          detailText
        };
      }

      if (statusValue === 'rejected') {
        return {
          button: {
            state: 'action',
            statusText: 'Needs new upload',
            helperText: 'Upload an updated certification.'
          },
          detailText: detailText || 'Your previous file needs an update.'
        };
      }

      return {
        button: {
          state: 'action',
          statusText: 'Upload certification',
          helperText: 'Submit credentials for verification.'
        },
        detailText
      };
    }

    function updateVerificationChecklist(userData = currentUserData) {
      if (!verificationButtons) return;
      const stripeButton = verificationButtons.stripe;
      const linkedinButton = verificationButtons.linkedin;
      const certificateButton = verificationButtons.certificate;

      setVerificationButton(stripeButton, deriveStripeStatus(userData));
      setVerificationButton(linkedinButton, deriveLinkedInStatus(userData));

      const certificateStatus = deriveCertificateStatus(userData, latestCertificate);
      setVerificationButton(certificateButton, certificateStatus.button);
      setCertificateStatusDetail(certificateStatus.detailText);
    }

    function renderLinkedInCard(userData = currentUserData) {
      if (!linkedinStatusBox) return;
      const linkedinData = userData?.linkedin || null;

      if (!linkedinData) {
        linkedinStatusBox.innerHTML = '<p>LinkedIn is not connected yet. Connect your profile to show families a verified headline and photo.</p>';
        if (linkedinRefreshBtn) linkedinRefreshBtn.hidden = true;
        if (linkedinDisconnectBtn) linkedinDisconnectBtn.hidden = true;
        if (linkedinConnectBtn) {
          linkedinConnectBtn.textContent = 'Connect LinkedIn';
        }
        updateVerificationChecklist(userData);
        return;
      }

      const photoUrl = linkedinData.photoURL || '';
      const profileUrl = linkedinData.profileUrl || '';
      const name = linkedinData.fullName || 'LinkedIn Member';
      const headline = linkedinData.headline || 'Headline not provided';
      const initials = getLinkedInInitials(linkedinData);
      const lastSyncedText = linkedinData.syncedAt ? `Last synced ${formatLinkedInTimestamp(linkedinData.syncedAt)}.` : 'Synced recently.';

      const avatar = photoUrl
        ? `<img src="${photoUrl}" alt="LinkedIn profile photo" loading="lazy" />`
        : `<span>${initials}</span>`;

      const nameMarkup = profileUrl
        ? `<h3><a href="${profileUrl}" target="_blank" rel="noopener">${name}</a></h3>`
        : `<h3>${name}</h3>`;

      linkedinStatusBox.innerHTML = `
        <div class="linkedin-profile">
          <div class="linkedin-avatar">${avatar}</div>
          <div class="linkedin-profile-details">
            ${nameMarkup}
            <p>${headline}</p>
          </div>
        </div>
        <p class="linkedin-meta">${lastSyncedText}</p>
      `;

      if (linkedinRefreshBtn) linkedinRefreshBtn.hidden = false;
      if (linkedinDisconnectBtn) linkedinDisconnectBtn.hidden = false;
      if (linkedinConnectBtn) {
        linkedinConnectBtn.textContent = 'Reconnect LinkedIn';
      }
      updateVerificationChecklist(userData);
    }

    function setLinkedInBusy(isBusy) {
      if (linkedinConnectBtn) linkedinConnectBtn.disabled = isBusy;
      if (linkedinRefreshBtn) linkedinRefreshBtn.disabled = isBusy;
      if (linkedinDisconnectBtn) linkedinDisconnectBtn.disabled = isBusy || !(currentUserData?.linkedin);
    }

    async function reloadUserData() {
      if (!currentUser) return;
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (userSnap.exists()) {
          currentUserData = userSnap.data();
          renderLinkedInCard(currentUserData);
          renderCalendarStatus(currentUserData);
        }
        await loadLatestCertificate();
      } catch (error) {
        console.warn('Tutor Hub: failed to reload user data', error);
      }
    }

    function getFunctionsOrigin() {
      if (!functionsBase) return null;
      try {
        return new URL(functionsBase).origin;
      } catch (error) {
        return null;
      }
    }

    function openCenteredPopup(url, name = 'oauthPopup') {
      const width = 540;
      const height = 720;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 3);
      const features = `width=${width},height=${height},left=${left},top=${top}`;
      return window.open(url, name, features);
    }

    async function startLinkedInAuthFlow(mode = 'link') {
      if (!functionsBase) {
        throw new Error('LinkedIn integration is not configured yet.');
      }

      const payload = { mode };
      const headers = { 'Content-Type': 'application/json' };

      if (mode === 'link') {
        if (!currentUser) {
          throw new Error('You must be signed in to link LinkedIn.');
        }
        const token = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${functionsBase}/startLinkedInAuth`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || 'Unable to start LinkedIn sign-in.');
      }

      const data = await response.json();
      if (!data?.url) {
        throw new Error('LinkedIn sign-in URL was not returned.');
      }

      const popup = openCenteredPopup(data.url, 'linkedinAuth');
      if (!popup) {
        throw new Error('Please enable pop-ups to continue with LinkedIn.');
      }
      return popup;
    }

    async function startGoogleCalendarAuth() {
      if (!functionsBase) {
        throw new Error('Calendar pairing is not configured yet.');
      }
      if (!currentUser) {
        throw new Error('You must be signed in to pair your calendar.');
      }

      const token = await currentUser.getIdToken();
      const response = await fetch(`${functionsBase}/startGoogleCalendarAuth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to start Google Calendar pairing.');
      }

      if (!data?.url) {
        throw new Error('Google Calendar pairing URL was not returned.');
      }

      const popup = openCenteredPopup(data.url, 'googleCalendarAuth');
      if (!popup) {
        throw new Error('Please enable pop-ups to continue with Google Calendar.');
      }
      return popup;
    }

    async function startMicrosoftTeamsAuth() {
      if (!functionsBase) {
        throw new Error('Microsoft Teams integration is not configured yet.');
      }
      if (!currentUser) {
        throw new Error('You must be signed in to connect Microsoft Teams.');
      }

      const token = await currentUser.getIdToken();
      const response = await fetch(`${functionsBase}/startMicrosoftTeamsAuth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to start Microsoft Teams connection.');
      }

      if (!data?.url) {
        throw new Error('Microsoft Teams connect URL was not returned.');
      }

      const popup = openCenteredPopup(data.url, 'microsoftTeamsAuth');
      if (!popup) {
        throw new Error('Please enable pop-ups to continue with Microsoft Teams.');
      }
      return popup;
    }

    async function unlinkLinkedInProfile() {
      if (!functionsBase || !currentUser) {
        throw new Error('LinkedIn integration is not ready.');
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`${functionsBase}/unlinkLinkedIn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || 'Failed to disconnect LinkedIn.');
      }
      if (currentUserData) {
        delete currentUserData.linkedin;
      }
      renderLinkedInCard();
      setLinkedInMessage('LinkedIn profile disconnected.');
      reloadUserData();
    }

    async function loadLatestCertificate() {
      if (!currentUser || !collection || !query || !where || !getDocs || !orderByFn || !limitFn) {
        latestCertificate = null;
        updateVerificationChecklist();
        return;
      }
      try {
        const certificatesRef = collection(db, 'tutorCertificates');
        const certificateQuery = query(
          certificatesRef,
          where('tutorUid', '==', currentUser.uid),
          orderByFn('submittedAt', 'desc'),
          limitFn(1)
        );
        const snapshot = await getDocs(certificateQuery);
        if (snapshot.empty) {
          latestCertificate = null;
        } else {
          const docSnap = snapshot.docs[0];
          latestCertificate = {
            id: docSnap.id,
            ...docSnap.data()
          };
        }
      } catch (error) {
        console.warn('Tutor Hub: failed to load latest certificate', error);
      }
      updateVerificationChecklist();
    }

    function validateCertificateFile(file) {
      if (!file) {
        throw new Error('Please choose a certificate to upload.');
      }
      if (typeof file.size === 'number' && file.size > MAX_CERTIFICATE_SIZE) {
        throw new Error('Certificate must be 8 MB or smaller.');
      }
      if (file.type) {
        const normalizedType = file.type.toLowerCase();
        if (!ALLOWED_CERTIFICATE_TYPES.includes(normalizedType)) {
          throw new Error('Use a PDF or image (JPG, PNG, WEBP) for your certification.');
        }
      }
    }

    async function uploadCertificate(file) {
      if (isUploadingCertificate) {
        setCertificateMessage('Certificate upload already in progress...', 'neutral');
        return;
      }
      if (!currentUser) {
        setCertificateMessage('Sign in before uploading credentials.', 'error');
        return;
      }
      try {
        validateCertificateFile(file);
      } catch (validationError) {
        setCertificateMessage(validationError.message, 'error');
        return;
      }

      if (!storage || !storageRefFn || !storageUploadBytes || !storageGetDownloadURL) {
        setCertificateMessage('File storage is not available right now.', 'error');
        return;
      }

      if (certificateInput) {
        certificateInput.disabled = true;
      }

      const fileName = file.name || 'certificate';
      const storagePath = buildCertificateStoragePath(file);
      if (!storagePath) {
        setCertificateMessage('Unable to prepare the upload path. Please try again later.', 'error');
        if (certificateInput) certificateInput.disabled = false;
        return;
      }

      const certificateRef = createStorageRef(storagePath);
      if (!certificateRef) {
        setCertificateMessage('Unable to prepare the upload destination.', 'error');
        if (certificateInput) certificateInput.disabled = false;
        return;
      }

      isUploadingCertificate = true;
      setCertificateMessage('Uploading certificate...');

      try {
        await storageUploadBytes(certificateRef, file, { contentType: file.type || 'application/octet-stream' });
        const downloadURL = await storageGetDownloadURL(certificateRef);

        const certificatesRef = collection(db, 'tutorCertificates');
        const docRef = await addDoc(certificatesRef, {
          tutorUid: currentUser.uid,
          tutorProfileId: tutorProfileRef?.id || null,
          fileName,
          storagePath,
          downloadURL,
          status: 'pending',
          contentType: file.type || null,
          size: typeof file.size === 'number' ? file.size : null,
          submittedAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'users', currentUser.uid), {
          certificateStatus: {
            status: 'pending',
            certificateId: docRef.id,
            fileName,
            downloadURL,
            submittedAt: serverTimestamp()
          }
        });

        if (!currentUserData) {
          currentUserData = {};
        }
        currentUserData.certificateStatus = {
          status: 'pending',
          certificateId: docRef.id,
          fileName,
          downloadURL,
          submittedAt: new Date().toISOString()
        };

        latestCertificate = {
          id: docRef.id,
          tutorUid: currentUser.uid,
          tutorProfileId: tutorProfileRef?.id || null,
          fileName,
          storagePath,
          downloadURL,
          status: 'pending',
          contentType: file.type || null,
          size: typeof file.size === 'number' ? file.size : null,
          submittedAt: new Date()
        };

        setCertificateMessage('Certificate uploaded. We will review it shortly.', 'success');
        updateVerificationChecklist();
        await loadLatestCertificate();
      } catch (error) {
        console.error('Tutor Hub certificate upload error', error);
        setCertificateMessage(error.message || 'Failed to upload certificate.', 'error');
        if (storageDeleteObject) {
          try {
            const cleanupRef = createStorageRef(storagePath);
            if (cleanupRef) {
              await storageDeleteObject(cleanupRef);
            }
          } catch (cleanupError) {
            console.warn('Tutor Hub certificate cleanup failed', cleanupError);
          }
        }
      } finally {
        if (certificateInput) {
          certificateInput.value = '';
          certificateInput.disabled = false;
        }
        isUploadingCertificate = false;
      }
    }

    async function handleStripeAction() {
      if (isStripeBusy) {
        setVerificationMessage('Already contacting Stripe...', 'neutral');
        return;
      }
      const stripeButton = verificationButtons?.stripe || null;
      if (!functionsBase) {
        setVerificationMessage('Stripe integration is not configured yet.', 'error');
        return;
      }
      if (!currentUser) {
        setVerificationMessage('Sign in before managing Stripe payouts.', 'error');
        return;
      }
      try {
        isStripeBusy = true;
        if (stripeButton) stripeButton.disabled = true;
        setVerificationMessage('Contacting Stripe...');
        const token = await currentUser.getIdToken();
        const response = await fetch(`${functionsBase}/createConnectAccount`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ tutorUid: currentUser.uid })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to reach Stripe.');
        }

        if (!currentUserData) {
          currentUserData = {};
        }
        if (payload.accountId) {
          currentUserData.stripeAccountId = payload.accountId;
        }
        const statusPayload = payload.accountStatus || payload.statusSnapshot || null;
        if (statusPayload) {
          currentUserData.stripeAccountStatus = statusPayload;
        }

        updateVerificationChecklist();

        let message = 'Stripe account status refreshed.';
        if (payload.onboardingUrl) {
          window.open(payload.onboardingUrl, '_blank', 'noopener');
          message = 'Finish Stripe onboarding in the tab that opened.';
        } else if (payload.dashboardUrl) {
          window.open(payload.dashboardUrl, '_blank', 'noopener');
          message = 'Manage payouts from the Stripe dashboard we opened.';
        }

        setVerificationMessage(message, 'success');
        await reloadUserData();
      } catch (error) {
        console.error('Tutor Hub Stripe onboarding error', error);
        setVerificationMessage(error.message || 'Unable to contact Stripe right now.', 'error');
      } finally {
        if (stripeButton) stripeButton.disabled = false;
        isStripeBusy = false;
      }
    }

    function handleLinkedInMessage(event) {
      const allowedOrigins = [window.location.origin, getFunctionsOrigin()].filter(Boolean);
      if (!allowedOrigins.includes(event.origin)) {
        return;
      }

      const data = event.data || {};
      if (data.provider !== 'linkedin') {
        return;
      }

      const { payload, errorMessage } = data;
      if (errorMessage) {
        setLinkedInMessage(typeof errorMessage === 'string' ? errorMessage : 'LinkedIn sign-in cancelled.', true);
        return;
      }

      if (!payload) {
        setLinkedInMessage('LinkedIn sign-in did not return any data.', true);
        return;
      }

      if (payload.mode === 'link') {
        if (!currentUserData) {
          currentUserData = {};
        }
        currentUserData.linkedin = payload.linkedin || null;
        renderLinkedInCard();
        setLinkedInMessage('LinkedIn profile connected.');
        reloadUserData();
      }
    }

    window.addEventListener('message', handleLinkedInMessage);

    function handleCalendarMessage(event) {
      const allowedOrigins = [window.location.origin, getFunctionsOrigin()].filter(Boolean);
      if (!allowedOrigins.includes(event.origin)) {
        return;
      }

      const data = event.data || {};
      if (data.provider !== 'google-calendar' && data.provider !== 'microsoft-teams') {
        return;
      }

      const { payload, errorMessage } = data;

      if (errorMessage) {
        const label = data.provider === 'microsoft-teams' ? 'Microsoft Teams connection cancelled.' : 'Google Calendar pairing cancelled.';
        setCalendarMessage(typeof errorMessage === 'string' ? errorMessage : label, 'error');
        return;
      }

      if (!payload) {
        setCalendarMessage('Connection did not return any data.', 'error');
        return;
      }

      if (!currentUserData) {
        currentUserData = {};
      }

      if (data.provider === 'google-calendar') {
        const calendarPayload = payload.calendar || payload;
        currentUserData.calendar = {
          ...(currentUserData.calendar || {}),
          google: {
            ...(calendarPayload || {}),
            connected: true,
            syncedAt: calendarPayload?.syncedAt || new Date().toISOString()
          }
        };
        renderCalendarStatus(currentUserData);
        setCalendarMessage('Google Calendar paired.', 'success');
        reloadUserData();
        return;
      }

      // microsoft-teams
      const teamsPayload = payload.microsoft || payload;
      currentUserData.microsoft = {
        ...(currentUserData.microsoft || {}),
        ...(teamsPayload || {}),
        connected: true,
        syncedAt: teamsPayload?.syncedAt || new Date().toISOString()
      };
      renderCalendarStatus(currentUserData);
      setCalendarMessage('Microsoft Teams connected.', 'success');
      reloadUserData();
    }

    window.addEventListener('message', handleCalendarMessage);

    function matchCatalogItem(rawValue) {
      const value = (rawValue || '').trim();
      if (!value) return null;

      if (catalogById.has(value)) {
        return catalogById.get(value);
      }

      const lowerValue = value.toLowerCase();
      if (catalogLabelIndex.has(lowerValue)) {
        return catalogLabelIndex.get(lowerValue);
      }

      if (catalogSlugIndex.has(lowerValue)) {
        return catalogSlugIndex.get(lowerValue);
      }

      const generatedSlug = slugifyCourseLabel(value);
      if (catalogSlugIndex.has(generatedSlug)) {
        return catalogSlugIndex.get(generatedSlug);
      }

      return null;
    }

    function getSortedSelectedCatalogItems() {
      return Array.from(selectedCatalogIds)
        .map((id) => catalogById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    function updateSelectedHint() {
      if (!selectedSubjectsHint) return;
      const hasSelected = selectedCatalogIds.size > 0;
      selectedSubjectsHint.hidden = hasSelected;
    }

    function renderSelectedSubjects() {
      if (!selectedSubjectsContainer) return;
      selectedSubjectsContainer.innerHTML = '';

      const items = getSortedSelectedCatalogItems();
      items.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = 'subject-chip';
        chip.dataset.itemId = item.id;

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        chip.appendChild(labelSpan);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.dataset.itemId = item.id;
        removeButton.setAttribute('aria-label', `Remove ${item.label}`);
        removeButton.textContent = '×';
        chip.appendChild(removeButton);

        selectedSubjectsContainer.appendChild(chip);
      });

      updateSelectedHint();
    }

    function createCatalogButton(item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-item';
      button.dataset.itemId = item.id;

      const isSelected = selectedCatalogIds.has(item.id);
      if (isSelected) {
        button.classList.add('selected');
      }
      button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      button.title = isSelected ? 'Remove subject' : 'Add subject';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'catalog-item-label';
      labelSpan.textContent = item.label;
      button.appendChild(labelSpan);

      if (isSelected) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'catalog-item-status';
        statusSpan.textContent = 'Added';
        button.appendChild(statusSpan);
      }

      return button;
    }

    function appendGroupSection(group, items, showDescription) {
      if (!catalogList || !group || !Array.isArray(items) || items.length === 0) return;

      const section = document.createElement('div');
      section.className = 'catalog-group';

      const heading = document.createElement('h3');
      heading.textContent = group.label || 'Subjects';
      section.appendChild(heading);

      if (showDescription && group.description) {
        const description = document.createElement('p');
        description.className = 'catalog-group-description';
        description.textContent = group.description;
        section.appendChild(description);
      }

      const groupList = document.createElement('div');
      groupList.className = 'catalog-group-items';
      items.forEach((item) => {
        groupList.appendChild(createCatalogButton(item));
      });

      section.appendChild(groupList);
      catalogList.appendChild(section);
    }

    function renderCatalog(searchTerm = '') {
      if (!catalogList) return;

      const normalizedTerm = (searchTerm || '').trim().toLowerCase();
      catalogList.innerHTML = '';

      if (!normalizedTerm) {
        if (catalogEmptyState) {
          catalogEmptyState.hidden = true;
        }
        catalogGroups.forEach((group) => {
          if (!Array.isArray(group.items) || group.items.length === 0) return;
          const items = group.items.map((item) => {
            const catalogItem = catalogById.get(item.id);
            if (catalogItem) {
              return catalogItem;
            }
            return {
              ...item,
              groupId: group.id,
              groupLabel: group.label,
              keywords: item.keywords || []
            };
          }).filter(Boolean);
          appendGroupSection(group, items, true);
        });
        return;
      }

      const matches = flatCatalog.filter((item) => {
        const labelMatch = (item.label || '').toLowerCase().includes(normalizedTerm);
        const groupMatch = (item.groupLabel || '').toLowerCase().includes(normalizedTerm);
        const keywordMatch = (item.keywords || []).some((keyword) => keyword.toLowerCase().includes(normalizedTerm));
        return labelMatch || groupMatch || keywordMatch;
      });

      if (matches.length === 0) {
        if (catalogEmptyState) {
          catalogEmptyState.hidden = false;
        }
        return;
      }

      if (catalogEmptyState) {
        catalogEmptyState.hidden = true;
      }
      const groupedResults = new Map();
      matches.forEach((item) => {
        if (!groupedResults.has(item.groupId)) {
          groupedResults.set(item.groupId, []);
        }
        groupedResults.get(item.groupId).push(item);
      });

      catalogGroups.forEach((group) => {
        const items = groupedResults.get(group.id);
        if (!items || items.length === 0) return;
        appendGroupSection(group, items, false);
      });
    }

    function toggleCatalogSelection(itemId) {
      if (!itemId) return;
      const previousScroll = catalogList ? catalogList.scrollTop : 0;
      if (selectedCatalogIds.has(itemId)) {
        selectedCatalogIds.delete(itemId);
      } else {
        selectedCatalogIds.add(itemId);
      }
      renderSelectedSubjects();
      renderCatalog(catalogSearchInput ? catalogSearchInput.value : '');
      if (catalogList) {
        catalogList.scrollTop = previousScroll;
      }
    }

    function renderProfilePhoto(profile) {
      const photoUrl = profile?.photoURL || null;
      setPhotoPreview(photoUrl);
    }

    async function uploadProfilePhoto(file) {
      if (!file) return;
      if (!tutorProfileRef) {
        updatePhotoMessage('Load your profile before uploading a photo.', 'error');
        return;
      }

      if (!storage || !storageUploadBytes || !storageGetDownloadURL) {
        updatePhotoMessage('Storage is not configured. Check firebase-config.js setup.', 'error');
        return;
      }

      if (file.size > MAX_PHOTO_SIZE) {
        updatePhotoMessage('Choose an image smaller than 3 MB.', 'error');
        return;
      }

      if (file.type && !ALLOWED_PHOTO_TYPES.includes(file.type.toLowerCase())) {
        updatePhotoMessage('Please upload a JPG, PNG, or WebP image.', 'error');
        return;
      }

      const newPath = buildPhotoStoragePath(file);
      const storageRef = createStorageRef(newPath);
      if (!newPath || !storageRef) {
        updatePhotoMessage('Unable to determine where to store this photo.', 'error');
        return;
      }

      const previousPath = tutorProfileData?.photoPath || null;

      try {
        isUploadingPhoto = true;
        if (photoInput) photoInput.disabled = true;
        if (removePhotoBtn) removePhotoBtn.disabled = true;
        updatePhotoMessage('Uploading photo...');

        await storageUploadBytes(storageRef, file, { contentType: file.type });
        const downloadURL = await storageGetDownloadURL(storageRef);

        await updateDoc(tutorProfileRef, {
          photoURL: downloadURL,
          photoPath: newPath,
          photoUpdatedAt: serverTimestamp()
        });

        tutorProfileData = {
          ...tutorProfileData,
          photoURL: downloadURL,
          photoPath: newPath
        };

        setPhotoPreview(downloadURL);
        updatePhotoMessage('Profile photo updated.', 'success');

        if (previousPath && previousPath !== newPath) {
          const previousRef = createStorageRef(previousPath);
          if (previousRef && storageDeleteObject) {
            try {
              await storageDeleteObject(previousRef);
            } catch (deleteError) {
              console.warn('Tutor Hub: failed to remove previous photo', deleteError);
            }
          }
        }
      } catch (error) {
        console.error('Tutor Hub photo upload error', error);
        updatePhotoMessage('Unable to upload photo right now. Please try again later.', 'error');
      } finally {
        if (photoInput) {
          photoInput.disabled = false;
          photoInput.value = '';
        }
        isUploadingPhoto = false;
        setPhotoPreview(tutorProfileData?.photoURL || null);
      }
    }

    async function removeProfilePhoto() {
      if (!tutorProfileRef) {
        updatePhotoMessage('Load your profile before removing the photo.', 'error');
        return;
      }

      if (!tutorProfileData?.photoURL) {
        updatePhotoMessage('No profile photo to remove.', 'error');
        return;
      }

      const photoPath = tutorProfileData.photoPath || null;

      try {
        isUploadingPhoto = true;
        if (photoInput) photoInput.disabled = true;
        if (removePhotoBtn) removePhotoBtn.disabled = true;
        updatePhotoMessage('Removing photo...');

        await updateDoc(tutorProfileRef, {
          photoURL: null,
          photoPath: null,
          photoUpdatedAt: serverTimestamp()
        });

        tutorProfileData = {
          ...tutorProfileData,
          photoURL: null,
          photoPath: null
        };

        if (photoPath) {
          const photoRef = createStorageRef(photoPath);
          if (photoRef && storageDeleteObject) {
            try {
              await storageDeleteObject(photoRef);
            } catch (deleteError) {
              console.warn('Tutor Hub: failed to delete photo during removal', deleteError);
            }
          }
        }

        setPhotoPreview(null);
        updatePhotoMessage('Profile photo removed.', 'success');
      } catch (error) {
        console.error('Tutor Hub photo removal error', error);
        updatePhotoMessage('Unable to remove the photo right now. Please try again later.', 'error');
        if (removePhotoBtn) removePhotoBtn.disabled = false;
      } finally {
        if (photoInput) photoInput.disabled = false;
        if (photoInput) photoInput.value = '';
        isUploadingPhoto = false;
        setPhotoPreview(tutorProfileData?.photoURL || null);
      }
    }

    function applyProfileSubjectsToCatalog(subjects = [], subjectIds = []) {
      selectedCatalogIds.clear();
      const unmatched = [];

      const normalizedIds = Array.isArray(subjectIds) ? subjectIds : [subjectIds];
      normalizedIds.forEach((rawId) => {
        const id = (rawId || '').trim();
        if (!id) return;
        const directMatch = catalogById.get(id) || catalogSlugIndex.get(id.toLowerCase());
        if (directMatch) {
          selectedCatalogIds.add(directMatch.id);
        }
      });

      (subjects || []).forEach((subject) => {
        const trimmedSubject = (subject || '').trim();
        if (!trimmedSubject) return;
        const match = matchCatalogItem(trimmedSubject);
        if (match) {
          selectedCatalogIds.add(match.id);
        } else if (!unmatched.includes(trimmedSubject)) {
          unmatched.push(trimmedSubject);
        }
      });

      if (customSubjectsInput) {
        customSubjectsInput.value = unmatched.join(', ');
      }

      renderSelectedSubjects();
      renderCatalog(catalogSearchInput ? catalogSearchInput.value : '');
    }

    function buildCatalogIdPayload() {
      return getSortedSelectedCatalogItems().map((item) => item.id);
    }

    function buildSubjectsPayload() {
      const catalogSubjects = getSortedSelectedCatalogItems().map((item) => item.label);
      const additionalSubjects = customSubjectsInput ? parseList(customSubjectsInput.value) : [];
      const combined = [...catalogSubjects, ...additionalSubjects];
      const seen = new Set();
      return combined.filter((subject) => {
        const key = subject.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (catalogSearchInput) {
      catalogSearchInput.addEventListener('input', () => {
        renderCatalog(catalogSearchInput.value);
      });
    }

    if (catalogList) {
      catalogList.addEventListener('click', (event) => {
        const target = event.target.closest('.catalog-item');
        if (!target) return;
        const itemId = target.dataset.itemId;
        toggleCatalogSelection(itemId);
      });
    }

    if (selectedSubjectsContainer) {
      selectedSubjectsContainer.addEventListener('click', (event) => {
        const removeButton = event.target.closest('button[data-item-id]');
        if (!removeButton) return;
        toggleCatalogSelection(removeButton.dataset.itemId);
      });
    }

    [modeOnline, modeInPerson, modeHybrid].forEach((checkbox) => {
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          applyTravelVisibility();
        });
      }
    });

    if (travelEnabledToggle) {
      travelEnabledToggle.addEventListener('change', () => {
        applyTravelVisibility();
      });
    }

    if (travelRadiusInput) {
      travelRadiusInput.addEventListener('input', () => {
        updateTravelRadiusDisplay();
        syncLocationFromInputs();
      });
    }

    if (travelZonesInput) {
      travelZonesInput.addEventListener('change', () => {
        syncLocationFromInputs();
      });
    }

    if (locationLabelInput) {
      locationLabelInput.addEventListener('input', () => {
        if (currentLocationState) {
          syncLocationFromInputs();
        }
      });
    }

    if (locationSearchInput) {
      locationSearchInput.addEventListener('focus', () => {
        void ensureLocationMap();
      });
    }

    applyTravelVisibility({ skipSync: true });

    if (verificationButtons.stripe) {
      verificationButtons.stripe.addEventListener('click', () => {
        handleStripeAction();
      });
    }

    if (verificationButtons.linkedin) {
      verificationButtons.linkedin.addEventListener('click', () => {
        if (currentUserData?.linkedin && linkedinRefreshBtn && !linkedinRefreshBtn.hidden) {
          linkedinRefreshBtn.click();
          return;
        }
        if (linkedinConnectBtn) {
          linkedinConnectBtn.click();
        }
      });
    }

    if (verificationButtons.certificate) {
      verificationButtons.certificate.addEventListener('click', (event) => {
        if ((event.metaKey || event.ctrlKey) && latestCertificate?.downloadURL) {
          window.open(latestCertificate.downloadURL, '_blank', 'noopener');
          return;
        }
        if (certificateInput) {
          certificateInput.click();
        }
      });
    }

    if (certificateInput) {
      certificateInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        uploadCertificate(file);
      });
    }

    if (photoInput) {
      photoInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) {
          uploadProfilePhoto(file);
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        if (isUploadingPhoto) return;
        if (!tutorProfileData?.photoURL) return;
        if (!window.confirm('Remove your profile photo?')) return;
        removeProfilePhoto();
      });
    }

    if (calendarPairBtn) {
      calendarPairBtn.addEventListener('click', async () => {
        if (isCalendarBusy) return;
        try {
          isCalendarBusy = true;
          calendarPairBtn.disabled = true;
          setCalendarMessage('Opening Google Calendar...', 'neutral');
          await startGoogleCalendarAuth();
        } catch (error) {
          console.error('Tutor Hub Google Calendar pair error', error);
          setCalendarMessage(error.message || 'Unable to start Google Calendar pairing.', 'error');
        } finally {
          isCalendarBusy = false;
          calendarPairBtn.disabled = false;
        }
      });
    }

    if (teamsPairBtn) {
      teamsPairBtn.addEventListener('click', async () => {
        if (isTeamsBusy) return;
        try {
          isTeamsBusy = true;
          teamsPairBtn.disabled = true;
          setCalendarMessage('Opening Microsoft Teams...', 'neutral');
          await startMicrosoftTeamsAuth();
        } catch (error) {
          console.error('Tutor Hub Microsoft Teams connect error', error);
          setCalendarMessage(error.message || 'Unable to start Microsoft Teams connection.', 'error');
        } finally {
          isTeamsBusy = false;
          teamsPairBtn.disabled = false;
        }
      });
    }

    if (linkedinConnectBtn) {
      linkedinConnectBtn.addEventListener('click', async () => {
        try {
          setLinkedInMessage('Opening LinkedIn...');
          setLinkedInBusy(true);
          await startLinkedInAuthFlow('link');
        } catch (error) {
          console.error('Tutor Hub LinkedIn connect error', error);
          setLinkedInMessage(error.message || 'Unable to open LinkedIn.', true);
        } finally {
          setLinkedInBusy(false);
        }
      });
    }

    if (linkedinRefreshBtn) {
      linkedinRefreshBtn.addEventListener('click', async () => {
        try {
          setLinkedInMessage('Refreshing from LinkedIn...');
          setLinkedInBusy(true);
          await startLinkedInAuthFlow('link');
        } catch (error) {
          console.error('Tutor Hub LinkedIn refresh error', error);
          setLinkedInMessage(error.message || 'Unable to refresh LinkedIn data.', true);
        } finally {
          setLinkedInBusy(false);
        }
      });
    }

    if (linkedinDisconnectBtn) {
      linkedinDisconnectBtn.addEventListener('click', async () => {
        if (!currentUserData?.linkedin) {
          setLinkedInMessage('LinkedIn is already disconnected.');
          return;
        }
        if (!window.confirm('Disconnect LinkedIn from your tutor profile?')) {
          return;
        }
        try {
          setLinkedInMessage('Disconnecting LinkedIn...');
          setLinkedInBusy(true);
          await unlinkLinkedInProfile();
        } catch (error) {
          console.error('Tutor Hub LinkedIn disconnect error', error);
          setLinkedInMessage(error.message || 'Unable to disconnect LinkedIn at this time.', true);
        } finally {
          setLinkedInBusy(false);
        }
      });
    }

    renderSelectedSubjects();
    renderCatalog('');
    renderLinkedInCard();

    function setStatus(statusLabel) {
      statusPill.textContent = statusLabel;
      statusPill.dataset.status = statusLabel.toLowerCase();
    }

    function formatStatus(raw) {
      if (!raw) return 'draft';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    async function reserveUniqueSlug(nameCandidate, existingId) {
      const base = (nameCandidate || 'tutor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const starter = base.slice(0, 60) || `tutor-${Date.now()}`;
      let candidate = starter;
      let attempt = 0;

      while (attempt < 5) {
        try {
          const slugQuery = query(collection(db, 'tutorProfiles'), where('slug', '==', candidate));
          const snapshot = await getDocs(slugQuery);
          const conflict = snapshot.docs.find((docSnap) => docSnap.id !== existingId);
          if (!conflict) {
            return candidate;
          }
        } catch (error) {
          console.warn('Tutor Hub: unable to verify slug uniqueness; falling back to random slug.', error);
          return `${starter}-${Math.random().toString(36).slice(2, 8)}`;
        }
        attempt += 1;
        candidate = `${starter}-${Math.random().toString(36).slice(2, 6)}`;
      }
      return `${starter}-${Date.now().toString(36)}`;
    }

    function normalizeRolesObject(rawRoles) {
      if (!rawRoles) {
        return {};
      }

      if (Array.isArray(rawRoles)) {
        return rawRoles.reduce((acc, role) => {
          if (typeof role === 'string' && role.trim()) {
            acc[role.trim().toLowerCase()] = true;
          }
          return acc;
        }, {});
      }

      if (typeof rawRoles === 'object') {
        return { ...rawRoles };
      }

      if (typeof rawRoles === 'string') {
        return { [rawRoles.trim().toLowerCase()]: true };
      }

      return {};
    }

    function hasTutorRole(userData) {
      if (!userData) return false;

      // If the account type is explicitly hybrid or tutor, allow access.
      const accountType = typeof userData.accountType === 'string' ? userData.accountType.toLowerCase() : '';
      if (accountType === 'hybrid' || accountType === 'tutor') {
        return true;
      }

      const roles = normalizeRolesObject(userData.roles);
      const tutorRole = roles.tutor;
      const coachRole = roles['coach'];

      const isRoleObjectAllowed = (roleVal) => {
        if (!roleVal || typeof roleVal !== 'object') return false;
        // If explicitly false/disabled, block. Otherwise allow (covers active/pending/frozen states).
        if (roleVal.active === false || roleVal.enabled === false || roleVal.frozen === true || roleVal.paused === true) {
          return false;
        }
        return true;
      };

      if (tutorRole === true || isRoleObjectAllowed(tutorRole)) return true;
      if (coachRole === true || isRoleObjectAllowed(coachRole)) return true;

      const singularRole = typeof userData.role === 'string' ? userData.role.trim().toLowerCase() : '';
      if (singularRole === 'tutor' || singularRole === 'hybrid') return true;

      if (Array.isArray(userData.roles) && userData.roles.some((role) => {
        const val = (role || '').toLowerCase();
        return val === 'tutor' || val === 'hybrid';
      })) {
        return true;
      }

      return false;
    }

    function hasAdminRole(user, userData) {
      const normalizedEmail = (user?.email || '').toLowerCase();
      if (ADMIN_EMAILS.includes(normalizedEmail)) {
        return true;
      }

      if (!userData) return false;

      if (userData.isAdmin === true || userData.admin === true) {
        return true;
      }

      const roles = normalizeRolesObject(userData.roles);
      if (roles.admin === true) {
        return true;
      }

      const singularRole = typeof userData.role === 'string' ? userData.role.trim().toLowerCase() : '';
      if (singularRole === 'admin') {
        return true;
      }

      if (Array.isArray(userData.roles) && userData.roles.some((role) => (role || '').toLowerCase() === 'admin')) {
        return true;
      }

      return false;
    }

    async function ensureTutorProfile(user) {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnapshot = await getDoc(userDocRef);

      if (!userSnapshot.exists()) {
        throw new Error('User profile not found.');
      }

      const userData = userSnapshot.data();
      let isTutor = hasTutorRole(userData);

      if (!isTutor && hasAdminRole(user, userData)) {
        const normalizedRoles = normalizeRolesObject(userData.roles);
        normalizedRoles.tutor = true;
        normalizedRoles.admin = true;

        const updatedRoles = normalizedRoles;

        try {
          await updateDoc(userDocRef, {
            roles: updatedRoles,
            onboarding: {
              ...(userData.onboarding || {}),
              tutorProfileStatus: userData.onboarding?.tutorProfileStatus || 'draft'
            }
          });
          userData.roles = updatedRoles;
          isTutor = true;
        } catch (roleError) {
          console.warn('Tutor Hub: failed to promote admin to tutor role', roleError);
        }
      }

      if (!isTutor) {
        window.location.href = 'dashboard.html';
        return null;
      }

      const createNewProfile = async () => {
        const slug = await reserveUniqueSlug(userData.fullName || user.displayName || user.email, null);
        const newProfile = {
          userId: user.uid,
          fullName: userData.fullName || user.displayName || '',
          slug,
          status: 'draft',
          headline: '',
          bio: '',
          subjectsOffered: [],
          catalogSubjectIds: [],
          catalogVersion: COURSE_CATALOG_VERSION_VALUE,
          photoURL: null,
          photoPath: null,
          gradeLevels: [],
          meetingModes: {
            online: true,
            inPerson: false,
            hybrid: false
          },
          placesSettings: {
            enabled: false,
            placeId: null,
            displayAddress: null
          },
          tutorLocation: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const profileDocRef = await addDoc(collection(db, 'tutorProfiles'), newProfile);
        await updateDoc(userDocRef, { tutorProfileId: profileDocRef.id });

        tutorProfileRef = profileDocRef;
        tutorProfileData = newProfile;
        return { ref: profileDocRef, data: newProfile, userData: { ...userData, tutorProfileId: profileDocRef.id } };
      };

      if (userData.tutorProfileId) {
        const profileRef = doc(db, 'tutorProfiles', userData.tutorProfileId);
        try {
          const profileSnapshot = await getDoc(profileRef);
          if (profileSnapshot.exists()) {
            const profileData = profileSnapshot.data();
            // If the document exists but belongs to someone else or lacks userId, create a new one we own.
            if (profileData.userId && profileData.userId === user.uid) {
              tutorProfileRef = profileRef;
              tutorProfileData = profileData;
              return { ref: profileRef, data: profileData, userData };
            }
          }
        } catch (error) {
          // Permission denied or other read issues; fall through to create a fresh profile we own.
          console.warn('Tutor Hub: unable to read existing tutor profile; creating a new one.', error);
        }
      }

      // Fallback: query any profile tied to this userId
      try {
        const fallbackQuery = query(collection(db, 'tutorProfiles'), where('userId', '==', user.uid));
        const profilesSnapshot = await getDocs(fallbackQuery);
        if (!profilesSnapshot.empty) {
          const docSnap = profilesSnapshot.docs[0];
          tutorProfileRef = doc(db, 'tutorProfiles', docSnap.id);
          tutorProfileData = docSnap.data();
          if (!userData.tutorProfileId) {
            await updateDoc(userDocRef, { tutorProfileId: docSnap.id });
          }
          return { ref: tutorProfileRef, data: tutorProfileData, userData };}
      } catch (error) {
        console.warn('Tutor Hub: unable to query tutor profile; creating a new one.', error);
      }

      // As a final fallback, create a profile we definitely own.
      return createNewProfile();
    }

    function populateProfile(profile) {
      tutorProfileData = profile;
      const profileId = tutorProfileRef?.id || profile?.id || null;
      renderProfilePhoto(profile);
      const status = formatStatus(profile.status);
      setStatus(status);
      if (statusSelect) {
        const rawStatus = profile.status || 'draft';
        statusSelect.value = ['draft', 'review', 'published'].includes(rawStatus) ? rawStatus : 'draft';
      }

      headlineInput.value = profile.headline || '';
      bioInput.value = profile.bio || '';
      applyProfileSubjectsToCatalog(profile.subjectsOffered || [], profile.catalogSubjectIds || []);
      gradesInput.value = (profile.gradeLevels || []).join(', ');

      if (meetingForm) {
        const modes = profile.meetingModes || {};
        if (modeOnline) modeOnline.checked = modes.online !== false;
        if (modeInPerson) modeInPerson.checked = !!modes.inPerson;
        if (modeHybrid) modeHybrid.checked = !!modes.hybrid;

        const locationSource = profile.tutorLocation || null;
        const fallbackLocation = profile.placesSettings?.placeId
          ? {
              basePlace: {
                placeId: profile.placesSettings.placeId,
                formattedAddress: profile.placesSettings.displayAddress || null
              },
              displayLocationLabel: profile.placesSettings.displayAddress || null
            }
          : profile.travelInfo || null;
        populateLocationFields(locationSource || fallbackLocation || {});
        void ensureLocationMap();
      }

      const profileUrl = buildProfileUrl(profile.slug);
      if (profileUrl) {
        profileLinkEl.textContent = profileUrl;
        copyLinkBtn.disabled = false;
        copyLinkBtn.dataset.profileUrl = profileUrl;
        copyLinkBtn.textContent = 'Copy Profile Link';
      } else {
        profileLinkEl.textContent = 'Add details and publish to receive your public link.';
        copyLinkBtn.disabled = true;
        delete copyLinkBtn.dataset.profileUrl;
      }

      if (bookingInfoLink) {
        if (profileId) {
          bookingInfoLink.href = `booking-settings.html?tutorId=${encodeURIComponent(profileId)}`;
          bookingInfoLink.hidden = false;
        } else {
          bookingInfoLink.hidden = true;
        }
      }
    }

    function showMessage(el, message, isError = false) {
      el.textContent = message;
      el.classList.remove('ok', 'error');
      el.classList.add(isError ? 'error' : 'ok');
    }

    onAuth(auth, async (user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      currentUser = user;
      setPhotoPreview(tutorProfileData?.photoURL || null);
      try {
        const result = await ensureTutorProfile(user);
        if (!result) return;
        currentUserData = result.userData || null;
        populateProfile(result.data);
        renderLinkedInCard(currentUserData);
        renderCalendarStatus(currentUserData);
        await loadLatestCertificate();
      } catch (error) {
        console.error('Tutor Hub load error', error);
        showMessage(profileMessage, 'Unable to load tutor profile. Please refresh or contact support.', true);
      }
    });

    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
        const url = copyLinkBtn.dataset.profileUrl;
        if (!url) {
          alert('Publish your profile before sharing a link.');
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          copyLinkBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyLinkBtn.textContent = 'Copy Profile Link';
          }, 2000);
        } catch (err) {
          console.warn('Clipboard unavailable', err);
          prompt('Copy this link', url);
        }
      });
    }

    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!tutorProfileRef) return;

      const allowedStatuses = ['draft', 'review', 'published'];
      const requestedStatus = statusSelect?.value || 'draft';
      const safeStatus = allowedStatuses.includes(requestedStatus) ? requestedStatus : 'draft';

      const payload = {
        headline: headlineInput.value.trim(),
        bio: bioInput.value.trim(),
        subjectsOffered: buildSubjectsPayload(),
        catalogSubjectIds: buildCatalogIdPayload(),
        catalogVersion: COURSE_CATALOG_VERSION_VALUE,
        gradeLevels: parseList(gradesInput.value),
        status: safeStatus,
        updatedAt: serverTimestamp()
      };

      try {
        await updateDoc(tutorProfileRef, payload);
        tutorProfileData = { ...tutorProfileData, ...payload };
        populateProfile({ ...tutorProfileData, ...payload });
        setStatus(formatStatus(payload.status));
        showMessage(profileMessage, 'Profile details saved.');
      } catch (error) {
        console.error('Profile save error', error);
        showMessage(profileMessage, 'Failed to save profile details.', true);
      }
    });

    if (meetingForm) {
      meetingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!tutorProfileRef) return;

        const meetingModes = {
          online: modeOnline.checked,
          inPerson: modeInPerson.checked,
          hybrid: modeHybrid.checked
        };

        if (!meetingModes.online && !meetingModes.inPerson && !meetingModes.hybrid) {
          showMessage(meetingMessage, 'Select at least one meeting option.', true);
          return;
        }

        syncLocationFromInputs();

        const travelActive = isTravelEnabled();
        const locationPayload = currentLocationState?.basePlace?.location
          ? {
              ...currentLocationState,
              displayLocationLabel: (locationLabelInput?.value || '').trim()
                || currentLocationState.displayLocationLabel
                || currentLocationState.basePlace?.formattedAddress
                || null,
              travelEnabled: travelActive,
              travelRadiusKm: travelActive
                ? clampTravelRadius(currentLocationState.travelRadiusKm || Number(travelRadiusInput?.value) || 0)
                : 0,
              travelZoneBreaksKm: travelActive ? currentLocationState.travelZoneBreaksKm || [] : [],
              updatedAt: serverTimestamp()
            }
          : null;

        if ((meetingModes.inPerson || meetingModes.hybrid) && !locationPayload) {
          showMessage(meetingMessage, 'Add a base location for in-person or hybrid sessions.', true);
          setLocationStatus('Add a base location to show your in-person area.', 'error');
          return;
        }

        const placesSettings = locationPayload?.basePlace?.placeId
          ? {
              enabled: true,
              placeId: locationPayload.basePlace.placeId,
              displayAddress: locationPayload.displayLocationLabel || locationPayload.basePlace.formattedAddress || null
            }
          : { enabled: false, placeId: null, displayAddress: null };

        try {
          await updateDoc(tutorProfileRef, {
            meetingModes,
            placesSettings,
            tutorLocation: locationPayload || null,
            updatedAt: serverTimestamp()
          });
          tutorProfileData = { ...tutorProfileData, meetingModes, placesSettings, tutorLocation: locationPayload || null };
          showMessage(meetingMessage, 'Meeting preferences saved.');
          setLocationStatus(locationPayload ? 'Location saved.' : 'Meeting modes saved.', 'success');
        } catch (error) {
          console.error('Meeting save error', error);
          showMessage(meetingMessage, 'Failed to save meeting preferences.', true);
        }
      });
    }
  