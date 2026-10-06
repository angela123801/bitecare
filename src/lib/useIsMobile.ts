import { useEffect, useState } from 'react';

/** Matches Tailwind's `sm` breakpoint (640px), where the auth layouts switch. */
export const MOBILE_QUERY = '(max-width: 639px)';

/** True while the viewport is phone-sized; updates on rotation and resize. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
