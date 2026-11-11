import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/config/constants';
import { formatDate, getErrorMessage } from '@/lib/utils';
import type { AccountRecoveryRequest, MissingAccount, Profile, UserRole } from '@/types';
import RecoveryReviewModal from '@/components/admin/RecoveryReviewModal';
import {
  Search, Loader2, ShieldAlert, ShieldCheck, UserCog, Inbox, Check, X,
  History, UserX, RefreshCw,
} from 'lucide-react';

const ROLE_COLORS: Record<UserRole, string> = {
  user: 'bg-gray-100 text-gray-700',
  health_worker: 'bg-accent-100 text-accent-800',
  admin: 'bg-primary-100 text-primary-800',
  super_admin: 'bg-warning-100 text-warning-800',
};

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type View = 'accounts' | 'recovery';

interface MissingRow {
  entityId: string;
  displayName: string;
  email: string | null;
  role: string;
  lastSeen: string;
  evidence: unknown[];
  request: AccountRecoveryRequest | null;
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All Accounts' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'archived', label: 'Archived / Soft Deleted' },
];

const RECOVERY_BADGE: Record<string, string> = {
  pending_verification: 'bg-warning-100 text-warning-800',
  restored: 'bg-success-100 text-success-800',
  rejected: 'bg-danger-100 text-danger-800',
};

const RECOVERY_LABEL: Record<string, string> = {
  pending_verification: 'Awaiting verification',
  restored: 'Identity confirmed',
  rejected: 'Not recoverable',
};

export default function UserManagementPage() {
  const { profile: myProfile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [missing, setMissing] = useState<MissingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<View>('accounts');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasSuperAdmin, setHasSuperAdmin] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reviewTarget, setReviewTarget] = useState<MissingAccount | null>(null);

  const isAdmin = myProfile?.role === 'admin' || myProfile?.role === 'super_admin';
  const canApprove = myProfile?.role === 'super_admin';

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { setError(getErrorMessage(error, 'Unable to load users.')); setUsers([]); }
    else setUsers(data as Profile[]);
    setLoading(false);
  }, []);

  const fetchMissing = useCallback(async () => {
    const [accountsRes, recoveryRes] = await Promise.all([
      supabase
        .from('audit_logs')
        .select('entity_id, action, new_values, created_at')
        .eq('action', 'account_created')
        .order('created_at', { ascending: true }),
      supabase.from('account_recovery_requests').select('*'),
    ]);

    if (accountsRes.error || recoveryRes.error) {
      setMissing([]);
      return;
    }

    const requests = (recoveryRes.data ?? []) as AccountRecoveryRequest[];
    const liveIds = new Set(users.map((u) => u.id));
    const grouped = new Map<string, MissingRow>();

    for (const row of accountsRes.data ?? []) {
      const id = row.entity_id as string | null;
      if (!id || liveIds.has(id)) continue;
      const values = (row.new_values ?? {}) as Record<string, unknown>;
      const existing = grouped.get(id);
      grouped.set(id, {
        entityId: id,
        displayName: (values.full_name as string) || existing?.displayName || 'Name not recorded',
        email: (values.email as string) || existing?.email || null,
        role: (values.role as string) || existing?.role || 'user',
        lastSeen: row.created_at as string,
        evidence: [...(existing?.evidence ?? []), row],
        request: requests.find((r) => r.entity_id === id) ?? null,
      });
    }

    setMissing(Array.from(grouped.values()));
  }, [users]);

  useEffect(() => { fetchUsers(); checkSuperAdmin(); }, [fetchUsers]);
  useEffect(() => { if (users.length > 0 || !loading) fetchMissing(); }, [users, loading, fetchMissing]);

  async function checkSuperAdmin() {
    const { data } = await supabase.rpc('check_super_admin_exists');
    setHasSuperAdmin(data ?? true);
  }

  async function handleRoleChange(userId: string) {
    if (!newRole) return;
    setActionLoading(userId);
    setError('');
    setSuccess('');
    const { error } = await supabase.rpc('set_user_role', { target_user_id: userId, new_role: newRole });
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Role updated successfully');
      setEditingRole(null);
      fetchUsers();
    }
    setActionLoading(null);
  }

  async function handleToggleActive(userId: string) {
    setActionLoading(userId);
    setError('');
    const { error } = await supabase.rpc('toggle_user_active', { target_user_id: userId });
    if (error) {
      setError(error.message);
    } else {
      fetchUsers();
    }
    setActionLoading(null);
  }

  async function initSuperAdmin() {
    if (!myProfile) return;
    setActionLoading('init');
    const { error } = await supabase.rpc('initialize_super_admin', { target_user_id: myProfile.id });
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Super Admin initialized! Please refresh the page.');
      setHasSuperAdmin(true);
      window.location.reload();
    }
    setActionLoading(null);
  }

  const assignableRoles: UserRole[] = myProfile?.role === 'super_admin'
    ? ['user', 'health_worker', 'admin', 'super_admin']
    : myProfile?.role === 'admin'
      ? ['user', 'health_worker']
      : [];

  // A caller may only change accounts their role outranks; the database enforces
  // the same rule independently.
  function canManage(u: Profile): boolean {
    if (!myProfile || u.id === myProfile.id) return false;
    if (myProfile.role === 'super_admin') return true;
    if (myProfile.role === 'admin') return u.role === 'user' || u.role === 'health_worker';
    return false;
  }

  const filtered = users.filter((u) => {
    if (statusFilter === 'active' && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active) return false;
    if (statusFilter === 'archived') return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return u.full_name.toLowerCase().includes(s) || (u.email ?? '').toLowerCase().includes(s);
    }
    return true;
  });

  const activeCount = users.filter((u) => u.is_active).length;
  const inactiveCount = users.length - activeCount;
  const pendingRecoveries = missing.filter((m) => m.request?.status === 'pending_verification').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} registered users</p>
        </div>
        <button onClick={() => { fetchUsers(); fetchMissing(); }} className="btn-secondary inline-flex items-center gap-2 self-start">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="p-4 rounded-xl bg-primary-50 border border-primary-200 text-primary-800">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Your account role: {myProfile ? ROLE_LABELS[myProfile.role] : '\u2014'}</p>
            <p className="text-sm mt-0.5">
              {myProfile?.role === 'super_admin'
                ? 'You can create and manage every role, including other super admins and admins, and you approve account recovery.'
                : 'You can create and manage health worker and resident accounts. Roles cannot be changed on your own account.'}
            </p>
          </div>
        </div>
      </div>

      {!hasSuperAdmin && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-warning-800">No Super Admin Found</h3>
            <p className="text-sm text-warning-700">Initialize your account as the first Super Admin.</p>
          </div>
          <button onClick={initSuperAdmin} disabled={actionLoading === 'init'} className="btn-primary">
            {actionLoading === 'init' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Initialize Super Admin'}
          </button>
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center justify-between gap-3"><span>{error}</span><button onClick={() => setError('')} className="text-danger-500 hover:text-danger-700"><X className="w-4 h-4" /></button></div>}
      {success && <div className="p-3 rounded-lg bg-success-50 border border-success-200 text-success-700 text-sm">{success}</div>}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setView('accounts')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'accounts' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            Account directory
          </button>
          <button
            onClick={() => setView('recovery')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'recovery' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            <History className="w-4 h-4" /> Recovery trail
            {pendingRecoveries > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-warning-100 text-warning-800 text-xs font-semibold">
                {pendingRecoveries}
              </span>
            )}
          </button>
        </div>
      )}

      {view === 'accounts' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((t) => {
              const count = t.key === 'all' ? users.length : t.key === 'active' ? activeCount : t.key === 'inactive' ? inactiveCount : missing.length;
              return (
                <button
                  key={t.key}
                  onClick={() => setStatusFilter(t.key)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === t.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  {t.label}
                  <span className={`text-xs ${statusFilter === t.key ? 'text-primary-100' : 'text-gray-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-9" />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input-field w-auto">
              <option value="all">All Roles</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {statusFilter === 'archived' ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-start gap-3">
                <UserX className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">
                    {missing.length === 0 ? 'No archived accounts' : `${missing.length} archived or soft-deleted ${missing.length === 1 ? 'account' : 'accounts'}`}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {missing.length === 0
                      ? 'Every account created through the system is present in the directory. Accounts cannot be deleted from the app: archiving and deactivating both keep the account and its history.'
                      : 'These accounts were created through the system but are no longer in the directory. Open the recovery trail to review them.'}
                  </p>
                  {missing.length > 0 && (
                    <button onClick={() => setView('recovery')} className="btn-secondary mt-3 inline-flex items-center gap-2">
                      <History className="w-4 h-4" /> Open recovery trail
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12"><Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No users found</p></div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Registered</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{u.full_name || 'No name'}</p>
                          <p className="text-xs text-gray-500">{u.email ?? u.phone ?? 'No sign-in detail on file'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {editingRole === u.id ? (
                            <div className="flex items-center gap-2">
                              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input-field py-1 text-xs w-32">
                                {assignableRoles.map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
                              </select>
                              <button onClick={() => handleRoleChange(u.id)} disabled={actionLoading === u.id} className="p-1 text-success-600 hover:bg-success-50 rounded">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingRole(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role as UserRole]}`}>
                              {ROLE_LABELS[u.role as UserRole]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canManage(u) && (
                              <>
                                <button
                                  onClick={() => { setEditingRole(u.id); setNewRole(u.role); }}
                                  className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                                  title="Change role"
                                >
                                  <UserCog className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleToggleActive(u.id)}
                                  disabled={actionLoading === u.id}
                                  className="p-1.5 rounded text-gray-400 hover:text-warning-600 hover:bg-warning-50"
                                  title={u.is_active ? 'Deactivate' : 'Activate'}
                                >
                                  {u.is_active ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Accounts missing from the directory</p>
            <p className="mt-1">
              This list is built from the permanent audit trail, not from memory. An account appears here only when the
              audit log records its creation but it is no longer in the user directory. Identity is verified with the
              person before any outcome is recorded, and no account, password or role is ever recreated automatically.
            </p>
          </div>

          {missing.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <ShieldCheck className="w-12 h-12 text-success-300 mx-auto mb-3" />
              <p className="font-medium text-gray-900">No accounts require recovery</p>
              <p className="text-sm text-gray-500 mt-1">Every account recorded in the audit trail is present in the directory.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Recorded identity</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Last seen</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Recovery status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {missing.map((m) => (
                      <tr key={m.entityId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{m.displayName}</p>
                          <p className="text-xs text-gray-500 break-all">{m.email ?? 'No email recorded'}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{ROLE_LABELS[m.role as UserRole] ?? m.role}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(m.lastSeen)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.request ? RECOVERY_BADGE[m.request.status] : 'bg-gray-100 text-gray-700'}`}>
                            {m.request ? RECOVERY_LABEL[m.request.status] : 'Not reviewed'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setReviewTarget({
                              entityId: m.entityId,
                              displayName: m.displayName,
                              email: m.email,
                              role: m.role,
                              lastSeen: m.lastSeen,
                              evidence: m.evidence,
                              request: m.request,
                            })}
                            className="btn-secondary inline-flex items-center gap-2"
                          >
                            <History className="w-4 h-4" /> Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {reviewTarget && (
        <RecoveryReviewModal
          account={reviewTarget}
          request={reviewTarget.request}
          canApprove={canApprove}
          onClose={() => setReviewTarget(null)}
          onDone={() => {
            setReviewTarget(null);
            setSuccess('Recovery outcome recorded.');
            fetchMissing();
          }}
        />
      )}
    </div>
  );
}
