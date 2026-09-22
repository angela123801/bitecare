import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ANIMAL_TYPE_LABELS, SEVERITY_LABELS } from '@/config/constants';
import { Loader2, FileText, Users, Building2, TrendingUp } from 'lucide-react';

interface Stats {
  totalReports: number;
  thisMonth: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byAnimal: Record<string, number>;
  byBarangay: { name: string; count: number }[];
  totalUsers: number;
  totalFacilities: number;
  vaccinationRate: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    setError('');
    const [reports, users, facilities, vaccinations] = await Promise.all([
      supabase.from('bite_reports').select('status, severity, animal_type, incident_barangay_id, created_at'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('healthcare_facilities').select('id', { count: 'exact', head: true }),
      supabase.from('vaccination_records').select('status'),
    ]);

    const allReports = reports.data ?? [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byAnimal: Record<string, number> = {};
    const barangayCounts: Record<string, number> = {};

    allReports.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      byAnimal[r.animal_type] = (byAnimal[r.animal_type] ?? 0) + 1;
      if (r.incident_barangay_id) {
        barangayCounts[r.incident_barangay_id] = (barangayCounts[r.incident_barangay_id] ?? 0) + 1;
      }
    });

    const barangayIds = Object.keys(barangayCounts);
    let byBarangay: { name: string; count: number }[] = [];
    if (barangayIds.length > 0) {
      const { data: brgys } = await supabase.from('barangays').select('id, name').in('id', barangayIds);
      byBarangay = (brgys ?? []).map(b => ({ name: b.name, count: barangayCounts[b.id] ?? 0 }))
        .sort((a, b) => b.count - a.count).slice(0, 10);
    }

    const allVacc = vaccinations.data ?? [];
    const completed = allVacc.filter(v => v.status === 'completed').length;
    const vaccinationRate = allVacc.length > 0 ? Math.round((completed / allVacc.length) * 100) : 0;

    if (reports.error || vaccinations.error || users.error || facilities.error) {
      setError(
        reports.error?.message ||
        vaccinations.error?.message ||
        users.error?.message ||
        facilities.error?.message ||
        'Failed to load analytics'
      );
      setLoading(false);
      return;
    }

    setStats({
      totalReports: allReports.length,
      thisMonth: allReports.filter(r => r.created_at >= monthStart).length,
      byStatus, bySeverity, byAnimal, byBarangay,
      totalUsers: users.count ?? 0,
      totalFacilities: facilities.count ?? 0,
      vaccinationRate,
    });
    setLoading(false);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;
  if (error) return <div className="text-center py-12"><p className="text-danger-600">{error}</p></div>;
  if (!stats) return null;

  const maxBarangay = Math.max(...stats.byBarangay.map(b => b.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Reports" value={stats.totalReports} icon={<FileText className="w-5 h-5 text-primary-600" />} bg="bg-primary-50" />
        <StatCard label="This Month" value={stats.thisMonth} icon={<TrendingUp className="w-5 h-5 text-accent-600" />} bg="bg-accent-50" />
        <StatCard label="Total Users" value={stats.totalUsers} icon={<Users className="w-5 h-5 text-success-600" />} bg="bg-success-50" />
        <StatCard label="Facilities" value={stats.totalFacilities} icon={<Building2 className="w-5 h-5 text-warning-600" />} bg="bg-warning-50" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">By Severity</h3>
          <div className="space-y-3">
            {Object.entries(stats.bySeverity).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{SEVERITY_LABELS[key as keyof typeof SEVERITY_LABELS] ?? key}</span>
                  <span className="font-medium">{val}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${stats.totalReports > 0 ? (val / stats.totalReports) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">By Animal Type</h3>
          <div className="space-y-3">
            {Object.entries(stats.byAnimal).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{ANIMAL_TYPE_LABELS[key as keyof typeof ANIMAL_TYPE_LABELS] ?? key}</span>
                  <span className="font-medium">{val}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-500 rounded-full transition-all" style={{ width: `${stats.totalReports > 0 ? (val / stats.totalReports) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Top Barangays</h3>
          {stats.byBarangay.length === 0 ? (
            <p className="text-sm text-gray-500">No location data yet</p>
          ) : (
            <div className="space-y-3">
              {stats.byBarangay.map(b => (
                <div key={b.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 truncate">{b.name}</span>
                    <span className="font-medium">{b.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-warning-500 rounded-full" style={{ width: `${(b.count / maxBarangay) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Vaccination Completion</h3>
          <div className="flex items-center justify-center py-6">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 36 36" className="w-full h-full">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#14b8a6" strokeWidth="3"
                  strokeDasharray={`${stats.vaccinationRate}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{stats.vaccinationRate}%</span>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500">of scheduled vaccinations completed</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, bg }: { label: string; value: number; icon: React.ReactNode; bg: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${bg}`}>{icon}</div>
      </div>
    </div>
  );
}
