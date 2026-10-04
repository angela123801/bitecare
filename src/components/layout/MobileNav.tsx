import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useNavItems } from './Sidebar';
import { cn } from '@/lib/utils';

export default function MobileNav() {
  const items = useNavItems();
  const location = useLocation();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted item in view when the route changes, so the user
  // can always see where they are even after swiping the bar.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [location.pathname]);

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-safe"
    >
      <div
        ref={scrollerRef}
        className="flex flex-nowrap items-stretch gap-1 overflow-x-auto overflow-y-hidden no-scrollbar px-2 py-1.5"
      >
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 flex-shrink-0',
                'min-w-[64px] min-h-[52px] px-3 py-1.5 rounded-lg',
                'text-xs font-medium whitespace-nowrap transition-colors duration-150',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 active:bg-gray-100'
              )
            }
          >
            {({ isActive }) => (
              <span
                data-active={isActive ? 'true' : undefined}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                {item.icon}
                <span className="truncate max-w-[96px]">{item.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
