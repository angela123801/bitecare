import { FACILITY_COLORS } from '@/lib/mapColors';
import {
  FACILITY_TYPE_DESCRIPTIONS,
  FACILITY_TYPE_LABELS,
  FACILITY_VERIFICATION_LABELS,
} from '@/config/constants';
import { formatDistance } from '@/lib/geo';
import type { MapFacility } from '@/lib/facilities';
import {
  Building2, Clock, Crosshair, ExternalLink, Info, MapPin, Navigation,
  Phone, ShieldAlert, ShieldCheck, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FacilityCardProps {
  facility: MapFacility;
  distanceKm: number | null;
  onClose: () => void;
  onDirections: () => void;
  onCenter: () => void;
  onOpenExternal: () => void;
}

function VerificationBadge({ facility }: { facility: MapFacility }) {
  const status = facility.verification;
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

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-xs text-gray-700 break-words">{value}</p>
      </div>
    </div>
  );
}

/**
 * The information card shown when a facility marker or list row is selected. It
 * carries only public directory information — never patient or reporter data.
 */
export default function FacilityCard({
  facility,
  distanceKm,
  onClose,
  onDirections,
  onCenter,
  onOpenExternal,
}: FacilityCardProps) {
  const color = FACILITY_COLORS[facility.type] ?? '#6b7280';

  return (
    <div className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-gray-100 w-full sm:w-[21rem] max-w-[calc(100vw-1.5rem)] flex flex-col overflow-hidden">
      <div className="flex items-start gap-3 p-3.5 border-b border-gray-100">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ background: color }}
        >
          {facility.type === 'animal_bite_center'
            ? <ShieldCheck className="w-4 h-4" />
            : <Building2 className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900 leading-snug">{facility.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {FACILITY_TYPE_LABELS[facility.type] ?? facility.type}
            {facility.isAbtc && facility.type !== 'animal_bite_center' && ' · registered ABTC'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close facility details"
          className="p-1.5 -mt-0.5 -mr-0.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3.5 py-3 space-y-2.5 overflow-y-auto max-h-[38vh] sm:max-h-[46vh]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ background: color }}
          >
            {FACILITY_TYPE_DESCRIPTIONS[facility.type] ?? FACILITY_TYPE_LABELS[facility.type]}
          </span>
          <VerificationBadge facility={facility} />
          {distanceKm != null && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              <Navigation className="w-3 h-3" /> {formatDistance(distanceKm)} away
            </span>
          )}
        </div>

        {facility.verification === 'needs_review' && (
          <p className="text-[11px] text-warning-800 bg-warning-50 border border-warning-200 rounded-lg px-2.5 py-2 leading-relaxed">
            The exact map pin for this facility has not been confirmed yet. It is shown near the
            centre of its barangay and is flagged for administrator review.
          </p>
        )}

        <DetailRow icon={MapPin} label="Address" value={facility.address} />
        <DetailRow icon={MapPin} label="Barangay" value={facility.barangayName} />
        <DetailRow icon={Phone} label="Contact number" value={facility.phone} />
        <DetailRow icon={Clock} label="Operating hours" value={facility.operatingHours} />

        {facility.services.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Services
            </p>
            <div className="flex flex-wrap gap-1">
              {facility.services.map((s) => (
                <span
                  key={s}
                  className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2">
          <Crosshair className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Coordinates
            </p>
            <p className="text-xs text-gray-700 font-mono">
              {facility.latitude.toFixed(6)}, {facility.longitude.toFixed(6)}
            </p>
          </div>
        </div>

        {facility.source && (
          <p className="text-[10px] text-gray-400 leading-relaxed border-t border-gray-100 pt-2">
            Source: {facility.source}
          </p>
        )}
      </div>

      <div className="p-3.5 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button
          type="button"
          onClick={onDirections}
          className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5"
        >
          <Navigation className="w-4 h-4" /> Get Directions
        </button>
        <button
          type="button"
          onClick={onCenter}
          title="Center the map on this facility"
          aria-label="Center the map on this facility"
          className={cn(
            'p-2.5 rounded-lg border border-gray-200 text-gray-600',
            'hover:bg-gray-50 hover:text-gray-900 transition-colors flex-shrink-0',
          )}
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenExternal}
          title="Open in Google Maps"
          aria-label="Open this facility in Google Maps"
          className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors flex-shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
