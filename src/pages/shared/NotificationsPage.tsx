import { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime, cn, getErrorMessage } from '@/lib/utils';
import type { Notification, NotificationType } from '@/types';
import {
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  BellOff,
  Loader2,
  CheckCheck,
} from 'lucide-react';

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  info: <Info className="w-5 h-5 text-primary-600" />,
  warning: <AlertTriangle className="w-5 h-5 text-warning-600" />,
  success: <CheckCircle className="w-5 h-5 text-success-600" />,
  error: <XCircle className="w-5 h-5 text-danger-600" />,
  reminder: <Clock className="w-5 h-5 text-accent-600" />,
  assignment: <UserCheck className="w-5 h-5 text-primary-700" />,
};

const TYPE_BG: Record<NotificationType, string> = {
  info: 'bg-primary-50',
  warning: 'bg-warning-50',
  success: 'bg-success-50',
  error: 'bg-danger-50',
  reminder: 'bg-accent-50',
  assignment: 'bg-primary-50',
};

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const { user, isRoleAtLeast } = useAuth();
  const navigate = useNavigate();
  const { refreshNotifications } = useOutletContext<{ refreshNotifications: () => Promise<number | undefined> }>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setNotifications((data as Notification[]) || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load notifications'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const { error: updateErr } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) {
      setError(getErrorMessage(updateErr, 'Failed to mark notification as read'));
      return;
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    refreshNotifications?.();
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error: updateErr } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (updateErr) {
      setError(getErrorMessage(updateErr, 'Failed to mark notifications as read'));
      return;
    }
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
    );
    refreshNotifications?.();
  };

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const openNotification = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.reference_type === 'bite_report' || n.reference_type === 'vaccination') {
      const isStaff = isRoleAtLeast('health_worker');
      if (n.reference_id) {
        navigate(isStaff ? `/admin/reports/${n.reference_id}` : `/reports/${n.reference_id}`);
        return;
      }
      navigate(isStaff ? '/admin/reports' : '/my-reports');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <CheckCheck className="w-4 h-4" /> Mark all as read
          </button>
        )}
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(['all', 'unread'] as Filter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              filter === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            {tab === 'all' ? 'All' : 'Unread'}
            {tab === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-xs">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BellOff className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === 'unread' ? "You're all caught up!" : "We'll notify you when something happens"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => openNotification(n)}
              className={cn(
                'w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-colors',
                n.is_read
                  ? 'bg-white border-gray-100 hover:bg-gray-50'
                  : 'bg-white border-primary-200 hover:bg-primary-50 shadow-sm'
              )}
            >
              <div className={cn('flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center', TYPE_BG[n.type])}>
                {TYPE_ICONS[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm', n.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold')}>
                    {n.title}
                  </p>
                  {!n.is_read && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-600 mt-1.5" />}
                </div>
                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
