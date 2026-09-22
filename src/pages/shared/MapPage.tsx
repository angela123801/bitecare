import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/lib/supabase';
import { BACOLOD_CENTER, DEFAULT_ZOOM, FACILITY_TYPE_LABELS } from '@/config/constants';
import { formatDate } from '@/lib/utils';
import type { HealthcareFacility, BiteReport } from '@/types';
import { Loader2, LocateFixed, Layers, X } from 'lucide-react';

// Fix default Leaflet icon issue
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const FACILITY_COLORS: Record<string, string> = {
  hospital: '#dc2626',
  health_center: '#2563eb',
  animal_bite_center: '#d97706',
  vaccination_center: '#16a34a',
  veterinary_clinic: '#7c3aed',
};

const facilityIconCache: Record<string, L.DivIcon> = {};
function getFacilityIcon(type: string) {
  if (!facilityIconCache[type]) {
    const color = FACILITY_COLORS[type] || '#6b7280';
    facilityIconCache[type] = L.divIcon({
      className: '',
      html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:11px;font-weight:700;">${(FACILITY_TYPE_LABELS[type] || type).charAt(0)}</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
  return facilityIconCache[type];
}

let biteIconInstance: L.DivIcon | null = null;
function getBiteIcon() {
  if (!biteIconInstance) {
    biteIconInstance = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="font-size:14px;">🐾</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  return biteIconInstance;
}

function LocateButton() {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 15);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <button
      onClick={handleLocate}
      title="My location"
      className="absolute top-4 right-4 z-[1000] bg-white rounded-lg p-2.5 shadow-lg hover:bg-gray-50 transition-colors"
    >
      {locating ? <Loader2 className="w-5 h-5 animate-spin text-primary-600" /> : <LocateFixed className="w-5 h-5 text-gray-700" />}
    </button>
  );
}

export default function MapPage() {
  const [facilities, setFacilities] = useState<HealthcareFacility[]>([]);
  const [reports, setReports] = useState<BiteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFacilities, setShowFacilities] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [showLayers, setShowLayers] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [facRes, repRes] = await Promise.all([
        supabase.from('healthcare_facilities').select('*').eq('is_active', true),
        supabase.from('bite_reports').select('id, category, animal_type, incident_location, incident_latitude, incident_longitude, bite_date, status').not('incident_latitude', 'is', null).not('incident_longitude', 'is', null),
      ]);
      if (facRes.error) throw facRes.error;
      if (repRes.error) throw repRes.error;
      setFacilities((facRes.data as HealthcareFacility[]) || []);
      setReports((repRes.data as BiteReport[]) || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-danger-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)]">
      <MapContainer
        center={[BACOLOD_CENTER.lat, BACOLOD_CENTER.lng]}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocateButton />

        {showFacilities &&
          facilities.map((f) => (
            <Marker key={f.id} position={[f.latitude, f.longitude]} icon={getFacilityIcon(f.type)}>
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-semibold text-sm">{f.name}</h3>
                  <p className="text-xs text-gray-500">{FACILITY_TYPE_LABELS[f.type] || f.type}</p>
                  <p className="text-xs mt-1">{f.address}</p>
                  {f.phone && <p className="text-xs text-primary-600 mt-1">📞 {f.phone}</p>}
                  {f.operating_hours && <p className="text-xs text-gray-500 mt-0.5">🕐 {f.operating_hours}</p>}
                </div>
              </Popup>
            </Marker>
          ))}

        {showReports &&
          reports.map((r) =>
            r.incident_latitude && r.incident_longitude ? (
              <Marker key={r.id} position={[r.incident_latitude, r.incident_longitude]} icon={getBiteIcon()}>
                <Popup>
                  <div className="min-w-[180px]">
                    <h3 className="font-semibold text-sm">Bite Report</h3>
                    <p className="text-xs text-gray-500">Category {r.category} • {r.animal_type}</p>
                    <p className="text-xs mt-1">{r.incident_location}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(r.bite_date)}</p>
                    <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{r.status}</span>
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}
      </MapContainer>

      {/* Layer Toggle */}
      <div className="absolute top-4 left-4 z-[1000]">
        <button
          onClick={() => setShowLayers(!showLayers)}
          className="bg-white rounded-lg p-2.5 shadow-lg hover:bg-gray-50 transition-colors"
        >
          {showLayers ? <X className="w-5 h-5 text-gray-700" /> : <Layers className="w-5 h-5 text-gray-700" />}
        </button>

        {showLayers && (
          <div className="mt-2 bg-white rounded-lg shadow-lg p-3 min-w-[180px]">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Layers</p>
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input type="checkbox" checked={showFacilities} onChange={() => setShowFacilities(!showFacilities)} className="rounded text-primary-600" />
              <span className="text-sm text-gray-700">Facilities</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input type="checkbox" checked={showReports} onChange={() => setShowReports(!showReports)} className="rounded text-primary-600" />
              <span className="text-sm text-gray-700">Bite Reports</span>
            </label>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-lg p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Legend</p>
        <div className="space-y-1.5">
          {Object.entries(FACILITY_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs text-gray-700">{FACILITY_TYPE_LABELS[type] || type}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0 bg-red-500" />
            <span className="text-xs text-gray-700">🐾 Bite Report</span>
          </div>
        </div>
      </div>
    </div>
  );
}
