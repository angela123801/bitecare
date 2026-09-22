# BiteCare Setup Guide

## Animal Bite Management & Monitoring System
### For Bacolod City, Negros Occidental

---

## 1. Prerequisites

- Node.js 18+ and npm
- A Supabase account and project (https://supabase.com) — for hosted/production use

### Additional prerequisites for Local Development

- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — install via `npm i -g supabase`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — required by `supabase start`

---

## 2. Installation

```bash
npm install
```

---

## 3. Environment Variables

### Option A — Hosted Supabase (production / remote)

1. Copy `.env.example` to `.env`
2. Fill in your Supabase credentials:
   - `VITE_SUPABASE_URL` — Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Your Supabase anon/public key

These values are found in your Supabase Dashboard under **Settings > API**.

### Option B — Local Supabase (development)

1. Copy `.env.local.example` to `.env.local`
2. The default values already point to the local Supabase stack

Vite loads `.env.local` with **higher priority** than `.env`, so both files can coexist. When `.env.local` is present, BiteCare connects to local Supabase. Delete or rename `.env.local` to switch back to hosted.

---

## 4. Database Schema

The database schema is managed through Supabase migrations in `supabase/migrations/`. The following tables are created:

| Table | Description |
|-------|-------------|
| **barangays** | 61 Bacolod City barangays (pre-seeded) |
| **profiles** | User profiles linked to Supabase Auth |
| **healthcare_facilities** | Hospitals, clinics, bite centers |
| **bite_reports** | Animal bite incident reports |
| **bite_report_photos** | Photos attached to reports |
| **bite_report_status_history** | Report status audit trail |
| **vaccination_records** | Vaccination dose tracking |
| **notifications** | In-app notifications |
| **audit_logs** | System audit trail |
| **education_content** | Educational articles (pre-seeded) |
| **first_aid_guides** | First aid instructions (pre-seeded) |

### Applying Migrations (hosted Supabase)

If setting up a fresh Supabase project, run the migration SQL files in order through the Supabase SQL Editor:

1. `001_barangays` — Barangay lookup table with seed data
2. `002_profiles` — User profiles with auto-creation trigger
3. `003_healthcare_facilities` — Healthcare facilities
4. `004_bite_reports` — Bite reports and related tables
5. `005_vaccination_records` — Vaccination tracking
6. `006_notifications_audit_education` — Notifications, audit logs, education
7. `007_security_functions_storage` — Security functions and storage buckets
8. `008_seed_education_fixed` — Education and first aid seed data
9. `009_handle_new_user_role_from_metadata` — Role selection at signup

For local Supabase, migrations are applied automatically by `supabase start` or `supabase db reset`.

---

## 5. Storage Buckets

Two private storage buckets are created:

- **avatars** — Profile photos (path: `{user_id}/avatar.{ext}`)
- **bite-photos** — Incident photos (path: `{user_id}/{report_id}/{filename}`)

---

## 6. Authentication Setup

BiteCare uses Supabase email/password authentication.

In your Supabase Dashboard:
1. Go to **Authentication > Settings**
2. Ensure email confirmations are **disabled** (for development)
3. Email provider should be enabled by default

For local Supabase, email confirmations are already disabled in `supabase/config.toml`.

---

## 7. First Super Admin

When no Super Admin exists in the system:

1. Register a new account through the app
2. Go to User Management (accessible to all users initially during setup)
3. Click "Initialize Super Admin" to promote your account
4. This only works once — after the first Super Admin exists, the button disappears

After initialization, only Super Admins can assign admin/super_admin roles.

---

## 8. Running the App

```bash
npm run dev
```

The app will be available at **http://localhost:5173**

---

## 9. Building for Production

```bash
npm run build
```

Output is in the `dist/` directory.

---

## 10. User Roles

| Role | Level | Description |
|------|-------|-------------|
| User/Resident | 0 | Report bites, view own data, access education |
| Health Worker | 1 | Manage assigned cases, record vaccinations |
| Admin | 2 | Manage users, facilities, reports, education |
| Super Admin | 3 | Full system access, analytics, audit logs |

---

## 11. Security

- Row Level Security (RLS) is enabled on all tables
- Role changes are protected by SECURITY DEFINER functions
- Storage access is owner-scoped
- Users cannot escalate their own privileges
- Audit logs are immutable (no update/delete)

---

# Local Supabase Development

This section explains how to run BiteCare against a **fully local** Supabase stack using Docker and the Supabase CLI. No hosted Supabase account is needed for local development.

## Architecture

```
BiteCare (React + Vite)
        │
        ▼
Local Supabase (Docker)
    ├── PostgreSQL    → localhost:54322
    ├── API (PostgREST) → localhost:54321
    ├── Auth (GoTrue)
    ├── Storage
    ├── Supabase Studio → localhost:54323
    └── Inbucket (email) → localhost:54324
```

## Requirements

| Tool | Purpose | Install |
|------|---------|---------|
| Node.js 18+ | Frontend runtime | https://nodejs.org |
| Docker Desktop | Runs local Supabase containers | https://docker.com |
| Supabase CLI | Manages local Supabase | `npm i -g supabase` |

**Docker must be running** before you start local Supabase.

---

## Quick Start

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Configure local environment

```bash
cp .env.local.example .env.local
```

The default values already point to the local Supabase stack. No edits needed.

### Step 3 — Start local Supabase

```bash
npm run supabase:start
```

This downloads Docker images on first run (may take a few minutes), then starts all Supabase services. All 9 migrations are applied automatically. Seed data (`supabase/seed.sql`) is also loaded.

### Step 4 — Start BiteCare

```bash
npm run dev
```

### Step 5 — Open the app

Open **http://localhost:5173** in your browser.

### Step 6 — Access Supabase Studio (local dashboard)

Open **http://localhost:54323** to browse tables, storage, auth users, and run SQL queries against your local database.

### Step 7 — Access Inbucket (local email)

Open **http://localhost:54324** to view any emails sent by local Auth (password resets, etc.).

---

## Stopping the Local Environment

```bash
npm run supabase:stop
```

This stops all Docker containers. Data is preserved in Docker volumes and will be available on the next `supabase start`.

To stop **and erase all local data**:

```bash
supabase stop --no-backup
```

---

## Database Reset

To drop all tables, re-run all migrations, and re-run the seed file:

```bash
npm run supabase:reset
```

This gives you a clean database with the full BiteCare schema plus seed data.

---

## Database Backup / Export

### Export (save local database to a file)

```bash
npm run supabase:dump
```

This creates `supabase/backup.sql` containing the full schema and data.

### Restore (load a backup into local database)

```bash
npm run supabase:restore
```

This reads `supabase/backup.sql` and applies it to the local database.

> **Note**: `supabase/backup.sql` is gitignored by default. Only commit it if it contains safe development data.

---

## Switching Between Local and Hosted Supabase

| Mode | How to activate |
|------|-----------------|
| **Local** | Ensure `.env.local` exists with local Supabase URLs |
| **Hosted** | Delete or rename `.env.local` — Vite falls back to `.env` |

Vite's loading priority: `.env.local` > `.env`. When `.env.local` is present, its values override `.env`.

**Safety**: The local environment and hosted environment use completely different URLs and API keys. There is no risk of accidentally writing local test data to production, or vice versa, as long as you do not copy production credentials into `.env.local`.

---

## Local Development Seed Data

`supabase/seed.sql` creates sample healthcare facilities for local testing. After running `supabase start` or `supabase db reset`, the seed data is automatically loaded.

To add more test data:

1. Edit `supabase/seed.sql`
2. Run `npm run supabase:reset` to reload everything

**Never put real patient data in the seed file.**

---

## Local Authentication Testing

With local Supabase running:

1. Register accounts through the app's registration page
2. Choose any role (User, Health Worker, Admin, Super Admin) during registration
3. Accounts are created instantly — no email confirmation needed
4. Use Supabase Studio (**localhost:54323** > Authentication) to view/manage local users

---

## Transferring Local Data to Another Computer

1. On the source machine: `npm run supabase:dump`
2. Copy the entire project folder (including `supabase/backup.sql`) to the new machine
3. On the new machine:
   ```bash
   npm install
   cp .env.local.example .env.local
   npm run supabase:start
   npm run supabase:restore
   npm run dev
   ```

---

## Transferring to Production

1. Create a Supabase project at https://supabase.com
2. Run all migration files in order through the Supabase SQL Editor
3. Copy `.env.example` to `.env` and fill in your hosted credentials
4. Delete `.env.local` (so Vite uses `.env`)
5. Deploy the `dist/` folder to your hosting provider

---

## Important Notes on Local vs. Production

- **Local Supabase** is completely isolated. Nothing you do locally affects the hosted project.
- **Map tiles** (Leaflet/OpenStreetMap) still require internet access even in local mode.
- **Geocoding or external APIs** also require internet.
- The local environment is for **development and testing**. Use hosted Supabase for production.

---

## npm Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `vite` | Start the frontend dev server |
| `npm run build` | `vite build` | Build for production |
| `npm run supabase:start` | `supabase start` | Start local Supabase (Docker) |
| `npm run supabase:stop` | `supabase stop` | Stop local Supabase |
| `npm run supabase:status` | `supabase status` | Show local Supabase service URLs/keys |
| `npm run supabase:reset` | `supabase db reset` | Reset local DB + re-run migrations + seed |
| `npm run supabase:dump` | `supabase db dump` | Export local DB to `supabase/backup.sql` |
| `npm run supabase:restore` | `psql ... backup.sql` | Restore a backup into local DB |

---

Built for Bacolod City, Negros Occidental
