import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatDate, cn } from '@/lib/utils';
import type { VaccinationRecord, BiteReport } from '@/types';
import {
  VACCINATION_STATUS_LABELS,
  VACCINATION_STATUS_COLORS,
  ESSEN_REGIMEN_DAYS,
} from '@/config/constants';
import { Loader2, Syringe, CalendarDays, FileText } from 'lucide-react';

interface RecordWithReport extends VaccinationRecord {
  report?: BiteReport;
}

export default function MyVaccinationsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<RecordWithReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      // Get bite reports belonging to this user, then vaccination records for those reports
      const { data: reports, error: repErr } = await supabase
        .from('bite_reports')
        .select('id')
        .eq('reporter_id', user.id);

      if (repErr) throw repErr;
      if (!reports || reports.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const reportIds = reports.map((r) => r.id);

      const { data: vaccinations, error: vacErr } = await supabase
        .from('vaccination_records')
        .select('*, report:bite_reports(id, patient_name, bite_date, animal_type, category, status)')
        .in('report_id', reportIds)
        .order('scheduled_date', { ascending: true });

      if (vacErr) throw vacErr;
      setRecords((vaccinations as RecordWithReport[]) || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load vaccination records');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Group records by report
  const grouped = records.reduce<Record<string, RecordWithReport[]>>((acc, rec) => {
    const key = rec.report_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rec);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-danger-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Vaccinations</h1>
        <p className="text-gray-500 text-sm mt-1">Track your vaccination schedule and progress</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <Syringe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No vaccination records</p>
          <p className="text-gray-400 text-sm mt-1">
            Vaccination records will appear here once treatment begins
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([reportId, doses]) => {
          const report = doses[0]?.report;
          const completedCount = doses.filter((d) => d.status === 'completed').length;
          const totalDoses = doses.length;

          return (
            <div key={reportId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Report Header */}
              <div className="p-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {report?.patient_name || 'Bite Report'}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {report?.animal_type} bite • Category {report?.category} •{' '}
                        {report?.bite_date ? formatDate(report.bite_date) : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-primary-700 bg-primary-50 px-2 py-1 rounded-md whitespace-nowrap">
                    {completedCount}/{totalDoses} doses
                  </span>
                </div>
              </div>

              {/* Essen Regimen Progress */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Essen Regimen Progress</p>
                <div className="flex items-center gap-1">
                  {ESSEN_REGIMEN_DAYS.map((day, idx) => {
                    const dose = doses.find((d) => d.dose_number === idx + 1);
                    const status = dose?.status || 'pending';
                    const isCompleted = status === 'completed';
                    const isMissed = status === 'missed';
                    const isScheduled = status === 'scheduled' || status === 'rescheduled';

                    return (
                      <div key={day} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2',
                              isCompleted && 'bg-success-500 border-success-500 text-white',
                              isMissed && 'bg-danger-500 border-danger-500 text-white',
                              isScheduled && 'bg-white border-primary-400 text-primary-600',
                              !dose && 'bg-gray-100 border-gray-300 text-gray-400'
                            )}
                          >
                            {idx + 1}
                          </div>
                          <span className="text-[10px] text-gray-500 mt-1">Day {day}</span>
                        </div>
                        {idx < ESSEN_REGIMEN_DAYS.length - 1 && (
                          <div
                            className={cn(
                              'h-0.5 flex-1 -mx-1',
                              isCompleted ? 'bg-success-400' : 'bg-gray-200'
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dose Timeline */}
              <div className="p-4 space-y-3">
                {doses.map((dose, idx) => (
                  <div key={dose.id} className="flex gap-3">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-3 h-3 rounded-full flex-shrink-0',
                          dose.status === 'completed' && 'bg-success-500',
                          dose.status === 'missed' && 'bg-danger-500',
                          dose.status === 'scheduled' && 'bg-primary-400',
                          dose.status === 'rescheduled' && 'bg-warning-500',
                          dose.status === 'cancelled' && 'bg-gray-400'
                        )}
                      />
                      {idx < doses.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                    </div>

                    <div className="flex-1 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Dose {dose.dose_number}
                            {dose.dose_label ? ` — ${dose.dose_label}` : ''}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {dose.vaccine_type}
                            {dose.site_of_injection ? ` • ${dose.site_of_injection}` : ''}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
                            VACCINATION_STATUS_COLORS[dose.status]
                          )}
                        >
                          {VACCINATION_STATUS_LABELS[dose.status]}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          Scheduled: {formatDate(dose.scheduled_date)}
                        </span>
                        {dose.administered_date && (
                          <span className="text-success-600">
                            Given: {formatDate(dose.administered_date)}
                          </span>
                        )}
                      </div>

                      {dose.notes && (
                        <p className="text-xs text-gray-500 mt-1 italic">{dose.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
