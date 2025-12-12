    import { auth, db, doc, getDoc, onAuthStateChanged, serverTimestamp, setDoc } from './firebase-config.js';
import { loadGoogleMapsApi, normalizeTutorLocation, parseTravelZoneBreaks, viewportToRectanglePath } from './maps-utils.js';

    const SITE_SETTINGS_COLLECTION = 'siteSettings';
    const BOOKING_SETTINGS_DOC_ID = 'booking';
    const TUTOR_PROFILES_COLLECTION = 'tutorProfiles';
    const ADMIN_UID_ALLOWLIST = new Set(['fUXnvGI024fYp4w1AvKUcbM7p8z2']);
    const ADMIN_EMAIL_ALLOWLIST = new Set(['amitshalev1510@gmail.com']);
    const CALENDAR_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const DEFAULT_BOOKING_SETTINGS = {
      maxStudentsPerSession: 4,
      maxHoursPerSession: 2,
      minSessionMinutes: 60,
      bufferMinutes: 15,
      baseSessionCost: 50,
      extraStudentCost: 20,
      recurringMaxAdvanceWeeks: 12,
      availability: {
        '0': [],
        '1': [],
        '2': [],
        '3': [],
        '4': [],
        '5': [],
        '6': [{ start: '11:00', end: '16:00' }]
      },
      calendarDisplay: {
        startHour: 8,
        endHour: 20,
        visibleDays: ['0', '1', '2', '3', '4']
      },
      radiusPricing: [],
      addOns: [],
      currency: 'CAD'
    };

    const statusEl = document.getElementById('booking-info-status');
    const contentEl = document.getElementById('booking-info-content');
    const metaEl = document.getElementById('booking-info-meta');
    const updatedEl = document.getElementById('booking-info-updated');
    const footerEl = document.getElementById('booking-info-footer');

    const editSectionEl = document.getElementById('booking-edit-section');
    const editFormEl = document.getElementById('booking-edit-form');
    const editStatusEl = document.getElementById('booking-edit-status');
    const saveBtn = document.getElementById('booking-save-btn');
    const resetBtn = document.getElementById('booking-reset-btn');

    const editInputs = {
      maxStudents: document.getElementById('edit-max-students'),
      maxHours: document.getElementById('edit-max-hours'),
      minDuration: document.getElementById('edit-min-duration'),
      bufferMinutes: document.getElementById('edit-buffer-minutes'),
      baseRate: document.getElementById('edit-base-rate'),
      extraRate: document.getElementById('edit-extra-rate'),
      recurringWeeks: document.getElementById('edit-recurring-weeks'),
      calendarStart: document.getElementById('edit-calendar-start'),
      calendarEnd: document.getElementById('edit-calendar-end')
    };

    const modeOnline = document.getElementById('mode-online');
    const modeOffice = document.getElementById('mode-office');
    const modeTravel = document.getElementById('mode-travel');
    const officeAddressHintEl = document.getElementById('office-address-hint');
    const locationSearchInput = document.getElementById('location-search');
    const locationLabelInput = document.getElementById('location-label');
    const travelEnabledToggle = document.getElementById('travel-enabled');
    const travelRadiusInput = document.getElementById('travel-radius');
    const travelRadiusValue = document.getElementById('travel-radius-value');
    const travelZonesInput = document.getElementById('travel-zones');
    const travelFields = document.getElementById('travel-fields');
    const locationMapEl = document.getElementById('location-map');
    const locationStatusEl = document.getElementById('location-status');

    const addonRowsEl = document.getElementById('addon-rows');
    const addonEmptyEl = document.getElementById('addon-empty');
    const addAddonBtn = document.getElementById('add-addon-btn');

    // Bind add-on handlers as early as possible.
    // (attachAddOnButtonHandlers is a function declaration and is hoisted.)
    attachAddOnButtonHandlers();
    document.addEventListener('DOMContentLoaded', attachAddOnButtonHandlers, { once: true });

    const zonePricingSection = document.getElementById('zone-pricing-section');
    const zonePricingRows = document.getElementById('zone-pricing-rows');

    const availabilityInputs = Array.from(document.querySelectorAll('#edit-availability-grid .availability-row')).map((row) => {
      return {
        dayKey: row.dataset.day,
        start: row.querySelector('input[data-role="start"]'),
        end: row.querySelector('input[data-role="end"]'),
        label: row.querySelector('label')?.textContent?.replace(' availability', '') || ''
      };
    }).filter((entry) => entry.dayKey != null);
    const calendarDayCheckboxes = Array.from(document.querySelectorAll('#edit-calendar-days input[type="checkbox"]'));

    const fieldEls = {
      baseRate: document.getElementById('rate-base'),
      extraRate: document.getElementById('rate-extra'),
      addOnCard: document.getElementById('addon-card'),
      addOnList: document.getElementById('addon-list'),
      minDuration: document.getElementById('session-min'),
      maxDuration: document.getElementById('session-max'),
      bufferMinutes: document.getElementById('session-buffer'),
      maxStudents: document.getElementById('session-max-students'),
      recurringWeeks: document.getElementById('session-recurring'),
      calendarHours: document.getElementById('calendar-hours'),
      calendarDays: document.getElementById('calendar-days')
    };

    const zonePricingCard = document.getElementById('zone-pricing-card');
    const zonePricingList = document.getElementById('zone-pricing-list');

    const availabilityListEl = document.getElementById('booking-availability-list');

    const mapDefaultCenter = { lat: 51.0447, lng: -114.0719 };
    let mapsApi = null;
    let locationMap = null;
    let locationMarker = null;
    let locationViewportShape = null;
    let travelOverlays = [];
    let locationAutocomplete = null;
    let currentLocationState = null;
    let currentTutorProfileData = null;

    let currentUser = null;
    let currentUserDoc = null;
    let targetTutorProfileId = null;
    let lastLoadedSettings = null;
    let siteSettingsCache = null;
    let travelZoneBreaks = [];
    let currentAddOns = [];

    function normalizeEmail(value) {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed || !trimmed.includes('@')) {
        return null;
      }
      return trimmed.toLowerCase();
    }

    function normalizeId(value) {
      if (!value) {
        return null;
      }
      const text = String(value).trim();
      return text || null;
    }

    function isOwner(user, userDoc) {
      const uidCandidates = [normalizeId(user?.uid), normalizeId(userDoc?.uid), normalizeId(userDoc?.id)];
      if (uidCandidates.some((uid) => uid && ADMIN_UID_ALLOWLIST.has(uid))) {
        return true;
      }

      const emailCandidates = [];
      const pushEmail = (candidate) => {
        const normalized = normalizeEmail(candidate);
        if (normalized) {
          emailCandidates.push(normalized);
        }
      };

      pushEmail(user?.email);
      pushEmail(userDoc?.email);
      pushEmail(userDoc?.primaryEmail);
      pushEmail(userDoc?.contactEmail);

      if (Array.isArray(userDoc?.emails)) {
        userDoc.emails.forEach(pushEmail);
      }

      if (userDoc?.contact && typeof userDoc.contact === 'object') {
        Object.values(userDoc.contact).forEach(pushEmail);
      }

      return emailCandidates.some((email) => ADMIN_EMAIL_ALLOWLIST.has(email));
    }

    function hasTutorPrivileges(userDoc) {
      if (!userDoc) {
        return false;
      }

      if (window.RoleUtils && typeof window.RoleUtils.normalizeRoleInfo === 'function') {
        try {
          const roleInfo = window.RoleUtils.normalizeRoleInfo(userDoc);
          if (roleInfo?.tutorActive) {
            return true;
          }
          const allowedStates = new Set([
            window.RoleUtils.ROLE_STATES.TUTOR_ONLY,
            window.RoleUtils.ROLE_STATES.HYBRID_ACTIVE,
            window.RoleUtils.ROLE_STATES.HYBRID_FREEZE_TUTOR,
            window.RoleUtils.ROLE_STATES.HYBRID_FREEZE_STUDENT
          ]);
          if (roleInfo && allowedStates.has(roleInfo.state)) {
            return true;
          }
        } catch (error) {
          console.warn('Booking info: unable to read role state via RoleUtils', error);
        }
      }

      const roles = userDoc.roles;
      if (!roles) {
        return false;
      }

      if (roles === true) {
        return true;
      }

      if (typeof roles === 'string') {
        return roles.toLowerCase().includes('tutor');
      }

      if (Array.isArray(roles)) {
        return roles.some((role) => typeof role === 'string' && role.toLowerCase().includes('tutor'));
      }

      if (typeof roles === 'object') {
        const tutor = roles.tutor;
        if (tutor === true) {
          return true;
        }
        if (typeof tutor === 'string') {
          return tutor.toLowerCase().includes('active');
        }
        if (tutor && typeof tutor === 'object') {
          if (tutor.active === true) {
            return true;
          }
          if (tutor.status && typeof tutor.status === 'string') {
            return tutor.status.toLowerCase().includes('active');
          }
        }
      }

      return false;
    }

    function coerceHour(value, fallback) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.min(24, Math.max(0, Math.floor(numeric)));
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return fallback;
        }
        const match = trimmed.match(/^([0-1]?\d|2[0-3])(?::00)?$/);
        if (match) {
          return Math.min(24, Math.max(0, Number(match[1])));
        }
      }
      return fallback;
    }

    function normalizeTimeString(value) {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const match = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
      if (!match) {
        return null;
      }
      const hours = match[1].padStart(2, '0');
      const minutes = match[2];
      return `${hours}:${minutes}`;
    }

    function normalizeAvailability(rawAvailability = {}) {
      const template = JSON.parse(JSON.stringify(DEFAULT_BOOKING_SETTINGS.availability));
      const result = {};
      Object.keys(template).forEach((key) => {
        const slots = Array.isArray(rawAvailability[key]) ? rawAvailability[key] : template[key];
        const normalizedSlots = [];
        slots.forEach((slot) => {
          if (Array.isArray(slot) && slot.length === 2) {
            const start = normalizeTimeString(slot[0]);
            const end = normalizeTimeString(slot[1]);
            if (start && end && start < end) {
              normalizedSlots.push({ start, end });
            }
            return;
          }
          const start = normalizeTimeString(slot?.start ?? slot?.from ?? slot?.begin);
          const end = normalizeTimeString(slot?.end ?? slot?.to ?? slot?.finish);
          if (start && end && start < end) {
            normalizedSlots.push({ start, end });
          }
        });
        result[key] = normalizedSlots;
      });
      return result;
    }

    function normalizeVisibleDays(rawDays) {
      const normalizeKey = (value) => {
        if (value == null) {
          return null;
        }
        const raw = String(value).trim();
        if (!raw) {
          return null;
        }
        if (/^[0-6]$/.test(raw)) {
          return raw;
        }
        const lowered = raw.toLowerCase();
        const matches = CALENDAR_DAY_LABELS.findIndex((label) => label.toLowerCase().startsWith(lowered.slice(0, 3)));
        if (matches === -1) {
          return null;
        }
        return String(matches);
      };

      const days = Array.isArray(rawDays)
        ? rawDays
        : typeof rawDays === 'string'
          ? rawDays.split(',').map((item) => item.trim()).filter(Boolean)
          : DEFAULT_BOOKING_SETTINGS.calendarDisplay.visibleDays;

      const normalized = Array.from(new Set(days.map(normalizeKey).filter((value) => value != null)));
      if (!normalized.length) {
        return DEFAULT_BOOKING_SETTINGS.calendarDisplay.visibleDays.slice();
      }
      normalized.sort((a, b) => Number(a) - Number(b));
      return normalized;
    }

    function normalizeTravelZones(rawZones) {
      const list = Array.isArray(rawZones) ? rawZones : [];
      const cleaned = list
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Number(value.toFixed(2)));
      const unique = Array.from(new Set(cleaned)).sort((a, b) => a - b);
      return unique;
    }

    function normalizeRadiusPricing(rawPricing = []) {
      if (!Array.isArray(rawPricing)) {
        return [];
      }
      return rawPricing
        .map((entry) => ({
          upToKm: Number(entry?.upToKm ?? entry?.upTo ?? entry?.radius ?? entry?.km),
          priceDelta: Number(entry?.priceDelta ?? entry?.delta ?? entry?.adjustment ?? 0),
          label: typeof entry?.label === 'string' ? entry.label.trim() : null
        }))
        .filter((entry) => Number.isFinite(entry.upToKm))
        .map((entry) => ({
          ...entry,
          upToKm: Math.max(0, Number(entry.upToKm.toFixed(2))),
          priceDelta: Number.isFinite(entry.priceDelta) ? Number(entry.priceDelta.toFixed(2)) : 0
        }))
        .sort((a, b) => a.upToKm - b.upToKm);
    }

    function normalizeAddOns(rawAddOns = []) {
      if (!Array.isArray(rawAddOns)) {
        return [];
      }
      const toId = (label, fallbackIndex) => {
        const safe = (label || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return safe || `addon-${fallbackIndex}`;
      };
      return rawAddOns
        .map((entry, index) => {
          const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
          const id = typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : toId(label, index + 1);
          const priceDelta = Number(entry?.priceDelta ?? entry?.delta ?? entry?.amount ?? 0);
          const defaultSelected = entry?.defaultSelected === true || entry?.default === true;
          if (!label) {
            return null;
          }
          return {
            id,
            label,
            priceDelta: Number.isFinite(priceDelta) ? Number(priceDelta.toFixed(2)) : 0,
            defaultSelected
          };
        })
        .filter(Boolean);
    }

    function normalizeCalendarDayKey(value) {
      if (value == null) {
        return null;
      }
      const raw = String(value).trim();
      if (!raw) {
        return null;
      }
      if (/^[0-6]$/.test(raw)) {
        return raw;
      }
      const lower = raw.toLowerCase();
      const match = CALENDAR_DAY_LABELS.findIndex((label) => label.toLowerCase().startsWith(lower.slice(0, 3)));
      return match === -1 ? null : String(match);
    }

    function formatHourForTimeInput(hour) {
      const numeric = coerceHour(hour, 8);
      const clamped = Math.max(0, Math.min(23, Math.floor(numeric)));
      return `${String(clamped).padStart(2, '0')}:00`;
    }

    function parseHourFromTimeInput(value) {
      return coerceHour(value, null);
    }

    function cloneAvailabilityTemplate(base = DEFAULT_BOOKING_SETTINGS.availability) {
      const template = base || DEFAULT_BOOKING_SETTINGS.availability;
      return JSON.parse(JSON.stringify(template));
    }

    function normalizeBookingSettings(raw = {}, baseDefaults = DEFAULT_BOOKING_SETTINGS) {
      const base = baseDefaults || DEFAULT_BOOKING_SETTINGS;
      const normalized = JSON.parse(JSON.stringify(base));

      const clampNumber = (value, fallback, options = {}) => {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
          return fallback;
        }
        let result = parsed;
        if (options.min != null) {
          result = Math.max(options.min, result);
        }
        if (options.max != null) {
          result = Math.min(options.max, result);
        }
        if (options.roundNearest) {
          const step = options.roundNearest;
          result = Math.round(result / step) * step;
        }
        if (options.precision != null) {
          const factor = 10 ** options.precision;
          result = Math.round(result * factor) / factor;
        }
        return result;
      };

      normalized.maxStudentsPerSession = clampNumber(raw.maxStudentsPerSession, normalized.maxStudentsPerSession, { min: 1, max: 8, roundNearest: 1 });
      normalized.maxHoursPerSession = clampNumber(raw.maxHoursPerSession, normalized.maxHoursPerSession, { min: 1, max: 6, precision: 2 });
      normalized.minSessionMinutes = clampNumber(raw.minSessionMinutes, normalized.minSessionMinutes, { min: 30, max: Math.round(normalized.maxHoursPerSession * 60), roundNearest: 15 });
      normalized.bufferMinutes = clampNumber(raw.bufferMinutes, normalized.bufferMinutes, { min: 0, max: 240, roundNearest: 1 });
      normalized.baseSessionCost = clampNumber(raw.baseSessionCost, normalized.baseSessionCost, { min: 0, precision: 2 });
      normalized.extraStudentCost = clampNumber(raw.extraStudentCost, normalized.extraStudentCost, { min: 0, precision: 2 });
      normalized.recurringMaxAdvanceWeeks = clampNumber(raw.recurringMaxAdvanceWeeks, normalized.recurringMaxAdvanceWeeks, { min: 1, max: 52, roundNearest: 1 });

      const startHour = coerceHour(raw.calendarDisplay?.startHour, normalized.calendarDisplay.startHour);
      let endHour = coerceHour(raw.calendarDisplay?.endHour, normalized.calendarDisplay.endHour);
      if (endHour <= startHour) {
        endHour = Math.min(24, Math.max(startHour + 1, normalized.calendarDisplay.endHour));
      }

      normalized.calendarDisplay = {
        startHour,
        endHour,
        visibleDays: normalizeVisibleDays(raw.calendarDisplay?.visibleDays)
      };

      normalized.availability = normalizeAvailability(raw.availability);
      if (typeof raw.currency === 'string' && raw.currency.trim()) {
        normalized.currency = raw.currency.trim().toUpperCase();
      }

      if (Array.isArray(raw.courses)) {
        normalized.courses = raw.courses.map((course) => String(course || '').trim()).filter(Boolean);
      } else if (typeof raw.courses === 'string') {
        normalized.courses = raw.courses
          .split(/\r?\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      } else {
        normalized.courses = [];
      }

      normalized.radiusPricing = normalizeRadiusPricing(raw.radiusPricing || raw.zonePricing || []);
  normalized.addOns = normalizeAddOns(raw.addOns || raw.addons || []);

      normalized._lastUpdatedAt = raw._lastUpdatedAt || base._lastUpdatedAt || null;
      normalized._lastUpdatedBy = raw._lastUpdatedBy || base._lastUpdatedBy || null;

      return normalized;
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
      return Boolean(modeTravel?.checked);
    }

    function isTravelEnabled() {
      if (!isTravelModeActive()) return false;
      if (travelEnabledToggle) return travelEnabledToggle.checked;
      return false;
    }

    function applyTravelVisibility(options = {}) {
      if (!modeTravel?.checked && travelEnabledToggle) {
        travelEnabledToggle.checked = false;
      }
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
        clearTravelOverlays();
        return;
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

    function toggleCollapsible(section, collapsed) {
      if (!section) return;
      const isCollapsed = collapsed != null ? collapsed : section.dataset.collapsed === 'true';
      const next = !isCollapsed;
      section.dataset.collapsed = next ? 'false' : 'true';
    }

    function setupCollapsibles() {
      const headers = Array.from(document.querySelectorAll('.collapsible-header'));
      headers.forEach((header) => {
        header.addEventListener('click', (event) => {
          const section = header.closest('.collapsible');
          if (!section) return;
          const collapsed = section.dataset.collapsed === 'true';
          section.dataset.collapsed = collapsed ? 'false' : 'true';
          event.preventDefault();
        });
      });
    }

    async function ensureLocationMap() {
      if (!locationMapEl) return null;
      if (!mapsApi) {
        try {
          mapsApi = await loadGoogleMapsApi({ libraries: 'places' });
        } catch (error) {
          console.error('Google Maps failed to load on booking info', error);
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
      travelZoneBreaks = normalizeTravelZones(location.travelZoneBreaksKm || []);
      renderZonePricingInputs(travelZoneBreaks, lastLoadedSettings?.radiusPricing || []);
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
        travelZoneBreaks = normalizeTravelZones(location.travelZoneBreaksKm || []);
        radii.push(...travelZoneBreaks);
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
        // Preserve any in-progress pricing edits when only radius changes.
        const preservedPricing = buildZonePricingPayload();
        renderZonePricingInputs(travelZoneBreaks, preservedPricing.length ? preservedPricing : lastLoadedSettings?.radiusPricing || []);
        return;
      }
      const travelActive = isTravelEnabled();
      const radius = travelActive
        ? clampTravelRadius(Number(travelRadiusInput?.value) || currentLocationState.travelRadiusKm || 0)
        : currentLocationState.travelRadiusKm || clampTravelRadius(Number(travelRadiusInput?.value) || 0);
      const parseRadius = travelActive ? radius : undefined; // when travel off, don’t bound zones to 0
      const { value: zones, errors } = parseTravelZoneBreaks(travelZonesInput?.value, parseRadius);
      travelZoneBreaks = zones;
      currentLocationState = {
        ...currentLocationState,
        displayLocationLabel: (locationLabelInput?.value || '').trim() || currentLocationState.displayLocationLabel || currentLocationState.basePlace?.formattedAddress || null,
        travelEnabled: travelActive,
        travelRadiusKm: radius,
        travelZoneBreaksKm: zones
      };
      // Keep the user’s current surcharge edits when the zone list stays the same.
      const preservedPricing = buildZonePricingPayload();
      renderZonePricingInputs(travelZoneBreaks, preservedPricing.length ? preservedPricing : lastLoadedSettings?.radiusPricing || []);
      if (errors.length) {
        setLocationStatus(errors.join(' '), 'error');
      } else {
        setLocationStatus('', 'neutral');
      }
      void renderLocationOnMap(currentLocationState);
    }

    function populateMeetingFields(profileData) {
      currentTutorProfileData = profileData || currentTutorProfileData;
      const rawModes = currentTutorProfileData?.meetingModes || {};
      const modes = {
        online: rawModes.online !== false,
        tutorsOffice: rawModes.tutorsOffice ?? rawModes.inPerson ?? rawModes.hybrid ?? false,
        travel: rawModes.travel ?? false
      };
      if (modeOnline) modeOnline.checked = modes.online !== false;

      const normalized = normalizeTutorLocation(currentTutorProfileData?.tutorLocation || {});
      const hasBase = Boolean(normalized.basePlace?.location);
      if (modeOffice) modeOffice.checked = modes.tutorsOffice !== false && hasBase;
      const travelEnabledFromData = normalized.travelEnabled !== false
        ? Boolean(normalized.travelRadiusKm || (normalized.travelZoneBreaksKm || []).length)
        : false;
      const travelModeEnabled = Boolean(modes.travel) && travelEnabledFromData;
      if (modeTravel) modeTravel.checked = travelModeEnabled;
      if (travelEnabledToggle) {
        travelEnabledToggle.checked = travelModeEnabled;
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

      travelZoneBreaks = normalizeTravelZones(normalized.travelZoneBreaksKm || []);
      renderZonePricingInputs(travelZoneBreaks, lastLoadedSettings?.radiusPricing || []);

      const hasLocation = normalized.basePlace?.location || radius;
      currentLocationState = hasLocation ? { ...normalized, travelRadiusKm: radius, travelEnabled: travelEnabledFromData } : null;
      applyTravelVisibility({ skipSync: true });
      syncOfficeAddressRequirements();
      void renderLocationOnMap(currentLocationState);
    }

    function syncOfficeAddressRequirements() {
      const officeEnabled = !!modeOffice?.checked;
      if (officeAddressHintEl) {
        officeAddressHintEl.hidden = !officeEnabled;
      }
      if (locationSearchInput) {
        if (officeEnabled) {
          locationSearchInput.required = true;
          locationSearchInput.setAttribute('aria-required', 'true');
        } else {
          locationSearchInput.required = false;
          locationSearchInput.removeAttribute('aria-required');
        }
      }
    }

    function formatCurrency(amount, currency) {
      const formatter = new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: currency || 'CAD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return formatter.format(amount);
    }

    function formatDurationMinutes(minutes) {
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return '—';
      }
      const totalMinutes = Math.round(minutes);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const parts = [];
      if (hours) {
        parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
      }
      if (mins) {
        parts.push(`${mins} min`);
      }
      return parts.length ? parts.join(' ') : '0 min';
    }

    function formatHourRange(startHour, endHour) {
      const toLabel = (hour) => {
        const date = new Date();
        date.setHours(hour, 0, 0, 0);
        return new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        }).format(date);
      };
      return `${toLabel(startHour)} – ${toLabel(endHour)}`;
    }

    function formatVisibleDays(visibleDays) {
      if (!Array.isArray(visibleDays) || !visibleDays.length) {
        return '—';
      }
      return visibleDays
        .map((value) => {
          const index = Number(value);
          return CALENDAR_DAY_LABELS[index] || value;
        })
        .join(', ');
    }

    function renderAvailability(availability) {
      availabilityListEl.innerHTML = '';
      const entries = CALENDAR_DAY_LABELS.map((label, index) => {
        const slots = availability[String(index)] || [];
        if (!slots.length) {
          return { label, text: 'Not available' };
        }
        const text = slots.map((slot) => `${slot.start} – ${slot.end}`).join(', ');
        return { label, text };
      });

      entries.forEach(({ label, text }) => {
        const li = document.createElement('li');
        const daySpan = document.createElement('span');
        daySpan.className = 'availability-day';
        daySpan.textContent = label;
        const valueSpan = document.createElement('span');
        valueSpan.className = 'availability-value';
        valueSpan.textContent = text;
        li.appendChild(daySpan);
        li.appendChild(valueSpan);
        availabilityListEl.appendChild(li);
      });
    }

    function renderZonePricingInputs(zones, pricing) {
      if (!zonePricingSection || !zonePricingRows) return;
      const normalizedZones = normalizeTravelZones(zones || travelZoneBreaks || []);
      travelZoneBreaks = normalizedZones;
      zonePricingRows.innerHTML = '';

      if (!normalizedZones.length) {
        zonePricingSection.hidden = true;
        return;
      }

      zonePricingSection.hidden = false;
      const pricingMap = new Map((pricing || []).map((entry) => [Number(entry.upToKm), entry]));

      normalizedZones.forEach((zoneKm, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'input-group';
        wrapper.dataset.zoneRow = 'true';
        wrapper.dataset.upToKm = String(zoneKm);

        const label = document.createElement('label');
        label.textContent = `Up to ${zoneKm} km surcharge`;
        wrapper.appendChild(label);

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        const existing = pricingMap.get(zoneKm);
        input.value = Number.isFinite(existing?.priceDelta) ? existing.priceDelta : '';
        wrapper.appendChild(input);

        const helper = document.createElement('p');
        helper.className = 'helper-text';
        helper.textContent = index === 0 ? 'Applies within this zone.' : 'Applies up to this breakpoint.';
        wrapper.appendChild(helper);

        zonePricingRows.appendChild(wrapper);
      });
    }

    function renderZonePricingDisplay(settings) {
      if (!zonePricingCard || !zonePricingList) return;
      zonePricingList.innerHTML = '';
      const pricing = normalizeRadiusPricing(settings.radiusPricing || []);
      const zones = normalizeTravelZones(travelZoneBreaks);
      if (!pricing.length || !zones.length) {
        zonePricingCard.hidden = true;
        return;
      }

      const pricingMap = new Map(pricing.map((entry) => [Number(entry.upToKm), entry]));
      zones.forEach((zoneKm) => {
        const entry = pricingMap.get(zoneKm);
        if (!entry) return;
        const li = document.createElement('li');
        const amount = formatCurrency(entry.priceDelta, settings.currency) || `${entry.priceDelta}`;
        li.textContent = `Up to ${zoneKm} km: ${amount}`;
        zonePricingList.appendChild(li);
      });

      zonePricingCard.hidden = zonePricingList.children.length === 0;
    }

    function addAddonRowToEditor(addOn) {
      if (!addonRowsEl || !addonEmptyEl) return;
      const row = document.createElement('div');
      row.className = 'addon-row';
      row.dataset.addonId = addOn.id;

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Add-on label (shown to families)';
      labelInput.value = addOn.label || '';
      row.appendChild(labelInput);

      const priceInput = document.createElement('input');
      priceInput.type = 'number';
      priceInput.step = '0.01';
      priceInput.value = Number.isFinite(addOn.priceDelta) ? addOn.priceDelta : '';
      priceInput.placeholder = '+/- cost';
      row.appendChild(priceInput);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        row.remove();
        if (!addonRowsEl.children.length) {
          addonEmptyEl.hidden = false;
        }
      });
      row.appendChild(removeBtn);

      addonRowsEl.appendChild(row);
      addonEmptyEl.hidden = addonRowsEl.children.length > 0;
    }

    function handleAddOnAddClick() {
      const newAddOn = { id: `addon-${Date.now()}`, label: '', priceDelta: 0 };
      addAddonRowToEditor(newAddOn);
    }

    function attachAddOnButtonHandlers() {
      if (attachAddOnButtonHandlers._attached) return;
      attachAddOnButtonHandlers._attached = true;

      const handler = (event) => {
        const target = event?.target;
        const btn = target && target.closest ? target.closest('.addon-add-btn, #add-addon-btn') : null;
        if (!btn) return;
        event.preventDefault();
        handleAddOnAddClick();
      };

      // Capture-phase pointer handler is the most reliable across click blockers.
      document.addEventListener('pointerup', handler, true);

      if (addAddonBtn) {
        addAddonBtn.disabled = false;
        addAddonBtn.addEventListener('pointerup', (event) => {
          event.preventDefault();
          handleAddOnAddClick();
        });
      }
    }

    function renderAddOnRows(addOns = []) {
      if (!addonRowsEl || !addonEmptyEl) return;
      addonRowsEl.innerHTML = '';
      const normalized = normalizeAddOns(addOns);
      normalized.forEach((addOn) => addAddonRowToEditor(addOn));
      addonEmptyEl.hidden = normalized.length > 0;
      currentAddOns = normalized;
    }

    function buildAddOnsPayload() {
      if (!addonRowsEl) return [];
      const rows = Array.from(addonRowsEl.querySelectorAll('.addon-row'));
      const payload = rows
        .map((row, index) => {
          const inputs = row.querySelectorAll('input');
          const label = inputs[0]?.value?.trim();
          if (!label) return null;
          const priceDelta = Number(inputs[1]?.value || 0);
          const id = row.dataset.addonId || `addon-${index + 1}`;
          return {
            id,
            label,
            priceDelta: Number.isFinite(priceDelta) ? Number(priceDelta.toFixed(2)) : 0,
            defaultSelected: false
          };
        })
        .filter(Boolean);
      return payload;
    }

    function renderAddOnsDisplay(settings) {
      if (!fieldEls.addOnCard || !fieldEls.addOnList) return;
      fieldEls.addOnList.innerHTML = '';
      const addOns = normalizeAddOns(settings.addOns || []);
      if (!addOns.length) {
        fieldEls.addOnCard.hidden = true;
        return;
      }
      addOns.forEach((addOn) => {
        const li = document.createElement('li');
        const amount = Number(addOn.priceDelta) >= 0
          ? `+${formatCurrency(addOn.priceDelta, settings.currency)}`
          : `${formatCurrency(addOn.priceDelta, settings.currency)}`;
        li.textContent = `${addOn.label} (${amount})`;
        fieldEls.addOnList.appendChild(li);
      });
      fieldEls.addOnCard.hidden = false;
    }

    function toDate(value) {
      if (!value) {
        return null;
      }
      if (typeof value.toDate === 'function') {
        try {
          return value.toDate();
        } catch (error) {
          return null;
        }
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function renderLastUpdated(settings) {
      const updatedAt = toDate(settings._lastUpdatedAt);
      const updatedBy = settings._lastUpdatedBy;
      if (!updatedAt && !updatedBy) {
        metaEl.hidden = true;
        footerEl.hidden = true;
        return;
      }

      const formattedDate = updatedAt
        ? updatedAt.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        : null;

      const parts = [];
      if (formattedDate) {
        parts.push(`Last updated ${formattedDate}`);
      }
      if (updatedBy) {
        parts.push(`by ${updatedBy}`);
      }

      const message = parts.join(' ');
      if (message) {
        updatedEl.textContent = message;
        metaEl.hidden = false;
        footerEl.textContent = message;
        footerEl.hidden = false;
      } else {
        metaEl.hidden = true;
        footerEl.hidden = true;
      }
    }

    function setEditStatus(message, tone = 'info') {
      if (!editStatusEl) return;
      editStatusEl.textContent = message || '';
      editStatusEl.classList.remove('ok', 'error');
      if (tone === 'ok') {
        editStatusEl.classList.add('ok');
      } else if (tone === 'error') {
        editStatusEl.classList.add('error');
      }
    }

    function populateEditForm(settings) {
      if (!editFormEl) return;
      const safe = normalizeBookingSettings(settings, settings);

      editInputs.maxStudents.value = safe.maxStudentsPerSession;
      editInputs.maxHours.value = safe.maxHoursPerSession;
      editInputs.minDuration.value = safe.minSessionMinutes;
      editInputs.bufferMinutes.value = safe.bufferMinutes ?? DEFAULT_BOOKING_SETTINGS.bufferMinutes;
      editInputs.baseRate.value = safe.baseSessionCost;
      editInputs.extraRate.value = safe.extraStudentCost;
      editInputs.recurringWeeks.value = safe.recurringMaxAdvanceWeeks;
      editInputs.calendarStart.value = formatHourForTimeInput(safe.calendarDisplay.startHour);
      editInputs.calendarEnd.value = formatHourForTimeInput(safe.calendarDisplay.endHour);

      const visibleDays = new Set(safe.calendarDisplay.visibleDays.map(normalizeCalendarDayKey).filter((v) => v != null));
      calendarDayCheckboxes.forEach((checkbox) => {
        const normalized = normalizeCalendarDayKey(checkbox.value);
        checkbox.checked = normalized != null && visibleDays.has(normalized);
      });
      if (![...visibleDays].length) {
        const defaults = normalizeVisibleDays(DEFAULT_BOOKING_SETTINGS.calendarDisplay.visibleDays);
        calendarDayCheckboxes.forEach((checkbox) => {
          const normalized = normalizeCalendarDayKey(checkbox.value);
          checkbox.checked = normalized != null && defaults.includes(normalized);
        });
      }

      availabilityInputs.forEach((entry) => {
        const slots = safe.availability?.[entry.dayKey] || [];
        const first = Array.isArray(slots) && slots.length ? slots[0] : null;
        entry.start.value = first?.start || '';
        entry.end.value = first?.end || '';
      });

      renderZonePricingInputs(travelZoneBreaks, safe.radiusPricing || []);
      renderAddOnRows(safe.addOns || []);
    }

    function buildAvailabilityPayload() {
      const payload = cloneAvailabilityTemplate();
      availabilityInputs.forEach((entry) => {
        const start = normalizeTimeString(entry.start.value || '');
        const end = normalizeTimeString(entry.end.value || '');

        if (!start && !end) {
          payload[entry.dayKey] = [];
          return;
        }

        if (!start || !end) {
          throw new Error(`Please enter both start and end times for ${entry.label || 'this day'}, or leave both blank.`);
        }
        if (end <= start) {
          throw new Error(`End time must be later than start time for ${entry.label || 'this day'}.`);
        }

        payload[entry.dayKey] = [{ start, end }];
      });
      return payload;
    }

    function buildZonePricingPayload() {
      if (!zonePricingRows) {
        return [];
      }

      const rows = Array.from(zonePricingRows.querySelectorAll('[data-zone-row]'));
      if (!rows.length) {
        // Preserve the last-loaded pricing if the UI rows are hidden (e.g., travel temporarily disabled).
        return normalizeRadiusPricing(lastLoadedSettings?.radiusPricing || []);
      }

      const entries = rows
        .map((row) => {
          const upToKm = Number(row.dataset.upToKm);
          const input = row.querySelector('input');
          const priceDelta = Number(input?.value);
          if (!Number.isFinite(upToKm)) {
            return null;
          }
          const safeDelta = Number.isFinite(priceDelta) ? Number(priceDelta.toFixed(2)) : 0;
          return { upToKm, priceDelta: safeDelta };
        })
        .filter(Boolean);
      return normalizeRadiusPricing(entries);
    }

    function buildUpdatePayload() {
      const maxStudents = Number(editInputs.maxStudents.value || DEFAULT_BOOKING_SETTINGS.maxStudentsPerSession);
      const maxHours = Number(editInputs.maxHours.value || DEFAULT_BOOKING_SETTINGS.maxHoursPerSession);
      const minSessionMinutes = Number(editInputs.minDuration.value || DEFAULT_BOOKING_SETTINGS.minSessionMinutes);
      const bufferMinutes = Number(editInputs.bufferMinutes.value || DEFAULT_BOOKING_SETTINGS.bufferMinutes);
      const baseRate = Number(editInputs.baseRate.value || DEFAULT_BOOKING_SETTINGS.baseSessionCost);
      const extraRate = Number(editInputs.extraRate.value || DEFAULT_BOOKING_SETTINGS.extraStudentCost);
      const recurringWeeks = Number(editInputs.recurringWeeks.value || DEFAULT_BOOKING_SETTINGS.recurringMaxAdvanceWeeks);

      if (!Number.isFinite(maxStudents) || maxStudents < 1) {
        throw new Error('Max students per session must be at least 1.');
      }
      if (!Number.isFinite(maxHours) || maxHours < 1) {
        throw new Error('Max hours per session must be at least 1.');
      }
      if (!Number.isFinite(minSessionMinutes) || minSessionMinutes < 30) {
        throw new Error('Minimum session length must be at least 30 minutes.');
      }
      if (minSessionMinutes > maxHours * 60) {
        throw new Error('Minimum session length cannot exceed the maximum hours per session.');
      }
      if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0) {
        throw new Error('Time after session must be zero or higher.');
      }
      if (!Number.isFinite(baseRate) || baseRate < 0) {
        throw new Error('Cost per session must be zero or higher.');
      }
      if (!Number.isFinite(extraRate) || extraRate < 0) {
        throw new Error('Cost per additional student must be zero or higher.');
      }
      if (!Number.isFinite(recurringWeeks) || recurringWeeks < 1) {
        throw new Error('Recurring sessions must be allowed at least one week in advance.');
      }

      const calendarStartHour = parseHourFromTimeInput(editInputs.calendarStart.value);
      const calendarEndHour = parseHourFromTimeInput(editInputs.calendarEnd.value);
      if (calendarStartHour == null || calendarEndHour == null) {
        throw new Error('Calendar start and end times must be provided on the hour (e.g., 09:00).');
      }
      if (calendarEndHour <= calendarStartHour) {
        throw new Error('Calendar end time must be later than the start time.');
      }

      const calendarVisibleDays = calendarDayCheckboxes
        .filter((checkbox) => checkbox?.checked)
        .map((checkbox) => normalizeCalendarDayKey(checkbox.value))
        .filter((value) => value != null);

      if (!calendarVisibleDays.length) {
        throw new Error('Select at least one day to display in the calendar.');
      }

      calendarVisibleDays.sort((a, b) => Number(a) - Number(b));

      const availabilityPayload = buildAvailabilityPayload();
      const meetingModes = {
        online: modeOnline?.checked ?? false,
        tutorsOffice: !!modeOffice?.checked,
        travel: !!(modeTravel?.checked && isTravelEnabled())
      };

      if (!meetingModes.online && !meetingModes.tutorsOffice && !meetingModes.travel) {
        throw new Error('Select at least one meeting option.');
      }

      syncLocationFromInputs();
      const radiusPricing = buildZonePricingPayload();

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
            travelZoneBreaksKm: travelZoneBreaks,
            radiusPricing,
            updatedAt: serverTimestamp()
          }
        : null;

      if ((meetingModes.tutorsOffice || meetingModes.travel) && !locationPayload) {
        throw new Error('Add a base location for in-person or travel sessions.');
      }

      const officeAddress = meetingModes.tutorsOffice
        ? (locationPayload?.basePlace?.formattedAddress || '').trim()
        : '';
      if (meetingModes.tutorsOffice) {
        if (!officeAddress || !locationPayload?.basePlace?.placeId) {
          throw new Error('Tutor’s office requires an exact address. Please select a full address from the Base location autocomplete.');
        }
      }

      const placesSettings = locationPayload?.basePlace?.placeId
        ? {
            enabled: true,
            placeId: locationPayload.basePlace.placeId,
            displayAddress: locationPayload.displayLocationLabel || locationPayload.basePlace.formattedAddress || null
          }
        : { enabled: false, placeId: null, displayAddress: null };

      const bookingSettings = {
        maxStudentsPerSession: Math.min(Math.max(Math.round(maxStudents), 1), 8),
        maxHoursPerSession: Math.min(Math.max(Number(maxHours.toFixed(2)), 1), 6),
        minSessionMinutes: Math.min(Math.max(Math.round(minSessionMinutes / 15) * 15, 30), Math.round(maxHours * 60)),
        bufferMinutes: Math.min(Math.max(Math.round(bufferMinutes), 0), 240),
        baseSessionCost: Number(baseRate.toFixed(2)),
        extraStudentCost: Number(extraRate.toFixed(2)),
        recurringMaxAdvanceWeeks: Math.min(Math.max(Math.round(recurringWeeks), 1), 52),
        availability: availabilityPayload,
        calendarDisplay: {
          startHour: calendarStartHour,
          endHour: calendarEndHour,
          visibleDays: calendarVisibleDays
        },
        radiusPricing,
        addOns: buildAddOnsPayload(),
        currency: DEFAULT_BOOKING_SETTINGS.currency,
        _lastUpdatedAt: serverTimestamp(),
        _lastUpdatedBy: currentUser?.email || currentUser?.uid || 'tutor'
      };

      return {
        bookingSettings,
        meetingModes,
        tutorLocation: locationPayload,
        placesSettings,
        officeAddress
      };
    }

    function renderBookingSettings(settings) {
      fieldEls.baseRate.textContent = formatCurrency(settings.baseSessionCost, settings.currency);
      fieldEls.extraRate.textContent = formatCurrency(settings.extraStudentCost, settings.currency);
      fieldEls.minDuration.textContent = formatDurationMinutes(settings.minSessionMinutes);
      fieldEls.maxDuration.textContent = formatDurationMinutes(settings.maxHoursPerSession * 60);
      fieldEls.bufferMinutes.textContent = `${Math.round(settings.bufferMinutes ?? DEFAULT_BOOKING_SETTINGS.bufferMinutes)} min`;
      fieldEls.maxStudents.textContent = settings.maxStudentsPerSession;
      fieldEls.recurringWeeks.textContent = `${settings.recurringMaxAdvanceWeeks} week${settings.recurringMaxAdvanceWeeks === 1 ? '' : 's'}`;
      fieldEls.calendarHours.textContent = formatHourRange(settings.calendarDisplay.startHour, settings.calendarDisplay.endHour);
      fieldEls.calendarDays.textContent = formatVisibleDays(settings.calendarDisplay.visibleDays);

      renderAvailability(settings.availability);
      renderZonePricingDisplay(settings);
      renderAddOnsDisplay(settings);
      renderLastUpdated(settings);

      contentEl.hidden = false;
      statusEl.hidden = true;
    }

    async function fetchSiteBookingSettings(options = {}) {
      const { force = false } = options;
      if (siteSettingsCache && !force) {
        return siteSettingsCache;
      }
      const settingsRef = doc(db, SITE_SETTINGS_COLLECTION, BOOKING_SETTINGS_DOC_ID);
      const snapshot = await getDoc(settingsRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      siteSettingsCache = normalizeBookingSettings(data);
      travelZoneBreaks = [];
      return siteSettingsCache;
    }

    async function fetchTutorBookingSettings(profileId, baseSettings) {
      if (!profileId) return null;
      const profileRef = doc(db, TUTOR_PROFILES_COLLECTION, profileId);
      const snap = await getDoc(profileRef);
      if (!snap.exists()) {
        return null;
      }
      const data = snap.data() || {};
      currentTutorProfileData = data;
      travelZoneBreaks = normalizeTravelZones(data.tutorLocation?.travelZoneBreaksKm || []);
      const booking = data.bookingSettings || {};
      const base = baseSettings || siteSettingsCache || DEFAULT_BOOKING_SETTINGS;
      const merged = { ...base, ...booking };
      return normalizeBookingSettings(merged, base);
    }

    function showError(message) {
      statusEl.textContent = message;
      statusEl.classList.remove('muted');
      statusEl.classList.add('error');
      statusEl.hidden = false;
      contentEl.hidden = true;
      metaEl.hidden = true;
      footerEl.hidden = true;
    }

    function showInfo(message) {
      statusEl.textContent = message;
      statusEl.classList.remove('error');
      statusEl.classList.add('muted');
      statusEl.hidden = false;
    }

    function getTutorIdFromQuery() {
      const params = new URLSearchParams(window.location.search);
      return params.get('tutorId') || params.get('tutor') || null;
    }

    async function loadUserDoc(uid) {
      if (!uid) return null;
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }

    function canEditBooking(user, userDoc, tutorProfileId) {
      if (!user || !userDoc || !tutorProfileId) return false;
      if (userDoc.tutorProfileId && userDoc.tutorProfileId === tutorProfileId) {
        return true;
      }
      return isOwner(user, userDoc);
    }

    function showEditor(settings) {
      if (!editSectionEl || !editFormEl) return;
      editSectionEl.hidden = false;
      populateEditForm(settings);
    }

    async function loadAndRender({ user, userDoc }) {
      const urlTutorId = getTutorIdFromQuery();
      targetTutorProfileId = urlTutorId || userDoc?.tutorProfileId || null;

      const siteSettings = await fetchSiteBookingSettings();
      const tutorSettings = targetTutorProfileId ? await fetchTutorBookingSettings(targetTutorProfileId, siteSettings) : null;
      const settings = tutorSettings || siteSettings;
      lastLoadedSettings = settings;

      renderBookingSettings(settings);
      populateMeetingFields(currentTutorProfileData);
      applyTravelVisibility({ skipSync: true });

      const editable = canEditBooking(user, userDoc, targetTutorProfileId);
      if (editable) {
        showEditor(settings);
      } else if (editSectionEl) {
        editSectionEl.hidden = true;
      }
    }

    async function saveBookingSettings(event) {
      if (event) {
        event.preventDefault();
      }
      if (!targetTutorProfileId) {
        setEditStatus('Tutor profile not found for saving.', 'error');
        return;
      }
      if (saveBtn) saveBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = true;
      setEditStatus('Saving booking info...');
      try {
        const { bookingSettings, meetingModes, tutorLocation, placesSettings, officeAddress } = buildUpdatePayload();
        const profileRef = doc(db, TUTOR_PROFILES_COLLECTION, targetTutorProfileId);
        await setDoc(profileRef, {
          bookingSettings,
          meetingModes,
          tutorLocation,
          placesSettings,
          officeAddress,
          updatedAt: serverTimestamp()
        }, { merge: true });

        // Always push booking defaults + meeting modes to the shared site settings that the public
        // booking form consumes.
        const siteSettingsRef = doc(db, SITE_SETTINGS_COLLECTION, BOOKING_SETTINGS_DOC_ID);
        const sitePayload = { ...bookingSettings, meetingModes };
        await setDoc(siteSettingsRef, sitePayload, { merge: true });
        siteSettingsCache = normalizeBookingSettings(sitePayload);
        const refreshed = await fetchTutorBookingSettings(targetTutorProfileId, siteSettingsCache || DEFAULT_BOOKING_SETTINGS);
        if (refreshed) {
          lastLoadedSettings = refreshed;
          renderBookingSettings(refreshed);
          populateEditForm(refreshed);
          populateMeetingFields(currentTutorProfileData);
        }
        setEditStatus('Booking info saved.', 'ok');
      } catch (error) {
        console.error('Booking info save failed', error);
        setEditStatus(error?.message || 'Unable to save booking info.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (resetBtn) resetBtn.disabled = false;
      }
    }

    function resetEditor() {
      if (lastLoadedSettings) {
        populateEditForm(lastLoadedSettings);
        populateMeetingFields(currentTutorProfileData);
        applyTravelVisibility({ skipSync: true });
        setEditStatus('Reset to last saved values.', 'info');
      }
    }

    if (editFormEl) {
      editFormEl.addEventListener('submit', saveBookingSettings);
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', resetEditor);
    }

    // --- UI wiring ---
    [modeOnline, modeOffice, modeTravel].forEach((checkbox) => {
      if (!checkbox) {
        return;
      }
      checkbox.addEventListener('change', () => {
        syncOfficeAddressRequirements();
        if (checkbox === modeTravel && travelEnabledToggle && checkbox.checked) {
          travelEnabledToggle.checked = true;
        }
        applyTravelVisibility();
      });
    });

    if (travelEnabledToggle) {
      travelEnabledToggle.addEventListener('change', () => applyTravelVisibility());
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

    updateTravelRadiusDisplay();
    applyTravelVisibility({ skipSync: true });
    syncOfficeAddressRequirements();

    setupCollapsibles();

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      currentUser = user;
      statusEl.textContent = 'Loading booking settings…';
      statusEl.classList.remove('error', 'muted');

      try {
        currentUserDoc = await loadUserDoc(user.uid);

        if (!isOwner(user, currentUserDoc) && !hasTutorPrivileges(currentUserDoc)) {
          showInfo('You do not have permission to view booking settings.');
          return;
        }

        await loadAndRender({ user, userDoc: currentUserDoc });
      } catch (error) {
        console.error('Booking info: failed to load settings', error);
        showError(error?.message ? `Unable to load booking settings: ${error.message}` : 'Unable to load booking settings.');
      }
    });
  