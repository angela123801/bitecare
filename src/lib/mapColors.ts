import type { Severity } from '@/types';

/** Marker tint per severity so the map reads at a glance. */
export const SEVERITY_COLORS: Record<Severity, string> = {
  low: '#16a34a',
  moderate: '#f59e0b',
  high: '#f97316',
  critical: '#dc2626',
};

/** Marker tint per healthcare facility type. */
export const FACILITY_COLORS: Record<string, string> = {
  animal_bite_center: '#dc2626',
  health_center: '#2563eb',
  hospital: '#16a34a',
  vaccination_center: '#0d9488',
  veterinary_clinic: '#a16207',
};
