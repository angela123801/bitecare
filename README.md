# BiteCare

**Animal Bite Management & Monitoring System — Bacolod City, Negros Occidental**

BiteCare is a web application for recording animal-bite incidents, tracking rabies
vaccination, managing patients and appointments, mapping facilities and incident
hotspots, and running the administrative side of a city health program. It has four
user roles, SMS-verified sign-in, role-based access control, and a full audit trail.

This repository is the complete, self-contained source of the system. It can be
opened in Visual Studio Code and run locally without any cloud IDE.

---

## Table of contents

1. [Technology stack](#1-technology-stack)
2. [Requirements](#2-requirements)
3. [Quick start](#3-quick-start)
4. [Environment variables](#4-environment-variables)
5. [Opening in Visual Studio Code](#5-opening-in-visual-studio-code)
6. [Available scripts](#6-available-scripts)
7. [Project structure](#7-project-structure)
8. [Backend: database and edge functions](#8-backend-database-and-edge-functions)
9. [User roles and access control](#9-user-roles-and-access-control)
10. [Authentication and the SMS OTP system](#10-authentication-and-the-sms-otp-system)
11. [Testing the system](#11-testing-the-system)
12. [Making and verifying a change](#12-making-and-verifying-a-change)
13. [Deployment](#13-deployment)
14. [Security notes](#14-security-notes)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Technology stack

| Layer | Technology |
|-------|------------|
| Build tool | Vite 5 |
| UI | React 18, TypeScript, Tailwind CSS |
| Routing | React Router 7 |
| Icons | lucide-react |
| Maps | Leaflet + leaflet.heat |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |

There is **no Firebase** in the running system. The `firebase/` directory contains the
historical Firebase artifacts kept for reference only — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#legacy-firebase-artifacts).

---

## 2. Requirements

- **Node.js 18 or newer** and npm — https://nodejs.org
- A **Supabase project** (hosted) for the default setup, **or**
- **Docker Desktop** + the **Supabase CLI** if you want a fully local backend:
  - Docker Desktop — https://www.docker.com/products/docker-desktop/
  - Supabase CLI — `npm i -g supabase`

For a thesis demonstration on a single machine, a hosted Supabase project is the
simplest option because it needs no Docker.

---

## 3. Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file and fill in your Supabase URL and anon key
cp .env.example .env

# 3. Start the development server
npm run dev
```

Open **http://localhost:5173**.

If the environment variables are missing, the app shows a configuration screen
instead of the login page. That screen means `.env` has not been filled in yet.

### Using a fully local backend instead

```bash
cp .env.local.example .env.local   # already points at the local stack
npm run supabase:start             # Docker must be running
npm run dev
```

`.env.local` takes priority over `.env`, so the two can coexist. Delete `.env.local`
to switch back to the hosted backend.

---

## 4. Environment variables

The browser only ever receives two values, both public by design:

| Variable | Where to find it |
|----------|------------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key |

Copy `.env.example` to `.env` and fill these in. **`.env` is gitignored and must never
be committed.**

Server-side secrets — the SMS gateway keys used to send verification codes — are **not**
stored in this repository and are **not** browser variables. They live in the Supabase
project as Edge Function secrets (Dashboard → Project Settings → Edge Functions →
Secrets), where the `otp` function reads them. Anything prefixed `VITE_` is shipped to
the browser, so secrets must never use that prefix.

`supabase/config.toml` is safe to commit: it holds local development ports and function
settings, no credentials.

---

## 5. Opening in Visual Studio Code

1. Open VS Code.
2. **File → Open Folder…** and select the `project` folder (the one containing this
   `README.md` and `package.json`).
3. Accept the recommended extensions when VS Code offers them (ESLint, Tailwind CSS
   IntelliSense, Deno, Docker).
4. Open a terminal with **Ctrl+`** and run `npm install`, then `npm run dev`.

### Running with the debugger

The `.vscode/` folder is included and ready to use:

- **Run and Debug → “BiteCare: Chrome”** launches Chrome against
  `http://localhost:5173` and starts the dev server for you. “BiteCare: Edge” does the
  same in Edge. Breakpoints in `src/` will bind.
- **Terminal → Run Task** lists the project tasks: `dev`, `build`, `typecheck`, `lint`,
  `supabase:start`, `supabase:stop`, `supabase:reset`. `Ctrl+Shift+B` runs the default
  build task (`dev`).

For the Chrome debugger to work, the **Debugger for Chrome** / built-in JavaScript
debugger must be enabled (it is bundled with VS Code by default).

### About the “Go Live” button (Live Server)

The file the **Go Live** button opens is **`index.html`** in the project root. On its own
that will show a **blank page**, and this is expected rather than a fault.

`index.html` loads `/src/main.tsx`, which is TypeScript and React. A plain web server
cannot run TypeScript, so the browser receives a file it cannot execute. BiteCare has to
be compiled by Vite first — that compilation is what `npm run dev` and `npm run build`
do. This is true of every Vite project, not just this one.

Use one of these instead:

| Goal | What to do |
|------|------------|
| Develop with live reload | `npm run dev` — open http://localhost:5173 |
| Debug in the browser | Run and Debug → “BiteCare: Chrome” |
| Preview the built app | `npm run build`, then `npm run preview` |

If you specifically want to use the Go Live button, build first and point Live Server at
the built folder:

1. Run `npm run build` to create `dist/`.
2. In `.vscode/settings.json`, add `"liveServer.settings.root": "/dist"`.
3. Open `dist/index.html` and click **Go Live**.

The built app then loads, but note that Live Server has no single-page-app fallback, so
refreshing on a deep link such as `/admin/users` will show a “not found” page. Use
`npm run dev` or `npm run preview` if that matters.

---

## 6. Available scripts

Run these from the VS Code terminal or any shell in the project root.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the development server at http://localhost:5173 |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the built `dist/` folder locally |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run lint` | Run ESLint over the project |
| `npm run supabase:start` | Start the local Supabase stack (Docker) |
| `npm run supabase:stop` | Stop the local Supabase stack |
| `npm run supabase:status` | Show local service URLs and keys |
| `npm run supabase:reset` | Drop, re-migrate, and re-seed the local database |
| `npm run supabase:dump` | Export the local database to `supabase/backup.sql` |
| `npm run supabase:restore` | Load `supabase/backup.sql` into the local database |

`npm run build` is the check to run before any demonstration: it fails loudly if any
TypeScript is invalid.

---

## 7. Project structure

```
project/
├── .vscode/                 VS Code tasks, debugger config, settings
├── database/                Database schema reference and how-to for schema work
├── docs/                    System documentation
│   ├── ARCHITECTURE.md      How the app is put together, roles, routes, data flow
│   └── DATABASE.md          Full schema, relationships, RLS, functions, storage
├── public/                  Static assets served as-is (logo, background, PWA icons)
├── src/                     Application source code
│   ├── components/          Reusable UI (layout, auth, admin, map)
│   ├── pages/               Screens grouped by area: auth, admin, shared, user
│   ├── contexts/            React context providers (authentication session)
│   ├── lib/                 Service and logic layer (see below)
│   ├── config/              Non-secret configuration and constants
│   ├── types/               Shared TypeScript types
│   ├── App.tsx              Route table and layout composition
│   ├── main.tsx             Entry point
│   └── index.css            Tailwind entry and global styles
├── supabase/                Backend: schema, seed data, and edge functions
│   ├── migrations/          Ordered SQL migrations — the source of truth for schema
│   ├── functions/           Edge functions (otp, account-admin)
│   ├── seed.sql             Local development sample data
│   └── config.toml          Local Supabase configuration (no secrets)
├── firebase/                Legacy Firebase artifacts, kept for reference only
├── firebase.json            Legacy Firebase project config, reference only
├── .env.example             Required environment variables (no real secrets)
├── index.html               Vite HTML entry
├── tailwind.config.js       Tailwind theme (colours, fonts, spacing)
├── vite.config.ts           Vite configuration and the `@/` path alias
└── package.json             Dependencies and scripts
```

### The `src/lib/` service layer

Business logic that talks to the backend lives here rather than inside pages:

| File | Responsibility |
|------|----------------|
| `supabase.ts` | Creates the Supabase client and reports whether it is configured |
| `accounts.ts` | Account creation and provisioning calls (admin/creator side) |
| `otp.ts` | Verification-code client: channels, send, resend, verify |
| `storage.ts` | Upload and retrieve avatars and incident photos |
| `mapReports.ts` | Loads and shapes report data for the map and heatmap |
| `heatmap.ts`, `leafletHeat.ts`, `leafletGlobal.ts` | Heatmap rendering helpers |
| `notifications.ts` | In-app notification helpers |
| `navigation.ts` | Role-to-landing-page mapping and route helpers |
| `installPrompt.ts` | “Install app” (PWA) prompt handling |
| `utils.ts` | Small shared helpers (error formatting, class names) |

Import across the project with the `@/` alias, which maps to `src/`
(for example `@/lib/otp` or `@/components/auth/OtpPanel`).

---

## 8. Backend: database and edge functions

The backend is Supabase. Full detail is in [docs/DATABASE.md](docs/DATABASE.md).

- **Database** — PostgreSQL with Row Level Security enabled on every table. Schema
  changes are made as ordered SQL files in `supabase/migrations/`.
- **Authentication** — Supabase Auth (email + password), with an SMS one-time-code step
  layered on top for sign-in and registration.
- **Storage** — two private buckets, `avatars` and `bite-photos`, with owner-scoped
  access policies.
- **Edge functions** — server-side logic that must not run in the browser:
  - `supabase/functions/otp` — issues, sends and verifies one-time codes.
  - `supabase/functions/account-admin` — creates and verifies accounts, enforcing the
    role rules server-side.

Verification codes are generated and hashed inside the database, delivered through the
configured SMS gateway by the `otp` function, and are never returned to the browser or
written to any log.

---

## 9. User roles and access control

Four roles exist, ordered by authority. Access is enforced in the database and in the
edge functions, not only in the interface.

| Role | Value | Can do |
|------|-------|--------|
| Resident | `user` | Report a bite, view their own reports and vaccinations, see education and the map |
| Health Worker | `health_worker` | Manage cases and patients, record vaccinations, manage appointments, create Resident accounts |
| Admin | `admin` | Everything above, plus user management, facilities, education content, all reports |
| Super Admin | `super_admin` | Full control: analytics and the audit log, and may create any role |

An account may only create roles at or below its own authority, and only a Super Admin
may create another Super Admin or an Admin. This is checked on the server against the
signed-in account’s role, so it cannot be bypassed by editing the page or the request.

The route table in `src/App.tsx` shows which role each screen requires; the
`ProtectedRoute` component enforces it.

---

## 10. Authentication and the SMS OTP system

Sign-in is **password plus a one-time code sent by SMS** to the account’s registered
mobile number.

- Every account must have a valid Philippine mobile number (`09XXXXXXXXX`).
- Residents sign in with their mobile number; staff sign in with a generated Staff ID.
- Codes are 6 digits, expire after **5 minutes**, allow **5 incorrect attempts**, and can
  be resent after a **60-second** cooldown, with a limit of **5 codes per hour**.
- Codes are stored only as a salted hash and are single-use.
- A mobile number can belong to only one account.

**Registration** creates the account in a pending state. It becomes usable only after the
SMS code is entered correctly.

**Super Admin provisioning exemption.** When a signed-in Super Admin creates an account,
no code is generated or sent and no verification screen appears. The account is active
immediately with the password the Super Admin set, and the Staff ID is generated
automatically for staff roles. This exemption applies **only** to a Super Admin, is
determined from the signed-in account on the server, and cannot be triggered from the
browser.

SMS delivery uses a gateway configured as a Supabase Edge Function secret. If no gateway
is configured, the interface says so plainly rather than pretending a message was sent.

---

## 11. Testing the system

You will need real mobile numbers that can receive SMS, plus at least one Super Admin
account. Because a mobile number can belong to only one account, use a different number
for each account you create.

### Accounts to prepare

| Role | How to obtain it |
|------|------------------|
| Super Admin | Provision the first one in the database (see below) |
| Admin | Created by the Super Admin |
| Health Worker | Created by the Super Admin or an Admin |
| Resident | Self-register, or create it as the Super Admin |

**Creating the first Super Admin.** Sign in through the app once to create an account,
then in the Supabase SQL Editor promote it:

```sql
update public.profiles set role = 'super_admin', verification_status = 'verified'
where email = 'your-super-admin@example.com';
```

Sign out and back in afterwards so the session picks up the new role.

### Checks to run

**Authentication**
- [ ] Sign in with a valid ID and password, receive an SMS code, enter it, reach the dashboard.
- [ ] Enter a wrong code: it is rejected and the attempts-remaining count drops.
- [ ] Let a code expire (wait over 5 minutes) and confirm it is refused.
- [ ] Reuse a code that already worked: it is refused.
- [ ] Request a resend before the cooldown ends: it is refused; after 60 seconds it works.
- [ ] Request more than 5 codes in an hour: further requests are refused.
- [ ] Use “Forgot password”, reset via SMS code, then sign in with the new password.
- [ ] Refresh the page while signed in: the session persists.
- [ ] Sign out: protected pages are no longer reachable.

**Registration**
- [ ] Register a Resident: the account is pending until the SMS code is entered, then it works.
- [ ] Try to register a second account with a number already in use: it is refused.

**Role access**
- [ ] As a Resident, confirm administrative screens are not reachable.
- [ ] As a Health Worker, confirm case and vaccination screens work but admin screens do not.
- [ ] As an Admin, confirm user and facility management work but the audit log and analytics do not.
- [ ] As a Super Admin, confirm every screen is reachable.

**Super Admin exemption**
- [ ] Create a Health Worker, an Admin, a Resident and a Super Admin: each is active
      immediately with no code and no verification screen.
- [ ] Confirm the Staff ID is generated for the staff roles and the mobile number is the
      Resident’s login ID.

**Core features**
- [ ] Submit a bite report with a photo; confirm it appears in “My Reports”.
- [ ] As a Health Worker, assign and progress a case, and record a vaccination dose.
- [ ] Book and view an appointment.
- [ ] Confirm a notification arrives and can be marked read.
- [ ] Confirm facilities and incident points render on the map and the heatmap responds
      to the filters.
- [ ] Confirm the audit log records sign-in, account creation and code events.

### Security checks that need no SMS

These can be run directly in the Supabase SQL Editor and confirm the server-side rules:

```sql
-- The channel rule is SMS-only for every role
select public.otp_allowed_channels('user'),
       public.otp_allowed_channels('super_admin');   -- both: {sms}

-- Two accounts cannot share a mobile number
-- (replace the number with one already in use)
insert into public.profiles (id, email, full_name, role, phone, verification_status)
values (gen_random_uuid(), 'dup@example.com', 'Dup', 'user', '09171234567', 'verified');
-- expect: duplicate key value violates unique constraint "idx_profiles_phone_unique"
```

---

## 12. Making and verifying a change

A short walkthrough for demonstrating that the running project is the real source:

1. Open the project folder in VS Code and start it with `npm run dev`.
2. Make a small, visible change. For example, open `src/config/constants.ts` and adjust
   a label, or edit the heading text in a page under `src/pages/`.
3. Save. Vite hot-reloads the browser immediately — the change appears without a restart.
4. Run `npm run typecheck` to confirm the types are still valid.
5. Run `npm run build` to confirm the whole project compiles, then `npm run preview` to
   view the production build.

For a change that touches the database, add a new SQL file under
`supabase/migrations/`, then run `npm run supabase:reset` locally to apply it. See
[database/README.md](database/README.md).

---

## 13. Deployment

The app is a static bundle and the backend is Supabase.

**Frontend**

```bash
npm run build     # produces dist/
```

Publish the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages, an
institutional web server). `public/_redirects` is included so single-page-app routes
resolve correctly on hosts that read it. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the host’s environment settings before building.

**Backend**

- Apply migrations to the target Supabase project, either through the SQL Editor in
  order, or with the Supabase CLI linked to that project.
- Add the SMS gateway keys as Edge Function secrets in that project.
- Deploy the edge functions from `supabase/functions/`.

---

## 14. Security notes

- Passwords are handled by Supabase Auth and are never stored by the application.
- One-time codes are stored only as salted hashes and are single-use.
- Every table has Row Level Security enabled. Privileged operations run through
  functions that verify the caller’s role from their session.
- Role values come from the signed-in account on the server, never from the browser, so
  changing a role in the page cannot grant access.
- `.env` is gitignored. No passwords, API keys or service-account keys are committed.

If a secret is ever committed by mistake, rotate it at the provider — removing it from
the latest commit is not enough.

---

## 15. Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| A configuration screen appears instead of the login page | `.env` is missing or empty. Copy `.env.example` to `.env` and fill in the Supabase URL and anon key. |
| Codes never arrive | No SMS gateway is configured for the project, or the gateway phone is offline. Check the Edge Function secrets and the gateway dashboard. |
| “This verification method is not available for your account” | The account has no valid mobile number on file. Add one to the account’s profile. |
| “A valid Philippine mobile number is required” | Numbers must be in the form `09XXXXXXXXX`. |
| The local Supabase stack will not start | Docker Desktop is not running. Start it, then run `npm run supabase:start` again. |
| Changes do not appear in the browser | Confirm the dev server is still running, then hard-refresh the page. |
| The build fails after an edit | Run `npm run typecheck` and read the first error; it names the file and line. |

---

## Further documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — application structure, roles, routes, data flow
- [docs/DATABASE.md](docs/DATABASE.md) — every table, relationship, policy and function
- [database/README.md](database/README.md) — how to work with the schema day to day
- [BITECARE_SETUP_GUIDE.md](BITECARE_SETUP_GUIDE.md) — detailed local Supabase and Docker setup
- [BITECARE_FIREBASE_MIGRATION.md](BITECARE_FIREBASE_MIGRATION.md) — historical record of the move off Firebase
