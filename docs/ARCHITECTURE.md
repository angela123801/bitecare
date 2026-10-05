# BiteCare Architecture

How the application is put together, how a request flows from screen to database, and
where each responsibility lives. For the database itself see
[DATABASE.md](DATABASE.md); for setup see the [README](../README.md).

---

## 1. Shape of the system

```
Browser (React SPA)
   │
   ├── Supabase Auth        → email + password, issues the session
   ├── PostgREST (database) → tables, protected by Row Level Security
   ├── Storage              → avatars, bite photos (private buckets)
   └── Edge Functions       → otp, account-admin
                                 │
                                 └── PostgreSQL functions (SECURITY DEFINER)
                                         │
                                         └── SMS gateway (verification codes)
```

There is no separate application server. The browser talks to Supabase directly, and
Supabase’s own security — Row Level Security and the privileged functions — is what
enforces access. Anything that must not be decided by the browser (issuing a code,
verifying an account, assigning a role) is pushed into an edge function or a database
function.

This is why the interface alone is never the security boundary: hiding a button does not
protect anything, and the policies and functions must stand on their own.

---

## 2. Source layout

```
src/
├── components/        Reusable UI
│   ├── auth/          OtpPanel, ProtectedRoute
│   ├── admin/         OtpVerificationModal
│   ├── layout/        AppLayout, Sidebar, TopBar, MobileNav, MobileSidebar
│   └── map/           HeatmapLayer, HeatmapLegend, MapFilterPanel
├── pages/             One component per screen
│   ├── auth/          RoleSelection, Login, Register, ResetPassword
│   ├── shared/        Dashboard, Profile, Notifications, Map, Education,
│   │                  FirstAid, Appointments, VaccinationManagement
│   ├── admin/         UserManagement, CreateAccount, FacilityManagement,
│   │                  EducationManagement, AllReports, AuditLog, Analytics
│   └── user/          MyReports, NewReport, ReportDetail, MyVaccinations
├── contexts/          AuthContext — session and profile state
├── lib/               Service and logic layer (see below)
├── config/            constants.ts — roles, labels, prefixes
├── types/             Shared TypeScript types
├── App.tsx            Route table and layout
├── main.tsx           Entry point
└── index.css          Tailwind entry and global styles
```

### The service layer (`src/lib/`)

Pages stay presentational; backend calls live here.

| Module | Responsibility |
|--------|----------------|
| `supabase.ts` | Creates the client, exports `isSupabaseConfigured` |
| `otp.ts` | Verification-code calls: `fetchOtpChannels`, `sendOtp`, `verifyOtp`, plus `allowedChannelsForRole` and the delivery-message wording |
| `accounts.ts` | Account provisioning: `createAccount`, `resendAccountOtp`, `verifyAccountOtp`, and the role options a creator may assign |
| `storage.ts` | Upload/read avatars and report photos |
| `mapReports.ts` | Loads and shapes report data for the map |
| `heatmap.ts`, `leafletHeat.ts`, `leafletGlobal.ts` | Heatmap data and Leaflet setup |
| `notifications.ts` | Notification helpers |
| `navigation.ts` | `LOGIN_ROLES` and role-to-landing-page mapping |
| `installPrompt.ts` | PWA “Install app” prompt |
| `utils.ts` | `getErrorMessage`, class-name helper |

Two edge functions, deployed from `supabase/functions/`:

| Function | Responsibility |
|----------|----------------|
| `otp` | Issues, sends and verifies one-time codes. Resolves the caller, enforces purpose and channel, calls the database code functions, and delivers via the SMS gateway. Public (`verify_jwt = false`) because sign-in happens before a session exists. |
| `account-admin` | Creates accounts, resends and verifies provisioning codes. Requires a valid session (`verify_jwt = true`). |

---

## 3. Authentication flow

Sign-in is **password, then a one-time SMS code**. The password alone never yields a
session.

```
Login page
   │  identifier (Staff ID or mobile number) + password
   ▼
otp edge function  action=channels
   │  resolves the account, returns which methods it may use (SMS)
   ▼
otp edge function  action=send
   │  verifies the password on a throwaway client (the session is discarded)
   │  calls otp_create_challenge → 6-digit code, stored only as a hash
   │  sends the code through the SMS gateway
   ▼
otp edge function  action=verify
   │  calls otp_verify_challenge (expiry, attempts, single use)
   │  on success, signs in again to obtain the real session
   ▼
Browser stores the session and enters the app
```

Points worth knowing:

- The password is checked by attempting a sign-in on a **separate** client that is then
  thrown away, so the shared service client never becomes “the user”.
- The code is returned by the database function **only** to the edge function, which never
  includes it in the response and never logs it.
- The real session is created only after the code is verified.

### Registration flow

1. The browser creates the auth user and completes the profile with the chosen role.
2. The `handle_new_user` trigger creates the profile as `pending_verification`.
3. An SMS code is sent (`purpose=verification`).
4. On a correct code, the account is set to `verified` and can sign in.

A pending account is blocked by `ProtectedRoute`, so it cannot reach the app even though
the password is correct.

### Super Admin provisioning exemption

When a signed-in Super Admin creates an account, `account-admin` skips code generation and
sends nothing; the profile is written as `verified` immediately. The decision comes from
the caller’s role read from the database for their verified session — never from the
request body — so it cannot be triggered by a Resident or an Admin, nor by editing the
page.

### Password reset

The user proves identity with an SMS code (`purpose=password_recovery`). On success the
edge function returns a one-time recovery token, which the browser exchanges for a session
so the user can set a new password. The reset response is identical whether or not the
account exists, so the endpoint cannot be used to discover registered numbers.

---

## 4. Roles and routes

Four roles, ordered by authority. Access is enforced by `ProtectedRoute` in the UI **and**
independently by RLS and the functions in the database.

| Route | Screen | Minimum role |
|-------|--------|--------------|
| `/` | Role selection | public |
| `/login`, `/register`, `/reset-password` | Authentication | public |
| `/dashboard` | Dashboard | any signed-in |
| `/profile` | Profile | any signed-in |
| `/notifications` | Notifications | any signed-in |
| `/map` | Facility and incident map | any signed-in |
| `/education`, `/first-aid` | Education and first aid | any signed-in |
| `/my-reports`, `/reports/new`, `/reports/:id` | Own reports | any signed-in |
| `/my-vaccinations` | Own vaccination record | any signed-in |
| `/vaccinations` | Vaccination management | `health_worker` |
| `/appointments` | Appointments | `health_worker` |
| `/cases`, `/cases/:id` | Case management | `health_worker` |
| `/admin/users/new` | Create account | `health_worker` |
| `/admin/reports`, `/admin/reports/:id` | All reports | `admin` |
| `/admin/users` | User management | `admin` |
| `/admin/facilities` | Facility management | `admin` |
| `/admin/education` | Education management | `admin` |
| `/admin/audit-log` | Audit log | `super_admin` |
| `/admin/analytics` | Analytics | `super_admin` |

`ProtectedRoute` handles three states beyond the role check: no session (redirect to the
role selection page), a deactivated account, and an unverified account.

---

## 5. Feature map

| Feature | Screens | Backing tables |
|---------|---------|----------------|
| Bite reporting | `NewReportPage`, `MyReportsPage`, `ReportDetailPage` | `bite_reports`, `bite_report_photos` |
| Case management | `AllReportsPage`, `ReportDetailPage` | `bite_reports`, `bite_report_status_history` |
| Vaccination | `VaccinationManagementPage`, `MyVaccinationsPage` | `vaccination_records` |
| Appointments | `AppointmentsPage` | `vaccination_records` (scheduled doses) |
| Notifications | `NotificationsPage` | `notifications` |
| Facilities and map | `MapPage`, `FacilityManagementPage` | `healthcare_facilities`, `barangays` |
| Heatmap | `MapPage` + `components/map/*` | `bite_reports` (incident coordinates) |
| Education and first aid | `EducationPage`, `FirstAidPage`, `EducationManagementPage` | `education_content`, `first_aid_guides` |
| Dashboards and analytics | `DashboardPage`, `AnalyticsPage` | aggregated over `bite_reports`, `vaccination_records` |
| Audit | `AuditLogPage` | `audit_logs` |
| Accounts and roles | `UserManagementPage`, `CreateAccountPage` | `profiles`, `staff_id_sequences` |

The map uses Leaflet with a heatmap layer; `lib/mapReports.ts` shapes the report data and
`components/map/` renders the layer, legend and filters.

---

## 6. Configuration

| Location | Holds | Secret? |
|----------|-------|---------|
| `.env` (gitignored) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | No — the anon key is public by design; RLS protects the data |
| `.env.example` | The same keys, with placeholders | No |
| Supabase Edge Function secrets | SMS gateway keys | **Yes** — server-side only, never in the repo |
| `supabase/config.toml` | Local ports, function settings | No |
| `src/config/constants.ts` | Role labels, Staff ID prefixes, UI constants | No |

Anything prefixed `VITE_` is compiled into the browser bundle. Secrets must never use that
prefix.

---

## 7. Legacy Firebase artifacts

BiteCare was originally built on Firebase and was migrated to Supabase. The running
application contains **no Firebase code**: no `firebase` import exists anywhere in `src/`,
and the `firebase` npm packages are no longer used at runtime.

What remains, and why:

| Path | Status |
|------|--------|
| `firebase/firestore.rules`, `storage.rules`, `database.rules.json`, `firestore.indexes.json` | Historical security rules. Kept as a record of the previous system. |
| `firebase/functions/` | The old Cloud Functions. Not deployed, not called. |
| `firebase/migrate/`, `firebase/backup/` | The one-off migration and export scripts used to move data across, plus their output. |
| `firebase/__tests__/` | Rules tests written against the old Firebase rules. |
| `firebase.json`, `supabase/firebase-rules.json` | Legacy project configuration. |
| `BITECARE_FIREBASE_MIGRATION.md` | The written record of the migration. |

These are inert: they are not part of the build (only `src/` is compiled) and nothing in
the application references them. They are retained for the thesis record, and can be
deleted wholesale without affecting the running system. The current Firebase client file
and the Firebase web config that were previously in `src/` have already been removed,
since they were unreferenced.

**The database is Supabase (PostgreSQL), not Firestore.** Any statement that BiteCare uses
Firestore describes the pre-migration system.
