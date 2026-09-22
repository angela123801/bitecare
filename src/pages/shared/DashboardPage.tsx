import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime, getErrorMessage } from '@/lib/utils';
import { ROLE_LABELS, REPORT_STATUS_LABELS, REPORT_STATUS_COLORS, SEVERITY_COLORS } from '@/config/constants';
import type { BiteReport, UserRole } from '@/types';
import {
  Loader2,
  FileText,
  AlertTriangle,
  Syringe,
  MapPin,
  HeartPulse,
  Plus,
  ClipboardList,
  CalendarCheck,
  Clock,
  Users,
  Building2,
  ShieldCheck,
  Activity,
  ChevronRight,
  Inbox,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Stats Card                                                        */
/* ------------------------------------------------------------------ */
function StatsCard({ label, value, icon, color, to }: { label: string; value: number | string; icon: React.ReactNode; color: string; to?: string }) {
  const body = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 block hover:border-teal-300 hover:shadow-md transition-all">
        {body}
      </Link>
    );
  }
  return <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">{body}</div>;
}

/* ------------------------------------------------------------------ */
/*  Quick Action Button                                               */
/* ------------------------------------------------------------------ */
function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-teal-300 hover:shadow-md transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-100 transition-colors">
        {icon}
      </div>
      <span className="text-sm font-semibold text-gray-700 group-hover:text-teal-700 transition-colors">{label}</span>
      <ChevronRight className="w-4 h-4 text-gray-400 ml-auto group-hover:text-teal-500 transition-colors" />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Report Row                                                        */
/* ------------------------------------------------------------------ */
function ReportRow({ report }: { report: BiteReport }) {
  return (
    <Link
      to={`/reports/${report.id}`}
      className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors group"
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_COLORS[report.severity]?.split(' ')[0] ?? 'bg-gray-300'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{report.patient_name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {report.animal_type} — {report.bite_site}
        </p>
      </div>
      <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${REPORT_STATUS_COLORS[report.status]}`}>
        {REPORT_STATUS_LABELS[report.status]}
      </span>
      <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
        {formatRelativeTime(report.created_at)}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                       */
/* ------------------------------------------------------------------ */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
      <Inbox className="w-10 h-10 mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                    */
/* ------------------------------------------------------------------ */
export default function DashboardPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [reports, setReports] = useState<BiteReport[]>([]);

  const [error, setError] = useState('');

  const role: UserRole = profile?.role ?? 'user';
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const s: Record<string, number> = {};
        const today = new Date().toISOString().split('T')[0];

        if (role === 'user') {
          const [reportsRes, activeRes, vaccRes] = await Promise.all([
            supabase.from('bite_reports').select('*', { count: 'exact', head: true }).eq('reporter_id', profile!.id),
            supabase.from('bite_reports').select('*', { count: 'exact', head: true }).eq('reporter_id', profile!.id).in('status', ['reported', 'under_investigation', 'treatment_started', 'treatment_ongoing']),
            supabase.from('vaccination_records').select('report_id, bite_reports!inner(reporter_id)', { count: 'exact', head: true }).eq('status', 'scheduled').gte('scheduled_date', today).eq('bite_reports.reporter_id', profile!.id),
          ]);
          s.myReports = reportsRes.count ?? 0;
          s.activeCases = activeRes.count ?? 0;
          s.upcomingVaccinations = vaccRes.count ?? 0;

          const { data } = await supabase.from('bite_reports').select('*').eq('reporter_id', profile!.id).order('created_at', { ascending: false }).limit(5);
          if (!cancelled) setReports(data ?? []);
        }

        if (role === 'health_worker') {
          const [assignedRes, todayVaccRes, overdueRes] = await Promise.all([
            supabase.from('bite_reports').select('*', { count: 'exact', head: true }).eq('assigned_worker_id', profile!.id).in('status', ['reported', 'under_investigation', 'treatment_started', 'treatment_ongoing']),
            supabase.from('vaccination_records').select('*', { count: 'exact', head: true }).eq('scheduled_date', today).eq('status', 'scheduled'),
            supabase.from('vaccination_records').select('*', { count: 'exact', head: true }).eq('status', 'scheduled').lt('scheduled_date', today),
          ]);
          s.assignedCases = assignedRes.count ?? 0;
          s.todayVaccinations = todayVaccRes.count ?? 0;
          s.overdueFollowups = overdueRes.count ?? 0;

          const { data } = await supabase.from('bite_reports').select('*').eq('assigned_worker_id', profile!.id).in('status', ['reported', 'under_investigation', 'treatment_started', 'treatment_ongoing']).order('created_at', { ascending: false }).limit(5);
          if (!cancelled) setReports(data ?? []);
        }

        if (role === 'admin' || role === 'super_admin') {
          const [totalRes, pendingRes, activeRes, usersRes] = await Promise.all([
            supabase.from('bite_reports').select('*', { count: 'exact', head: true }),
            supabase.from('bite_reports').select('*', { count: 'exact', head: true }).eq('status', 'reported'),
            supabase.from('bite_reports').select('*', { count: 'exact', head: true }).in('status', ['reported', 'under_investigation', 'treatment_started', 'treatment_ongoing']),
            supabase.from('profiles').select('*', { count: 'exact', head: true }),
          ]);
          s.totalReports = totalRes.count ?? 0;
          s.pendingReports = pendingRes.count ?? 0;
          s.activeCases = activeRes.count ?? 0;
          s.totalUsers = usersRes.count ?? 0;

          if (role === 'super_admin') {
            const [facilityRes, auditRes] = await Promise.all([
              supabase.from('healthcare_facilities').select('*', { count: 'exact', head: true }),
              supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
            ]);
            s.totalFacilities = facilityRes.count ?? 0;
            s.weeklyAuditEvents = auditRes.count ?? 0;
          }

          const { data } = await supabase.from('bite_reports').select('*').order('created_at', { ascending: false }).limit(5);
          if (!cancelled) setReports(data ?? []);
        }

        if (!cancelled) setStats(s);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load dashboard'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [profile, role]);

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
        <p className="text-danger-600 font-medium">{error}</p>
        <button className="btn-secondary mt-4" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  /* ---- Render ---- */
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {role === 'user' ? `Welcome back, ${firstName}!` : `${ROLE_LABELS[role]} Dashboard`}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          {role === 'user' && "Here\u2019s an overview of your bite reports and upcoming schedules."}
          {role === 'health_worker' && 'Manage your assigned cases and vaccination schedules.'}
          {role === 'admin' && 'System overview for your administrative area.'}
          {role === 'super_admin' && 'Full system overview and activity monitoring.'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {role === 'user' && (
          <>
            <StatsCard label="My Reports" value={stats.myReports ?? 0} icon={<FileText className="w-5 h-5 text-white" />} color="bg-teal-600" to="/my-reports" />
            <StatsCard label="Active Cases" value={stats.activeCases ?? 0} icon={<AlertTriangle className="w-5 h-5 text-white" />} color="bg-amber-500" />
            <StatsCard label="Upcoming Vaccinations" value={stats.upcomingVaccinations ?? 0} icon={<Syringe className="w-5 h-5 text-white" />} color="bg-sky-500" />
          </>
        )}
        {role === 'health_worker' && (
          <>
            <StatsCard label="Assigned Cases" value={stats.assignedCases ?? 0} icon={<ClipboardList className="w-5 h-5 text-white" />} color="bg-teal-600" />
            <StatsCard label="Today's Vaccinations" value={stats.todayVaccinations ?? 0} icon={<CalendarCheck className="w-5 h-5 text-white" />} color="bg-sky-500" />
            <StatsCard label="Overdue Follow-ups" value={stats.overdueFollowups ?? 0} icon={<Clock className="w-5 h-5 text-white" />} color="bg-red-500" />
          </>
        )}
        {(role === 'admin' || role === 'super_admin') && (
          <>
            <StatsCard label="Total Reports" value={stats.totalReports ?? 0} icon={<FileText className="w-5 h-5 text-white" />} color="bg-teal-600" to="/admin/reports" />
            <StatsCard label="Pending Reports" value={stats.pendingReports ?? 0} icon={<AlertTriangle className="w-5 h-5 text-white" />} color="bg-amber-500" />
            <StatsCard label="Active Cases" value={stats.activeCases ?? 0} icon={<Activity className="w-5 h-5 text-white" />} color="bg-sky-500" />
            <StatsCard label="Total Users" value={stats.totalUsers ?? 0} icon={<Users className="w-5 h-5 text-white" />} color="bg-blue-600" to="/admin/users" />
            {role === 'super_admin' && (
              <>
                <StatsCard label="Healthcare Facilities" value={stats.totalFacilities ?? 0} icon={<Building2 className="w-5 h-5 text-white" />} color="bg-teal-500" />
                <StatsCard label="Audit Events (7d)" value={stats.weeklyAuditEvents ?? 0} icon={<ShieldCheck className="w-5 h-5 text-white" />} color="bg-slate-600" />
              </>
            )}
          </>
        )}
      </div>

      {/* Quick Actions — user role only */}
      {role === 'user' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickAction to="/reports/new" icon={<Plus className="w-5 h-5" />} label="Report Animal Bite" />
            <QuickAction to="/map" icon={<MapPin className="w-5 h-5" />} label="View Map" />
            <QuickAction to="/first-aid" icon={<HeartPulse className="w-5 h-5" />} label="First Aid Guide" />
          </div>
        </div>
      )}

      {/* Recent Reports / Cases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {role === 'health_worker' ? 'Recent Assigned Cases' : 'Recent Reports'}
          </h2>
          <Link to={role === 'user' ? '/my-reports' : role === 'health_worker' ? '/cases' : '/admin/reports'} className="text-sm font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1">
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {reports.length === 0 ? (
            <EmptyState message={role === 'user' ? "You haven\u2019t filed any reports yet." : 'No reports to display.'} />
          ) : (
            reports.map((r) => <ReportRow key={r.id} report={r} />)
          )}
        </div>
      </div>
    </div>
  );
}
