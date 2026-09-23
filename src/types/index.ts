export type UserRole = 'user' | 'health_worker' | 'admin' | 'super_admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string;
  role: UserRole;
  staff_id: string | null;
  barangay_id: string | null;
  address: string;
  city: string;
  date_of_birth: string | null;
  is_active: boolean;
  verification_status: 'pending_verification' | 'verified';
  created_at: string;
  updated_at: string;
}

export interface Barangay {
  id: string;
  name: string;
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface HealthcareFacility {
  id: string;
  name: string;
  type: 'hospital' | 'health_center' | 'animal_bite_center' | 'vaccination_center' | 'veterinary_clinic';
  address: string;
  barangay_id: string | null;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  operating_hours: string;
  services: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  barangay?: Barangay;
}

export type ReportStatus =
  | 'reported'
  | 'under_investigation'
  | 'treatment_started'
  | 'treatment_ongoing'
  | 'treatment_completed'
  | 'closed'
  | 'cancelled';

export type AnimalType = 'dog' | 'cat' | 'rat' | 'bat' | 'monkey' | 'other';
export type WoundType = 'bite' | 'scratch' | 'lick_on_broken_skin' | 'other';
export type ExposureCategory = 'I' | 'II' | 'III';
export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface BiteReport {
  id: string;
  reporter_id: string;
  patient_name: string;
  patient_age: number | null;
  patient_sex: 'male' | 'female' | 'other' | null;
  patient_phone: string;
  patient_address: string;
  patient_barangay_id: string | null;
  bite_date: string;
  bite_time: string | null;
  animal_type: AnimalType;
  animal_type_other: string;
  animal_status: 'alive' | 'dead' | 'unknown' | 'stray';
  animal_vaccinated: 'yes' | 'no' | 'unknown';
  bite_site: string;
  wound_type: WoundType;
  category: ExposureCategory;
  number_of_wounds: number;
  provoked: boolean;
  incident_location: string;
  incident_latitude: number | null;
  incident_longitude: number | null;
  incident_barangay_id: string | null;
  status: ReportStatus;
  severity: Severity;
  assigned_worker_id: string | null;
  assigned_facility_id: string | null;
  first_aid_given: boolean;
  first_aid_details: string;
  notes: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  reporter?: Profile;
  assigned_worker?: Profile;
  assigned_facility?: HealthcareFacility;
  patient_barangay?: Barangay;
  incident_barangay?: Barangay;
  photos?: BiteReportPhoto[];
}

export interface BiteReportPhoto {
  id: string;
  report_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  created_at: string;
  url?: string;
}

export interface BiteReportStatusHistory {
  id: string;
  report_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  notes: string;
  created_at: string;
  actor?: Profile;
}

export type VaccineType = 'PVRV' | 'PCECV' | 'ERIG' | 'HRIG' | 'TT';
export type VaccinationStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled' | 'rescheduled';

export interface VaccinationRecord {
  id: string;
  report_id: string;
  patient_name: string;
  vaccine_type: VaccineType;
  dose_number: number;
  dose_label: string;
  scheduled_date: string;
  administered_date: string | null;
  administered_by: string | null;
  facility_id: string | null;
  batch_number: string;
  site_of_injection: string;
  adverse_reaction: string;
  status: VaccinationStatus;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  facility?: HealthcareFacility;
  administered_by_profile?: Profile;
  report?: BiteReport;
}

export type NotificationType = 'info' | 'warning' | 'success' | 'error' | 'reminder' | 'assignment';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  actor?: Profile;
}

export interface EducationContent {
  id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  summary: string;
  cover_image_url: string;
  is_published: boolean;
  sort_order: number;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface FirstAidGuide {
  id: string;
  title: string;
  animal_type: string;
  wound_category: ExposureCategory;
  steps: { title: string; description: string }[];
  warnings: string[];
  when_to_seek_help: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
