import { useState } from 'react';
import { FACILITY_COLORS } from '@/lib/mapColors';
import { formatDistance, formatDuration, bearingDegrees, distanceKm } from '@/lib/geo';
import { TRAVEL_MODE_LABELS, type GeocodeResult, type RouteResult, type TravelMode } from '@/lib/directions';
import type { LatLng } from '@/lib/geo';
import type { MapFacility } from '@/lib/facilities';
import {
  AlertCircle, ArrowUp, Bike, Car, Footprints, Loader2, MapPin,
  Navigation, RotateCcw, Search, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DirectionsPanelProps {
  facility: MapFacility;
  origin: LatLng | null;
  originLabel: string;
  locating: boolean;
  locationError: string;
  onUseMyLocation: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchResults: GeocodeResult[];
  searching: boolean;
  onSelectSearchResult: (result: GeocodeResult) => void;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  route: RouteResult | null;
  routing: boolean;
  routeError: string;
  onRetryRoute: () => void;
  onEndRoute: () => void;
  onOpenExternal: () => void;
}

const MODES: { value: TravelMode; icon: React.ElementType }[] = [
  { value: 'driving', icon: Car },
  { value: 'walking', icon: Footprints },
  { value: 'cycling', icon: Bike },
];

/**
 * Step-by-step directions from the user's chosen starting point to the selected
 * facility. The distance and time come from a real routing service; the route is
 * drawn on the map by the parent. Google Maps is offered for spoken turn-by-turn.
 */
export default function DirectionsPanel({
  facility,
  origin,
  originLabel,
  locating,
  locationError,
  onUseMyLocation,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searching,
  onSelectSearchResult,
  mode,
  onModeChange,
  route,
  routing,
  routeError,
  onRetryRoute,
  onEndRoute,
  onOpenExternal,
}: DirectionsPanelProps) {
  const [showSearch, setShowSearch] = useState(false);
  const color = FACILITY_COLORS[facility.type] ?? '#6b7280';
  const destination = { lat: facility.latitude, lng: facility.longitude };
  const bearing = origin ? Math.round(bearingDegrees(origin, destination)) : null;

  return (
    <div className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-gray-100 w-full sm:w-[21rem] max-w-[calc(100vw-1.5rem)] flex flex-col overflow-hidden">
      <div className="flex items-start gap-3 p-3.5 border-b border-gray-100">
        <span className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
          <Navigation className="w-4 h-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900">Directions</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">To {facility.name}</p>
        </div>
        <button
          type="button"
          onClick={onEndRoute}
          aria-label="Close directions"
          className="p-1.5 -mt-0.5 -mr-0.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3.5 py-3 space-y-3 overflow-y-auto max-h-[52vh]">
        {/* Starting point */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Starting from</p>

          {origin ? (
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800 break-words">{originLabel}</p>
                <p className="text-[10px] text-gray-500 font-mono">
                  {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Choose a starting point to see the route and travel time.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onUseMyLocation}
              disabled={locating}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5 text-primary-600" />}
              {locating ? 'Locating…' : 'Use my current location'}
            </button>
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors',
                showSearch
                  ? 'border-primary-200 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50',
              )}
            >
              <Search className="w-3.5 h-3.5" /> Enter a place
            </button>
          </div>

          {showSearch && (
            <div className="space-y-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="e.g. SM City Bacolod, Villamonte"
                className="input-field text-sm py-1.5"
                aria-label="Starting point"
              />
              {searching && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                </p>
              )}
              {!searching && searchQuery.trim().length >= 3 && searchResults.length === 0 && (
                <p className="text-xs text-gray-500">
                  No matching places found. Try a landmark, street or barangay.
                </p>
              )}
              {searchResults.length > 0 && (
                <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {searchResults.map((r) => (
                    <li key={`${r.lat},${r.lng},${r.label}`}>
                      <button
                        type="button"
                        onClick={() => onSelectSearchResult(r)}
                        className="w-full text-left px-2.5 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                          <span className="min-w-0">{r.label}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {locationError && (
            <p className="text-xs text-danger-600 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {locationError}
            </p>
          )}
        </div>

        {/* Travel mode */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Travel mode</p>
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
            {MODES.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onModeChange(value)}
                aria-pressed={mode === value}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
                  mode === value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {TRAVEL_MODE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        {routing && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-600" /> Finding the best route…
          </p>
        )}

        {routeError && !routing && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 px-2.5 py-2 space-y-1.5">
            <p className="text-xs text-danger-700 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {routeError}
            </p>
            {origin && (
              <button
                type="button"
                onClick={onRetryRoute}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                <RotateCcw className="w-3 h-3" /> Try again
              </button>
            )}
          </div>
        )}

        {route && !routing && !routeError && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-gray-200">
              <div className="px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Distance</p>
                <p className="text-base font-bold text-gray-900">{formatDistance(route.distance / 1000)}</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Est. travel time
                </p>
                <p className="text-base font-bold text-gray-900">{formatDuration(route.duration)}</p>
              </div>
            </div>
            {bearing != null && (
              <div className="px-3 py-2 border-t border-gray-200 flex items-center gap-2 bg-gray-50">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}1a` }}
                >
                  <ArrowUp
                    className="w-3.5 h-3.5"
                    style={{ color, transform: `rotate(${bearing}deg)` }}
                  />
                </span>
                <p className="text-xs text-gray-600">
                  Head roughly {bearing}° from your starting point
                </p>
              </div>
            )}
            <div className="px-3 py-2 border-t border-gray-200">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Straight-line distance {formatDistance(distanceKm(origin!, destination))} · route
                drawn on the map
              </p>
            </div>
          </div>
        )}

        {!origin && (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 leading-relaxed">
            The route is calculated on this device's request only. BiteCare does not store your
            location.
          </p>
        )}
      </div>

      <div className="p-3.5 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenExternal}
          className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5"
        >
          <Navigation className="w-4 h-4" /> Open in Google Maps
        </button>
        <button
          type="button"
          onClick={onEndRoute}
          className="btn-secondary py-2.5 px-3 flex-shrink-0"
        >
          End
        </button>
      </div>
    </div>
  );
}
