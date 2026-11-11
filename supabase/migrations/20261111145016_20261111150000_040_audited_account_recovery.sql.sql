/*
# Audited account recovery for User Management

## 1. Purpose

Adds a controlled, audited "recover account" capability so an authorised
Super Admin can bring back an account that is missing from the live
`profiles` table but still referenced by the audit trail, without ever
creating a replacement account or inventing identity details.

This migration is **additive only**. It does not create, delete, deactivate,
rename or otherwise modify any existing account or patient record.

## 2. New table

- `account_recovery_requests`
  - `id` (uuid, primary key) - the recovery record itself.
  - `entity_id` (uuid, not null) - the original user id taken from the audit
    trail. The original id is preserved so any future relationship can be
    reconnected to the same identity.
  - `display_name` (text, not null) - name exactly as recorded in the audit
    trail at the time of recovery. Never invented.
  - `email` (text, nullable) - email exactly as recorded in the audit trail.
  - `previous_role` (text, not null) - role the account held before it
    disappeared. Recorded for traceability only; it is never re-applied
    automatically.
  - `status` (text, not null) - one of `pending_verification`, `restored`,
    `rejected`. Defaults to `pending_verification`.
  - `reason` (text, not null) - the outcome message shown to administrators.
  - `evidence` (jsonb, not null) - the audit-log rows that prove the account
    existed, so the decision is auditable.
  - `requested_by` / `reviewed_by` (uuid, nullable) - administrator who opened
    and who closed the request.
  - `requested_at` / `reviewed_at` (timestamptz) - request and decision times.
  - `created_at` / `updated_at` (timestamptz).

## 3. New function

- `public.request_account_recovery(p_entity_id uuid, p_display_name text,
  p_email text, p_previous_role text)` (SECURITY DEFINER)
  - Callable by signed-in administrators only.
  - Inserts a recovery request with status `pending_verification` and records
    the evidence taken from `audit_logs`.
  - Returns the new request id.
  - It intentionally performs **no** account creation or restoration. The
    identity and ownership of a missing account cannot be proven from the
    database alone, so the request is recorded for an authorised administrator
    to review and act on deliberately.
  - If a recovery record already exists for that entity id the existing record
    is returned instead of a duplicate being created.

- `public.review_account_recovery(p_request_id uuid, p_status text, p_reason text)`
  (SECURITY DEFINER)
  - Callable by **Super Admin only**.
  - Accepts only `restored` or `rejected`, and only from `pending_verification`.
  - Records who reviewed it and when, and writes an `audit_logs` entry
    (`account_recovery_reviewed`).
  - A recovery can only be marked `restored` when the identity has been
    verified by an administrator through a channel outside the database
    (for example the person presenting their own Staff ID or mobile number).
    The function never re-creates credentials, never sets a password, and never
    changes a role.

## 4. Security changes

- Row level security is enabled on `account_recovery_requests`.
- `SELECT` is granted to `authenticated` but restricted by policy to
  administrators only.
- `INSERT`, `UPDATE` and `DELETE` are **revoked** from `anon` and
  `authenticated`: rows are written exclusively through the two SECURITY
  DEFINER functions above, which enforce their own role checks. This keeps the
  recovery trail append-only from the client's point of view.
- `EXECUTE` on both functions is revoked from `PUBLIC` and `anon` and granted to
  `authenticated` only; the functions themselves verify the caller's role from
  the signed token, so a resident cannot open or approve a recovery.

## 5. Important notes

1. No existing table, column, row, policy or grant is dropped or altered.
2. No password, password hash or credential is read, stored or created here.
3. No role is granted, elevated or restored automatically.
4. Intentionally deactivated accounts are not touched: this feature only deals
   with accounts that are absent from `profiles`.
*/

CREATE TABLE IF NOT EXISTS public.account_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  display_name text NOT NULL,
  email text,
  previous_role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'restored', 'rejected')),
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_by uuid,
  reviewed_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_recovery_requests_entity_idx
  ON public.account_recovery_requests (entity_id);

CREATE INDEX IF NOT EXISTS account_recovery_requests_status_idx
  ON public.account_recovery_requests (status, requested_at DESC);

ALTER TABLE public.account_recovery_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_recovery_requests FROM anon, authenticated;
GRANT SELECT ON public.account_recovery_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_recovery_requests TO service_role;

DROP POLICY IF EXISTS "admins_read_recovery_requests" ON public.account_recovery_requests;
CREATE POLICY "admins_read_recovery_requests"
  ON public.account_recovery_requests FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));

CREATE OR REPLACE FUNCTION public.request_account_recovery(
  p_entity_id uuid,
  p_display_name text,
  p_email text,
  p_previous_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text;
  existing_id uuid;
  evidence jsonb;
  new_id uuid;
BEGIN
  caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'user');
  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only administrators may open an account recovery request';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'A user id is required';
  END IF;
  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'A recorded name is required';
  END IF;

  SELECT r.id INTO existing_id
  FROM public.account_recovery_requests r
  WHERE r.entity_id = p_entity_id;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb)
  INTO evidence
  FROM public.audit_logs l
  WHERE l.entity_id = p_entity_id
     OR (l.new_values ->> 'email' IS NOT NULL
         AND p_email IS NOT NULL
         AND l.new_values ->> 'email' = p_email);

  INSERT INTO public.account_recovery_requests (
    entity_id, display_name, email, previous_role, status, reason, evidence, requested_by
  ) VALUES (
    p_entity_id,
    btrim(p_display_name),
    NULLIF(btrim(COALESCE(p_email, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p_previous_role, '')), ''), 'user'),
    'pending_verification',
    'Account is absent from the live user directory but appears in the audit trail. Identity must be verified by an administrator before any restoration.',
    evidence,
    auth.uid()
  )
  RETURNING id INTO new_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (
    auth.uid(),
    'account_recovery_requested',
    'account',
    p_entity_id,
    jsonb_build_object('display_name', btrim(p_display_name), 'email', p_email, 'previous_role', p_previous_role)
  );

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_account_recovery(
  p_request_id uuid,
  p_status text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text;
  current_status text;
  target_entity uuid;
BEGIN
  caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'user');
  IF caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only a Super Admin may review an account recovery';
  END IF;

  IF p_status NOT IN ('restored', 'rejected') THEN
    RAISE EXCEPTION 'Recovery status must be restored or rejected';
  END IF;

  SELECT status, entity_id INTO current_status, target_entity
  FROM public.account_recovery_requests
  WHERE id = p_request_id;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Recovery request not found';
  END IF;
  IF current_status <> 'pending_verification' THEN
    RAISE EXCEPTION 'This recovery request has already been reviewed';
  END IF;

  UPDATE public.account_recovery_requests
  SET status = p_status,
      reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), reason),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (
    auth.uid(),
    'account_recovery_reviewed',
    'account',
    target_entity,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );

  RETURN p_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_account_recovery(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_recovery(uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_account_recovery(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_account_recovery(uuid, text, text) TO authenticated;
