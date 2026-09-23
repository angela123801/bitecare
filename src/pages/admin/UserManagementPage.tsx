import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/config/constants';
import { formatDate, getErrorMessage } from '@/lib/utils';
import type { Profile, UserRole } from '@/types';
import { Search, Loader2, ShieldAlert, ShieldCheck, UserCog, Inbox, Check, X } from 'lucide-react';

const ROLE_COLORS: Record<UserRole, string> = {
  user: 'bg-gray-100 text-gray-700',
  health_worker: 'bg-accent-100 text-accent-800',
  admin: 'bg-primary-100 text-primary-800',
  super_admin: 'bg-warning-100 text-warning-800',
};

export default function UserManagementPage() {
  const { profile: myProfile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasSuperAdmin, setHasSuperAdmin] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchUsers(); checkSuperAdmin(); }, []);

  async function checkSuperAdmin() {
    const { data } = await supabase.rpc('check_super_admin_exists');
    setHasSuperAdmin(data ?? true);
  }

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { setError(getErrorMessage(error, 'Unable to load users.')); setUsers([]); }
    else setUsers(data as Profile[]);
    setLoading(false);
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
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return u.full_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-1">{users.length} registered users</p>
      </div>

      <div className="p-4 rounded-xl bg-primary-50 border border-primary-200 text-primary-800">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Your account role: {myProfile ? ROLE_LABELS[myProfile.role] : '\u2014'}</p>
            <p className="text-sm mt-0.5">
              {myProfile?.role === 'super_admin'
                ? 'You can create and manage every role, including other super admins and admins.'
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

      {loading ? (
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Joined</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{u.full_name || 'No name'}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
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
    </div>
  );
}
