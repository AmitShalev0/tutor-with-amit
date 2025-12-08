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
