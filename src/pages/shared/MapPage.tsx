import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/lib/supabase';
import {
  BACOLOD_CENTER, DEFAULT_ZOOM, FACILITY_TYPE_LABELS,
  ANIMAL_TYPE_LABELS, REPORT_STATUS_LABELS, SEVERITY_LABELS,
} from '@/config/constants';
import { formatDate, cn } from '@/lib/utils';
import { useMapReports, EMPTY_FILTERS, type MapFilters } from '@/lib/mapReports';
import { buildHeatPoints } from '@/lib/heatmap';
import HeatmapLayer from '@/components/map/HeatmapLayer';
import HeatmapLegend from '@/components/map/HeatmapLegend';
import MapControlPanel from '@/components/map/MapControlPanel';
import type { HealthcareFacility, Severity } from '@/types';
import { Loader2, AlertCircle } from 'lucide-react';

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
  veterinary_clinic: '#0f766e',
};

/** Marker tint per severity so the map reads at a glance. */
const SEVERITY_COLORS: Record<Severity, string> = {
  low: '#16a34a',
  moderate: '#f59e0b',
  high: '#f97316',
  critical: '#dc2626',
};

const facilityIconCache: Record<string, L.DivIcon> = {};
function getFacilityIcon(type: string) {
  if (!facilityIconCache[type]) {
    const color = FACILITY_COLORS[type] || '#6b7280';
    facilityIconCache[type] = L.divIcon({
      className: '',
      html: `<div style="width:30px;height:30px;border-radius:8px;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:11px;font-weight:700;">${(FACILITY_TYPE_LABELS[type] || type).charAt(0)}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }
  return facilityIconCache[type];
}

const reportIconCache: Record<string, L.DivIcon> = {};
function getReportIcon(severity: Severity) {
  if (!reportIconCache[severity]) {
    const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.moderate;
    reportIconCache[severity] = L.divIcon({
      className: '',
      html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 21 13 21s13-11.3 13-21C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>
        <circle cx="13" cy="12.5" r="4.5" fill="#ffffff"/>
      </svg>`,
      iconSize: [26, 34],
      iconAnchor: [13, 34],
      popupAnchor: [0, -30],
    });
  }
  return reportIconCache[severity];
}

/** Hands the Leaflet map instance to the parent for the locate action. */
function MapBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

interface BarangayOption {
  id: string;
  name: string;
}

export default function MapPage() {
  const [facilities, setFacilities] = useState<HealthcareFacility[]>([]);
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);

  const mapRef = useRef<L.Map | null>(null);
  const { reports, loading: reportsLoading, error: reportsError } = useMapReports(filters);

  const fetchReference = useCallback(async () => {
    const [facRes, brgyRes] = await Promise.all([
      supabase.from('healthcare_facilities').select('*').eq('is_active', true),
      supabase.from('barangays').select('id, name').order('name'),
    ]);
    if (!facRes.error) setFacilities((facRes.data as HealthcareFacility[]) || []);
    if (!brgyRes.error) setBarangays((brgyRes.data as BarangayOption[]) || []);
  }, []);

  useEffect(() => {
    fetchReference();
  }, [fetchReference]);

  const visibleReports = useMemo(
    () => reports.filter((r) => r.incident_latitude != null && r.incident_longitude != null),
    [reports],
  );

  // Intensity comes from how tightly the filtered reports cluster, so the
  // heatmap always matches the markers the user is currently looking at.
  const heatPoints = useMemo(
    () => buildHeatPoints(visibleReports.map((r) => ({ lat: r.incident_latitude, lng: r.incident_longitude }))),
    [visibleReports],
  );

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setNotice('This device does not support location detection.');
      return;
    }
    setLocating(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 0.6 });
        setLocating(false);
      },
      () => {
        setNotice('Could not get your location. Check location permissions and try again.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const mappedFacilities = facilities.filter((f) => f.latitude != null && f.longitude != null);

  return (
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
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
        <MapBridge onReady={handleMapReady} />

        <HeatmapLayer points={heatPoints} visible={showHeatmap && !reportsLoading} />

        {showFacilities &&
          mappedFacilities.map((f) => (
            <Marker key={f.id} position={[f.latitude, f.longitude]} icon={getFacilityIcon(f.type)}>
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-semibold text-sm text-gray-900">{f.name}</h3>
                  <p className="text-xs text-gray-500">{FACILITY_TYPE_LABELS[f.type] || f.type}</p>
                  {f.address && <p className="text-xs mt-1 text-gray-700">{f.address}</p>}
                  {f.phone && <p className="text-xs text-primary-600 mt-1">{f.phone}</p>}
                  {f.operating_hours && <p className="text-xs text-gray-500 mt-0.5">{f.operating_hours}</p>}
                </div>
              </Popup>
            </Marker>
          ))}

        {showMarkers &&
          visibleReports.map((r) => (
            <Marker
              key={r.id}
              position={[r.incident_latitude, r.incident_longitude]}
              icon={getReportIcon(r.severity)}
            >
              <Popup>
                <div className="min-w-[190px]">
                  <h3 className="font-semibold text-sm text-gray-900">Bite Report</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Category {r.category} &middot; {ANIMAL_TYPE_LABELS[r.animal_type] ?? r.animal_type}
                  </p>
                  {r.incident_location && <p className="text-xs mt-1 text-gray-700">{r.incident_location}</p>}
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(r.bite_date)}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                      {REPORT_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded font-medium text-white"
                      style={{ background: SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.moderate }}
                    >
                      {SEVERITY_LABELS[r.severity] ?? r.severity}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      <MapControlPanel
        open={controlsOpen}
        onOpenChange={setControlsOpen}
        filters={filters}
        onFiltersChange={setFilters}
        barangays={barangays}
        resultCount={visibleReports.length}
        loading={reportsLoading}
        showMarkers={showMarkers}
        showHeatmap={showHeatmap}
        showFacilities={showFacilities}
        onShowMarkersChange={setShowMarkers}
        onShowHeatmapChange={setShowHeatmap}
        onShowFacilitiesChange={setShowFacilities}
        showLegend={showLegend}
        onShowLegendChange={setShowLegend}
        onLocate={handleLocate}
        locating={locating}
      />

      {/* Legend — hidden on small screens when the control sheet is open. */}
      <div
        className={cn(
          'absolute bottom-4 left-3 z-[999] flex flex-col gap-2 overflow-y-auto',
          'max-h-[45vh] sm:max-h-[calc(100%-7rem)]',
          controlsOpen && 'hidden',
        )}
      >
        {showLegend && showHeatmap && <HeatmapLegend />}
        {showLegend && (
          <div className="bg-white/95 backdrop-blur rounded-lg shadow-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Legend</p>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Bite report severity</p>
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: SEVERITY_COLORS[s] }} />
                  <span className="text-xs text-gray-700">{SEVERITY_LABELS[s]}</span>
                </div>
              ))}
              <p className="text-[10px] font-semibold text-gray-400 uppercase pt-1.5">Facilities</p>
              {Object.entries(FACILITY_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded flex-shrink-0" style={{ background: color }} />
                  <span className="text-xs text-gray-700">{FACILITY_TYPE_LABELS[type] || type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {reportsError && (
        <div className="absolute z-[1002] top-16 left-3 right-3 sm:top-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {reportsError}
        </div>
      )}

      {notice && (
        <div className={cn(
          'absolute z-[1002] bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md',
          'bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 shadow-lg flex items-center gap-2',
          controlsOpen && 'hidden sm:flex',
        )}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-warning-500" />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {reportsLoading && (
        <div className="absolute top-3 right-3 z-[999] bg-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
          <span className="text-xs text-gray-600">Loading reports…</span>
        </div>
      )}

      {!reportsLoading && !reportsError && visibleReports.length === 0 && !controlsOpen && (
        <div className="absolute bottom-4 right-3 z-[999] max-w-[15rem] bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2">
          <p className="text-xs text-gray-600">
            No mapped reports match the current filters. Reports need a pinned location to appear here.
          </p>
        </div>
      )}
    </div>
  );
}
