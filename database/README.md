# Working with the BiteCare Database

A practical guide for the day-to-day work of changing and inspecting the schema. For a
full description of every table and policy, see [../docs/DATABASE.md](../docs/DATABASE.md).

---

## Where the schema lives

| Location | What it is |
|----------|------------|
| `../supabase/migrations/` | The schema itself, as ordered SQL files. **This is the source of truth.** |
| `../supabase/seed.sql` | Local development sample data (facilities). Test data only. |
| `../supabase/config.toml` | Local Supabase configuration — ports, function settings. No secrets. |
| `../docs/DATABASE.md` | The written description of the schema, kept alongside it. |
| `../supabase/functions/` | Edge functions that call the database functions. |

The database is **PostgreSQL, hosted by Supabase**. It is not Firestore. The `firebase/`
folder contains historical rules from before the migration and is not part of the running
system.

---

## Making a schema change

1. **Create a new migration.** Never edit a file that has already been applied.

   ```
   supabase/migrations/20261005120000_028_add_facility_note.sql
   ```

   The name is a timestamp followed by a sequence number and a short description.

2. **Write forward-only SQL.** Use idempotent forms so re-running is safe:

   ```sql
   ALTER TABLE public.healthcare_facilities ADD COLUMN IF NOT EXISTS note text;

   DROP POLICY IF EXISTS "admin_update_facilities" ON public.healthcare_facilities;
   CREATE POLICY "admin_update_facilities" ON public.healthcare_facilities FOR UPDATE
     TO authenticated
     USING (public.get_my_role() IN ('admin','super_admin'))
     WITH CHECK (public.get_my_role() IN ('admin','super_admin'));
   ```

3. **Apply it locally** and confirm it takes effect:

   ```bash
   npm run supabase:reset
   ```

4. **Update the documentation** — `../docs/DATABASE.md` — in the same change.

5. **Apply it to the hosted project** by running the same file in the Supabase SQL Editor,
   or by linking the project with the Supabase CLI and pushing.

### Rules that protect the data

- **Never** `DROP TABLE`, `DROP COLUMN`, rename a table, or change a column’s type once
  real data exists. Those operations destroy data. Add a new column, backfill it, and stop
  using the old one.
- **Never** use `BEGIN` / `COMMIT` in a migration; the migration runner supplies the
  transaction. `DO $$ … $$` blocks are fine.
- Always `ENABLE ROW LEVEL SECURITY` on a new table and add **per-verb** policies
  (SELECT, INSERT, UPDATE, DELETE separately). Never a single permissive `FOR ALL`.
- Ownership checks use `auth.uid()`, never `current_user`.
- `USING (true)` is only for data that is intentionally public.

---

## Inspecting the database

### Locally

```bash
npm run supabase:start     # start the stack
npm run supabase:status    # show URLs and keys
```

- **Studio** (browse tables, run SQL): http://localhost:54323
- **PostgreSQL**: `localhost:54322`
- **API**: `localhost:54321`

### Hosted

Use the Supabase Dashboard → **Table Editor** to browse data and **SQL Editor** to run
queries. Useful starting queries:

```sql
-- Who is in the system, and in what role
select full_name, role, phone, staff_id, verification_status, is_active
from public.profiles order by role, staff_id;

-- Recent activity
select action, entity_type, new_values, created_at
from public.audit_logs order by created_at desc limit 50;

-- Case counts by status
select status, count(*) from public.bite_reports group by status order by 2 desc;
```

---

## Verifying the security rules by hand

These queries confirm the server-side rules without needing the interface or SMS.

```sql
-- 1. SMS is the only verification channel, for every role
select public.otp_allowed_channels('user'),
       public.otp_allowed_channels('health_worker'),
       public.otp_allowed_channels('admin'),
       public.otp_allowed_channels('super_admin');
-- expect: {sms} for all four

-- 2. Two accounts cannot share a mobile number
--    (substitute a number that is already registered)
insert into public.profiles (id, email, full_name, role, phone, verification_status)
values (gen_random_uuid(), 'duplicate@example.com', 'Duplicate', 'user',
        '09171234567', 'verified');
-- expect: duplicate key value violates unique constraint "idx_profiles_phone_unique"

-- 3. Every table has Row Level Security enabled
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;
-- expect: relrowsecurity = true for every row

-- 4. The audit trail cannot be altered from the application
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'audit_logs'
order by cmd;
-- expect: no UPDATE or DELETE policy that grants access

-- 5. One-time codes are never stored in plain text
select purpose, channel, destination, expires_at, attempts, consumed_at
from public.otp_challenges order by created_at desc limit 10;
-- expect: no column anywhere holds the code itself
```

---

## Seeding

- `../supabase/seed.sql` is applied automatically by `supabase start` and
  `supabase db reset`. It loads sample healthcare facilities for local testing.
- It must contain **test data only** — never real patient information.
- Reference data that every environment needs (barangays, education content, first aid
  guides) is seeded by migrations instead, so it is present in production too.

---

## Backup and restore (local)

```bash
npm run supabase:dump       # writes supabase/backup.sql
npm run supabase:restore    # loads supabase/backup.sql
```

`supabase/backup.sql` is gitignored. Only commit it if it is known to contain no real
data.

---

## Storage buckets

Two private buckets, created by the migrations:

| Bucket | Path convention | Access |
|--------|-----------------|--------|
| `avatars` | `{user_id}/avatar.{ext}` | Owner only |
| `bite-photos` | `{user_id}/{report_id}/{filename}` | Owner and staff |

Both are private: files are reached through signed URLs, so knowing a path is not enough
to read a file.

---

## Recreating a clean local database

```bash
npm run supabase:reset
```

This drops everything, re-applies every migration in order, and re-runs the seed. Use it
whenever a migration has changed or the local data has become inconsistent.
