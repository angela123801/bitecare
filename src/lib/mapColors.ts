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
  hospital: '#dc2626',
  health_center: '#2563eb',
  animal_bite_center: '#d97706',
  vaccination_center: '#16a34a',
  veterinary_clinic: '#0f766e',
};
