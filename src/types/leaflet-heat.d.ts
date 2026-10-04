import 'leaflet';

// leaflet.heat ships as a plain browser script with no bundled types. This
// augmentation describes the API it adds to the Leaflet module.
declare module 'leaflet' {
  export interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  export class HeatLayer extends Layer {
    constructor(latlngs: Array<[number, number, number?]>, options?: HeatLayerOptions);
    setLatLngs(latlngs: Array<[number, number, number?]>): this;
    addLatLng(latlng: [number, number, number?]): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  export function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: HeatLayerOptions,
  ): HeatLayer;
}
