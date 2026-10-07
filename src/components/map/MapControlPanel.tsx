import { useId } from 'react';
import {
  X, RotateCcw, Crosshair, Loader2, Eye, MapPin, Flame, Building2, Info,
} from 'lucide-react';
import {
  ANIMAL_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  SEVERITY_LABELS,
} from '@/config/constants';
import { EMPTY_FILTERS, type MapFilters } from '@/lib/mapReports';
import { cn } from '@/lib/utils';
import type { AnimalType, ReportStatus, Severity } from '@/types';

interface BarangayOption {
  id: string;
  name: string;
}

type MapViewMode = 'markers' | 'heatmap' | 'both';

interface MapControlPanelProps {
  onClose: () => void;
  filters: MapFilters;
  onFiltersChange: (filters: MapFilters) => void;
  barangays: BarangayOption[];
  resultCount: number;
  loading: boolean;
  showMarkers: boolean;
  showHeatmap: boolean;
  showFacilities: boolean;
  onShowMarkersChange: (value: boolean) => void;
  onShowHeatmapChange: (value: boolean) => void;
  onShowFacilitiesChange: (value: boolean) => void;
  showLegend: boolean;
  onShowLegendChange: (value: boolean) => void;
  onLocate: () => void;
  locating: boolean;
}

const VIEW_MODES: { value: MapViewMode; label: string }[] = [
  { value: 'markers', label: 'Markers' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'both', label: 'Both' },
];

function Toggle({
  checked,
  onChange,
  label,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        checked ? 'bg-primary-50 text-primary-800' : 'text-gray-600 hover:bg-gray-50',
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', checked ? 'text-primary-600' : 'text-gray-400')} />
      <span className="flex-1 text-left">{label}</span>
      <span
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
          checked ? 'bg-primary-600' : 'bg-gray-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

/**
 * The map control sheet. It renders in normal flow inside the map's left
 * control column, so it can never overlap the legend, the toggle button or any
 * other overlay.
 */
export default function MapControlPanel({
  onClose,
  filters,
  onFiltersChange,
  barangays,
  resultCount,
  loading,
  showMarkers,
  showHeatmap,
  showFacilities,
  onShowMarkersChange,
  onShowHeatmapChange,
  onShowFacilitiesChange,
  showLegend,
  onShowLegendChange,
  onLocate,
  locating,
}: MapControlPanelProps) {
  const panelId = useId();

  const viewMode: MapViewMode = showMarkers && showHeatmap ? 'both' : showHeatmap ? 'heatmap' : 'markers';

  const setViewMode = (mode: MapViewMode) => {
    onShowMarkersChange(mode === 'markers' || mode === 'both');
    onShowHeatmapChange(mode === 'heatmap' || mode === 'both');
  };

  const set = <K extends keyof MapFilters>(key: K, value: MapFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  return (
    <div
      id={panelId}
      role="dialog"
      aria-label="Map controls"
      className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-gray-100 w-[17rem] max-w-[calc(100vw-1.5rem)] flex flex-col flex-shrink-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-sm font-bold text-gray-900">Map controls</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map controls"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[52vh] px-4 py-4 space-y-5">
        {/* Layers */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Layers</p>

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setViewMode(mode.value)}
                aria-pressed={viewMode === mode.value}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                  viewMode === mode.value
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <Toggle checked={showMarkers} onChange={onShowMarkersChange} label="Bite report markers" icon={MapPin} />
          <Toggle checked={showHeatmap} onChange={onShowHeatmapChange} label="Incident heatmap" icon={Flame} />
          <Toggle checked={showFacilities} onChange={onShowFacilitiesChange} label="Health facilities" icon={Building2} />
          <Toggle checked={showLegend} onChange={onShowLegendChange} label="Map legend" icon={Info} />
        </section>

        {/* Filters */}
        <section className="space-y-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Filters</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${panelId}-from`} className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input
                id={`${panelId}-from`}
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => set('dateFrom', e.target.value)}
                className="input-field text-sm py-1.5"
              />
            </div>
            <div>
              <label htmlFor={`${panelId}-to`} className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                id={`${panelId}-to`}
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => set('dateTo', e.target.value)}
                className="input-field text-sm py-1.5"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${panelId}-brgy`} className="block text-xs font-medium text-gray-600 mb-1">Barangay</label>
            <select
              id={`${panelId}-brgy`}
              value={filters.barangayId}
              onChange={(e) => set('barangayId', e.target.value)}
              className="input-field text-sm py-1.5"
            >
              <option value="">All barangays</option>
              {barangays.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${panelId}-severity`} className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
            <select
              id={`${panelId}-severity`}
              value={filters.severity}
              onChange={(e) => set('severity', e.target.value as MapFilters['severity'])}
              className="input-field text-sm py-1.5"
            >
              <option value="">All severities</option>
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${panelId}-status`} className="block text-xs font-medium text-gray-600 mb-1">Report status</label>
            <select
              id={`${panelId}-status`}
              value={filters.status}
              onChange={(e) => set('status', e.target.value as MapFilters['status'])}
              className="input-field text-sm py-1.5"
            >
              <option value="">All statuses</option>
              {(Object.keys(REPORT_STATUS_LABELS) as ReportStatus[]).map((s) => (
                <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${panelId}-animal`} className="block text-xs font-medium text-gray-600 mb-1">Animal type</label>
            <select
              id={`${panelId}-animal`}
              value={filters.animalType}
              onChange={(e) => set('animalType', e.target.value as MapFilters['animalType'])}
              className="input-field text-sm py-1.5"
            >
              <option value="">All animals</option>
              {(Object.keys(ANIMAL_TYPE_LABELS) as AnimalType[]).map((a) => (
                <option key={a} value={a}>{ANIMAL_TYPE_LABELS[a]}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Actions */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actions</p>
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin text-primary-600" /> : <Crosshair className="w-4 h-4 text-gray-400" />}
            <span className="flex-1 text-left">Show my current location</span>
          </button>
        </section>

        <p className="text-xs text-gray-500 pt-3 border-t border-gray-100 flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-gray-400" />
          {loading ? 'Loading reports…' : `${resultCount} mapped report${resultCount === 1 ? '' : 's'} shown`}
        </p>
      </div>
    </div>
  );
}
