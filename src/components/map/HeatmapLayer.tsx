import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { createHeatLayer } from '@/lib/leafletHeat';
import { HEAT_GRADIENT, type HeatLatLng } from '@/lib/heatmap';

interface HeatmapLayerProps {
  points: HeatLatLng[];
  visible: boolean;
}

export default function HeatmapLayer({ points, visible }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<ReturnType<typeof createHeatLayer> | null>(null);

  // Create/destroy the layer as visibility changes.
  useEffect(() => {
    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    if (!layerRef.current) {
      layerRef.current = createHeatLayer(points, {
        radius: 32,
        blur: 22,
        maxZoom: 17,
        minOpacity: 0.3,
        gradient: HEAT_GRADIENT,
      });
      layerRef.current.addTo(map);
    } else {
      layerRef.current.setLatLngs(points);
    }
  }, [map, visible, points]);

  // Clean up if the map unmounts while the layer is attached.
  useEffect(() => {
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  return null;
}
