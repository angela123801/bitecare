import { NavLink } from 'react-router-dom';
import { useNavItems } from './Sidebar';
import { cn } from '@/lib/utils';
import { PawPrint, X } from 'lucide-react';

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col lg:hidden animate-slide-in">
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
              <PawPrint className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">BiteCare</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          <NavItems onItemClick={onClose} />
        </nav>
      </aside>
    </>
  );
}

function NavItems({ onItemClick }: { onItemClick: () => void }) {
  const items = useNavItems();

  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onItemClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}
