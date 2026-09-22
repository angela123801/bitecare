import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import MobileSidebar from './MobileSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadCount(count ?? 0);
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div
        className={cn(
          'flex flex-col min-h-screen transition-all duration-200',
          collapsed ? 'lg:ml-[68px]' : 'lg:ml-60'
        )}
      >
        <TopBar onMenuClick={() => setMobileOpen(true)} unreadCount={unreadCount} />
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet context={{ refreshNotifications: fetchUnread }} />
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
