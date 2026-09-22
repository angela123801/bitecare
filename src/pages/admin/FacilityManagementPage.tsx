import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FACILITY_TYPE_LABELS } from '@/config/constants';
import { getErrorMessage } from '@/lib/utils';
import type { HealthcareFacility, Barangay } from '@/types';
import { Plus, Loader2, MapPin, Phone, Clock, X, Pencil, Inbox } from 'lucide-react';

export default function FacilityManagementPage() {
  const [facilities, setFacilities] = useState<HealthcareFacility[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HealthcareFacility | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm());

  function defaultForm() {
    return { name: '', type: 'animal_bite_center', address: '', barangay_id: '', latitude: '10.6840', longitude: '122.9740', phone: '', email: '', operating_hours: '', services: '' };
  }

  useEffect(() => { loadFacilities(); fetchBarangays(); }, []);

  async function loadFacilities() {
    setLoading(true);
    const { data, error: err } = await supabase.from('healthcare_facilities').select('*, barangay:barangays(name)').order('name');
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
      name: f.name, type: f.type, address: f.address, barangay_id: f.barangay_id ?? '',
      latitude: String(f.latitude), longitude: String(f.longitude), phone: f.phone,
      email: f.email, operating_hours: f.operating_hours, services: f.services?.join(', ') ?? '',
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.latitude || !form.longitude) {
      setError('Name, latitude, and longitude are required');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name, type: form.type, address: form.address,
      barangay_id: form.barangay_id || null,
      latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude),
      phone: form.phone, email: form.email, operating_hours: form.operating_hours,
      services: form.services.split(',').map(s => s.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    };

    let err;
    if (editing) {
      ({ error: err } = await supabase.from('healthcare_facilities').update(payload).eq('id', editing.id));
    } else {
      ({ error: err } = await supabase.from('healthcare_facilities').insert(payload));
    }

    if (err) { setError(err.message); }
    else { setShowForm(false); setEditing(null); setForm(defaultForm()); loadFacilities(); }
    setSaving(false);
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Healthcare Facilities</h1>
          <p className="text-sm text-gray-500 mt-1">{facilities.length} facilities</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(defaultForm()); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Facility
        </button>
      </div>

      {error && !showForm && (
        <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Facility' : 'Add Facility'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && <div className="p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={set('name')} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={set('type')} className="input-field">
                  {Object.entries(FACILITY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input value={form.address} onChange={set('address')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Barangay</label>
                <select value={form.barangay_id} onChange={set('barangay_id')} className="input-field">
                  <option value="">Select barangay</option>
                  {barangays.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude *</label>
                  <input value={form.latitude} onChange={set('latitude')} className="input-field" required type="number" step="any" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude *</label>
                  <input value={form.longitude} onChange={set('longitude')} className="input-field" required type="number" step="any" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <input value={form.operating_hours} onChange={set('operating_hours')} className="input-field" placeholder="e.g. Mon-Fri 8AM-5PM" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Services (comma-separated)</label>
                <input value={form.services} onChange={set('services')} className="input-field" placeholder="Rabies vaccination, Wound treatment" />
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
            <div key={f.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{f.name}</h3>
                  <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                    {FACILITY_TYPE_LABELS[f.type] ?? f.type}
                  </span>
                </div>
                <button onClick={() => openEdit(f)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
