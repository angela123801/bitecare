# BiteCare Database Structure

This document describes the BiteCare database: every table, its important fields and
types, how the tables relate, how permissions are enforced, and how the schema is
changed. It reflects the **live** schema, which is defined by the ordered migrations in
`supabase/migrations/`.

> **Source of truth.** The SQL files in `supabase/migrations/` are authoritative. This
> document explains them; it does not replace them. If the two ever disagree, the
> migrations win and this document should be corrected.

---

## 1. Overview

- **Engine:** PostgreSQL 15, hosted by Supabase.
- **Schema:** all application objects live in the `public` schema.
- **Auth:** Supabase Auth owns the `auth.users` table. `public.profiles` is the
  application’s own record for each user, linked one-to-one to `auth.users`.
- **Access control:** Row Level Security (RLS) is enabled on **every** table. The browser
  talks to the database directly, so the policies — not the interface — are what actually
  protect the data.
- **Privileged operations:** anything that must not be decided by the browser (assigning
  a role, verifying an account, issuing a code) runs inside a `SECURITY DEFINER` function
  that checks the caller’s role from their session.

### How schema changes are made

1. Add a new numbered file to `supabase/migrations/`, for example
   `20261005120000_028_add_field.sql`. Never edit an applied migration.
2. Write forward-only SQL: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`,
   `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.
3. Apply it locally with `npm run supabase:reset` (rebuilds from all migrations + seed).
4. Apply it to the hosted project by running the same file in the Supabase SQL Editor, or
   via the Supabase CLI.

**Never** drop a table, drop a column, rename a table, or change a column type in a
migration once real data exists — that destroys user data. Add a new column and migrate
values instead.

---

## 2. Table catalogue

### 2.1 Identity and access

#### `profiles`
The application record for every user. One row per `auth.users` row, created
automatically by the `handle_new_user` trigger on signup.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Same value as `auth.users.id` |
| `email` | text | Mirrors the sign-in email |
| `full_name` | text | Display name |
| `phone` | text | Mobile number. Residents use this as their login ID. Unique across accounts. |
| `avatar_url` | text | Profile photo path in the `avatars` bucket |
| `role` | text | `user` \| `health_worker` \| `admin` \| `super_admin` |
| `barangay_id` | uuid → `barangays.id` | Home barangay |
| `address`, `city` | text | Free-text address |
| `date_of_birth` | date | |
| `is_active` | boolean | Deactivated accounts cannot sign in |
| `verification_status` | text | `pending_verification` \| `verified` |
| `role_selected_at` | timestamptz | Set once when the role is chosen; prevents re-selection |
| `staff_id` | text | Generated login ID for staff, e.g. `BC-HW-000002`. Unique. NULL for residents. |
| `created_at`, `updated_at` | timestamptz | |

Key rules enforced here:
- A **partial unique index** on the normalised phone (`idx_profiles_phone_unique`) allows
  only one account per mobile number, ignoring NULL and empty values.
- `staff_id` is unique (`profiles_staff_id_key`).

#### `staff_id_sequences`
Counter table behind Staff ID generation. One row per role prefix (`BC-SADM`, `BC-ADM`,
`BC-HW`) holding the next number to issue. Written only by the `generate_staff_id`
function, so two simultaneous creations cannot collide.

| Column | Type | Notes |
|--------|------|-------|
| `prefix` | text, PK | e.g. `BC-HW` |
| `next_id` | integer | Next sequence number |

#### `app_settings`
Small key/value store for system switches.

| Column | Type | Notes |
|--------|------|-------|
| `key` | text, PK | |
| `value` | jsonb | |
| `updated_at` | timestamptz | |

Holds the open-registration flag read by `is_open_registration_enabled()`.

---

### 2.2 Reference data

#### `barangays`
The 61 barangays of Bacolod City, pre-seeded.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `name` | text, unique | |
| `zip_code` | text | |
| `latitude`, `longitude` | double precision | Used for the map |
| `created_at` | timestamptz | |

#### `healthcare_facilities`
Hospitals, clinics and animal-bite treatment centres.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `name` | text | |
| `type` | text | e.g. `hospital`, `animal_bite_center` |
| `address` | text | |
| `barangay_id` | uuid → `barangays.id` | |
| `latitude`, `longitude` | double precision | Map position |
| `phone`, `email` | text | |
| `operating_hours` | text | |
| `services` | text[] | Offered services |
| `is_active` | boolean | Inactive facilities are hidden |
| `created_by` | uuid → `profiles.id` | |
| `created_at`, `updated_at` | timestamptz | |

#### `education_content`
Published articles shown in the Education section.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `title`, `slug` | text | `slug` is unique |
| `category` | text | |
| `content`, `summary` | text | |
| `cover_image_url` | text | |
| `is_published` | boolean | Only published rows are readable by residents |
| `sort_order` | integer | Display order |
| `author_id` | uuid → `profiles.id` | |
| `created_at`, `updated_at` | timestamptz | |

#### `first_aid_guides`
Step-by-step first aid instructions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `title` | text | |
| `animal_type` | text | |
| `wound_category` | text | |
| `steps` | jsonb | Ordered list of steps |
| `warnings` | jsonb | Warning list |
| `when_to_seek_help` | text | |
| `is_published` | boolean | |
| `sort_order` | integer | |
| `created_at`, `updated_at` | timestamptz | |

---

### 2.3 Core domain

#### `bite_reports`
The central record: one animal-bite incident.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `reporter_id` | uuid → `profiles.id` | Who filed the report |
| `patient_name`, `patient_age`, `patient_sex`, `patient_phone`, `patient_address` | text / integer | Patient details |
| `patient_barangay_id` | uuid → `barangays.id` | |
| `bite_date`, `bite_time` | date / time | When the bite happened |
| `animal_type`, `animal_type_other`, `animal_status`, `animal_vaccinated` | text | Animal details |
| `bite_site`, `wound_type`, `category`, `number_of_wounds` | text / integer | Wound assessment |
| `provoked` | boolean | Whether the bite was provoked |
| `incident_location`, `incident_latitude`, `incident_longitude` | text / double precision | Where it happened; coordinates drive the map and heatmap |
| `incident_barangay_id` | uuid → `barangays.id` | |
| `status` | text | Case progression, e.g. `pending`, `under_review`, `completed` |
| `severity` | text | |
| `assigned_worker_id` | uuid → `profiles.id` | Health worker handling the case |
| `assigned_facility_id` | uuid → `healthcare_facilities.id` | |
| `first_aid_given`, `first_aid_details` | boolean / text | |
| `notes` | text | |
| `closed_at` | timestamptz | Set when the case is closed |
| `created_at`, `updated_at` | timestamptz | |

Status changes are written through the `update_report_status` function, which also
appends to `bite_report_status_history`.

#### `bite_report_photos`
Photos attached to a report.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `report_id` | uuid → `bite_reports.id` | |
| `storage_path` | text | Path in the `bite-photos` bucket |
| `file_name`, `mime_type` | text | |
| `file_size` | integer | Bytes |
| `uploaded_by` | uuid → `profiles.id` | |
| `created_at` | timestamptz | |

#### `bite_report_status_history`
Append-only trail of case status changes. Never updated or deleted.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `report_id` | uuid → `bite_reports.id` | |
| `from_status`, `to_status` | text | |
| `changed_by` | uuid → `profiles.id` | |
| `notes` | text | |
| `created_at` | timestamptz | |

#### `vaccination_records`
Doses administered or scheduled against a case.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `report_id` | uuid → `bite_reports.id` | The case this dose belongs to |
| `patient_name` | text | Denormalised for quick display |
| `vaccine_type` | text | |
| `dose_number` | integer | e.g. 1 = day 0 |
| `dose_label` | text | e.g. `Day 0`, `Day 3` |
| `scheduled_date`, `administered_date` | date | |
| `administered_by` | uuid → `profiles.id` | |
| `facility_id` | uuid → `healthcare_facilities.id` | |
| `batch_number`, `site_of_injection` | text | |
| `adverse_reaction` | text | |
| `status` | text | e.g. `scheduled`, `administered` |
| `notes` | text | |
| `created_by` | uuid → `profiles.id` | |
| `created_at`, `updated_at` | timestamptz | |

---

### 2.4 System

#### `notifications`
In-app notifications, one row per recipient.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `user_id` | uuid → `profiles.id` | Recipient |
| `title`, `message` | text | |
| `type` | text | |
| `reference_type`, `reference_id` | text / uuid | Optional link to a report etc. |
| `is_read` | boolean | |
| `read_at` | timestamptz | |
| `created_at` | timestamptz | |

Created through the `create_notification` function, which restricts who may notify whom.

#### `audit_logs`
Append-only record of significant events: sign-ins, account creation, role changes,
report status changes, and OTP send/verify/failure events. `old_values` and `new_values`
hold jsonb snapshots.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `actor_id` | uuid → `profiles.id` | Who acted |
| `action` | text | e.g. `account_created`, `otp_sent`, `otp_failed` |
| `entity_type` | text | e.g. `account`, `report` |
| `entity_id` | uuid | |
| `old_values`, `new_values` | jsonb | |
| `created_at` | timestamptz | |

There is deliberately **no UPDATE or DELETE policy** on this table, so the trail cannot
be altered from the application. OTP values are never written here.

---

### 2.5 Verification (OTP)

#### `otp_challenges` — the active one-time-code store
One row per (user, purpose). A new code overwrites the previous row, which invalidates it.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `user_id` | uuid → `profiles.id` | |
| `purpose` | text | `login` \| `verification` \| `password_recovery` \| `contact_change` |
| `channel` | text | `email` \| `sms` (the application currently issues SMS only) |
| `destination` | text | The number the code was actually sent to |
| `otp_hash` | text | SHA-256 of `code + ':' + salt` — the code itself is never stored |
| `salt` | text | Random per-row salt |
| `expires_at` | timestamptz | 5 minutes after issue |
| `attempts` | integer | Failed guesses for the current code; blocked at 5 |
| `resend_available_at` | timestamptz | 60-second resend cooldown |
| `send_count` | integer | Codes issued in the current window; blocked at 5 |
| `window_started_at` | timestamptz | Start of the rolling one-hour window |
| `consumed_at` | timestamptz | Set when used — enforces single use |
| `created_at`, `updated_at` | timestamptz | |

Unique constraint `otp_challenges_user_purpose_key` on `(user_id, purpose)`.

No browser role has any access to this table; it is reachable only through the
`otp_create_challenge` and `otp_verify_challenge` functions.

#### `pending_accounts` — provisioning verification store
Used by the account-provisioning path when a non-Super-Admin creates an account that
requires verification. Separate from `otp_challenges` because it predates it and keys off
a single pending account per user rather than a purpose.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `user_id` | uuid → `profiles.id`, unique | |
| `email` | text | |
| `otp_hash` | text | SHA-256 of the code |
| `salt` | text | |
| `expires_at` | timestamptz | 10 minutes after issue |
| `attempts` | integer | |
| `resend_available_at` | timestamptz | 60-second cooldown |
| `attempt_count` | integer | Codes issued; blocked at 5 |
| `created_at`, `updated_at` | timestamptz | |

---

### 2.6 Retired objects

These exist in the database but are **not used by the running application**. They are kept
rather than dropped so that nothing referencing them hard-fails, and because dropping
tables is a destructive change.

| Object | Status |
|--------|--------|
| `otp_codes` table | Retired. Previously held **plaintext** codes. All rows purged and all browser access revoked; a deny-all policy remains. Superseded by `otp_challenges`. |
| `generate_login_otp`, `verify_login_otp`, `generate_staff_login_otp`, `verify_staff_login_otp` | Retired. The old login-code functions, which returned the plaintext code and were reachable by anonymous visitors. Access revoked; superseded by the `otp_challenges` functions. |

---

## 3. Relationships

```
auth.users (Supabase)
     │ 1:1  (handle_new_user trigger)
     ▼
 profiles ──────────┐
   │  │  │          │
   │  │  └── barangay_id ──► barangays
   │  │                       ▲
   │  │                       │ patient_barangay_id / incident_barangay_id
   │  └── reporter_id ──┐     │
   │                    ▼     │
   │              bite_reports ──► healthcare_facilities (assigned_facility_id)
   │                 │  │  │
   │   assigned_worker_id  │  └── created_by / administered_by ──► profiles
   │                 │  │  │
   │                 │  │  └──► vaccination_records ──► healthcare_facilities
   │                 │  │
   │                 │  └──► bite_report_photos ──► profiles (uploaded_by)
   │                 │
   │                 └──► bite_report_status_history ──► profiles (changed_by)
   │
   ├── notifications ──► profiles (user_id)
   ├── audit_logs ──► profiles (actor_id)
   ├── education_content ──► profiles (author_id)
   └── otp_challenges / pending_accounts ──► profiles (user_id)
```

All foreign keys use `ON DELETE CASCADE` where the child cannot exist without the parent
(for example photos and status history belong to a report), and restrict or nullify where
the child should survive.

---

## 4. Roles and permission structure

### Role values

| Value | Rank | Meaning |
|-------|------|---------|
| `user` | 0 | Resident |
| `health_worker` | 1 | Health worker |
| `admin` | 2 | Administrator |
| `super_admin` | 3 | Super administrator |

### How the current role is read

`public.get_my_role()` returns the role of the caller from `profiles`, keyed on
`auth.uid()`. Policies and functions use this rather than trusting anything sent by the
browser. This is the single most important security property of the schema: **a role is
never taken from the request.**

### Who may do what

| Capability | Minimum role |
|------------|--------------|
| Read own profile, update own profile | any signed-in user |
| File a bite report | any signed-in user |
| Read all reports, manage cases | `health_worker` |
| Record or update vaccinations | `health_worker` |
| Read all profiles, manage users and facilities, manage education | `admin` |
| Read the audit log, view analytics | `super_admin` |
| Create accounts | `health_worker` (Residents only), `admin` (Health Workers and Residents), `super_admin` (any role) |
| Change a user’s role | `super_admin`, and `admin` within its own authority |

### RLS policy summary

RLS is enabled on every table. Policies are per-verb (SELECT / INSERT / UPDATE / DELETE),
never a single permissive `FOR ALL`, except for the deliberate deny-all policies on the
retired OTP tables.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | own row, plus staff as allowed | system (trigger) | own row; admin any | none |
| `barangays` | anyone (anon + authenticated) | — | — | — |
| `healthcare_facilities` | active rows | admin | admin | admin |
| `bite_reports` | reporter or staff | reporter | own or staff | staff |
| `bite_report_photos` | via report access | reporter | none | reporter |
| `bite_report_status_history` | via report access | staff | none | none |
| `vaccination_records` | staff or patient | staff | staff | admin |
| `notifications` | own rows | own or staff | own rows | own rows |
| `audit_logs` | super_admin | any authenticated | none | none |
| `education_content` | published rows; all rows for staff | admin | admin | admin |
| `first_aid_guides` | published rows; all rows for staff | admin | admin | admin |
| `app_settings` | anyone | — | — | — |
| `otp_challenges` | deny all (functions only) | deny | deny | deny |
| `otp_codes` (retired) | deny all | deny | deny | deny |
| `pending_accounts` | admin/super_admin | — | — | — |
| `staff_id_sequences` | deny all (functions only) | deny | deny | deny |

The exact predicates live in the migrations; the table above is a map, not a substitute.

---

## 5. Database functions

All functions are `SECURITY DEFINER` (they run with elevated rights and therefore must
check the caller themselves) unless noted. Browser `EXECUTE` is revoked except where a
function is intentionally public.

### Access and role management

| Function | Purpose | Callable by |
|----------|---------|-------------|
| `get_my_role()` | The caller’s role | authenticated |
| `is_open_registration_enabled()` | Whether public registration is on | anyone |
| `check_super_admin_exists()` | Whether a Super Admin exists yet | authenticated |
| `initialize_super_admin(target_user_id)` | One-time promotion of the first Super Admin | authenticated (only while none exists) |
| `set_user_role(target_user_id, new_role)` | Change a role, within the caller’s authority | authenticated (authority checked inside) |
| `toggle_user_active(target_user_id)` | Activate / deactivate an account | staff |
| `set_user_app_metadata(p_user_id, p_role)` | Mirror the role into the session token | service role |
| `set_new_user_app_metadata()`, `sync_role_to_metadata()` | Trigger helpers keeping the token role in step | trigger |
| `set_staff_id()` | Trigger assigning a Staff ID on creation | trigger |
| `generate_staff_id(p_role)` | Allocate the next Staff ID for a role prefix | service role |

### Account lifecycle

| Function | Purpose | Callable by |
|----------|---------|-------------|
| `handle_new_user()` | Trigger: create the `profiles` row on signup, as `pending_verification` | trigger |
| `public_complete_registration(p_role, p_full_name, p_phone, p_barangay_id)` | Self-registration: set the chosen role and details, once | authenticated |
| `admin_create_account(p_email, p_full_name, p_role, p_phone)` | Authorise and record a role assignment; the role matrix is enforced here | authenticated (staff) |
| `mark_account_verified(p_user_id)` | Set an account to verified and active | service role |
| `get_user_by_login_id(p_login_id)` | Resolve a Staff ID or resident phone to an account (used by the edge functions) | service role |

### Verification codes

| Function | Purpose | Callable by |
|----------|---------|-------------|
| `otp_allowed_channels(p_role)` | The role → channel rule. Currently SMS for every role. | anyone (exposes no secrets) |
| `otp_create_challenge(p_user_id, p_purpose, p_channel, p_destination)` | Enforce the channel rule, cooldown and rate limit; generate a code; store only its hash; return the plaintext **once** to the server | service role |
| `otp_verify_challenge(p_user_id, p_purpose, p_otp)` | Validate format, expiry, attempt cap and hash; mark used on success | service role |
| `generate_verification_otp(p_user_id)` / `verify_account_otp(p_user_id, p_otp)` | Provisioning-path codes in `pending_accounts` | service role |
| `normalize_phone(p_phone)` | Canonicalise a Philippine number (`+63`/`63` → `0…`). Used by the unique phone index. | service role |

### Domain operations

| Function | Purpose | Callable by |
|----------|---------|-------------|
| `update_report_status(p_report_id, p_new_status, p_notes)` | Change a case status and append to its history | staff |
| `create_notification(p_user_id, p_title, p_message, p_type, p_ref_type, p_ref_id)` | Create a notification, restricting who may notify whom | authenticated |

---

## 6. Indexes

Beyond primary keys and unique constraints, the schema carries indexes for the queries the
application actually runs:

| Table | Index | For |
|-------|-------|-----|
| `bite_reports` | `idx_reports_status`, `idx_reports_reporter`, `idx_reports_bite_date`, `idx_reports_created`, `idx_reports_assigned_worker`, `idx_reports_incident_barangay` | Case lists, dashboards, map and heatmap filters |
| `vaccination_records` | `idx_vacc_report`, `idx_vacc_status`, `idx_vacc_scheduled`, `idx_vacc_created_by` | Vaccination schedules and case timelines |
| `notifications` | `idx_notif_user`, `idx_notif_read`, `idx_notif_created` | The notification list and unread count |
| `audit_logs` | `idx_audit_actor`, `idx_audit_entity`, `idx_audit_created` | Audit log filtering |
| `healthcare_facilities` | `idx_facilities_active`, `idx_facilities_type`, `idx_facilities_barangay` | Facility lists and map |
| `profiles` | `idx_profiles_role`, `idx_profiles_verification`, `idx_profiles_barangay`, `idx_profiles_phone_unique` | User management and login lookup |
| `otp_challenges` | `otp_challenges_user_purpose_key`, `idx_otp_challenges_user` | One active code per purpose |
| `bite_report_photos` | `idx_photos_report` | Loading a report’s photos |
| `bite_report_status_history` | `idx_status_history_report` | A case’s history |

---

## 7. Storage

Two **private** buckets (no public URL access; files are served through signed URLs):

| Bucket | Path convention | Used for |
|--------|-----------------|----------|
| `avatars` | `{user_id}/avatar.{ext}` | Profile photos |
| `bite-photos` | `{user_id}/{report_id}/{filename}` | Incident photos |

Access policies are owner-scoped: a user may read and write only objects under their own
`{user_id}/` prefix, and staff may read photos for reports they can see. Because the
buckets are private, a leaked path alone does not grant access.

---

## 8. Initialisation and migration process

### Local (Docker)

```bash
npm run supabase:start     # first run downloads images and applies all migrations + seed
npm run supabase:reset     # drop, re-apply all migrations, re-run seed
```

### Hosted Supabase

Run the migration files in `supabase/migrations/` **in filename order** through the SQL
Editor, or link the project with the Supabase CLI and push. Then add the SMS gateway keys
as Edge Function secrets.

### Seeding

- `supabase/seed.sql` loads sample facilities for local development. It is test data only
  and must never contain real patient information.
- `barangays` and the initial `education_content` / `first_aid_guides` rows are seeded by
  their migrations (`001_barangays`, `008_seed_education_fixed`), so they are present in
  every environment, not just local.

### Migration history at a glance

| # | Migration | What it did |
|---|-----------|-------------|
| 001 | `barangays` | Barangay lookup + seed |
| 002 | `profiles` | Profiles table + signup trigger |
| 003 | `healthcare_facilities` | Facilities |
| 004 | `bite_reports` | Reports, photos, status history |
| 005 | `vaccination_records` | Vaccination tracking |
| 006 | `notifications_audit_education` | Notifications, audit, education, first aid |
| 007 | `security_functions_storage` | Security functions + storage buckets |
| 008 | `seed_education_fixed` | Education / first aid seed |
| 009 | `handle_new_user_role_from_metadata` | Role at signup |
| 010–014 | RLS and hardening | Recursion fix, trigger timing, search-path and grant hardening |
| 015 | `secure_account_creation_and_otp` | Authorised account creation, first OTP store |
| 016 | `authoritative_role_rules` | Role matrix enforced in the database |
| 017 | `open_registration_setup` | Self-registration completion |
| 018–019 | Staff IDs | Staff ID generation and format |
| 020 | `phone_normalization` | `normalize_phone` |
| 021–022 | Login and realtime | Resident login lookup; live report updates |
| 023–025 | Secure OTP system | `otp_challenges`, hashed/expiring/rate-limited codes; crypto and grant hardening |
| 026 | Staff creation hardening | Provisioning fixes |
| 027 | `sms_only_otp_and_duplicate_phone` | SMS-only channels, pending-by-default registration, unique mobile number |

---

## 9. Data dictionary quick reference

Field names follow a consistent convention: `*_id` columns are foreign keys,
`*_at` columns are timestamptz, `is_*` columns are booleans, `*_date` columns are dates.
Status and type columns are constrained `text` rather than database enums, so adding a new
value is a code change rather than a migration.
