// Import order matters: leafletGlobal sets window.L before the plugin runs.
import L from './leafletGlobal';
import 'leaflet.heat';
import type { HeatLayerOptions } from 'leaflet';
import type { HeatLatLng } from './heatmap';

export function createHeatLayer(points: HeatLatLng[], options: HeatLayerOptions): L.HeatLayer {
  return L.heatLayer(points, options);
}
