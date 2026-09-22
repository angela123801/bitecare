import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  PawPrint,
  FileText,
  Syringe,
  CalendarDays,
  Map,
  Heart,
  BookOpen,
  Bell,
  User,
  Users,
  Building2,
  Shield,
  BarChart3,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Search,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

function useNavItems(): NavItem[] {
  const { profile } = useAuth();
  const role = profile?.role ?? 'user';

  const base: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  ];

  if (role === 'user') {
    return [
      ...base,
      { label: 'Report Bite', path: '/reports/new', icon: <PawPrint className="w-5 h-5" /> },
      { label: 'My Reports', path: '/my-reports', icon: <FileText className="w-5 h-5" /> },
      { label: 'Vaccinations', path: '/my-vaccinations', icon: <Syringe className="w-5 h-5" /> },
      { label: 'Map', path: '/map', icon: <Map className="w-5 h-5" /> },
      { label: 'First Aid', path: '/first-aid', icon: <Heart className="w-5 h-5" /> },
      { label: 'Education', path: '/education', icon: <BookOpen className="w-5 h-5" /> },
      { label: 'Notifications', path: '/notifications', icon: <Bell className="w-5 h-5" /> },
      { label: 'Profile', path: '/profile', icon: <User className="w-5 h-5" /> },
    ];
  }

  if (role === 'health_worker') {
    return [
      ...base,
      { label: 'Cases', path: '/cases', icon: <Stethoscope className="w-5 h-5" /> },
      { label: 'Patients', path: '/admin/users', icon: <Search className="w-5 h-5" /> },
      { label: 'Bite Reports', path: '/admin/reports', icon: <FileText className="w-5 h-5" /> },
      { label: 'Vaccinations', path: '/vaccinations', icon: <Syringe className="w-5 h-5" /> },
      { label: 'Appointments', path: '/appointments', icon: <CalendarDays className="w-5 h-5" /> },
      { label: 'Map', path: '/map', icon: <Map className="w-5 h-5" /> },
      { label: 'Notifications', path: '/notifications', icon: <Bell className="w-5 h-5" /> },
      { label: 'Profile', path: '/profile', icon: <User className="w-5 h-5" /> },
    ];
  }

  if (role === 'admin') {
    return [
      ...base,
      { label: 'Bite Reports', path: '/admin/reports', icon: <FileText className="w-5 h-5" /> },
      { label: 'Vaccinations', path: '/vaccinations', icon: <Syringe className="w-5 h-5" /> },
      { label: 'Appointments', path: '/appointments', icon: <CalendarDays className="w-5 h-5" /> },
      { label: 'Facilities', path: '/admin/facilities', icon: <Building2 className="w-5 h-5" /> },
      { label: 'Map', path: '/map', icon: <Map className="w-5 h-5" /> },
      { label: 'Users', path: '/admin/users', icon: <Users className="w-5 h-5" /> },
      { label: 'Education', path: '/admin/education', icon: <BookOpen className="w-5 h-5" /> },
      { label: 'Notifications', path: '/notifications', icon: <Bell className="w-5 h-5" /> },
      { label: 'Profile', path: '/profile', icon: <User className="w-5 h-5" /> },
    ];
  }

  // super_admin
  return [
    ...base,
    { label: 'Bite Reports', path: '/admin/reports', icon: <FileText className="w-5 h-5" /> },
    { label: 'Vaccinations', path: '/vaccinations', icon: <Syringe className="w-5 h-5" /> },
    { label: 'Appointments', path: '/appointments', icon: <CalendarDays className="w-5 h-5" /> },
    { label: 'Facilities', path: '/admin/facilities', icon: <Building2 className="w-5 h-5" /> },
    { label: 'Map', path: '/map', icon: <Map className="w-5 h-5" /> },
    { label: 'Users', path: '/admin/users', icon: <Users className="w-5 h-5" /> },
    { label: 'Education', path: '/admin/education', icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Analytics', path: '/admin/analytics', icon: <BarChart3 className="w-5 h-5" /> },
    { label: 'Audit Log', path: '/admin/audit-log', icon: <ScrollText className="w-5 h-5" /> },
    { label: 'Settings', path: '/admin/settings', icon: <Settings className="w-5 h-5" /> },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="w-5 h-5" /> },
    { label: 'Profile', path: '/profile', icon: <User className="w-5 h-5" /> },
  ];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const items = useNavItems();
  const location = useLocation();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-60',
        'hidden lg:flex'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-100 gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
          <PawPrint className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-display text-lg font-bold text-gray-900 whitespace-nowrap">BiteCare</span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-gray-100">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
}

export { useNavItems };
