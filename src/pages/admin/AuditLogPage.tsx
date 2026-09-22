import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, getErrorMessage } from '@/lib/utils';
import type { AuditLog } from '@/types';
import { Loader2, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');

  const [entityFilter, setEntityFilter] = useState('all');

  useEffect(() => { loadLogs(); }, [page, entityFilter]);

  async function loadLogs() {
    setLoading(true);
    setError('');
    let query = supabase
      .from('audit_logs')
      .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter);

    const { data, count, error: err } = await query;
    if (err) { setError(getErrorMessage(err, 'Unable to load audit logs.')); setLogs([]); setTotal(0); }
    else { setLogs((data as unknown as AuditLog[]) ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const entityTypes = ['profile', 'bite_report', 'vaccination', 'facility', 'education'];

  const ACTION_COLORS: Record<string, string> = {
    create: 'bg-success-100 text-success-800',
    role_change: 'bg-warning-100 text-warning-800',
    toggle_active: 'bg-warning-100 text-warning-800',
    status_change: 'bg-primary-100 text-primary-800',
    initialize_super_admin: 'bg-danger-100 text-danger-800',
    update: 'bg-primary-100 text-primary-800',
    delete: 'bg-danger-100 text-danger-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">{total} events recorded</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(0); }} className="input-field w-auto">
          <option value="all">All Types</option>
          {entityTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</option>)}
        </select>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12"><Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No audit events</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {(l as unknown as { actor: { full_name: string } | null }).actor?.full_name ?? 'System'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[l.action] ?? 'bg-gray-100 text-gray-700'}`}>
                        {l.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{l.entity_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                      {l.new_values ? JSON.stringify(l.new_values) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">Page {page + 1} of {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-secondary py-1.5 px-3 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="btn-secondary py-1.5 px-3 flex items-center gap-1">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
