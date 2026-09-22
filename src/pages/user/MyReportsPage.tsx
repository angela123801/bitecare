import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { BiteReport, ReportStatus } from '@/types';
import {
  REPORT_STATUS_COLORS,
  REPORT_STATUS_LABELS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  ANIMAL_TYPE_LABELS,
} from '@/config/constants';
import { formatDate, cn } from '@/lib/utils';
import {
  Loader2,
  PawPrint,
  Calendar,
  ChevronRight,
  Filter,
  FileText,
  Plus,
} from 'lucide-react';

const STATUS_OPTIONS: { value: '' | ReportStatus; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'reported', label: 'Reported' },
  { value: 'under_investigation', label: 'Under Investigation' },
  { value: 'treatment_started', label: 'Treatment Started' },
  { value: 'treatment_ongoing', label: 'Treatment Ongoing' },
  { value: 'treatment_completed', label: 'Treatment Completed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function MyReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<BiteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'' | ReportStatus>('');

  useEffect(() => {
    if (!user) return;
    const fetchReports = async () => {
      setLoading(true);
      let query = supabase
        .from('bite_reports')
        .select('*')
        .eq('reporter_id', user.id)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data } = await query;
      setReports((data as BiteReport[]) ?? []);
      setLoading(false);
    };
    fetchReports();
  }, [user, statusFilter]);

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-4">
        <FileText className="w-10 h-10 text-primary-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No reports yet</h3>
      <p className="text-gray-500 text-sm mb-6 max-w-sm">
        You haven't submitted any bite reports. If you or someone you know has been bitten, file a report to get help.
      </p>
      <Link to="/reports/new" className="btn-primary flex items-center gap-2">
        <Plus className="w-4 h-4" /> New Report
      </Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
        <Link to="/reports/new" className="btn-primary flex items-center gap-2 self-start">
          <Plus className="w-4 h-4" /> New Report
        </Link>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          className="input-field max-w-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | ReportStatus)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              to={`/reports/${report.id}`}
              className="card-hover block p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <PawPrint className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {report.patient_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-500">
                      <span className="capitalize">
                        {ANIMAL_TYPE_LABELS[report.animal_type] ?? report.animal_type} bite
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(report.bite_date)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
                      REPORT_STATUS_COLORS[report.status]
                    )}
                  >
                    {REPORT_STATUS_LABELS[report.status]}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      SEVERITY_COLORS[report.severity]
                    )}
                  >
                    {SEVERITY_LABELS[report.severity]}
                  </span>
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
