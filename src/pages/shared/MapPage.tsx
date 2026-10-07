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
import MapLegend from '@/components/map/MapLegend';
import MapControlPanel from '@/components/map/MapControlPanel';
import { FACILITY_COLORS, SEVERITY_COLORS } from '@/lib/mapColors';
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
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [densityCollapsed, setDensityCollapsed] = useState(false);
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
    <div className="map-shell relative overflow-hidden">
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

      {/*
        Legend stack. Anchored bottom-left and kept clear of the top-left
        hamburger control and the top-right message stack. Hidden entirely while
        the control sheet is open on phones, where it would be covered anyway.
      */}
      {showLegend && (
        <div
          className={cn(
            'absolute bottom-4 left-3 z-[999] flex flex-col items-start gap-2 pointer-events-none',
            'max-h-[42vh] sm:max-h-[calc(100%-8rem)] overflow-y-auto overflow-x-hidden',
            controlsOpen && 'hidden',
          )}
        >
          <div className="pointer-events-auto">
            <MapLegend collapsed={legendCollapsed} onToggle={() => setLegendCollapsed((v) => !v)} />
          </div>
          {showHeatmap && (
            <div className="pointer-events-auto">
              <HeatmapLegend collapsed={densityCollapsed} onToggle={() => setDensityCollapsed((v) => !v)} />
            </div>
          )}
        </div>
      )}

      {/*
        All transient messages live in one stack so they can never overlap each
        other. Top-right on desktop (clear of the top-left controls), and below
        the controls on phones. The wrapper ignores pointer events so the map
        underneath stays draggable; each card re-enables them.
      */}
      <div className="absolute top-16 left-3 right-3 z-[1002] flex flex-col gap-2 pointer-events-none sm:top-3 sm:left-auto sm:right-3 sm:max-w-md">
        {reportsError && (
          <div className="pointer-events-auto bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {reportsError}
          </div>
        )}

        {reportsLoading && (
          <div className="pointer-events-auto bg-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 self-start sm:self-end">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            <span className="text-xs text-gray-600">Loading reports…</span>
          </div>
        )}

        {!reportsLoading && !reportsError && visibleReports.length === 0 && (
          <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2">
            <p className="text-xs text-gray-600">
              No mapped reports match the current filters. Reports need a pinned location to appear here.
            </p>
          </div>
        )}

        {notice && (
          <div className="pointer-events-auto bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
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
      </div>
    </div>
  );
}
