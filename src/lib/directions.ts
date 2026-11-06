import type { LatLng } from '@/lib/geo';

export type TravelMode = 'driving' | 'walking' | 'cycling';

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  driving: 'Drive',
  walking: 'Walk',
  cycling: 'Bicycle',
};

export interface RouteResult {
  distance: number;
  duration: number;
  geometry: [number, number][];
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facility-geo`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Reads the error message the edge function returned, if there is one. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Fall through to the generic message below.
  }
  return fallback;
}

/**
 * Asks the server for a real route between two points. The geometry is a list of
 * [lat, lng] pairs ready to draw on the map.
 */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
): Promise<RouteResult> {
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}?action=route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ from, to, profile: mode }),
    });
  } catch {
    throw new Error('Could not reach the routing service. Check your connection and try again.');
  }

  if (!res.ok) {
    throw new Error(await readError(res, 'No route could be found to this facility.'));
  }

  const data = await res.json();
  if (typeof data?.distance !== 'number' || !Array.isArray(data?.geometry)) {
    throw new Error('The routing service returned an unexpected response.');
  }
  return {
    distance: data.distance,
    duration: Number(data.duration) || 0,
    geometry: data.geometry as [number, number][],
  };
}

/** Looks up a typed place or address and returns matching coordinates. */
export async function geocodePlace(query: string): Promise<GeocodeResult[]> {
  const url = `${FUNCTIONS_URL}?action=search&q=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${ANON_KEY}` } });
  } catch {
    throw new Error('Could not reach the address lookup service. Check your connection and try again.');
  }

  if (!res.ok) {
    throw new Error(await readError(res, 'Address lookup is unavailable right now.'));
  }

  const data = await res.json();
  return Array.isArray(data?.results) ? (data.results as GeocodeResult[]) : [];
}

/** Google Maps travel modes, which differ from our own labels. */
const EXTERNAL_MODES: Record<TravelMode, string> = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'bicycling',
};

/**
 * Opens the route in Google Maps. This is the escape hatch when a user wants
 * turn-by-turn guidance, which an embedded map cannot provide.
 */
export function externalNavigationUrl(
  destination: LatLng,
  mode: TravelMode,
  origin?: LatLng | null,
): string {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('travelmode', EXTERNAL_MODES[mode]);
  if (origin) url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  return url.toString();
}

export interface LocationFailure {
  code: 'unsupported' | 'denied' | 'unavailable' | 'timeout';
  message: string;
}

/** Wraps the geolocation callback API in a promise with plain-language errors. */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({
        code: 'unsupported',
        message: 'This device does not support location detection. Enter a starting point instead.',
      } satisfies LocationFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const failure: LocationFailure =
          err.code === err.PERMISSION_DENIED
            ? {
                code: 'denied',
                message:
                  'Location permission was denied. Allow location access, or enter a starting point instead.',
              }
            : err.code === err.TIMEOUT
              ? {
                  code: 'timeout',
                  message: 'Getting your location took too long. Try again, or enter a starting point.',
                }
              : {
                  code: 'unavailable',
                  message: 'Your location is unavailable right now. Enter a starting point instead.',
                };
        reject(failure);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
