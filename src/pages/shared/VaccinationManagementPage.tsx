import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VACCINATION_STATUS_LABELS, VACCINATION_STATUS_COLORS, ESSEN_REGIMEN_DAYS } from '@/config/constants';
import { formatDate, getErrorMessage } from '@/lib/utils';
import { notifyUser, getReportReporterId } from '@/lib/notifications';
import type { VaccinationRecord, BiteReport } from '@/types';
import { Loader2, Search, Plus, X, Inbox, Check } from 'lucide-react';

export default function VaccinationManagementPage() {
  const { isRoleAtLeast } = useAuth();
  const [records, setRecords] = useState<(VaccinationRecord & { report?: BiteReport })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<BiteReport[]>([]);
  const [form, setForm] = useState({ report_id: '', vaccine_type: 'PVRV', generateSchedule: true });

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('vaccination_records')
      .select('*, report:bite_reports(id, patient_name, category)')
      .order('scheduled_date', { ascending: true });
    if (err) { setError(getErrorMessage(err, 'Unable to load vaccination records.')); setRecords([]); }
    else setRecords((data as unknown as (VaccinationRecord & { report?: BiteReport })[]) ?? []);
    setLoading(false);
  }

  async function fetchReports() {
    const { data, error: err } = await supabase.from('bite_reports').select('id, patient_name, category').order('created_at', { ascending: false });
    if (err) { setError(getErrorMessage(err, 'Unable to load reports.')); return; }
    setReports((data as BiteReport[]) ?? []);
  }

  async function generateEssenSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!form.report_id) { setError('Please select a report'); return; }
    setSaving(true);
    setError('');

    const report = reports.find(r => r.id === form.report_id);
    const today = new Date();
    const recs = ESSEN_REGIMEN_DAYS.map((day, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() + day);
      return {
        report_id: form.report_id,
        patient_name: report?.patient_name ?? '',
        vaccine_type: form.vaccine_type,
        dose_number: i + 1,
        dose_label: `Day ${day}`,
        scheduled_date: date.toISOString().split('T')[0],
        status: 'scheduled',
      };
    });

    const { error: err } = await supabase.from('vaccination_records').insert(recs);
    if (err) {
      setError(getErrorMessage(err, 'Failed to generate schedule'));
    } else {
      const reporterId = await getReportReporterId(form.report_id);
      if (reporterId) {
        await notifyUser({
          userId: reporterId,
          title: 'Vaccination schedule created',
          message: `A ${form.vaccine_type} vaccination schedule (${recs.length} doses) was created for ${report?.patient_name ?? 'the patient'}. First appointment: ${formatDate(recs[0].scheduled_date)}.`,
          type: 'reminder',
          referenceType: 'vaccination',
          referenceId: form.report_id,
        });
      }
      setShowForm(false);
      setForm({ report_id: '', vaccine_type: 'PVRV', generateSchedule: true });
      loadRecords();
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: 'completed' | 'missed', label: string) {
    const record = records.find(r => r.id === id);
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') patch.administered_date = new Date().toISOString().split('T')[0];

    const { error: err } = await supabase.from('vaccination_records').update(patch).eq('id', id);
    if (err) { setError(getErrorMessage(err, 'Failed to update record')); return; }

    if (record) {
      const reporterId = await getReportReporterId(record.report_id);
      if (reporterId) {
        await notifyUser({
          userId: reporterId,
          title: `Vaccination ${label}`,
          message: `Dose ${record.dose_label || record.dose_number} (${record.vaccine_type}) for ${record.patient_name} was marked as ${label}.`,
          type: status === 'completed' ? 'success' : 'warning',
          referenceType: 'vaccination',
          referenceId: record.report_id,
        });
      }
    }
    loadRecords();
  }

  const filtered = records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search && !r.patient_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vaccination Records</h1>
        {isRoleAtLeast('health_worker') && (
          <button onClick={() => { fetchReports(); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Generate Schedule
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Generate Essen Regimen</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">{error}</div>}
            <form onSubmit={generateEssenSchedule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bite Report</label>
                <select value={form.report_id} onChange={e => setForm(f => ({ ...f, report_id: e.target.value }))} className="input-field" required>
                  <option value="">Select a report...</option>
                  {reports.map(r => <option key={r.id} value={r.id}>{r.patient_name} (Cat. {r.category})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vaccine Type</label>
                <select value={form.vaccine_type} onChange={e => setForm(f => ({ ...f, vaccine_type: e.target.value }))} className="input-field">
                  <option value="PVRV">PVRV</option>
                  <option value="PCECV">PCECV</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">This will create 5 doses: Day 0, 3, 7, 14, 28 starting today.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && !showForm && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search patient..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-auto">
          <option value="all">All Status</option>
          {Object.entries(VACCINATION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12"><Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No vaccination records</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Patient</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vaccine</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dose</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.patient_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.vaccine_type}</td>
                    <td className="px-4 py-3 text-gray-600">{r.dose_label || `Dose ${r.dose_number}`}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.scheduled_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${VACCINATION_STATUS_COLORS[r.status]}`}>
                        {VACCINATION_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'scheduled' && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateStatus(r.id, 'completed', 'completed')} className="p-1.5 rounded text-success-600 hover:bg-success-50" title="Mark Completed">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => updateStatus(r.id, 'missed', 'missed')} className="p-1.5 rounded text-danger-600 hover:bg-danger-50" title="Mark Missed">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
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
