import { useMemo } from 'react';
import { FACILITY_COLORS } from '@/lib/mapColors';
import {
  FACILITY_CATEGORY_FILTERS,
  FACILITY_TYPE_LABELS,
} from '@/config/constants';
import { distanceKm, formatDistance, type LatLng } from '@/lib/geo';
import type { MapFacility } from '@/lib/facilities';
import {
  AlertCircle, ArrowDownWideNarrow, Building2, Inbox, Loader2, MapPin,
  Navigation, RotateCcw, Search, ShieldAlert, ShieldCheck, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FacilityDirectoryPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  sortByDistance: boolean;
  onToggleSort: () => void;
  onClearFilters: () => void;
  results: MapFacility[];
  totalCount: number;
  userLocation: LatLng | null;
  locating: boolean;
  locationError: string;
  onUseMyLocation: () => void;
  selectedId: string | null;
  onSelect: (facility: MapFacility) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}

function withDistance(facilities: MapFacility[], origin: LatLng | null) {
  return facilities.map((facility) => ({
    facility,
    distance:
      origin == null
        ? null
        : distanceKm(origin, { lat: facility.latitude, lng: facility.longitude }),
  }));
}

function FacilityRow({
  facility,
  distance,
  selected,
  onSelect,
}: {
  facility: MapFacility;
  distance: number | null;
  selected: boolean;
  onSelect: (facility: MapFacility) => void;
}) {
  const color = FACILITY_COLORS[facility.type] ?? '#6b7280';
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(facility)}
        className={cn(
          'w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2.5',
          selected ? 'bg-primary-50' : 'hover:bg-gray-50',
        )}
      >
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${color}1a` }}
        >
          <Building2 className="w-3.5 h-3.5" style={{ color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gray-900 leading-snug">
            {facility.name}
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5 truncate">
            {FACILITY_TYPE_LABELS[facility.type] ?? facility.type}
            {facility.barangayName ? ` · ${facility.barangayName}` : ''}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 mt-1">
            {facility.isAbtc && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-danger-50 text-danger-700">
                <ShieldCheck className="w-2.5 h-2.5" /> ABTC
              </span>
            )}
            {facility.verification === 'needs_review' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning-50 text-warning-800">
                <ShieldAlert className="w-2.5 h-2.5" /> Needs review
              </span>
            )}
            {distance != null && (
              <span className="text-[10px] font-semibold text-gray-600">
                {formatDistance(distance)} away
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The facility directory: search, category filters, the nearest facility of each
 * category, and the full sorted list. Every row selects the same facility the map
 * markers use, so the list and the map never disagree.
 */
export default function FacilityDirectoryPanel({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  sortByDistance,
  onToggleSort,
  onClearFilters,
  results,
  totalCount,
  userLocation,
  locating,
  locationError,
  onUseMyLocation,
  selectedId,
  onSelect,
  onClose,
  loading,
  error,
}: FacilityDirectoryPanelProps) {
  const rows = useMemo(() => withDistance(results, userLocation), [results, userLocation]);

  // The nearest facility in each category, so a user can see at a glance which
  // hospital, health center and animal bite center is closest to them.
  const nearest = useMemo(() => {
    if (!userLocation) return [];
    return FACILITY_CATEGORY_FILTERS.filter((c) => c.value).map((c) => {
      const inCategory = rows
        .filter((r) => r.facility.type === c.value && r.distance != null)
        .sort((a, b) => (a.distance as number) - (b.distance as number));
      return inCategory[0] ? { label: c.label, ...inCategory[0] } : null;
    }).filter((n): n is { label: string; facility: MapFacility; distance: number } => n !== null);
  }, [rows, userLocation]);

  const filtersActive = Boolean(query.trim() || category);

  return (
    <div className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-gray-100 w-[17rem] max-w-[calc(100vw-1.5rem)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-sm font-bold text-gray-900">Facilities</h2>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close facility directory"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Name, barangay or address"
            aria-label="Search facilities"
            className="input-field text-sm py-1.5 pl-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FACILITY_CATEGORY_FILTERS.map((c) => (
            <button
              key={c.value || 'all'}
              type="button"
              onClick={() => onCategoryChange(c.value)}
              aria-pressed={category === c.value}
              className={cn(
                'text-[11px] font-semibold px-2 py-1 rounded-full border transition-colors',
                category === c.value
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={locating}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3 text-primary-600" />}
            {locating ? 'Locating…' : userLocation ? 'Update my location' : 'Near me'}
          </button>
          <button
            type="button"
            onClick={onToggleSort}
            disabled={!userLocation}
            aria-pressed={sortByDistance}
            title={userLocation ? 'Sort by distance' : 'Enable location to sort by distance'}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              sortByDistance
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50',
            )}
          >
            <ArrowDownWideNarrow className="w-3 h-3" /> Nearest
          </button>
        </div>

        {locationError && (
          <p className="text-[11px] text-danger-600 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            {locationError}
          </p>
        )}
      </div>

      <div className="overflow-y-auto max-h-[38vh] sm:max-h-[46vh]">
        {error && (
          <p className="m-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-xs px-2.5 py-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {error}
          </p>
        )}

        {loading && !error && (
          <p className="m-3 text-xs text-gray-500 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-600" /> Loading facilities…
          </p>
        )}

        {!loading && !error && nearest.length > 0 && !filtersActive && (
          <div className="border-b border-gray-100">
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Nearest to you
            </p>
            <ul className="divide-y divide-gray-100">
              {nearest.map((n) => (
                <li key={`nearest-${n.facility.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(n.facility)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <span className="block text-[10px] font-semibold text-primary-600 uppercase tracking-wide">
                      Nearest {n.label.replace(/s$/, '')}
                    </span>
                    <span className="block text-xs font-semibold text-gray-900 truncate">
                      {n.facility.name}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {formatDistance(n.distance)} away
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && !error && (
          <>
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              {filtersActive
                ? `${rows.length} of ${totalCount} facilities`
                : `${rows.length} facilit${rows.length === 1 ? 'y' : 'ies'}`}
            </p>

            {rows.length === 0 ? (
              <div className="px-3 pb-4 pt-2 text-center">
                <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">
                  No facilities match your search.
                </p>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    Show all facilities
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map(({ facility, distance }) => (
                  <FacilityRow
                    key={facility.id}
                    facility={facility}
                    distance={distance}
                    selected={facility.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <p className="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex items-start gap-1.5 flex-shrink-0">
        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
        Only Animal Bite Centers are registered to provide animal-bite treatment.
      </p>
    </div>
  );
}
