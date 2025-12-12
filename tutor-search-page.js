    import { loadGoogleMapsApi, normalizeTutorLocation, viewportToRectanglePath } from './maps-utils.js';

    const db = window.firebaseDb;
    const collection = window.firestoreCollection;
    const query = window.firestoreQuery;
    const where = window.firestoreWhere;
    const getDocs = window.firestoreGetDocs;
    const functionsBase = window.firebaseFunctionsBase;
    const auth = window.firebaseAuth;
    const onAuth = window.firebaseOnAuth;
    const docFn = window.firestoreDoc;
    const getDocFn = window.firestoreGetDoc;
    const updateDocFn = window.firestoreUpdateDoc;
    const setDocFn = window.firestoreSetDoc;
    const arrayUnion = window.firestoreArrayUnion;
    const arrayRemove = window.firestoreArrayRemove;

    const searchInput = document.getElementById('search-query');
    const gradeInput = document.getElementById('grade-filter');
    const filterOnline = document.getElementById('filter-online');
    const filterInPerson = document.getElementById('filter-inperson');
    const loadingState = document.getElementById('loading-state');
    const resultsGrid = document.getElementById('tutor-results');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const mapContainer = document.getElementById('tutor-map');
    const mapError = document.getElementById('map-error');
    const mapProfileCard = document.getElementById('map-profile-card');
    const postalSearchInput = document.getElementById('postal-search');
    const postalSearchButton = document.getElementById('postal-search-button');

    let allTutors = [];
    let currentUser = null;
    let favoriteTutorIds = new Set();
    let favoriteButtons = new Map();
    const favoriteMutations = new Set();
    const placeCache = new Map();
    const inflightPlaces = new Map();
    const fallbackCenter = { lat: 51.0447, lng: -114.0719 };
    let defaultCenter = { ...fallbackCenter };
    const mapsApiPromise = loadGoogleMapsApi({ libraries: 'places' });
    let mapsApi = null;
    let map = null;
    let geocoder = null;
    let markers = [];
    let circles = [];
    let polygons = [];
    let lastMapTutors = [];
    const MAX_TRAVEL_RADIUS_KM = 20;

    const userLocationPromise = (async () => {
      if (!('geolocation' in navigator)) return null;
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
      });
    })().then((coords) => {
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        defaultCenter = coords;
        if (map && !lastMapTutors.length) {
          map.setCenter(defaultCenter);
        }
      }
      return coords;
    });

    async function loadUserFavorites(uid) {
      if (!uid || !docFn || !getDocFn) {
        favoriteTutorIds = new Set();
        refreshAllFavoriteButtons();
        return;
      }
      try {
        const userSnap = await getDocFn(docFn(db, 'users', uid));
        if (userSnap.exists()) {
          const data = userSnap.data() || {};
          const ids = Array.isArray(data.favoriteTutorIds) ? data.favoriteTutorIds.filter(Boolean) : [];
          favoriteTutorIds = new Set(ids);
        } else {
          favoriteTutorIds = new Set();
        }
      } catch (error) {
        console.warn('Failed to load favourite tutors', error);
        favoriteTutorIds = new Set();
      }
      refreshAllFavoriteButtons();
    }

    function updateFavoriteButtonState(tutorId) {
      const button = favoriteButtons.get(tutorId);
      if (!button) {
        return;
      }
      const isFavourite = favoriteTutorIds.has(tutorId);
      button.textContent = isFavourite ? '★ Favourite' : '☆ Favourite';
      button.classList.toggle('is-favourite', isFavourite);
      button.disabled = favoriteMutations.has(tutorId);
      button.title = currentUser
        ? (isFavourite ? 'Remove from favourites' : 'Add to favourites')
        : 'Sign in to save favourite tutors';
    }

    function refreshAllFavoriteButtons() {
      favoriteButtons.forEach((_, tutorId) => updateFavoriteButtonState(tutorId));
    }

    function createFavoriteButton(tutorId) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary favorite-btn';
      button.dataset.favoriteBtn = tutorId;
      button.addEventListener('click', () => handleFavoriteClick(tutorId));
      favoriteButtons.set(tutorId, button);
      updateFavoriteButtonState(tutorId);
      return button;
    }

    function handleBookClick(tutorId) {
      const target = tutorId ? `book.html?tutor=${encodeURIComponent(tutorId)}` : 'book.html';
      window.location.href = target;
    }

    async function handleFavoriteClick(tutorId) {
      if (!currentUser) {
        window.location.href = 'login.html';
        return;
      }
      if (favoriteMutations.has(tutorId)) {
        return;
      }

      if (!tutorId) {
        console.warn('Favourite toggle skipped: missing tutorId');
        return;
      }

      if (!docFn || !updateDocFn || !arrayUnion || !arrayRemove) {
        alert('Favourite tutors are unavailable right now. Please try again later.');
        return;
      }

      favoriteMutations.add(tutorId);
      updateFavoriteButtonState(tutorId);

      try {
        const userRef = docFn(db, 'users', currentUser.uid);
        const isFavourite = favoriteTutorIds.has(tutorId);
        const payload = isFavourite
          ? { favoriteTutorIds: arrayRemove(tutorId) }
          : { favoriteTutorIds: arrayUnion(tutorId) };

        // setDoc with merge + arrayUnion/arrayRemove creates the doc if missing and reduces 404 retries
        await setDocFn(userRef, payload, { merge: true });

        if (isFavourite) {
          favoriteTutorIds.delete(tutorId);
        } else {
          favoriteTutorIds.add(tutorId);
        }
      } catch (error) {
        console.error('Unable to update favourite tutors', error);
        alert('Sorry, we could not update your favourites. Please try again.');
      } finally {
        favoriteMutations.delete(tutorId);
        refreshAllFavoriteButtons();
      }
    }

    if (typeof onAuth === 'function' && auth) {
      onAuth(auth, async (user) => {
        currentUser = user || null;
        if (currentUser) {
          await loadUserFavorites(currentUser.uid);
        } else {
          favoriteTutorIds = new Set();
          refreshAllFavoriteButtons();
        }
      });
    }

    function normalize(text) {
      return (text || '').toLowerCase();
    }

    function resolveTutorLocation(tutor) {
      const raw = tutor?.tutorLocation || tutor?.travelInfo || null;

      // If legacy travelInfo has a bare location, wrap it into basePlace for map rendering.
      const withBasePlace = raw && raw.location && !raw.basePlace
        ? {
            ...raw,
            basePlace: {
              location: raw.location,
              formattedAddress: raw.formattedAddress || raw.displayAddress || raw.postalCode || null
            }
          }
        : raw;

      return normalizeTutorLocation(withBasePlace || {});
    }

    function getInitials(text) {
      const source = (text || '').replace(/[^a-zA-Z\s]/g, ' ').trim();
      if (!source) return 'TU';
      const parts = source.split(/\s+/).filter(Boolean);
      const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
      return initials || 'TU';
    }

    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';
        img.onload = () => resolve(img);
        img.onerror = (error) => reject(error);
        img.src = url;
      });
    }

    async function buildMarkerIcon(tutor, mapsApiRef) {
      if (!tutor) return null;

      const sizePx = 64;
      const center = sizePx / 2;
      const radius = center - 2;
      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      const ctx = canvas.getContext('2d');

      const drawInitials = () => {
        ctx.fillStyle = '#0ea5e9';
        ctx.font = 'bold 22px Inter, system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getInitials(tutor.fullName || tutor.headline || 'Tutor'), center, center);
      };

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0ea5e9';
      ctx.stroke();

      const photoUrl = tutor.photoURL || null;
      if (photoUrl) {
        try {
          const img = await loadImage(photoUrl);
          ctx.save();
          ctx.beginPath();
          ctx.arc(center, center, radius - 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, 0, 0, sizePx, sizePx);
          ctx.restore();
        } catch (error) {
          console.warn('Marker photo failed to load, falling back to initials', error);
          drawInitials();
        }
      } else {
        drawInitials();
      }

      return {
        url: canvas.toDataURL('image/png'),
        scaledSize: mapsApiRef ? new mapsApiRef.Size(sizePx, sizePx) : undefined,
        anchor: mapsApiRef ? new mapsApiRef.Point(center, center) : undefined
      };
    }

    function getTutorBaseRate(tutor) {
      const candidates = [
        tutor?.bookingSettings?.baseSessionCost,
        tutor?.baseSessionCost,
        tutor?.baseRate,
        tutor?.rate,
        tutor?.hourlyRate
      ];
      const found = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
      const numeric = Number(found);
      return Number.isFinite(numeric) ? numeric : null;
    }

    function formatCurrency(amount, currency = 'CAD') {
      if (!Number.isFinite(amount)) return null;
      try {
        return new Intl.NumberFormat('en-CA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
      } catch (error) {
        return `$${amount.toFixed(2)}`;
      }
    }

    function hideMapProfileCard() {
      if (!mapProfileCard) return;
      mapProfileCard.innerHTML = '';
      mapProfileCard.hidden = true;
      mapProfileCard.classList.remove('visible');
    }

    function renderMapProfileCard(payload) {
      if (!mapProfileCard || !payload) return;
      const { title, rateHtml, subjectsText, address, profileUrl, tutorId, favoriteText } = payload;
      const avatarHtml = payload.avatarHtml || '';

      mapProfileCard.innerHTML = `
        <div class="card-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="card-avatar">${avatarHtml}</span>
            <div>
              <h3>${title}</h3>
              ${rateHtml || ''}
            </div>
          </div>
          <button type="button" class="card-close" aria-label="Close">×</button>
        </div>
        ${subjectsText ? `<p class="card-meta"><strong>Subjects:</strong> ${subjectsText}</p>` : ''}
        ${address ? `<p class="card-meta">${address}</p>` : ''}
        <div class="card-actions">
          <button type="button" class="btn secondary" data-card-profile="${profileUrl || ''}">View Profile</button>
          <button type="button" class="btn secondary favorite-btn" data-card-fav="${tutorId || ''}">${favoriteText || '☆ Favourite'}</button>
          <button type="button" class="btn primary" data-card-book="${tutorId || ''}">Book Session</button>
        </div>
      `;

      mapProfileCard.hidden = false;
      mapProfileCard.classList.add('visible');
    }

    async function fetchPlaceDetails(placeId) {
      if (!functionsBase || !placeId) {
        return null;
      }
      if (placeCache.has(placeId)) {
        return placeCache.get(placeId);
      }
      if (inflightPlaces.has(placeId)) {
        return inflightPlaces.get(placeId);
      }

      const request = (async () => {
        try {
          const response = await fetch(`${functionsBase}/getPlaceDetails`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ placeId })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.warn('Place lookup failed', placeId, errorText);
            return null;
          }

          const json = await response.json();
          placeCache.set(placeId, json);
          return json;
        } catch (error) {
          console.warn('Place lookup error', placeId, error);
          return null;
        } finally {
          inflightPlaces.delete(placeId);
        }
      })();

      inflightPlaces.set(placeId, request);
      const result = await request;
      if (!placeCache.has(placeId)) {
        placeCache.set(placeId, result);
      }
      return result;
    }

    async function hydratePlacesDetails(tutors) {
      if (!Array.isArray(tutors) || !functionsBase) {
        return;
      }
      const lookups = tutors.map(async (tutor) => {
        const settings = tutor?.placesSettings;
        if (!settings?.enabled || !settings.placeId) {
          return;
        }
        const details = await fetchPlaceDetails(settings.placeId);
        if (details) {
          tutor.placesSettings.lookup = details;
        }
      });
      await Promise.allSettled(lookups);
    }

    function createAvatar(tutor) {
      const avatar = document.createElement('div');
      avatar.className = 'tutor-card-avatar';
      const photoUrl = tutor.photoURL;

      if (photoUrl) {
        const img = document.createElement('img');
        img.src = photoUrl;
        img.alt = `${tutor.fullName || 'Tutor'} profile photo`;
        img.loading = 'lazy';
        avatar.appendChild(img);
      } else {
        const initialsEl = document.createElement('span');
        initialsEl.textContent = getInitials(tutor.fullName || tutor.headline || 'Tutor');
        avatar.appendChild(initialsEl);
      }

      return avatar;
    }

    function sanitizeHomeSlug(slug) {
      if (!slug) {
        return '';
      }
      const cleaned = String(slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      return cleaned;
    }

    function buildTutorHomeUrl(slug) {
      const sanitized = sanitizeHomeSlug(slug);
      if (!sanitized) {
        return 'home.html';
      }
      return `home/${encodeURIComponent(sanitized)}/`;
    }

    function getTutorBioText(tutor) {
      return (tutor?.bio || tutor?.about || '').trim();
    }

    // Returns a trimmed first paragraph for the card dropdown.
    function buildBioPreview(rawBio) {
      if (!rawBio) {
        return '';
      }
      const segments = rawBio
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const source = segments.length ? segments[0] : rawBio;
      if (source.length <= 320) {
        return source;
      }
      const truncated = source.slice(0, 317);
      const lastSpace = truncated.lastIndexOf(' ');
      const safeSlice = lastSpace > 240 ? truncated.slice(0, lastSpace) : truncated;
      return `${safeSlice.trim()}...`;
    }

    function buildBioElementId(tutor) {
      const base = String(tutor?.id || tutor?.slug || Date.now());
      const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '');
      return `tutor-bio-${sanitized || Math.random().toString(36).slice(2)}`;
    }

    function createBioSection(tutor, profileUrl) {
      const wrapper = document.createElement('div');
      wrapper.className = 'tutor-card-bio';
      wrapper.hidden = true;

      const rawBio = getTutorBioText(tutor);
      const preview = buildBioPreview(rawBio);

      const textEl = document.createElement('p');
      textEl.textContent = preview || 'This tutor has not added a biography yet.';
      wrapper.appendChild(textEl);

      if (profileUrl) {
        const readMoreLink = document.createElement('a');
        readMoreLink.href = profileUrl;
        readMoreLink.className = 'read-more-link';
        readMoreLink.textContent = 'Read more';
        wrapper.appendChild(readMoreLink);
      }

      return wrapper;
    }

    function matchesFilter(tutor, filters) {
      const queryMatch = !filters.query || [
        tutor.fullName,
        tutor.headline,
        ...(tutor.subjectsOffered || [])
      ].some((value) => normalize(value).includes(filters.query));

      if (!queryMatch) return false;

      const gradeMatch = !filters.grade || (tutor.gradeLevels || []).some((level) => normalize(level).includes(filters.grade));
      if (!gradeMatch) return false;

      const meetingModes = tutor.meetingModes || {};
      const supportsOnline = meetingModes.online || meetingModes.hybrid;
      const supportsInPerson = meetingModes.inPerson || meetingModes.hybrid;
      if (filters.meeting.online && !supportsOnline) return false;
      if (filters.meeting.inPerson && !supportsInPerson) return false;

      return true;
    }

    function renderTutors(tutors) {
      resultsGrid.innerHTML = '';
      favoriteButtons = new Map();
      tutors.forEach((tutor) => {
        const card = document.createElement('article');
        card.className = 'tutor-card';

        const header = document.createElement('div');
        header.className = 'tutor-card-header';

        header.appendChild(createAvatar(tutor));

        const headerBody = document.createElement('div');
        headerBody.className = 'tutor-card-header-body';

        const title = document.createElement('h2');
        title.textContent = tutor.fullName || 'Tutor';
        headerBody.appendChild(title);

        if (tutor.headline) {
          const headline = document.createElement('p');
          headline.className = 'headline';
          headline.textContent = tutor.headline;
          headerBody.appendChild(headline);
        }

        header.appendChild(headerBody);
        card.appendChild(header);

        const profileSlug = tutor.slug || '';
        const hasProfileSlug = Boolean(profileSlug);
        const publicUrl = hasProfileSlug
          ? buildTutorHomeUrl(profileSlug)
          : 'home.html';

        const bioSection = createBioSection(tutor, hasProfileSlug ? publicUrl : null);
        const bioId = buildBioElementId(tutor);
        bioSection.id = bioId;
        card.appendChild(bioSection);

        header.classList.add('toggleable');
        header.setAttribute('tabindex', '0');
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-controls', bioId);

        const toggleBio = () => {
          const showBio = bioSection.hidden;
          bioSection.hidden = !showBio;
          header.setAttribute('aria-expanded', String(showBio));
          card.classList.toggle('bio-open', showBio);
        };

        header.addEventListener('click', toggleBio);
        header.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleBio();
          }
        });

        const tagRow = document.createElement('div');
        tagRow.className = 'tag-row';

        const meetingModes = tutor.meetingModes || {};
        if (meetingModes.hybrid) {
          const hybridTag = document.createElement('span');
          hybridTag.className = 'tag';
          hybridTag.textContent = 'Online & In person';
          tagRow.appendChild(hybridTag);
        } else {
          if (meetingModes.online) {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = 'Online';
            tagRow.appendChild(tag);
          }
          if (meetingModes.inPerson) {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = 'In person';
            tagRow.appendChild(tag);
          }
        }

        if (tagRow.children.length > 0) {
          card.appendChild(tagRow);
        }

        if (tutor.subjectsOffered?.length) {
          const subjects = document.createElement('p');
          subjects.className = 'detail-text';
          subjects.innerHTML = `<strong>Subjects:</strong> ${tutor.subjectsOffered.join(', ')}`;
          card.appendChild(subjects);
        }

        if (tutor.gradeLevels?.length) {
          const grades = document.createElement('p');
          grades.className = 'detail-text';
          grades.innerHTML = `<strong>Grades:</strong> ${tutor.gradeLevels.join(', ')}`;
          card.appendChild(grades);
        }

        const normalizedLocation = resolveTutorLocation(tutor);
        const locationLabel = normalizedLocation.displayLocationLabel
          || normalizedLocation.basePlace?.formattedAddress
          || tutor.placesSettings?.displayAddress
          || null;
        const locationMapsUrl = normalizedLocation.basePlace?.mapsUrl
          || tutor.placesSettings?.lookup?.mapsUrl
          || null;

        if (locationLabel) {
          const location = document.createElement('p');
          location.className = 'detail-text location-detail';

          const label = document.createElement('strong');
          label.textContent = 'Location:';
          location.appendChild(label);
          location.appendChild(document.createTextNode(` ${locationLabel}`));

          if (locationMapsUrl) {
            location.appendChild(document.createElement('br'));
            const link = document.createElement('a');
            link.href = locationMapsUrl;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'View on Google Maps';
            location.appendChild(link);
          }

          card.appendChild(location);
        }

        const profileLink = document.createElement('button');
        profileLink.type = 'button';
        profileLink.className = 'btn secondary';
        profileLink.textContent = 'View Profile';
        profileLink.addEventListener('click', () => {
          window.location.href = publicUrl;
        });

        const actionRow = document.createElement('div');
        actionRow.className = 'tutor-card-actions';
        actionRow.appendChild(createFavoriteButton(tutor.id));

        const bookButton = document.createElement('button');
        bookButton.type = 'button';
        bookButton.className = 'btn primary';
        bookButton.textContent = 'Book Session';
        bookButton.addEventListener('click', () => handleBookClick(tutor.id));
        actionRow.appendChild(bookButton);

        actionRow.appendChild(profileLink);

        card.appendChild(actionRow);

        resultsGrid.appendChild(card);
      });
      refreshAllFavoriteButtons();
    }

    function applyFilters() {
      const filters = {
        query: normalize(searchInput.value.trim()),
        grade: normalize(gradeInput.value.trim()),
        meeting: {
          online: filterOnline.checked,
          inPerson: filterInPerson.checked
        }
      };

      const filtered = allTutors.filter((tutor) => matchesFilter(tutor, filters));

      const hasResults = filtered.length > 0;
      resultsGrid.hidden = !hasResults;
      emptyState.hidden = hasResults;

      if (hasResults) {
        renderTutors(filtered);
      }

      void renderMap(filtered);
    }

    function clearMapOverlays() {
      markers.forEach((marker) => marker.setMap(null));
      markers = [];
      clearTravelOverlays();
    }

    function clearTravelOverlays() {
      circles.forEach((circle) => circle.setMap(null));
      polygons.forEach((poly) => poly.setMap(null));
      circles = [];
      polygons = [];
    }

    function drawTravelOverlays({ location, position }) {
      if (!mapsApi || !location || !position) return;
      clearTravelOverlays();

      const meetingModes = location.meetingModes || null; // placeholder if needed later
      const travelAllowed = location.travelEnabled !== false;
      const radii = [];
      if (travelAllowed && Array.isArray(location.travelZoneBreaksKm)) {
        radii.push(...location.travelZoneBreaksKm);
      }
      if (travelAllowed && Number.isFinite(location.travelRadiusKm) && location.travelRadiusKm > 0) {
        radii.push(location.travelRadiusKm);
      }
      const sortedRadii = radii
        .filter((r) => Number.isFinite(r) && r > 0)
        .map((r) => Math.min(r, MAX_TRAVEL_RADIUS_KM))
        .sort((a, b) => a - b);

      const palette = ['#22d3ee', '#38bdf8', '#60a5fa', '#a5b4fc'];
      sortedRadii.forEach((radiusKm, index) => {
        const color = palette[index % palette.length];
        const circle = new mapsApi.Circle({
          center: position,
          radius: radiusKm * 1000,
          strokeColor: color,
          strokeOpacity: 0.35,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: Math.max(0.05, 0.18 - index * 0.02),
          map
        });
        circles.push(circle);
      });

      const rectPath = viewportToRectanglePath(location?.basePlace?.viewport);
      if (rectPath) {
        const polygon = new mapsApi.Polygon({
          paths: rectPath,
          strokeColor: '#38bdf8',
          strokeOpacity: 0.4,
          strokeWeight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          map
        });
        polygons.push(polygon);
      }
    }

    async function renderMap(tutors) {
      lastMapTutors = Array.isArray(tutors) ? tutors : [];
      if (!mapContainer) {
        return;
      }
      try {
        if (!mapsApi) {
          mapsApi = await mapsApiPromise;
        }
      } catch (error) {
        mapError.hidden = false;
        mapError.textContent = 'Google Maps failed to load. Check your API key configuration.';
        console.error('Unable to load Google Maps', error);
        return;
      }

      if (!map) {
        map = new mapsApi.Map(mapContainer, {
          center: defaultCenter,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });
        geocoder = new mapsApi.Geocoder();
      }

      clearMapOverlays();
      hideMapProfileCard();

      if (!Array.isArray(tutors) || tutors.length === 0) {
        map.setCenter(defaultCenter);
        map.setZoom(11);
        return;
      }

      const bounds = new mapsApi.LatLngBounds();
      let hasBounds = false;

      for (const tutor of tutors) {
        const location = resolveTutorLocation(tutor);
        const lat = location?.basePlace?.location?.lat;
        const lng = location?.basePlace?.location?.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          continue;
        }

        const position = { lat, lng };
        hasBounds = true;
        bounds.extend(position);

        const markerIcon = await buildMarkerIcon(tutor, mapsApi);
        const marker = new mapsApi.Marker({
          map,
          position,
          title: tutor.fullName || location?.basePlace?.name || 'Tutor',
          icon: markerIcon || undefined
        });
        markers.push(marker);

        const subjects = Array.isArray(location?.subjects) && location.subjects.length
          ? location.subjects
          : (tutor.subjectsOffered || []);
        const address = location?.displayLocationLabel
          || location?.basePlace?.formattedAddress
          || location?.postalCode
          || '';
        const rateAmount = getTutorBaseRate(tutor);
        const rateHtml = Number.isFinite(rateAmount)
          ? `<p style="margin:0 0 6px 0; color:#0f172a; font-weight:600;">From ${formatCurrency(rateAmount, tutor.bookingSettings?.currency || 'CAD')}/hr</p>`
          : '';
        const profileSlug = tutor.slug || '';
        const publicUrl = profileSlug ? buildTutorHomeUrl(profileSlug) : 'home.html';

        const hasPhoto = Boolean(tutor.photoURL);
        const avatarHtml = hasPhoto
          ? `<img src="${tutor.photoURL}" alt="${marker.getTitle()} profile photo" />`
          : getInitials(marker.getTitle());

        marker.addListener('click', () => {
          const isFavourite = tutor.id ? favoriteTutorIds.has(tutor.id) : false;
          const favoriteText = isFavourite ? '★ Favourite' : '☆ Favourite';
          drawTravelOverlays({ location: { ...location, travelEnabled: location.travelEnabled !== false }, position });
          renderMapProfileCard({
            title: marker.getTitle(),
            rateHtml,
            subjectsText: subjects.join(', '),
            address,
            profileUrl: publicUrl,
            tutorId: tutor.id || '',
            favoriteText,
            avatarHtml
          });
        });
      }

      if (hasBounds) {
        map.fitBounds(bounds, 60);
      } else {
        map.setCenter(defaultCenter);
        map.setZoom(11);
      }
    }

    async function centerMapOnPostalCode() {
      const queryValue = postalSearchInput.value.trim();
      if (!queryValue) {
        return;
      }
      try {
        if (!mapsApi) {
          mapsApi = await mapsApiPromise;
        }
        if (!map) {
          await renderMap(allTutors);
        }
        if (!geocoder) {
          geocoder = new mapsApi.Geocoder();
        }
        geocoder.geocode(
          { address: queryValue, componentRestrictions: { country: 'CA' } },
          (results, status) => {
            if (status === 'OK' && results[0]) {
              const result = results[0];
              if (result.geometry.viewport) {
                map.fitBounds(result.geometry.viewport);
              } else if (result.geometry.location) {
                map.setCenter(result.geometry.location);
                map.setZoom(12);
              }
              mapError.hidden = true;
              mapError.textContent = '';
            } else {
              mapError.hidden = false;
              mapError.textContent = 'Sorry, we could not find that postal code. Check the spelling and try again.';
            }
          }
        );
      } catch (error) {
        console.error('Postal code lookup failed', error);
        mapError.hidden = false;
        mapError.textContent = 'Unable to search that location right now. Please try again later.';
      }
    }

    async function loadTutors() {
      if (!db) {
        loadingState.textContent = '';
        errorState.hidden = false;
        errorState.textContent = 'Firestore is not configured. Check firebase-config.js setup.';
        return;
      }
      try {
        const tutorQuery = query(
          collection(db, 'tutorProfiles'),
          where('status', '==', 'published')
        );
        const tutorsCollection = collection(db, 'tutors');

        const [profileSnapshot, locationSnapshot] = await Promise.all([
          getDocs(tutorQuery),
          getDocs(tutorsCollection)
        ]);

        const locationById = new Map();
        locationSnapshot.forEach((docSnap) => {
          locationById.set(docSnap.id, docSnap.data());
        });

        allTutors = profileSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          travelInfo: locationById.get(docSnap.id) || null
        }));
        allTutors.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

        try {
          await hydratePlacesDetails(allTutors);
        } catch (error) {
          console.warn('Failed to hydrate Google Places details', error);
        }

        loadingState.textContent = '';
        loadingState.hidden = true;

        if (allTutors.length === 0) {
          resultsGrid.hidden = true;
          emptyState.hidden = false;
          void renderMap([]);
          return;
        }

        applyFilters();
      } catch (error) {
        console.error('Tutor search load error', error);
        loadingState.textContent = '';
        errorState.hidden = false;
        errorState.textContent = 'Unable to load tutors right now. Please refresh or try again later.';
      }
    }

    [searchInput, gradeInput, filterOnline, filterInPerson]
      .forEach((control) => {
        if (!control) return;
        const handler = () => applyFilters();
        if (control instanceof HTMLInputElement && control.type === 'text') {
          control.addEventListener('input', handler);
        } else {
          control.addEventListener('change', handler);
        }
      });

    if (postalSearchButton) {
      postalSearchButton.addEventListener('click', () => {
        void centerMapOnPostalCode();
      });
    }

    if (postalSearchInput) {
      postalSearchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void centerMapOnPostalCode();
        }
      });
    }

    if (mapProfileCard) {
      mapProfileCard.addEventListener('click', (event) => {
        const closeBtn = event.target.closest('.card-close');
        if (closeBtn) {
          hideMapProfileCard();
          clearTravelOverlays();
          return;
        }

        const profileBtn = event.target.closest('[data-card-profile]');
        if (profileBtn) {
          const url = profileBtn.dataset.cardProfile;
          if (url) {
            window.location.href = url;
          }
          return;
        }

        const favBtn = event.target.closest('[data-card-fav]');
        if (favBtn) {
          const tutorId = favBtn.dataset.cardFav;
          if (tutorId) {
            void handleFavoriteClick(tutorId);
          }
          return;
        }

        const bookBtn = event.target.closest('[data-card-book]');
        if (bookBtn) {
          const tutorId = bookBtn.dataset.cardBook;
          handleBookClick(tutorId);
        }
      });
    }

    loadTutors();
  