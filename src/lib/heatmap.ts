/** A heat point: [latitude, longitude, intensity 0..1]. */
export type HeatLatLng = [number, number, number];

export interface HeatPointInput {
  lat: number;
  lng: number;
}

/** Gradient shared by the heat layer and its legend, light -> hot. */
export const HEAT_GRADIENT: Record<number, string> = {
  0.2: '#60a5fa',
  0.4: '#22d3ee',
  0.6: '#facc15',
  0.8: '#fb923c',
  1.0: '#dc2626',
};

// Roughly 440 m per cell at Bacolod's latitude. A report's intensity is derived
// from how many other reports fall in the surrounding 3x3 cells, so dense
// clusters burn hotter than isolated incidents.
const DENSITY_CELL_DEG = 0.004;

export function buildHeatPoints(points: HeatPointInput[]): HeatLatLng[] {
  if (points.length === 0) return [];

  const grid = new Map<string, number>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / DENSITY_CELL_DEG)}:${Math.floor(p.lng / DENSITY_CELL_DEG)}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }

  const counts: number[] = new Array(points.length);
  let maxCount = 1;
  for (let i = 0; i < points.length; i++) {
    const gl = Math.floor(points[i].lat / DENSITY_CELL_DEG);
    const gn = Math.floor(points[i].lng / DENSITY_CELL_DEG);
    let n = 0;
    for (let dl = -1; dl <= 1; dl++) {
      for (let dn = -1; dn <= 1; dn++) {
        n += grid.get(`${gl + dl}:${gn + dn}`) ?? 0;
      }
    }
    counts[i] = n;
    if (n > maxCount) maxCount = n;
  }

  // log1p keeps a single report visible while letting large clusters saturate,
  // instead of one dense hotspot washing out every other area.
  const denom = Math.log1p(Math.max(maxCount, 2));
  const result: HeatLatLng[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    result[i] = [points[i].lat, points[i].lng, Math.log1p(counts[i]) / denom];
  }
  return result;
}
