import type { UserRole, ReportStatus, Severity, AnimalType, VaccinationStatus, ExposureCategory } from '@/types';

export const APP_NAME = 'BiteCare';
export const APP_DESCRIPTION = 'Animal Bite Management & Monitoring System';
export const CITY = 'Bacolod City';
export const PROVINCE = 'Negros Occidental';

export const BACOLOD_CENTER = { lat: 10.6840, lng: 122.9740 };
export const DEFAULT_ZOOM = 13;

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Resident',
  health_worker: 'Health Worker',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  health_worker: 1,
  admin: 2,
  super_admin: 3,
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  reported: 'Reported',
  under_investigation: 'Under Investigation',
  treatment_started: 'Treatment Started',
  treatment_ongoing: 'Treatment Ongoing',
  treatment_completed: 'Treatment Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const REPORT_STATUS_COLORS: Record<ReportStatus, string> = {
  reported: 'bg-warning-100 text-warning-800',
  under_investigation: 'bg-primary-100 text-primary-800',
  treatment_started: 'bg-accent-100 text-accent-800',
  treatment_ongoing: 'bg-accent-100 text-accent-800',
  treatment_completed: 'bg-success-100 text-success-800',
  closed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-danger-100 text-danger-800',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: 'bg-success-100 text-success-800',
  moderate: 'bg-warning-100 text-warning-800',
  high: 'bg-danger-100 text-danger-800',
  critical: 'bg-danger-200 text-danger-900',
};

export const ANIMAL_TYPE_LABELS: Record<AnimalType, string> = {
  dog: 'Dog',
  cat: 'Cat',
  rat: 'Rat',
  bat: 'Bat',
  monkey: 'Monkey',
  other: 'Other',
};

export const VACCINATION_STATUS_LABELS: Record<VaccinationStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export const VACCINATION_STATUS_COLORS: Record<VaccinationStatus, string> = {
  scheduled: 'bg-primary-100 text-primary-800',
  completed: 'bg-success-100 text-success-800',
  missed: 'bg-danger-100 text-danger-800',
  cancelled: 'bg-gray-100 text-gray-800',
  rescheduled: 'bg-warning-100 text-warning-800',
};

export const CATEGORY_LABELS: Record<ExposureCategory, string> = {
  I: 'Category I - No treatment needed',
  II: 'Category II - Wound treatment + vaccination',
  III: 'Category III - Wound treatment + vaccination + RIG',
};

export const ESSEN_REGIMEN_DAYS = [0, 3, 7, 14, 28];

export const FACILITY_TYPE_LABELS: Record<string, string> = {
  hospital: 'Hospital',
  health_center: 'Health Center',
  animal_bite_center: 'Animal Bite Center',
  vaccination_center: 'Vaccination Center',
  veterinary_clinic: 'Veterinary Clinic',
};

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
