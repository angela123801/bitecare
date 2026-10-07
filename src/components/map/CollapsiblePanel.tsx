import type { ElementType, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  title: string;
  icon: ElementType;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A map overlay panel that can shrink to a small pill so it stops covering the
 * map. The collapsed pill keeps the title visible so the panel is still easy to
 * find and reopen.
 */
export default function CollapsiblePanel({
  title,
  icon: Icon,
  collapsed,
  onToggle,
  children,
}: CollapsiblePanelProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        aria-label={`Expand ${title}`}
        className={cn(
          'flex items-center gap-2 bg-white/95 backdrop-blur rounded-lg shadow-lg',
          'px-3 py-2 max-w-[calc(100vw-1.5rem)] transition-colors',
          'hover:bg-white active:bg-gray-50',
        )}
      >
        <Icon className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-700 truncate">{title}</span>
        <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur rounded-lg shadow-lg w-56 max-w-[calc(100vw-1.5rem)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <span className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-600 uppercase truncate">{title}</span>
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded
          aria-label={`Minimize ${title}`}
          className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
