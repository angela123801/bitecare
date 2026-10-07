import { FACILITY_TYPE_LABELS, SEVERITY_LABELS } from '@/config/constants';
import { FACILITY_COLORS, SEVERITY_COLORS } from '@/lib/mapColors';
import type { Severity } from '@/types';
import CollapsiblePanel from './CollapsiblePanel';
import { Info } from 'lucide-react';

interface MapLegendProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function MapLegend({ collapsed, onToggle }: MapLegendProps) {
  return (
    <CollapsiblePanel title="Legend" icon={Info} collapsed={collapsed} onToggle={onToggle}>
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
    </CollapsiblePanel>
  );
}
