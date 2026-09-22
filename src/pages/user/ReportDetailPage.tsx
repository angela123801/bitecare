import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { BiteReport, BiteReportStatusHistory, VaccinationRecord, ReportStatus, Barangay, Profile } from '@/types';
import { REPORT_STATUS_COLORS, REPORT_STATUS_LABELS, SEVERITY_COLORS, SEVERITY_LABELS, ANIMAL_TYPE_LABELS, CATEGORY_LABELS, VACCINATION_STATUS_COLORS, VACCINATION_STATUS_LABELS } from '@/config/constants';
import { formatDate, formatDateTime, cn, getErrorMessage } from '@/lib/utils';
import { notifyUser } from '@/lib/notifications';
import { ArrowLeft, Loader2, AlertCircle, Clock, Syringe, User, PawPrint, MapPin, ShieldCheck, Send, CheckCircle2, UserPlus } from 'lucide-react';

const ALL_STATUSES: ReportStatus[] = ['reported','under_investigation','treatment_started','treatment_ongoing','treatment_completed','closed','cancelled'];
const WOUND_LABELS: Record<string, string> = { bite: 'Bite', scratch: 'Scratch', lick_on_broken_skin: 'Lick on Broken Skin', other: 'Other' };

const Row = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value ?? '\u2014'}</span>
  </div>
);

const Section = ({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
  <section className="card p-5">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
      <Icon className="w-4 h-4" /> {title}
    </h2>
    {children}
  </section>
);

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [report, setReport] = useState<BiteReport | null>(null);
  const [history, setHistory] = useState<BiteReportStatusHistory[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState<ReportStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState(false);
  const [statusError, setStatusError] = useState('');

  const [workers, setWorkers] = useState<Pick<Profile, 'id' | 'full_name'>[]>([]);
  const [assignWorker, setAssignWorker] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [markingDose, setMarkingDose] = useState<string | null>(null);

  const isStaff = profile?.role === 'health_worker' || profile?.role === 'admin' || profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const reportSelect = '*, patient_barangay:barangays!patient_barangay_id(*), incident_barangay:barangays!incident_barangay_id(*), assigned_worker:profiles!assigned_worker_id(id, full_name, email)';
  const historySelect = '*, actor:profiles!changed_by(id, full_name)';

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setError('');
      const [rpt, hist, vac] = await Promise.all([
        supabase.from('bite_reports').select(reportSelect).eq('id', id).maybeSingle(),
        supabase.from('bite_report_status_history').select(historySelect).eq('report_id', id).order('created_at', { ascending: true }),
        supabase.from('vaccination_records').select('*, facility:healthcare_facilities(*)').eq('report_id', id).order('dose_number', { ascending: true }),
      ]);
      if (rpt.error) setError(getErrorMessage(rpt.error, 'Unable to load this report.'));
      else if (!rpt.data) setError('Report not found');
      else setReport(rpt.data as BiteReport);
      if (hist.error || vac.error) {
        setStatusError(getErrorMessage(hist.error || vac.error, 'Some report details could not be loaded.'));
      }
      setHistory((hist.data as BiteReportStatusHistory[]) ?? []);
      setVaccinations((vac.data as VaccinationRecord[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!isStaff) return;
    supabase.from('profiles').select('id, full_name').in('role', ['health_worker', 'admin', 'super_admin']).eq('is_active', true).order('full_name').then(({ data, error: e }) => {
      if (e) { setStatusError(getErrorMessage(e, 'Failed to load health workers.')); return; }
      if (data) setWorkers(data);
    });
  }, [isStaff]);

  const refreshReport = async () => {
    if (!id) return;
    const [r, h, v] = await Promise.all([
      supabase.from('bite_reports').select(reportSelect).eq('id', id).maybeSingle(),
      supabase.from('bite_report_status_history').select(historySelect).eq('report_id', id).order('created_at', { ascending: true }),
      supabase.from('vaccination_records').select('*, facility:healthcare_facilities(*)').eq('report_id', id).order('dose_number', { ascending: true }),
    ]);
    if (r.data) setReport(r.data as BiteReport);
    setHistory((h.data as BiteReportStatusHistory[]) ?? []);
    setVaccinations((v.data as VaccinationRecord[]) ?? []);
  };

  const handleStatusUpdate = async () => {
    if (!id || !newStatus || !profile) return;
    const newStatusLabel = REPORT_STATUS_LABELS[newStatus];
    setUpdatingStatus(true); setStatusSuccess(false); setStatusError('');
    const { error: e } = await supabase.rpc('update_report_status', { p_report_id: id, p_new_status: newStatus, p_notes: statusNote.trim() });
    if (e) {
      setStatusError(getErrorMessage(e, 'Failed to update status'));
    } else {
      if (report?.reporter_id && report.reporter_id !== profile.id) {
        await notifyUser({
          userId: report.reporter_id,
          title: 'Bite report status updated',
          message: `Your report for ${report.patient_name} is now "${newStatusLabel}".`,
          type: 'info',
          referenceType: 'bite_report',
          referenceId: id,
        });
      }
      setStatusSuccess(true); setNewStatus(''); setStatusNote(''); await refreshReport();
    }
    setUpdatingStatus(false);
  };

  const handleAssign = async () => {
    if (!id || !assignWorker || assignWorker === '') return;
    setAssigning(true); setStatusError('');
    const { error: e } = await supabase.from('bite_reports').update({ assigned_worker_id: assignWorker }).eq('id', id);
    if (e) { setStatusError(getErrorMessage(e, 'Failed to assign worker')); }
    else { await refreshReport(); setAssignWorker(null); }
    setAssigning(false);
  };

  const handleMarkDose = async (vaccId: string) => {
    setMarkingDose(vaccId); setStatusError('');
    const { error: e } = await supabase.from('vaccination_records').update({
      status: 'completed',
      administered_date: new Date().toISOString().split('T')[0],
      administered_by: profile?.id,
    }).eq('id', vaccId);
    if (e) {
      setStatusError(getErrorMessage(e, 'Failed to mark dose as done'));
    } else {
      if (report?.reporter_id && report.reporter_id !== profile?.id) {
        await notifyUser({
          userId: report.reporter_id,
          title: 'Vaccination dose completed',
          message: `A vaccination dose for ${report.patient_name} was marked as given.`,
          type: 'success',
          referenceType: 'vaccination',
          referenceId: id,
        });
      }
      await refreshReport();
    }
    setMarkingDose(null);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;

  if (error || !report) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{error || 'Report not found'}</h2>
      <button className="btn-secondary mt-4" onClick={() => navigate(-1)}>Go Back</button>
    </div>
  );

  const pBrgy = report.patient_barangay as Barangay | undefined;
  const iBrgy = report.incident_barangay as Barangay | undefined;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{report.patient_name}</h1>
          <p className="text-sm text-gray-500">Report filed {formatDate(report.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', REPORT_STATUS_COLORS[report.status])}>{REPORT_STATUS_LABELS[report.status]}</span>
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', SEVERITY_COLORS[report.severity])}>{SEVERITY_LABELS[report.severity]}</span>
        </div>
      </div>

      <div className="space-y-6">
        <Section icon={User} title="Patient Information">
          <Row label="Name" value={report.patient_name} />
          <Row label="Age" value={report.patient_age} />
          <Row label="Sex" value={report.patient_sex} />
          <Row label="Phone" value={report.patient_phone} />
          <Row label="Address" value={report.patient_address} />
          <Row label="Barangay" value={pBrgy?.name} />
        </Section>

        <Section icon={PawPrint} title="Incident Details">
          <Row label="Date" value={formatDate(report.bite_date)} />
          <Row label="Time" value={report.bite_time} />
          <Row label="Animal" value={ANIMAL_TYPE_LABELS[report.animal_type] ?? report.animal_type} />
          <Row label="Animal Status" value={report.animal_status} />
          <Row label="Vaccinated" value={report.animal_vaccinated} />
          <Row label="Bite Site" value={report.bite_site} />
          <Row label="Wound Type" value={WOUND_LABELS[report.wound_type] ?? report.wound_type} />
          <Row label="Category" value={CATEGORY_LABELS[report.category]} />
          <Row label="Wounds" value={report.number_of_wounds} />
          <Row label="Provoked" value={report.provoked ? 'Yes' : 'No'} />
          <Row label="First Aid" value={report.first_aid_given ? 'Yes' : 'No'} />
          {report.first_aid_given && <Row label="First Aid Details" value={report.first_aid_details} />}
        </Section>

        <Section icon={MapPin} title="Incident Location">
          <Row label="Location" value={report.incident_location} />
          <Row label="Barangay" value={iBrgy?.name} />
          {report.incident_latitude && report.incident_longitude && (
            <Row label="Coordinates" value={`${report.incident_latitude.toFixed(5)}, ${report.incident_longitude.toFixed(5)}`} />
          )}
        </Section>

        <Section icon={Clock} title="Status History">
          {history.length === 0 ? <p className="text-sm text-gray-400 py-3">No status changes recorded.</p> : (
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-gray-200" />
              {history.map((h) => (
                <div key={h.id} className="relative">
                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-primary-500 border-2 border-white" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {h.from_status && (<>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', REPORT_STATUS_COLORS[h.from_status as ReportStatus])}>{REPORT_STATUS_LABELS[h.from_status as ReportStatus] ?? h.from_status}</span>
                      <span className="text-gray-400 text-xs">{'\u2192'}</span>
                    </>)}
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', REPORT_STATUS_COLORS[h.to_status as ReportStatus])}>{REPORT_STATUS_LABELS[h.to_status as ReportStatus] ?? h.to_status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDateTime(h.created_at)}{h.actor && ` \u2014 ${(h.actor as { full_name: string }).full_name}`}
                  </p>
                  {h.notes && <p className="text-sm text-gray-600 mt-0.5">{h.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={Syringe} title="Vaccination Records">
          {vaccinations.length === 0 ? <p className="text-sm text-gray-400 py-3">No vaccination records yet.</p> : (
            <div className="space-y-3">
              {vaccinations.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{v.vaccine_type} {'\u2014'} Dose {v.dose_number}{v.dose_label && ` (${v.dose_label})`}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Scheduled: {formatDate(v.scheduled_date)}{v.administered_date && ` \u00b7 Given: ${formatDate(v.administered_date)}`}</p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', VACCINATION_STATUS_COLORS[v.status])}>{VACCINATION_STATUS_LABELS[v.status]}</span>
                  {isStaff && v.status === 'scheduled' && (
                    <button
                      onClick={() => handleMarkDose(v.id)}
                      disabled={markingDose === v.id}
                      className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1 whitespace-nowrap"
                    >
                      {markingDose === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Mark Done
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {isStaff && (
          <section className="card p-5 border-primary-200">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary-700 uppercase tracking-wide mb-3"><ShieldCheck className="w-4 h-4" /> Staff Actions</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Update Status</label>
                <div className="flex gap-2">
                  <select className="input-field flex-1" value={newStatus} onChange={(e) => setNewStatus(e.target.value as ReportStatus)}>
                    <option value="">Select new status</option>
                    {ALL_STATUSES.filter((s) => s !== report.status).map((s) => <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>)}
                  </select>
                  <button className="btn-primary flex items-center gap-1" onClick={handleStatusUpdate} disabled={!newStatus || updatingStatus}>
                    {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Update
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea className="input-field" rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Add a note about this status change" />
              </div>
              {statusSuccess && (
                <div className="p-3 rounded-lg text-sm flex items-center gap-2 bg-success-50 border border-success-200 text-success-700">
                  <CheckCircle2 className="w-4 h-4" /> Status updated successfully
                </div>
              )}
              {statusError && (
                <div className="p-3 rounded-lg text-sm flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700">
                  <AlertCircle className="w-4 h-4" /> {statusError}
                </div>
              )}

              <div className="pt-3 border-t border-gray-200">
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"><UserPlus className="w-4 h-4" /> Case Assignment</h3>
                {report.assigned_worker ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Assigned to: <span className="font-medium">{(report.assigned_worker as { full_name: string }).full_name}</span></p>
                    {isAdmin && (
                      <button className="text-xs text-primary-600 hover:text-primary-700 font-medium" onClick={() => setAssignWorker('')}>
                        Reassign
                      </button>
                    )}
                  </div>
                ) : null}
                {(!report.assigned_worker || assignWorker !== null) && isStaff && (
                  <div className="flex gap-2 mt-2">
                    <select className="input-field flex-1" value={assignWorker ?? ''} onChange={(e) => setAssignWorker(e.target.value)}>
                      <option value="">Select health worker</option>
                      {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
                    </select>
                    <button className="btn-accent flex items-center gap-1" onClick={handleAssign} disabled={!assignWorker || assigning || assignWorker === ''}>
                      {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Assign
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
