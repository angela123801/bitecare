/*
# Tighten bite_reports write grants

1. Problem fixed
- An earlier migration had granted table-level UPDATE (all columns) to
  authenticated. A later column-list grant does not remove that broader
  privilege, so `is_archived` remained writable from the browser.

2. Security changes
- Revoke the table-level INSERT/UPDATE on bite_reports from anon and
  authenticated, then re-issue the column-restricted grants (archive columns
  excluded) so only the archive RPC can change archive state.
*/

REVOKE INSERT, UPDATE ON public.bite_reports FROM anon, authenticated;

GRANT INSERT, UPDATE (reporter_id, patient_name, patient_age, patient_sex, patient_phone,
  patient_email, patient_address, patient_barangay_id, bite_date, bite_time,
  animal_type, animal_type_other, animal_status, animal_vaccinated, bite_site,
  wound_type, category, number_of_wounds, provoked, first_aid_given,
  first_aid_details, incident_location, incident_barangay_id, incident_latitude,
  incident_longitude, status, severity, assigned_worker_id, assigned_facility_id,
  notes, closed_at, created_at, updated_at)
ON public.bite_reports TO authenticated;
