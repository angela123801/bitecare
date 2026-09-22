import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { REPORT_STATUS_LABELS, REPORT_STATUS_COLORS, SEVERITY_LABELS, SEVERITY_COLORS, ANIMAL_TYPE_LABELS } from '@/config/constants';
import { formatDate, getErrorMessage } from '@/lib/utils';
import type { BiteReport } from '@/types';
import { Search, Loader2, Filter, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

const PAGE_SIZE = 20;

export default function AllReportsPage() {
  const [reports, setReports] = useState<BiteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter, search]);

  // Debounce the search box so we query once the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function fetchReports() {
    setLoading(true);
    setError('');
    let query = supabase
      .from('bite_reports')
      .select('*, reporter:profiles!bite_reports_reporter_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (search) query = query.ilike('patient_name', `%${search}%`);

    const { data, count, error: err } = await query;
    if (err) { setError(getErrorMessage(err, 'Unable to load reports.')); setReports([]); setTotal(0); }
    else { setReports((data as unknown as BiteReport[]) ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bite Reports</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total reports</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by patient name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="input-field pl-9 pr-8 appearance-none"
          >
            <option value="all">All Status</option>
            {Object.entries(REPORT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12">
          <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No reports found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Animal</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Severity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reporter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/admin/reports/${r.id}`} className="font-medium text-gray-900 hover:text-primary-600">
                        {r.patient_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ANIMAL_TYPE_LABELS[r.animal_type] ?? r.animal_type}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.bite_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[r.severity]}`}>
                        {SEVERITY_LABELS[r.severity]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${REPORT_STATUS_COLORS[r.status]}`}>
                        {REPORT_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {(r as unknown as { reporter: { full_name: string } | null }).reporter?.full_name ?? 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="btn-secondary py-1.5 px-3 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary py-1.5 px-3 flex items-center gap-1"
                >
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
