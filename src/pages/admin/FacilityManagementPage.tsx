import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  FACILITY_TYPE_LABELS,
  FACILITY_VERIFICATION_LABELS,
} from '@/config/constants';
import { getErrorMessage } from '@/lib/utils';
import { isValidLatLng } from '@/lib/geo';
import LocationPicker, { type LatLngValue } from '@/components/map/LocationPicker';
import type { HealthcareFacility, Barangay, FacilityVerificationStatus } from '@/types';
import {
  Plus, Loader2, MapPin, Phone, Clock, X, Pencil, Inbox,
  ShieldCheck, ShieldAlert, Info, EyeOff, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FacilityForm {
  name: string;
  type: string;
  address: string;
  barangay_id: string;
  coords: LatLngValue | null;
  phone: string;
  email: string;
  operating_hours: string;
  services: string;
  is_active: boolean;
  is_abtc: boolean;
  verification_status: FacilityVerificationStatus;
  source: string;
}

function defaultForm(): FacilityForm {
  return {
    name: '',
    type: 'animal_bite_center',
    address: '',
    barangay_id: '',
    coords: { lat: 10.684, lng: 122.974 },
    phone: '',
    email: '',
    operating_hours: '',
    services: '',
    is_active: true,
    is_abtc: false,
    verification_status: 'unverified',
    source: '',
  };
}

function VerificationBadge({ status }: { status: FacilityVerificationStatus }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200">
        <ShieldCheck className="w-3 h-3" /> {FACILITY_VERIFICATION_LABELS.verified}
      </span>
    );
  }
  if (status === 'needs_review') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warning-50 text-warning-800 border border-warning-200">
        <ShieldAlert className="w-3 h-3" /> {FACILITY_VERIFICATION_LABELS.needs_review}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
      <Info className="w-3 h-3" /> {FACILITY_VERIFICATION_LABELS.unverified}
    </span>
  );
}

export default function FacilityManagementPage() {
  const [facilities, setFacilities] = useState<HealthcareFacility[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HealthcareFacility | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FacilityForm>(defaultForm());

  useEffect(() => { loadFacilities(); fetchBarangays(); }, []);

  async function loadFacilities() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('healthcare_facilities')
      .select('*, barangay:barangays(name)')
      .order('name');
    if (err) { setError(getErrorMessage(err, 'Unable to load facilities.')); setFacilities([]); }
    else setFacilities((data as unknown as HealthcareFacility[]) ?? []);
    setLoading(false);
  }

  async function fetchBarangays() {
    const { data, error: err } = await supabase.from('barangays').select('*').order('name');
    if (err) { setError(getErrorMessage(err, 'Unable to load barangays.')); return; }
    setBarangays((data as Barangay[]) ?? []);
  }

  function openEdit(f: HealthcareFacility) {
    setEditing(f);
    setForm({
      name: f.name,
      type: f.type,
      address: f.address,
      barangay_id: f.barangay_id ?? '',
      coords: isValidLatLng(f.latitude, f.longitude) ? { lat: f.latitude, lng: f.longitude } : null,
      phone: f.phone,
      email: f.email,
      operating_hours: f.operating_hours,
      services: f.services?.join(', ') ?? '',
      is_active: f.is_active,
      is_abtc: f.is_abtc === true,
      verification_status: f.verification_status ?? 'unverified',
      source: f.source ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('A facility name is required.'); return; }
    if (!form.coords || !isValidLatLng(form.coords.lat, form.coords.lng)) {
      setError('Place the facility pin on the map, or type a valid latitude and longitude.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim(),
      barangay_id: form.barangay_id || null,
      latitude: form.coords.lat,
      longitude: form.coords.lng,
      phone: form.phone.trim(),
      email: form.email.trim(),
      operating_hours: form.operating_hours.trim(),
      services: form.services.split(',').map(s => s.trim()).filter(Boolean),
      is_active: form.is_active,
      is_abtc: form.is_abtc,
      verification_status: form.verification_status,
      source: form.source.trim(),
      verified_at: form.verification_status === 'verified' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let err;
    if (editing) {
      ({ error: err } = await supabase.from('healthcare_facilities').update(payload).eq('id', editing.id));
    } else {
      ({ error: err } = await supabase.from('healthcare_facilities').insert(payload));
    }

    if (err) {
      setError(
        err.code === '23505'
          ? 'A facility with this name already exists. Edit the existing record instead.'
          : getErrorMessage(err, 'Unable to save this facility.'),
      );
    } else {
      setShowForm(false);
      setEditing(null);
      setForm(defaultForm());
      loadFacilities();
    }
    setSaving(false);
  }

  async function toggleActive(f: HealthcareFacility) {
    setBusyId(f.id);
    setError('');
    const { error: err } = await supabase
      .from('healthcare_facilities')
      .update({ is_active: !f.is_active, updated_at: new Date().toISOString() })
      .eq('id', f.id);
    if (err) setError(getErrorMessage(err, 'Unable to update this facility.'));
    else await loadFacilities();
    setBusyId(null);
  }

  async function markVerified(f: HealthcareFacility) {
    setBusyId(f.id);
    setError('');
    const { error: err } = await supabase
      .from('healthcare_facilities')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id);
    if (err) setError(getErrorMessage(err, 'Unable to verify this facility.'));
    else await loadFacilities();
    setBusyId(null);
  }

  const set = (field: keyof FacilityForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  const activeCount = facilities.filter(f => f.is_active).length;
  const reviewCount = facilities.filter(f => f.verification_status === 'needs_review').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Healthcare Facilities</h1>
          <p className="text-sm text-gray-500 mt-1">
            {facilities.length} facilities · {activeCount} active
            {reviewCount > 0 && ` · ${reviewCount} awaiting verification`}
          </p>
        </div>
        <button onClick={() => { setEditing(null); setForm(defaultForm()); setError(''); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Facility
        </button>
      </div>

      {error && !showForm && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Facility' : 'Add Facility'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && <div className="p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={set('name')} className="input-field" required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={form.type} onChange={set('type')} className="input-field">
                    {Object.entries(FACILITY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Barangay</label>
                  <select value={form.barangay_id} onChange={set('barangay_id')} className="input-field">
                    <option value="">Select barangay</option>
                    {barangays.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input value={form.address} onChange={set('address')} className="input-field" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <LocationPicker
                  value={form.coords}
                  onChange={(coords) => setForm(f => ({ ...f, coords }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input value={form.phone} onChange={set('phone')} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input value={form.email} onChange={set('email')} className="input-field" type="email" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operating Hours</label>
                <input value={form.operating_hours} onChange={set('operating_hours')} className="input-field" placeholder="e.g. Mon-Sat 8AM-5PM" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Services (comma-separated)</label>
                <input value={form.services} onChange={set('services')} className="input-field" placeholder="Rabies vaccination, Wound treatment" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification</label>
                  <select
                    value={form.verification_status}
                    onChange={(e) => setForm(f => ({ ...f, verification_status: e.target.value as FacilityVerificationStatus }))}
                    className="input-field"
                  >
                    {(Object.keys(FACILITY_VERIFICATION_LABELS) as FacilityVerificationStatus[]).map((k) => (
                      <option key={k} value={k}>{FACILITY_VERIFICATION_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source / notes</label>
                  <input value={form.source} onChange={set('source')} className="input-field" placeholder="Where this record came from" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_abtc}
                    onChange={(e) => setForm(f => ({ ...f, is_abtc: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Registered Animal Bite Treatment Center
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Active (visible on the map)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Update' : 'Add'} Facility
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : facilities.length === 0 ? (
        <div className="text-center py-12"><Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No facilities yet</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.map((f) => (
            <div key={f.id} className={cn('card p-5 space-y-3', !f.is_active && 'opacity-70')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 leading-snug">{f.name}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      {FACILITY_TYPE_LABELS[f.type] ?? f.type}
                    </span>
                    {f.is_abtc && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-200">
                        <ShieldCheck className="w-3 h-3" /> ABTC
                      </span>
                    )}
                    <VerificationBadge status={f.verification_status ?? 'unverified'} />
                    {!f.is_active && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        <EyeOff className="w-3 h-3" /> Inactive
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => openEdit(f)} aria-label={`Edit ${f.name}`} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 flex-shrink-0">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>

              {f.address && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{f.address}</span>
                </div>
              )}
              {f.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <span>{f.phone}</span>
                </div>
              )}
              {f.operating_hours && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>{f.operating_hours}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                {f.verification_status !== 'verified' && (
                  <button
                    onClick={() => markVerified(f)}
                    disabled={busyId === f.id}
                    className="flex items-center gap-1.5 text-xs font-medium text-success-700 hover:text-success-800 px-2 py-1.5 rounded-lg hover:bg-success-50 transition-colors disabled:opacity-60"
                  >
                    {busyId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Mark verified
                  </button>
                )}
                <button
                  onClick={() => toggleActive(f)}
                  disabled={busyId === f.id}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors ml-auto disabled:opacity-60"
                >
                  {f.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {f.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
