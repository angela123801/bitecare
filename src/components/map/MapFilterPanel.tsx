import { useState } from 'react';
import { Filter, X, RotateCcw } from 'lucide-react';
import {
  ANIMAL_TYPE_LABELS,
  REPORT_STATUS_LABELS,
} from '@/config/constants';
import { EMPTY_FILTERS, type MapFilters } from '@/lib/mapReports';
import type { AnimalType, ReportStatus } from '@/types';

interface BarangayOption {
  id: string;
  name: string;
}

interface MapFilterPanelProps {
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
  barangays: BarangayOption[];
  resultCount: number;
}

export default function MapFilterPanel({
  filters,
  onChange,
  barangays,
  resultCount,
}: MapFilterPanelProps) {
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const set = <K extends keyof MapFilters>(key: K, value: MapFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col items-start">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative bg-white rounded-lg p-2.5 shadow-lg hover:bg-gray-50 transition-colors"
        title="Filters"
        aria-label="Filters"
      >
        {open ? <X className="w-5 h-5 text-gray-700" /> : <Filter className="w-5 h-5 text-gray-700" />}
        {!open && activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 bg-white rounded-lg shadow-lg p-3 w-64 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Filters</p>
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From date</label>
              <input
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => set('dateFrom', e.target.value)}
                className="input-field text-sm py-1.5"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To date</label>
              <input
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => set('dateTo', e.target.value)}
                className="input-field text-sm py-1.5"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Barangay</label>
              <select
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Animal type</label>
              <select
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

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Case status</label>
              <select
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
          </div>

          <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100">
            {resultCount} report{resultCount === 1 ? '' : 's'} match
          </p>
        </div>
      )}
    </div>
  );
}
