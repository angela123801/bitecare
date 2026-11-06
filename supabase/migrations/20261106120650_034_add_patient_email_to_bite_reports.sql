/*
# Add patient_email snapshot to bite_reports

1. Changes
   - `bite_reports.patient_email` (text, not null default '') — a snapshot of the
     reporter's email captured at submission time. Snapshots keep historical
     reports unchanged when the account holder later edits their profile.

2. Security
   - No policy or grant changes are needed: RLS already scopes each row to its
     owner (and staff), and the grants on bite_reports are table-level, so the
     new column is covered by the existing SELECT/INSERT/UPDATE grants.

3. Notes
   - Existing rows default to '' and are unaffected.
*/

ALTER TABLE public.bite_reports
  ADD COLUMN IF NOT EXISTS patient_email text NOT NULL DEFAULT '';
