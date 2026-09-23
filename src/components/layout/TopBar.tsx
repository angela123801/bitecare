import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn, getInitials, getErrorMessage } from '@/lib/utils';
import { getSignedUrl } from '@/lib/storage';
import { useInstallApp } from '@/lib/installPrompt';
import { ROLE_LABELS } from '@/config/constants';
import {
  Bell,
  Menu,
  LogOut,
  User,
  ChevronDown,
  Download,
  Loader2,
  Smartphone,
  X,
} from 'lucide-react';
import type { UserRole } from '@/types';

interface TopBarProps {
  onMenuClick: () => void;
  unreadCount: number;
}

export default function TopBar({ onMenuClick, unreadCount }: TopBarProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { canInstall, install, installing, platform } = useInstallApp();

  useEffect(() => {
    let active = true;
    if (profile?.avatar_url) {
      getSignedUrl('avatars', profile.avatar_url)
        .then((url) => { if (active) setAvatarUrl(url); })
        .catch((err) => { if (active) { setAvatarUrl(''); console.error('Avatar load failed:', getErrorMessage(err)); } });
    } else {
      setAvatarUrl('');
    }
    return () => { active = false; };
  }, [profile?.avatar_url]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleInstall = async () => {
    // iPhone and iPad expose no install prompt, so show the manual steps.
    if (platform === 'ios') {
      setShowInstallHelp(true);
      return;
    }
    await install();
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      await signOut();
    } catch (err) {
      // Even if the network call fails, clear local state so the user is not
      // left in a half-authenticated state; the guard will send them to login.
      console.error('Sign out error:', getErrorMessage(err));
    }
    navigate('/', { replace: true });
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Install the app on this device */}
        {canInstall && (
          <div className="relative">
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors disabled:opacity-60"
            >
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="hidden sm:inline">Install app</span>
            </button>

            {showInstallHelp && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg p-4 z-50">
                <button
                  type="button"
                  onClick={() => setShowInstallHelp(false)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-5 h-5 text-primary-600" />
                  <p className="font-semibold text-gray-900 text-sm">Add BiteCare to your phone</p>
                </div>
                <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                  <li>Tap the Share button in Safari.</li>
                  <li>Scroll down and tap Add to Home Screen.</li>
                  <li>Tap Add. The BiteCare icon appears on your home screen.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1.5 pr-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                getInitials(profile?.full_name || 'U')
              )}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-700 leading-tight truncate max-w-[120px]">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                {ROLE_LABELS[(profile?.role as UserRole) ?? 'user']}
              </p>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform hidden sm:block', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
              <button
                onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <User className="w-4 h-4" />
                Profile
              </button>
              <hr className="my-1 border-gray-100" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
