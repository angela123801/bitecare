import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/lib/supabase';
import {
  BACOLOD_CENTER, DEFAULT_ZOOM, FACILITY_TYPE_LABELS,
  ANIMAL_TYPE_LABELS, REPORT_STATUS_LABELS, SEVERITY_LABELS,
} from '@/config/constants';
import { formatDate, cn } from '@/lib/utils';
import { useMapReports, EMPTY_FILTERS, type MapFilters } from '@/lib/mapReports';
import { useMapFacilities, facilityMatchesQuery, type MapFacility } from '@/lib/facilities';
import { distanceKm, type LatLng } from '@/lib/geo';
import {
  fetchRoute, geocodePlace, getCurrentPosition, externalNavigationUrl,
  type GeocodeResult, type RouteResult, type TravelMode,
} from '@/lib/directions';
import { buildHeatPoints } from '@/lib/heatmap';
import HeatmapLayer from '@/components/map/HeatmapLayer';
import HeatmapLegend from '@/components/map/HeatmapLegend';
import MapLegend from '@/components/map/MapLegend';
import MapControlPanel from '@/components/map/MapControlPanel';
import FacilityDirectoryPanel from '@/components/map/FacilityDirectoryPanel';
import FacilityCard from '@/components/map/FacilityCard';
import DirectionsPanel from '@/components/map/DirectionsPanel';
import { FACILITY_COLORS, SEVERITY_COLORS } from '@/lib/mapColors';
import type { Severity } from '@/types';
import { Loader2, AlertCircle, Menu, X, Building2 } from 'lucide-react';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** The glyph drawn inside each facility marker, per category. */
const FACILITY_GLYPHS: Record<string, string> = {
  animal_bite_center: '<path d="M12 3l7 3v5c0 4.2-2.9 7.6-7 8.6C7.9 18.6 5 15.2 5 11V6l7-3z"/>',
  health_center: '<path d="M12 4v16M4 12h16" stroke="white" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
  hospital: '<path d="M12 4v16M4 12h16" stroke="white" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
};

const facilityIconCache: Record<string, L.DivIcon> = {};
function getFacilityIcon(type: string, selected = false) {
  const key = `${type}:${selected}`;
  if (!facilityIconCache[key]) {
    const color = FACILITY_COLORS[type] || '#6b7280';
    const size = selected ? 38 : 30;
    const glyph = FACILITY_GLYPHS[type] ?? FACILITY_GLYPHS.hospital;
    facilityIconCache[key] = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:9px;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;${selected ? 'outline:3px solid ' + color + '55;' : ''}">
        <svg width="${selected ? 20 : 16}" height="${selected ? 20 : 16}" viewBox="0 0 24 24" fill="white">${glyph}</svg>
      </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
  return facilityIconCache[key];
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

const originIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.25),0 2px 6px rgba(0,0,0,0.3)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Hands the Leaflet map instance to the parent for the locate and fit actions. */
function MapBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

/** Keeps the map sized correctly as overlays open and close. */
function MapResizer({ deps }: { deps: unknown[] }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

interface BarangayOption {
  id: string;
  name: string;
}

export default function MapPage() {
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [densityCollapsed, setDensityCollapsed] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);

  // Facility directory state
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sortByDistance, setSortByDistance] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<MapFacility | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locationError, setLocationError] = useState('');

  // Directions state
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  const [originLocating, setOriginLocating] = useState(false);
  const [originError, setOriginError] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<GeocodeResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');

  const mapRef = useRef<L.Map | null>(null);
  const { reports, loading: reportsLoading, error: reportsError } = useMapReports(filters);
  const { facilities, loading: facilitiesLoading, error: facilitiesError } = useMapFacilities();

  const activeFilters = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  const fetchReference = useCallback(async () => {
    const { data, error } = await supabase.from('barangays').select('id, name').order('name');
    if (!error) setBarangays((data as BarangayOption[]) || []);
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

  // Search + category filter, so the list and the markers stay in sync.
  const filteredFacilities = useMemo(
    () =>
      facilities.filter((f) => {
        if (category && f.type !== category) return false;
        return facilityMatchesQuery(f, query, FACILITY_TYPE_LABELS[f.type] ?? f.type);
      }),
    [facilities, query, category],
  );

  const mappedFacilities = useMemo(
    () => (sortByDistance && userLocation
      ? [...filteredFacilities].sort(
          (a, b) =>
            distanceKm(userLocation, { lat: a.latitude, lng: a.longitude }) -
            distanceKm(userLocation, { lat: b.latitude, lng: b.longitude }),
        )
      : filteredFacilities),
    [filteredFacilities, sortByDistance, userLocation],
  );

  const distanceToSelected = useMemo(
    () =>
      selectedFacility && userLocation
        ? distanceKm(userLocation, { lat: selectedFacility.latitude, lng: selectedFacility.longitude })
        : null,
    [selectedFacility, userLocation],
  );

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);

  const requestLocation = useCallback(async () => {
    setLocating(true);
    setLocationError('');
    try {
      const pos = await getCurrentPosition();
      setUserLocation(pos);
      mapRef.current?.flyTo([pos.lat, pos.lng], 15, { duration: 0.6 });
    } catch (err) {
      const message =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not get your location. Check location permissions and try again.';
      setLocationError(message);
    } finally {
      setLocating(false);
    }
  }, []);

  const handleLocate = useCallback(() => {
    if (navigator.geolocation) {
      requestLocation();
      return;
    }
    setNotice('This device does not support location detection.');
  }, [requestLocation]);

  const selectFacility = useCallback((facility: MapFacility) => {
    setSelectedFacility(facility);
    setDirectionsOpen(false);
    setRoute(null);
    setRouteError('');
    mapRef.current?.flyTo([facility.latitude, facility.longitude], 16, { duration: 0.6 });
  }, []);

  const centerSelected = useCallback(() => {
    if (!selectedFacility) return;
    mapRef.current?.flyTo(
      [selectedFacility.latitude, selectedFacility.longitude],
      17,
      { duration: 0.5 },
    );
  }, [selectedFacility]);

  const runRoute = useCallback(
    async (from: LatLng, to: LatLng, mode: TravelMode) => {
      setRouting(true);
      setRouteError('');
      try {
        setRoute(await fetchRoute(from, to, mode));
      } catch (err) {
        setRoute(null);
        setRouteError(err instanceof Error ? err.message : 'Could not calculate a route.');
      } finally {
        setRouting(false);
      }
    },
    [],
  );

  const handleGetDirections = useCallback(() => {
    if (!selectedFacility) return;
    setDirectionsOpen(true);
    setRoute(null);
    setRouteError('');
    const destination = { lat: selectedFacility.latitude, lng: selectedFacility.longitude };
    if (origin) {
      runRoute(origin, destination, travelMode);
    } else if (userLocation) {
      setOrigin(userLocation);
      setOriginLabel('Your current location');
      runRoute(userLocation, destination, travelMode);
    } else {
      // No starting point yet: ask for one, without blocking the panel.
      setOriginLocating(true);
      setOriginError('');
      getCurrentPosition()
        .then((pos) => {
          setOrigin(pos);
          setOriginLabel('Your current location');
          setUserLocation(pos);
          mapRef.current?.flyTo([pos.lat, pos.lng], 14, { duration: 0.6 });
          return runRoute(pos, destination, travelMode);
        })
        .catch((err) => {
          setOriginError(
            typeof err === 'object' && err && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Could not get your location. Enter a starting point instead.',
          );
        })
        .finally(() => setOriginLocating(false));
    }
  }, [selectedFacility, origin, userLocation, travelMode, runRoute]);

  const handleUseMyLocationForRoute = useCallback(() => {
    if (!selectedFacility) return;
    setOriginLocating(true);
    setOriginError('');
    getCurrentPosition()
      .then((pos) => {
        setOrigin(pos);
        setOriginLabel('Your current location');
        setUserLocation(pos);
        return runRoute(pos, { lat: selectedFacility.latitude, lng: selectedFacility.longitude }, travelMode);
      })
      .catch((err) => {
        setOriginError(
          typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Could not get your location. Enter a starting point instead.',
        );
      })
      .finally(() => setOriginLocating(false));
  }, [selectedFacility, travelMode, runRoute]);

  const handleModeChange = useCallback(
    (mode: TravelMode) => {
      setTravelMode(mode);
      if (selectedFacility && origin) {
        runRoute(origin, { lat: selectedFacility.latitude, lng: selectedFacility.longitude }, mode);
      }
    },
    [selectedFacility, origin, runRoute],
  );

  // Place search for the starting point, debounced so typing stays smooth.
  useEffect(() => {
    if (!directionsOpen) return;
    const q = placeQuery.trim();
    if (q.length < 3) {
      setPlaceResults([]);
      setPlaceSearching(false);
      return;
    }
    let active = true;
    setPlaceSearching(true);
    const timer = setTimeout(() => {
      geocodePlace(q)
        .then((results) => {
          if (active) setPlaceResults(results);
        })
        .catch(() => {
          if (active) setPlaceResults([]);
        })
        .finally(() => {
          if (active) setPlaceSearching(false);
        });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [placeQuery, directionsOpen]);

  const handleSelectPlace = useCallback(
    (result: GeocodeResult) => {
      if (!selectedFacility) return;
      const start = { lat: result.lat, lng: result.lng };
      setOrigin(start);
      setOriginLabel(result.label);
      setPlaceResults([]);
      setPlaceQuery('');
      runRoute(start, { lat: selectedFacility.latitude, lng: selectedFacility.longitude }, travelMode);
    },
    [selectedFacility, travelMode, runRoute],
  );

  const openExternal = useCallback(
    (facility: MapFacility) => {
      const url = externalNavigationUrl(
        { lat: facility.latitude, lng: facility.longitude },
        travelMode,
        origin,
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [travelMode, origin],
  );

  const clearFacilityFilters = useCallback(() => {
    setQuery('');
    setCategory('');
    setSortByDistance(false);
  }, []);

  const endRoute = useCallback(() => {
    setDirectionsOpen(false);
    setRoute(null);
    setRouteError('');
  }, []);

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
        <MapResizer deps={[directoryOpen, directionsOpen, Boolean(selectedFacility)]} />

        <HeatmapLayer points={heatPoints} visible={showHeatmap && !reportsLoading} />

        {showFacilities &&
          mappedFacilities.map((f) => (
            <Marker
              key={f.id}
              position={[f.latitude, f.longitude]}
              icon={getFacilityIcon(f.type, selectedFacility?.id === f.id)}
              eventHandlers={{ click: () => setSelectedFacility(f) }}
            />
          ))}

        {route && route.geometry.length > 1 && (
          <Polyline
            positions={route.geometry}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85, lineCap: 'round' }}
          />
        )}

        {origin && <Marker position={[origin.lat, origin.lng]} icon={originIcon} />}

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
                    Category {r.category} &middot; {r.animal_type === 'other' && r.animal_type_other ? `Others \u2014 ${r.animal_type_other}` : ANIMAL_TYPE_LABELS[r.animal_type] ?? r.animal_type}
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

      {/*
        Left control column. The ☰ toggle, the control sheet, the facility
        directory and the legend stack all live in this one vertical column in
        normal flow, so they can never overlap each other. Only the bottom part
        scrolls, which keeps the ☰ toggle pinned above the control sheet.
      */}
      <div
        className={cn(
          'absolute top-28 left-3 z-[1000] flex flex-col items-start gap-2 w-[17rem] max-w-[calc(100vw-1.5rem)] pointer-events-none sm:top-3',
          // On phones the details/directions card occupies the bottom of the
          // screen, so the control column stops above it instead of hiding behind it.
          selectedFacility || directionsOpen
            ? 'bottom-[calc(16rem+env(safe-area-inset-bottom,0px))] lg:bottom-4'
            : 'bottom-4',
        )}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setControlsOpen((v) => !v)}
            aria-label={controlsOpen ? 'Close map controls' : 'Open map controls'}
            aria-expanded={controlsOpen}
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2.5 shadow-lg',
              'bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors',
              controlsOpen && 'ring-2 ring-primary-500',
            )}
          >
            {controlsOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
            <span className="text-sm font-semibold text-gray-800">Map controls</span>
            {!controlsOpen && activeFilters > 0 && (
              <span className="w-5 h-5 bg-primary-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setDirectoryOpen((v) => !v)}
            aria-label={directoryOpen ? 'Close facility directory' : 'Open facility directory'}
            aria-expanded={directoryOpen}
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2.5 shadow-lg',
              'bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors',
              directoryOpen && 'ring-2 ring-primary-500',
            )}
          >
            <Building2 className="w-5 h-5 text-primary-600" />
            <span className="text-sm font-semibold text-gray-800">Facilities</span>
            {!directoryOpen && facilities.length > 0 && (
              <span className="w-5 h-5 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-full flex items-center justify-center">
                {facilities.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 min-h-0 w-full flex flex-col items-start gap-2 overflow-y-auto pointer-events-none">
          {controlsOpen && (
            <MapControlPanel
              onClose={() => setControlsOpen(false)}
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
          )}

          {directoryOpen && (
            <FacilityDirectoryPanel
              query={query}
              onQueryChange={setQuery}
              category={category}
              onCategoryChange={setCategory}
              sortByDistance={sortByDistance}
              onToggleSort={() => setSortByDistance((v) => !v)}
              onClearFilters={clearFacilityFilters}
              results={mappedFacilities}
              totalCount={facilities.length}
              userLocation={userLocation}
              locating={locating}
              locationError={locationError}
              onUseMyLocation={requestLocation}
              selectedId={selectedFacility?.id ?? null}
              onSelect={selectFacility}
              onClose={() => setDirectoryOpen(false)}
              loading={facilitiesLoading}
              error={facilitiesError}
            />
          )}

          {showLegend && (
            <div className="pointer-events-auto flex-shrink-0 flex flex-col items-start gap-2">
              <MapLegend collapsed={legendCollapsed} onToggle={() => setLegendCollapsed((v) => !v)} />
              {showHeatmap && (
                <HeatmapLegend collapsed={densityCollapsed} onToggle={() => setDensityCollapsed((v) => !v)} />
              )}
            </div>
          )}
        </div>
      </div>

      {/*
        Facility details and directions share one stack in the bottom-right on
        desktop and across the bottom on phones, above the mobile navigation bar.
        Only one of them is ever visible, so they cannot overlap each other.
      */}
      {(selectedFacility || directionsOpen) && (
        <div className="absolute z-[1001] bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 flex flex-col items-stretch gap-2 pointer-events-none lg:bottom-4 lg:left-auto lg:right-4 lg:items-end">
          {directionsOpen && selectedFacility ? (
            <DirectionsPanel
              facility={selectedFacility}
              origin={origin}
              originLabel={originLabel}
              locating={originLocating}
              locationError={originError}
              onUseMyLocation={handleUseMyLocationForRoute}
              searchQuery={placeQuery}
              onSearchQueryChange={setPlaceQuery}
              searchResults={placeResults}
              searching={placeSearching}
              onSelectSearchResult={handleSelectPlace}
              mode={travelMode}
              onModeChange={handleModeChange}
              route={route}
              routing={routing}
              routeError={routeError}
              onRetryRoute={() =>
                origin && runRoute(origin, { lat: selectedFacility.latitude, lng: selectedFacility.longitude }, travelMode)
              }
              onEndRoute={endRoute}
              onOpenExternal={() => openExternal(selectedFacility)}
            />
          ) : selectedFacility ? (
            <FacilityCard
              facility={selectedFacility}
              distanceKm={distanceToSelected}
              onClose={() => setSelectedFacility(null)}
              onDirections={handleGetDirections}
              onCenter={centerSelected}
              onOpenExternal={() => openExternal(selectedFacility)}
            />
          ) : null}
        </div>
      )}

      {/*
        All transient messages live in one stack so they can never overlap each
        other. Top-right on desktop (clear of the top-left controls), and top on
        phones, where the control column starts lower down.
      */}
      <div className="absolute top-3 left-3 right-3 z-[1002] flex flex-col gap-2 pointer-events-none sm:left-auto sm:right-3 sm:max-w-md">
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
          <div className="pointer-events-auto hidden sm:block bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2">
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
