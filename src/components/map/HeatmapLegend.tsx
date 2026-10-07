import { HEAT_GRADIENT } from '@/lib/heatmap';
import CollapsiblePanel from './CollapsiblePanel';
import { Flame } from 'lucide-react';

const LEGEND_STOPS = [
  { label: 'Few incidents', color: HEAT_GRADIENT[0.2] },
  { label: 'Moderate', color: HEAT_GRADIENT[0.4] },
  { label: 'Many', color: HEAT_GRADIENT[0.6] },
  { label: 'High', color: HEAT_GRADIENT[0.8] },
  { label: 'Very high', color: HEAT_GRADIENT[1.0] },
];

interface HeatmapLegendProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function HeatmapLegend({ collapsed, onToggle }: HeatmapLegendProps) {
  const gradientCss = `linear-gradient(to right, ${Object.keys(HEAT_GRADIENT)
    .map((stop) => `${HEAT_GRADIENT[Number(stop)]} ${Number(stop) * 100}%`)
    .join(', ')})`;

  return (
    <CollapsiblePanel title="Incident Density" icon={Flame} collapsed={collapsed} onToggle={onToggle}>
      <div className="h-2.5 rounded-full" style={{ background: gradientCss }} />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-500">Low</span>
        <span className="text-[10px] text-gray-500">High</span>
      </div>
      <div className="mt-2 space-y-1">
        {LEGEND_STOPS.map((stop) => (
          <div key={stop.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: stop.color }} />
            <span className="text-xs text-gray-700">{stop.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-2 leading-snug">
        Colour reflects how many bite reports fall in the same area, not an individual case.
      </p>
    </CollapsiblePanel>
  );
}
