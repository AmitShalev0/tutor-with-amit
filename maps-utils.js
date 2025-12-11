let mapsLoaderPromise = null;

async function fetchMapsConfigWithFallback() {
  const endpoints = [
    '/config/google-maps-key.json',
    '/config/google-maps-key.example.json'
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Config request failed (${response.status})`);
      }
      const json = await response.json();
      if (json && json.apiKey) {
        return json.apiKey;
      }
    } catch (error) {
      console.warn(`[maps-utils] Unable to load config from ${url}:`, error.message);
    }
  }

  throw new Error('Unable to read Google Maps key configuration.');
}

function injectGoogleMapsScript(apiKey, params = {}) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('Google Maps API key is missing.')); // eslint-disable-line prefer-promise-reject-errors
      return;
    }

    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }

    const script = document.createElement('script');
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('libraries', params.libraries || 'places');
    if (params.language) {
      url.searchParams.set('language', params.language);
    }
    if (params.region) {
      url.searchParams.set('region', params.region);
    }
    script.src = url.toString();
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = (error) => reject(error);
    document.head.appendChild(script);
  });
}

export function loadGoogleMapsApi(options = {}) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps API can only be loaded in the browser.'));
  }

  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (!mapsLoaderPromise) {
    mapsLoaderPromise = fetchMapsConfigWithFallback()
      .then((apiKey) => injectGoogleMapsScript(apiKey, options));
  }

  return mapsLoaderPromise;
}

/**
 * Compute great-circle distance between two coordinates in kilometres using the Haversine formula.
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} target
 */
export function haversineDistanceKm(origin, target) {
  if (!origin || !target) {
    return Number.POSITIVE_INFINITY;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(target.lat - origin.lat);
  const dLng = toRadians(target.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(target.lat);

  const a = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/**
 * Determine if the student is inside the tutor's travel radius.
 * @param {{ lat: number, lng: number }} student
 * @param {{ lat: number, lng: number }} tutor
 * @param {number} travelRadiusKm
 */
export function isWithinTravelRadius(student, tutor, travelRadiusKm) {
  if (!Number.isFinite(travelRadiusKm) || travelRadiusKm <= 0) {
    return false;
  }
  const distance = haversineDistanceKm(student, tutor);
  return distance <= travelRadiusKm;
}

/**
 * Normalize a viewport object from Google Places geometry into north/south/east/west bounds.
 * Accepts { northeast: { lat, lng }, southwest: { lat, lng } } or { north, south, east, west }.
 */
export function normalizeViewport(viewport) {
  if (!viewport) return null;

  const hasCorners = viewport.northeast && viewport.southwest;
  const north = hasCorners ? viewport.northeast.lat : viewport.north;
  const south = hasCorners ? viewport.southwest.lat : viewport.south;
  const east = hasCorners ? viewport.northeast.lng : viewport.east;
  const west = hasCorners ? viewport.southwest.lng : viewport.west;

  if (![north, south, east, west].every(Number.isFinite)) {
    return null;
  }

  return { north, south, east, west };
}

/**
 * Convert a normalized viewport into a rectangle path usable by google.maps.Polygon.
 */
export function viewportToRectanglePath(viewport) {
  const bounds = normalizeViewport(viewport);
  if (!bounds) return null;
  const { north, south, east, west } = bounds;
  return [
    { lat: north, lng: west },
    { lat: north, lng: east },
    { lat: south, lng: east },
    { lat: south, lng: west }
  ];
}

function parseNumberList(raw) {
  if (Array.isArray(raw)) return raw.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (typeof raw === 'number') return [raw];
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((v) => Number.isFinite(v));
}

/**
 * Parse and validate travel zone breakpoints (in km). Returns sorted unique values within the max radius.
 */
export function parseTravelZoneBreaks(rawValue, maxRadiusKm) {
  const errors = [];
  const numbers = parseNumberList(rawValue)
    .map((v) => Math.max(0, v))
    .filter((v) => v > 0);

  if (!numbers.length) {
    return { value: [], errors: [] };
  }

  const seen = new Set();
  const filtered = numbers
    .map((n) => Number(n.toFixed(2)))
    .filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .sort((a, b) => a - b);

  const withinRadius = typeof maxRadiusKm === 'number' && Number.isFinite(maxRadiusKm)
    ? filtered.filter((n) => n <= maxRadiusKm)
    : filtered;

  if (withinRadius.length !== filtered.length && maxRadiusKm !== undefined) {
    errors.push('Some travel zone breaks were above the travel radius and were ignored.');
  }

  return { value: withinRadius, errors };
}

function normalizeLatLng(raw) {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function normalizeRadiusPricing(rawPricing, travelRadiusKm) {
  if (!Array.isArray(rawPricing)) return [];
  return rawPricing
    .map((entry) => ({
      upToKm: Number(entry?.upToKm ?? entry?.upTo ?? entry?.radius),
      priceDelta: Number(entry?.priceDelta ?? entry?.delta ?? entry?.adjustment ?? 0),
      label: typeof entry?.label === 'string' ? entry.label.trim() : null
    }))
    .filter((entry) => Number.isFinite(entry.upToKm))
    .map((entry) => ({ ...entry, upToKm: Math.min(Math.max(entry.upToKm, 0), travelRadiusKm || entry.upToKm) }))
    .sort((a, b) => a.upToKm - b.upToKm);
}

/**
 * Normalize a tutor location object into a consistent shape.
 */
export function normalizeTutorLocation(raw = {}) {
  const travelRadiusKm = Number(raw.travelRadiusKm ?? raw.radiusKm ?? raw.travelRadius ?? 0) || 0;
  const basePlace = raw.basePlace || raw.place || raw.location || null;
  const placeLocation = normalizeLatLng(basePlace?.location || raw.location);
  const viewport = normalizeViewport(basePlace?.viewport || raw.viewport);

  const { value: travelZoneBreaksKm } = parseTravelZoneBreaks(raw.travelZoneBreaksKm ?? raw.travelZones ?? [], travelRadiusKm || undefined);
  const radiusPricing = normalizeRadiusPricing(raw.radiusPricing || [], travelRadiusKm || 0);

  return {
    basePlace: basePlace
      ? {
          placeId: basePlace.placeId || basePlace.id || null,
          name: basePlace.name || null,
          primaryType: basePlace.primaryType || basePlace.type || null,
          formattedAddress: basePlace.formattedAddress || basePlace.address || basePlace.description || null,
          mapsUrl: basePlace.mapsUrl || null,
          location: placeLocation,
          viewport
        }
      : null,
    displayLocationLabel: raw.displayLocationLabel || raw.displayAddress || raw.label || null,
    travelRadiusKm,
    travelZoneBreaksKm,
    radiusPricing,
    updatedAt: raw.updatedAt || null
  };
}
