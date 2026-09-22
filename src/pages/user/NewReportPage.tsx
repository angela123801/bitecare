import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { validateImage, uploadBitePhoto } from '@/lib/storage';
import type { Barangay, AnimalType, WoundType, ExposureCategory } from '@/types';
import { ANIMAL_TYPE_LABELS, CATEGORY_LABELS } from '@/config/constants';
import { cn } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, Loader2, CheckCircle2, User, PawPrint,
  MapPin, ClipboardCheck, AlertCircle, Camera, MapPinned, X, Crosshair,
} from 'lucide-react';

const STEPS = [
  { label: 'Patient Info', icon: User },
  { label: 'Incident', icon: PawPrint },
  { label: 'Location', icon: MapPin },
  { label: 'Review', icon: ClipboardCheck },
];

const WOUND_LABELS: Record<WoundType, string> = {
  bite: 'Bite', scratch: 'Scratch', lick_on_broken_skin: 'Lick on Broken Skin', other: 'Other',
};

interface FormData {
  patient_name: string; patient_age: string; patient_sex: string;
  patient_phone: string; patient_address: string; patient_barangay_id: string;
  bite_date: string; bite_time: string; animal_type: string; animal_status: string;
  animal_vaccinated: string; bite_site: string; wound_type: string; category: string;
  number_of_wounds: string; provoked: boolean; first_aid_given: boolean;
  first_aid_details: string; incident_location: string; incident_barangay_id: string;
  incident_latitude: string; incident_longitude: string;
}

const init: FormData = {
  patient_name: '', patient_age: '', patient_sex: '', patient_phone: '',
  patient_address: '', patient_barangay_id: '',
  bite_date: new Date().toISOString().split('T')[0], bite_time: '',
  animal_type: '', animal_status: '', animal_vaccinated: 'unknown',
  bite_site: '', wound_type: '', category: '', number_of_wounds: '1',
  provoked: false, first_aid_given: false, first_aid_details: '',
  incident_location: '', incident_barangay_id: '',
  incident_latitude: '', incident_longitude: '',
};

const Label = ({ text, req }: { text: string; req?: boolean }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1">{text}{req && ' *'}</label>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value || '—'}</span>
  </div>
);

export default function NewReportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<FormData>(init);
  const [barangays, setBrgy] = useState<Barangay[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    supabase.from('barangays').select('*').order('name').then(({ data }) => { if (data) setBrgy(data); });
  }, []);

  // Clean up preview URLs on unmount
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const set = (k: keyof FormData, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const brgyName = (id: string) => barangays.find((b) => b.id === id)?.name ?? '—';

  /* --- Photos --- */
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const validFiles: File[] = [];
    for (const file of incoming) {
      const err = validateImage(file);
      if (err) { setError(err); return; }
      validFiles.push(file);
    }
    setError('');
    const next = [...photos, ...validFiles].slice(0, 5);
    setPhotos(next);
    setPreviews(next.map((file) => URL.createObjectURL(file)));
  };

  const removePhoto = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    const np = photos.filter((_, i) => i !== idx);
    setPhotos(np);
    setPreviews(np.map((file) => URL.createObjectURL(file)));
  };

  /* --- Geolocation --- */
  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported by your browser'); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((p) => ({
          ...p,
          incident_latitude: pos.coords.latitude.toFixed(6),
          incident_longitude: pos.coords.longitude.toFixed(6),
        }));
        setGeoLoading(false);
      },
      (err) => { setError(`Location error: ${err.message}`); setGeoLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* --- Validation --- */
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!f.patient_name.trim()) e.patient_name = 'Required';
      if (!f.patient_sex) e.patient_sex = 'Required';
    } else if (step === 1) {
      if (!f.bite_date) e.bite_date = 'Required';
      if (!f.animal_type) e.animal_type = 'Required';
      if (!f.wound_type) e.wound_type = 'Required';
      if (!f.category) e.category = 'Required';
      if (!f.bite_site.trim()) e.bite_site = 'Required';
    } else if (step === 2) {
      if (!f.incident_location.trim()) e.incident_location = 'Required';
    }
    setErrs(e);
    return !Object.keys(e).length;
  };

  const next = () => { if (validate()) setStep((s) => Math.min(s + 1, 3)); };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const Err = ({ k }: { k: string }) => errs[k] ? (
    <p className="text-danger-600 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errs[k]}</p>
  ) : null;

  const BrgySelect = ({ field }: { field: 'patient_barangay_id' | 'incident_barangay_id' }) => (
    <select className="input-field" value={f[field]} onChange={(e) => set(field, e.target.value)}>
      <option value="">Select barangay</option>
      {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  /* --- Submit --- */
  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true); setError('');

    const { data: report, error: err } = await supabase.from('bite_reports').insert({
      reporter_id: user.id, patient_name: f.patient_name.trim(),
      patient_age: f.patient_age ? Number(f.patient_age) : null,
      patient_sex: f.patient_sex || null, patient_phone: f.patient_phone.trim(),
      patient_address: f.patient_address.trim(),
      patient_barangay_id: f.patient_barangay_id || null,
      bite_date: f.bite_date, bite_time: f.bite_time || null,
      animal_type: f.animal_type, animal_status: f.animal_status || 'unknown',
      animal_vaccinated: f.animal_vaccinated, bite_site: f.bite_site.trim(),
      wound_type: f.wound_type, category: f.category,
      number_of_wounds: Number(f.number_of_wounds) || 1,
      provoked: f.provoked, first_aid_given: f.first_aid_given,
      first_aid_details: f.first_aid_details.trim(),
      incident_location: f.incident_location.trim(),
      incident_barangay_id: f.incident_barangay_id || null,
      incident_latitude: f.incident_latitude ? Number(f.incident_latitude) : null,
      incident_longitude: f.incident_longitude ? Number(f.incident_longitude) : null,
      status: 'reported' as const,
    }).select('id').single();

    if (err || !report) { setError(err?.message ?? 'Failed to create report'); setSubmitting(false); return; }

    // Upload photos
    if (photos.length > 0) {
      try {
        const uploads = await Promise.all(
          photos.map((file) => uploadBitePhoto(user.id, report.id, file)),
        );
        const photoRows = uploads.map((u, i) => ({
          report_id: report.id,
          storage_path: u.path,
          file_name: photos[i].name,
          file_size: photos[i].size,
          mime_type: photos[i].type,
          uploaded_by: user.id,
        }));
        await supabase.from('bite_report_photos').insert(photoRows);
      } catch (uploadErr) {
        console.error('Photo upload error:', uploadErr);
        // Report was created — continue to navigate, photos can be added later
      }
    }

    navigate('/my-reports', { replace: true });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Bite Report</h1>

      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon; const active = i === step; const done = i < step;
          return (
            <div key={s.label} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                  done && 'bg-success-600 text-white', active && 'bg-primary-600 text-white',
                  !done && !active && 'bg-gray-200 text-gray-500')}>
                  {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span className={cn('text-xs mt-1.5 font-medium', active ? 'text-primary-700' : 'text-gray-500')}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn('flex-1 h-0.5 mx-2', i < step ? 'bg-success-400' : 'bg-gray-200')} />}
            </div>
          );
        })}
      </div>

      <div className="card p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Step 0: Patient */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Patient Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label text="Full Name" req /><input className="input-field" value={f.patient_name} onChange={(e) => set('patient_name', e.target.value)} /><Err k="patient_name" />
              </div>
              <div>
                <Label text="Age" /><input className="input-field" type="number" min={0} max={150} value={f.patient_age} onChange={(e) => set('patient_age', e.target.value)} />
              </div>
              <div>
                <Label text="Sex" req />
                <select className="input-field" value={f.patient_sex} onChange={(e) => set('patient_sex', e.target.value)}>
                  <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select><Err k="patient_sex" />
              </div>
              <div><Label text="Phone" /><input className="input-field" value={f.patient_phone} onChange={(e) => set('patient_phone', e.target.value)} placeholder="09XX XXX XXXX" /></div>
              <div><Label text="Barangay" /><BrgySelect field="patient_barangay_id" /></div>
              <div className="sm:col-span-2"><Label text="Address" /><input className="input-field" value={f.patient_address} onChange={(e) => set('patient_address', e.target.value)} /></div>
            </div>
          </div>
        )}

        {/* Step 1: Incident */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Incident Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label text="Bite Date" req /><input className="input-field" type="date" value={f.bite_date} onChange={(e) => set('bite_date', e.target.value)} /><Err k="bite_date" /></div>
              <div><Label text="Bite Time" /><input className="input-field" type="time" value={f.bite_time} onChange={(e) => set('bite_time', e.target.value)} /></div>
              <div>
                <Label text="Animal Type" req />
                <select className="input-field" value={f.animal_type} onChange={(e) => set('animal_type', e.target.value)}>
                  <option value="">Select</option>
                  {Object.entries(ANIMAL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select><Err k="animal_type" />
              </div>
              <div>
                <Label text="Animal Status" />
                <select className="input-field" value={f.animal_status} onChange={(e) => set('animal_status', e.target.value)}>
                  <option value="">Select</option><option value="alive">Alive</option><option value="dead">Dead</option><option value="stray">Stray</option><option value="unknown">Unknown</option>
                </select>
              </div>
              <div>
                <Label text="Animal Vaccinated" />
                <select className="input-field" value={f.animal_vaccinated} onChange={(e) => set('animal_vaccinated', e.target.value)}>
                  <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </div>
              <div><Label text="Bite Site" req /><input className="input-field" value={f.bite_site} onChange={(e) => set('bite_site', e.target.value)} placeholder="e.g. Left hand" /><Err k="bite_site" /></div>
              <div>
                <Label text="Wound Type" req />
                <select className="input-field" value={f.wound_type} onChange={(e) => set('wound_type', e.target.value)}>
                  <option value="">Select</option>
                  {Object.entries(WOUND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select><Err k="wound_type" />
              </div>
              <div>
                <Label text="Exposure Category" req />
                <select className="input-field" value={f.category} onChange={(e) => set('category', e.target.value)}>
                  <option value="">Select</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select><Err k="category" />
              </div>
              <div><Label text="Number of Wounds" /><input className="input-field" type="number" min={1} value={f.number_of_wounds} onChange={(e) => set('number_of_wounds', e.target.value)} /></div>
              <div className="flex items-center gap-6 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="rounded border-gray-300" checked={f.provoked} onChange={(e) => set('provoked', e.target.checked)} />Provoked
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="rounded border-gray-300" checked={f.first_aid_given} onChange={(e) => set('first_aid_given', e.target.checked)} />First aid given
                </label>
              </div>
              {f.first_aid_given && (
                <div className="sm:col-span-2"><Label text="First Aid Details" /><textarea className="input-field" rows={2} value={f.first_aid_details} onChange={(e) => set('first_aid_details', e.target.value)} /></div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Location + Photos */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Incident Location</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label text="Location Description" req /><input className="input-field" value={f.incident_location} onChange={(e) => set('incident_location', e.target.value)} placeholder="Street, landmark, or address" /><Err k="incident_location" />
                </div>
                <div><Label text="Barangay" /><BrgySelect field="incident_barangay_id" /></div>
              </div>

              {/* Lat/Lng */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-secondary text-sm flex items-center gap-1.5" onClick={useMyLocation} disabled={geoLoading}>
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                    {geoLoading ? 'Locating…' : 'Use my location'}
                  </button>
                  <button type="button" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1" onClick={() => setShowManualCoords(!showManualCoords)}>
                    <MapPinned className="w-4 h-4" />{showManualCoords ? 'Hide coordinates' : 'Enter manually'}
                  </button>
                </div>
                {(showManualCoords || f.incident_latitude) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label text="Latitude" />
                      <input className="input-field" type="number" step="any" placeholder="e.g. 14.5995" value={f.incident_latitude} onChange={(e) => set('incident_latitude', e.target.value)} />
                    </div>
                    <div>
                      <Label text="Longitude" />
                      <input className="input-field" type="number" step="any" placeholder="e.g. 120.9842" value={f.incident_longitude} onChange={(e) => set('incident_longitude', e.target.value)} />
                    </div>
                  </div>
                )}
                {f.incident_latitude && f.incident_longitude && !showManualCoords && (
                  <p className="text-xs text-gray-500">📍 {f.incident_latitude}, {f.incident_longitude}</p>
                )}
              </div>
            </div>

            {/* Photo upload */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Photos <span className="text-sm font-normal text-gray-500">(optional, max 5)</span></h2>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
              {photos.length < 5 && (
                <button type="button" className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => fileRef.current?.click()}>
                  <Camera className="w-4 h-4" /> Add photos
                </button>
              )}
              {previews.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                      <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Review Your Report</h2>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Patient</h3>
              <Row label="Name" value={f.patient_name} />
              <Row label="Age / Sex" value={`${f.patient_age || '—'} / ${f.patient_sex || '—'}`} />
              <Row label="Phone" value={f.patient_phone} />
              <Row label="Address" value={f.patient_address} />
              <Row label="Barangay" value={brgyName(f.patient_barangay_id)} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Incident</h3>
              <Row label="Date / Time" value={`${f.bite_date} ${f.bite_time || ''}`} />
              <Row label="Animal" value={f.animal_type ? ANIMAL_TYPE_LABELS[f.animal_type as AnimalType] : '—'} />
              <Row label="Animal Status" value={f.animal_status} />
              <Row label="Vaccinated" value={f.animal_vaccinated} />
              <Row label="Bite Site" value={f.bite_site} />
              <Row label="Wound Type" value={f.wound_type ? WOUND_LABELS[f.wound_type as WoundType] : '—'} />
              <Row label="Category" value={f.category ? CATEGORY_LABELS[f.category as ExposureCategory] : '—'} />
              <Row label="Wounds" value={f.number_of_wounds} />
              <Row label="Provoked" value={f.provoked ? 'Yes' : 'No'} />
              <Row label="First Aid" value={f.first_aid_given ? 'Yes' : 'No'} />
              {f.first_aid_given && <Row label="Details" value={f.first_aid_details} />}
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Location</h3>
              <Row label="Location" value={f.incident_location} />
              <Row label="Barangay" value={brgyName(f.incident_barangay_id)} />
              {f.incident_latitude && f.incident_longitude && (
                <Row label="Coordinates" value={`${f.incident_latitude}, ${f.incident_longitude}`} />
              )}
            </div>
            {photos.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Photos ({photos.length})</h3>
                <div className="flex flex-wrap gap-3 mt-2">
                  {previews.map((src, i) => (
                    <img key={i} src={src} alt={`Photo ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-200">
          <button type="button" className="btn-secondary flex items-center gap-1" onClick={prev} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          {step < 3 ? (
            <button type="button" className="btn-primary flex items-center gap-1" onClick={next}>
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" className="btn-primary flex items-center gap-2" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
