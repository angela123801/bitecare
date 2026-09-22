# BiteCare Setup Guide

## Animal Bite Management & Monitoring System
### For Bacolod City, Negros Occidental

---

## 1. Prerequisites

- Node.js 18+ and npm
- A Supabase account and project (https://supabase.com)

## 2. Installation

```bash
# Clone/download the project
# Navigate to the project directory
npm install
```

## 3. Environment Variables

1. Copy `.env.example` to `.env`
2. Fill in your Supabase credentials:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon/public key

These values are found in your Supabase Dashboard under Settings > API.

## 4. Database Setup

The database schema is managed through Supabase migrations. The following tables are created:

- **barangays** - 61 Bacolod City barangays (pre-seeded)
- **profiles** - User profiles linked to Supabase Auth
- **healthcare_facilities** - Hospitals, clinics, bite centers
- **bite_reports** - Animal bite incident reports
- **bite_report_photos** - Photos attached to reports
- **bite_report_status_history** - Report status audit trail
- **vaccination_records** - Vaccination dose tracking
- **notifications** - In-app notifications
- **audit_logs** - System audit trail
- **education_content** - Educational articles (pre-seeded)
- **first_aid_guides** - First aid instructions (pre-seeded)

### Applying Migrations

If setting up a fresh Supabase project, run the migration SQL files in order through the Supabase SQL Editor:

1. `001_barangays` - Barangay lookup table with seed data
2. `002_profiles` - User profiles with auto-creation trigger
3. `003_healthcare_facilities` - Healthcare facilities
4. `004_bite_reports` - Bite reports and related tables
5. `005_vaccination_records` - Vaccination tracking
6. `006_notifications_audit_education` - Notifications, audit logs, education
7. `007_security_functions_storage` - Security functions and storage buckets
8. `008_seed_education_fixed` - Education and first aid seed data

## 5. Storage Buckets

Two private storage buckets are created:

- **avatars** - Profile photos (path: `{user_id}/avatar.{ext}`)
- **bite-photos** - Incident photos (path: `{user_id}/{report_id}/{filename}`)

## 6. Authentication Setup

BiteCare uses Supabase email/password authentication.

In your Supabase Dashboard:
1. Go to Authentication > Settings
2. Ensure email confirmations are **disabled** (for development)
3. Email provider should be enabled by default

## 7. First Super Admin

When no Super Admin exists in the system:

1. Register a new account through the app
2. Go to User Management (accessible to all users initially during setup)
3. Click "Initialize Super Admin" to promote your account
4. This only works once - after the first Super Admin exists, the button disappears

After initialization, only Super Admins can assign admin/super_admin roles.

## 8. Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## 9. Building for Production

```bash
npm run build
```

Output is in the `dist/` directory.

## 10. User Roles

| Role | Level | Description |
|------|-------|-------------|
| User/Resident | 0 | Report bites, view own data, access education |
| Health Worker | 1 | Manage assigned cases, record vaccinations |
| Admin | 2 | Manage users, facilities, reports, education |
| Super Admin | 3 | Full system access, analytics, audit logs |

## 11. Security

- Row Level Security (RLS) is enabled on all tables
- Role changes are protected by SECURITY DEFINER functions
- Storage access is owner-scoped
- Users cannot escalate their own privileges
- Audit logs are immutable (no update/delete)

## 12. Transferring to Another Beneficiary

1. Download/backup the source code
2. Create a new Supabase project
3. Run all migrations in order
4. Update `.env` with new credentials
5. Deploy the application
6. Initialize the first Super Admin

**Important**: The source code contains NO private credentials. All sensitive configuration is in `.env` which is gitignored.

## 13. Data Backup

- Use Supabase Dashboard to export database backups
- Storage files can be downloaded through the Supabase Dashboard
- Never include real patient data in development environments

---

Built for Bacolod City, Negros Occidental
