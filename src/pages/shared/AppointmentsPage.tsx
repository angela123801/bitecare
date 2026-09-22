import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { VACCINATION_STATUS_LABELS, VACCINATION_STATUS_COLORS } from '@/config/constants';
import { formatDate } from '@/lib/utils';
import type { VaccinationRecord } from '@/types';
import { CalendarDays, Loader2, Inbox, Check, X, AlertTriangle } from 'lucide-react';

type FilterType = 'all' | 'today' | 'week' | 'overdue';

export default function AppointmentsPage() {
  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase
      .from('vaccination_records')
      .select('*')
      .in('status', ['scheduled', 'rescheduled'])
      .order('scheduled_date', { ascending: true });
    setRecords((data as VaccinationRecord[]) ?? []);
    setLoading(false);
  }

  const today = new Date().toISOString().split('T')[0];
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const filtered = records.filter(r => {
    if (filter === 'today') return r.scheduled_date === today;
    if (filter === 'week') return r.scheduled_date >= today && r.scheduled_date <= weekAhead;
    if (filter === 'overdue') return r.scheduled_date < today;
    return true;
  });

  const overdueCount = records.filter(r => r.scheduled_date < today).length;

  async function markCompleted(id: string) {
    await supabase.from('vaccination_records').update({ status: 'completed', administered_date: today, updated_at: new Date().toISOString() }).eq('id', id);
    fetch();
  }

  async function markMissed(id: string) {
    await supabase.from('vaccination_records').update({ status: 'missed', updated_at: new Date().toISOString() }).eq('id', id);
    fetch();
  }

  const filters: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'overdue', label: 'Overdue', count: overdueCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <p className="text-sm text-gray-500 mt-1">Upcoming vaccination appointments</p>
      </div>

      {overdueCount > 0 && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-danger-600 flex-shrink-0" />
          <p className="text-sm text-danger-700 font-medium">{overdueCount} overdue appointment{overdueCount > 1 ? 's' : ''} require attention</p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className="ml-1.5 bg-danger-500 text-white text-xs px-1.5 py-0.5 rounded-full">{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12"><Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No appointments found</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const isOverdue = r.scheduled_date < today;
            return (
              <div key={r.id} className={`card p-4 flex items-center justify-between ${isOverdue ? 'border-danger-200 bg-danger-50/30' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isOverdue ? 'bg-danger-100' : 'bg-primary-100'}`}>
                    <CalendarDays className={`w-5 h-5 ${isOverdue ? 'text-danger-600' : 'text-primary-600'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{r.patient_name}</p>
                    <p className="text-sm text-gray-500">
                      {r.vaccine_type} - {r.dose_label || `Dose ${r.dose_number}`} | {formatDate(r.scheduled_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${VACCINATION_STATUS_COLORS[r.status]}`}>
                    {isOverdue ? 'Overdue' : VACCINATION_STATUS_LABELS[r.status]}
                  </span>
                  <button onClick={() => markCompleted(r.id)} className="p-1.5 rounded text-success-600 hover:bg-success-50" title="Complete">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => markMissed(r.id)} className="p-1.5 rounded text-danger-600 hover:bg-danger-50" title="Missed">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
