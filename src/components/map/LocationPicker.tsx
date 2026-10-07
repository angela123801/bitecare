import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BACOLOD_CENTER, DEFAULT_ZOOM } from '@/config/constants';
import { cn } from '@/lib/utils';
import { isValidLatLng } from '@/lib/geo';
import { AlertCircle, Crosshair, Loader2, MapPin, Trash2 } from 'lucide-react';

export interface LatLngValue {
  lat: number;
  lng: number;
}

const PIN_ICON = L.divIcon({
  className: '',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#0284c7" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="14" cy="14" r="5" fill="#ffffff"/>
  </svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

function MapBridge({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    // The picker lives inside modals that can be laid out after mount; a
    // resize nudge keeps Leaflet's tile grid aligned once it has a real size.
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map, mapRef]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface LocationPickerProps {
  value: LatLngValue | null;
  onChange: (value: LatLngValue | null) => void;
  /** Starting view when no pin has been placed yet. */
  fallbackCenter?: LatLngValue;
  /** When false, the numeric coordinates are hidden from the interface.
   *  The pin is still placed and the coordinates are still saved. */
  showCoordinates?: boolean;
  heightClass?: string;
  className?: string;
}

/**
 * Lets the reporter set the exact incident point three ways: tap/drag on the
 * map, use the device GPS, or type coordinates. The value is always a real
 * coordinate or null — never a placeholder.
 */
export default function LocationPicker({
  value,
  onChange,
  fallbackCenter,
  showCoordinates = true,
  heightClass = 'h-56 sm:h-64',
  className,
}: LocationPickerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [latText, setLatText] = useState(value ? String(value.lat) : '');
  const [lngText, setLngText] = useState(value ? String(value.lng) : '');

  // Keep the text inputs in step when the pin is moved by dragging, GPS or a
  // tap. Typing in the inputs updates `value` too, so the text stays identical.
  useEffect(() => {
    if (value) {
      setLatText(String(value.lat));
      setLngText(String(value.lng));
    }
  }, [value]);

  const center = useMemo<[number, number]>(
    () => (value ? [value.lat, value.lng] : [fallbackCenter?.lat ?? BACOLOD_CENTER.lat, fallbackCenter?.lng ?? BACOLOD_CENTER.lng]),
    // Only the first render's centre matters; later moves are handled by flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const place = (lat: number, lng: number, fly = false) => {
    const next = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    onChange(next);
    if (fly) mapRef.current?.flyTo([next.lat, next.lng], 16, { duration: 0.6 });
  };

  const handleManual = (nextLat: string, nextLng: string) => {
    setLatText(nextLat);
    setLngText(nextLng);
    if (nextLat === '' || nextLng === '') {
      onChange(null);
      return;
    }
    const lat = Number(nextLat);
    const lng = Number(nextLng);
    if (isValidLatLng(lat, lng)) onChange({ lat, lng });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('This device does not support location detection.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place(pos.coords.latitude, pos.coords.longitude, true);
        setLocating(false);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Tap the map to set the spot instead.'
            : 'Could not get your location. Tap the map to set the spot instead.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className={cn('relative rounded-xl overflow-hidden border border-gray-200 z-0', heightClass)}>
        <MapContainer
          center={center}
          zoom={value ? 16 : DEFAULT_ZOOM}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBridge mapRef={mapRef} />
          <ClickToPlace onPick={(lat, lng) => place(lat, lng)} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  place(ll.lat, ll.lng);
                },
              }}
            />
          )}
        </MapContainer>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="absolute top-3 right-3 z-[600] bg-white/95 backdrop-blur rounded-lg px-3 py-2 shadow-md text-sm font-medium text-gray-700 hover:bg-white transition-colors flex items-center gap-2"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin text-primary-600" /> : <Crosshair className="w-4 h-4 text-primary-600" />}
          {locating ? 'Locating…' : 'Use my location'}
        </button>

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setLatText('');
              setLngText('');
            }}
            className="absolute bottom-3 right-3 z-[600] bg-white/95 backdrop-blur rounded-lg p-2 shadow-md text-gray-500 hover:text-danger-600 hover:bg-white transition-colors"
            title="Clear pin"
            aria-label="Clear pin"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 flex items-start gap-1.5">
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
        Tap the map or drag the pin to mark the exact spot. Zoom in for precision.
      </p>

      {showCoordinates && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              className="input-field text-sm py-1.5"
              placeholder="10.684000"
              value={latText}
              onChange={(e) => handleManual(e.target.value, lngText)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              className="input-field text-sm py-1.5"
              placeholder="122.974000"
              value={lngText}
              onChange={(e) => handleManual(latText, e.target.value)}
            />
          </div>
        </div>
      )}

      {value ? (
        <p className="text-xs text-success-700 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {showCoordinates
            ? `Pinned at ${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`
            : 'Incident spot pinned on the map. The exact coordinates are saved privately.'}
        </p>
      ) : (
        <p className="text-xs text-warning-700 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          No location pinned yet.
        </p>
      )}

      {geoError && (
        <p className="text-xs text-danger-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {geoError}
        </p>
      )}
    </div>
  );
}
