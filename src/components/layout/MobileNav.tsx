import { NavLink } from 'react-router-dom';
import { useNavItems } from './Sidebar';
import { cn } from '@/lib/utils';

export default function MobileNav() {
  const allItems = useNavItems();
  const items = allItems.slice(0, 5);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-2 pb-safe">
      <div className="flex items-center justify-around py-1">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                isActive ? 'text-primary-600' : 'text-gray-400'
              )
            }
          >
            {item.icon}
            <span className="truncate max-w-[60px]">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
