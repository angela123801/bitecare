import { FACILITY_TYPE_LABELS, SEVERITY_LABELS } from '@/config/constants';
import { FACILITY_COLORS, SEVERITY_COLORS } from '@/lib/mapColors';
import type { Severity } from '@/types';
import CollapsiblePanel from './CollapsiblePanel';
import { Info } from 'lucide-react';

interface MapLegendProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** The three facility categories the directory covers, in display order. */
const FACILITY_LEGEND_TYPES = ['animal_bite_center', 'health_center', 'hospital'];

export default function MapLegend({ collapsed, onToggle }: MapLegendProps) {
  return (
    <CollapsiblePanel title="Legend" icon={Info} collapsed={collapsed} onToggle={onToggle}>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase">Healthcare facilities</p>
        {FACILITY_LEGEND_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded flex-shrink-0"
              style={{ background: FACILITY_COLORS[type] }}
            />
            <span className="text-xs text-gray-700">
              {FACILITY_TYPE_LABELS[type] ?? type}s
            </span>
          </div>
        ))}

        <p className="text-[10px] font-semibold text-gray-400 uppercase pt-1.5">Bite reports</p>
        <div className="flex items-center gap-2">
          <svg width="12" height="15" viewBox="0 0 26 34" className="flex-shrink-0" aria-hidden="true">
            <path
              d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 21 13 21s13-11.3 13-21C26 5.8 20.2 0 13 0z"
              fill="#64748b"
              stroke="#ffffff"
              strokeWidth="3"
            />
          </svg>
          <span className="text-xs text-gray-700">Animal bite incident report</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded flex-shrink-0"
            style={{
              background: 'linear-gradient(90deg,#16a34a,#f59e0b,#f97316,#dc2626)',
            }}
          />
          <span className="text-xs text-gray-700">Incident density / hotspots</span>
        </div>

        <p className="text-[10px] font-semibold text-gray-400 uppercase pt-1.5">Report severity</p>
        {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: SEVERITY_COLORS[s] }} />
            <span className="text-xs text-gray-700">{SEVERITY_LABELS[s]}</span>
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}
