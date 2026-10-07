import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';
import LocationPicker from '@/components/map/LocationPicker';
import { isValidLatLng } from '@/lib/geo';
import { AlertCircle, Loader2, MapPin, X } from 'lucide-react';

interface EditReportLocationModalProps {
  reportId: string;
  /** Current coordinates, or null when the report has never been pinned. */
  current: { lat: number; lng: number } | null;
  /** Starting view, e.g. the report's barangay centre. */
  fallbackCenter?: { lat: number; lng: number };
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Lets a report owner (or staff, per RLS) set or correct the incident
 * coordinates. Saving writes real coordinates to the report, which the map's
 * realtime subscription then reflects as a moved marker and heat point.
 */
export default function EditReportLocationModal({
  reportId,
  current,
  fallbackCenter,
  onClose,
  onSaved,
}: EditReportLocationModalProps) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!value || !isValidLatLng(value.lat, value.lng)) {
      setError('Pin the incident location on the map before saving.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('bite_reports')
      .update({
        incident_latitude: Number(value.lat.toFixed(6)),
        incident_longitude: Number(value.lng.toFixed(6)),
      })
      .eq('id', reportId);
    if (err) {
      setError(getErrorMessage(err, 'Could not save the location. Please try again.'));
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit incident location"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <MapPin className="w-4 h-4 text-primary-600" /> Incident Location
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <LocationPicker value={value} onChange={setValue} fallbackCenter={fallbackCenter} />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={handleSave}
            disabled={saving || !value}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save location'}
          </button>
        </div>
      </div>
    </div>
  );
}
