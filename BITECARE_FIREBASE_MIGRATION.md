# BiteCare — Supabase → Firebase Migration Mapping

Status: **inspection complete, mapping defined, rules written; migration not yet executed.**
The migration is blocked on a Firebase project that can actually run Firestore (see
"Blockers"). Nothing here is guessed — every row is derived from the live Supabase
schema and the live Firebase Realtime Database contents, both inspected directly.

---

## 1. What actually exists today (inspected, not assumed)

### 1.1 Supabase (reference model — the blueprint)

Row counts as inspected:

| Table | Rows | Meaning |
|---|---|---|
| `profiles` | 1 | App users (role lives here) |
| `barangays` | 61 | Bacolod barangay reference list |
| `education_content` | 4 | Health education articles |
| `first_aid_guides` | 3 | First-aid guides |
| `bite_reports` | 0 | Bite incident reports |
| `bite_report_photos` | 0 | Incident photo metadata |
| `bite_report_status_history` | 0 | Report workflow history |
| `vaccination_records` | 0 | PEP vaccination records |
| `healthcare_facilities` | 0 | ABTC / hospital / clinic registry |
| `notifications` | 0 | Per-user notifications |
| `audit_logs` | 0 | Security/administrative audit trail |
| `pending_accounts` | 0 | OTP account-creation staging |
| `app_settings` | — | e.g. `open_registration` |

Storage buckets: `avatars` (private), `bite-photos` (private).

All 13 tables have row-level security. `profiles` has column-level privileges so a
user cannot edit their own `role`, `is_active` or `verification_status`.

**Two facts that change the migration plan:**

1. **There is no `patients` table in Supabase.** Patient identity is embedded inside
   each `bite_reports` row (`patient_name`, `patient_age`, `patient_sex`,
   `patient_phone`, `patient_address`, `patient_barangay_id`). The "Patients"
   feature in your spec therefore does not have a Supabase source table to migrate.
2. **There is no `appointments` table in Supabase.** Appointments are modelled as
   rows in `vaccination_records` (the page reads and updates `scheduled_date`,
   `status`). Real appointment records currently exist only in Firebase RTDB.

### 1.2 Firebase Realtime Database (the live data, currently public)

| Collection | Records |
|---|---|
| `users` | 4 |
| `reports` | 2 (with inline base64 photos) |
| `appointments` | 4 |
| `notifications` | 5 |
| `hw_notifications` | 5 |
| `centers` | 3 |
| `health_workers` | 5 |
| `Super_Admin` | 5 |
| `dtr_records` | 2 |
| `education_resources` | 0 |
| others | 0 |

A read-only backup was taken before any change (kept out of version control,
because it contains personal data).

---

## 2. Target architecture

```
Browser (Firebase JS SDK)
   ├── Firebase Authentication   → identity (UID), passwords, sessions
   ├── Cloud Firestore           → application data (documents + references)
   ├── Firebase Cloud Storage    → avatars/ and incident-photos/
   └── Security Rules            → authoritative authorization
Cloud Functions                  → only the two privileged operations in §5
```

Firestore (not Realtime Database) is the final database, as decided.

---

## 3. Collection mapping

Reference fields carry the related document id. Existing UUIDs from Supabase are
preserved as document ids wherever a record is migrated, so relationships survive.

### 3.1 Identity and people

| Supabase | Firestore | Notes |
|---|---|---|
| `auth.users` | Firebase Authentication | UID replaces Supabase UUID |
| `profiles` | `users/{uid}` | `role`, `isActive`, `verificationStatus` authoritative here |
| — (RTDB `Super_Admin`, `health_workers`) | `users/{uid}` | Staff lists fold into the user document; **plaintext access codes are dropped, not carried over** |
| — (no source table) | `patients/{patientId}` | New collection; populated from report-embedded patient fields (§3.2) |

`users/{uid}` fields:

```
uid, name, email, phone, address, barangayId, barangayName,
photoPath, role, isActive, verificationStatus,
createdAt, updatedAt
```

### 3.2 Bite reports and patients

| Supabase `bite_reports` column | Firestore `biteReports/{reportId}` |
|---|---|
| `id` | document id (preserved) |
| `reporter_id` | `reporterId` |
| `patient_name` `patient_age` `patient_sex` `patient_phone` `patient_address` `patient_barangay_id` | `patient: { name, age, sex, phone, address, barangayId }` — the source for `patients/{patientId}` |
| `bite_date` `bite_time` | `biteDate`, `biteTime` |
| `animal_type` `animal_type_other` `animal_status` `animal_vaccinated` | `animal: { type, other, status, vaccinated }` |
| `bite_site` `wound_type` `category` `number_of_wounds` `provoked` | `wound: { site, type, category, count, provoked }` |
| `incident_location` `incident_latitude` `incident_longitude` `incident_barangay_id` | `incident: { location, latitude, longitude, barangayId }` |
| `status` `severity` | `status`, `severity` |
| `assigned_worker_id` `assigned_facility_id` | `assignedWorkerId`, `assignedFacilityId` |
| `first_aid_given` `first_aid_details` | `firstAid: { given, details }` |
| `notes` `closed_at` `created_at` `updated_at` | `notes`, `closedAt`, `createdAt`, `updatedAt` |

Patient records are **deduplicated** on `(name, date_of_birth/age, barangayId)` so one
person is not created twice per incident.

### 3.3 Photos

| Supabase | Firebase |
|---|---|
| Storage `avatars` + `profiles.avatar_url` | Storage `profile-photos/{uid}/{file}` + `users/{uid}.photoPath` |
| `bite_report_photos` (`report_id`, `storage_path`, `file_name`, `uploaded_by`, …) | `incidentPhotos/{photoId}` + Storage `incident-photos/{reportId}/{file}` |
| RTDB `reports.bite_pic` (inline base64) | **Converted to a real Storage object**, then referenced — base64 blobs are not carried into Firestore |

The two photo families stay in separate Storage prefixes, with separate rules.

### 3.4 Clinical and operational

| Supabase | Firestore | Notes |
|---|---|---|
| `vaccination_records` | `vaccinations/{vaccinationId}` | Dose schedule kept as a `doses[]` array; `reportId` links back |
| — (RTDB `appointments`) | `appointments/{appointmentId}` | Real source of current appointment data |
| `notifications` | `notifications/{notificationId}` | `recipientId` = Firebase UID, `isRead`, `readAt` |
| `healthcare_facilities` | `facilities/{facilityId}` | Feeds the map; not hard-coded |
| `barangays` | `barangays/{barangayId}` | 61 rows, reference data |
| `education_content` | `education/{docId}` | 4 rows |
| `first_aid_guides` | `firstAidGuides/{docId}` | 3 rows |
| `audit_logs` | `auditLogs/{logId}` | Append-only |
| `app_settings` | `appSettings/{key}` | e.g. registration toggle |
| `pending_accounts` (OTP staging) | **Dropped** | Its OTP values must not be carried over; see §6 |

### 3.5 Map and GIS

Facility and report coordinates carry straight across as numbers on the
`facilities` and `biteReports` documents. No coordinate is invented. The public
map shows anonymised report markers (animal type, barangay, coordinates, status) —
never patient identity.

---

## 4. Security: RLS → Security Rules

The Supabase intent (owners see their own; staff see operational data; only
superadmins manage administrators; nobody edits their own role) is translated
in `firebase/firestore.rules` and `firebase/storage.rules`.

Key properties of the rule set:

- **Default deny** everything, then open specific paths.
- `users/{uid}` `create` is allowed **only** with `role == 'resident'`. This is what
  makes self-promotion to superadmin impossible at the database level.
- Role changes enforce the creation matrix (`superadmin` → any; `admin` →
  `health_worker`/`resident`; `health_worker` → `resident`; `resident` → none)
  **and** forbid changing your own role.
- Residents read only their own reports/appointments/vaccinations/notifications.
- Write operations call `get()` on the caller's user document, so
  `request.auth.token.email_verified` alone is never sufficient — a deactivated
  account loses access immediately without waiting for token expiry.
- `auditLogs` are append-only: no update, no delete.
- The insecure `auth != null || true` pattern and unrestricted `.write`
  are **not present anywhere** in the final rules.

Storage rules keep `profile-photos/` and `incident-photos/` separate, enforce a
2 MB image-only limit, and never allow public reads.

---

## 5. Cloud Functions (only where genuinely required)

Two operations genuinely cannot be done safely from the browser, because they
must write fields the client is forbidden to write, or must be atomic:

1. **`createManagedAccount`** — verifies the caller's role, creates the Auth user,
   writes `users/{uid}` with the requested role, issues the role custom claim.
   Enforces the role-creation matrix server-side.
2. **`setUserRole` / `setUserActive`** — administrative role and status changes,
   with an audit log entry. Cannot be a client write, since clients may not touch
   those fields.

Everything else is ordinary client SDK access governed by rules. No function is
added speculatively.

---

## 6. Data that must NOT be migrated

- `Super_Admin.access_code` and `health_workers.access_code` (plaintext codes)
- `pending_accounts` OTP values
- Any password, token, key or secret

Passwords exist only in Firebase Authentication. An old-style access code cannot
be turned into a password; those accounts are re-provisioned instead.

---

## 7. Blockers — what is needed before execution

The Firebase project referenced by the current config (`bitecare-deb9d`) is not
usable for this migration:

1. **Cloud Firestore is not enabled on it.** A direct API probe returns:
   `403 — Cloud Firestore API has not been used in project bitecare-deb9d before
   or it is disabled.`
2. **It is on the Realtime Database**, which the final architecture forbids.
3. **That project's data has been publicly readable for an unknown period**, and
   contains plaintext staff codes. It should be treated as compromised and
   **replaced by a fresh project**, not reused.

Firestore requires a billing-enabled (Blaze) project.

**What I cannot do from here:** there is no Firebase CLI session, no service-account
credential, and no Google Cloud access to create or bill a project, so I cannot
provision Firestore or deploy these rules to a cloud project. That step requires
you.

**What I *did* verify, without a cloud project:** the Firestore Emulator Suite runs
locally with no Google account, so the rules were exercised against a real Firestore
engine using the actual `firebase/firestore.rules` file. The adversarial suite in
`firebase/__tests__/rules.test.mjs` covers 40 cases and **passes 40/40** —
including unsigned-in reads, self-promotion to superadmin/admin, cross-resident
reads, role-matrix violations, audit-log tampering, and immediate loss of access
on deactivation. The emulator caught two genuine rule defects during this pass
(a missing-field evaluation error on profile updates, and a verification claim
applied too broadly); both were fixed before the suite went green.

This proves the *authorization logic*. It does **not** prove the deployed
configuration, the real Auth flow, Storage uploads, or the UI — those still
require a live project and a browser.

**Storage rules, also verified:** `firebase/__tests__/storage.test.mjs` runs
against the Storage + Firestore emulators with the real `firebase/storage.rules`
file and **passes 13/13** — owner-only profile-photo uploads, cross-user and
anonymous read denials, non-image and oversized upload rejections, report-owner
incident-photo uploads, cross-resident and anonymous incident-photo denials, and
staff read access via the `role` custom claim. The incident-photo rules were
hardened during this pass: uploads now verify the caller owns the report via a
Firestore lookup, instead of trusting the client-supplied path.

**Migration scripts, validated (dry-run):** `firebase/migrate/transform.mjs`
converts the RTDB backup into Firestore-shaped documents (4 users, 1 patient,
3 facilities, 2 reports, 4 appointments, 113 notifications, 2 DTR records) and
drops the plaintext access codes. `firebase/migrate/import.mjs --dry-run` and
`firebase/migrate/photos.mjs --dry-run` both complete with zero errors; the
photo step confirms 2 report photos would move from inline base64 into Storage.

**Legacy Firebase files are dead code:** `src/lib/bitecare-core.js` and
`src/config/firebase-config.js` import from the old Realtime Database and carry
the compromised `bitecare-deb9d` config, but nothing in the app imports them.
They must be deleted before the Firebase data layer is wired in, so the insecure
config cannot be re-introduced.

---

## 8. Execution order once a working project exists

1. Create fresh Firebase project; enable Auth (email/password), Firestore, Storage.
2. `firebase deploy --only firestore:rules,firestore:indexes,storage` from this repo
   (config already wired in `firebase.json`).
3. Load the RTDB backup in, converting base64 photos to real Storage objects.
4. Provision the four role accounts through the protected function; import real data.
5. Point the app at the new project; keep Supabase untouched.
6. Run the full OPEN → INTERACT → SAVE → VERIFY FIREBASE → REFRESH → LOGOUT →
   LOGIN → VERIFY sequence per feature — **as the four separate roles**.
7. Adversarial pass: unsigned-in read, cross-resident read, self-role-change,
   audit-log edit — each must be **rejected**.
8. Only then consider removing Supabase.

## 9. Open items

- **Appointments bug** ("saves but does not appear"): in the Supabase app the page
  reads/writes `vaccination_records` and never creates an appointment row, so there
  is no insert path for a new appointment. In the Firestore design this is fixed by
  a first-class `appointments` collection with `ownerId`; the page must insert, then
  re-read. To be verified against the new backend, not assumed.
- **Frontend rewrite**: spec asks for plain HTML/CSS/vanilla JS; the working app is
  React + Tailwind. Kept as-is until the data layer is proven, to avoid discarding
  working code. Data-layer access will be isolated so the view layer can be swapped
  independently later.
- **Patients collection** is new (no Supabase source) — confirmed with the clinic
  whether the report-embedded patient fields are the full intended record.
