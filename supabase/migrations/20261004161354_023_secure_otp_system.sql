/*
# Secure OTP Verification System

## Summary
Replaces the previous plaintext, anon-reachable OTP helpers with a single
hardened OTP store and a small set of service-role-only functions that the
`otp` edge function calls. OTPs are now hashed, single-use, time-limited and
rate-limited, and channel availability is enforced per role on the server.

## 1. Security fix (critical) — OTPs were reachable by anonymous visitors
The previous functions `generate_login_otp`, `verify_login_otp`,
`generate_staff_login_otp` and `verify_staff_login_otp` were granted to the
`anon` role AND returned the plaintext code in their JSON result (`dev_otp`).
Any unauthenticated visitor could therefore call
`generate_login_otp(<victim uuid>)` and read the victim's code back. This
migration revokes all browser access to those functions. They are left in place
(so nothing referencing them hard-fails) but are no longer used by the app.

`get_user_by_login_id` is also revoked from the browser roles: it returns the
auth email for a phone lookup, which allowed phone -> email enumeration. Only
the edge functions (service role) may call it now.

## 2. New table — otp_challenges
The single secure store for every OTP the system issues.
  - `id` uuid PK
  - `user_id` uuid FK profiles(id), ON DELETE CASCADE
  - `purpose` text — login | verification | password_recovery | contact_change
  - `channel` text — email | sms
  - `destination` text — the address/phone the code was actually sent to
  - `otp_hash` text — SHA-256 of (code + per-row salt); the code is never stored
  - `salt` text — random per-row salt
  - `expires_at` timestamptz — 5 minutes after issue
  - `attempts` integer — failed guesses for the current code (max 5)
  - `resend_available_at` timestamptz — 60-second resend cooldown
  - `send_count` integer — codes issued inside the current rate window (max 5)
  - `window_started_at` timestamptz — start of the rolling one-hour window
  - `consumed_at` timestamptz — set when a code is used (one-time use)
  - `created_at` / `updated_at`
  One active challenge per (user_id, purpose); a new code overwrites the old
  one, which invalidates it.

## 3. New functions (all SECURITY DEFINER, service_role only)
- `otp_allowed_channels(p_role)` — the role->channel truth table. Readable by
  anon/authenticated because it exposes no secrets, so the UI can show only the
  permitted methods. Residents are limited to SMS; staff may use email or SMS.
- `otp_create_challenge(p_user_id, p_purpose, p_channel, p_destination)` —
  enforces the role/channel rule, the resend cooldown and the hourly rate
  limit, generates a cryptographically random 6-digit code, stores only its
  hash, invalidates any previous code, and returns the plaintext code ONCE to
  the caller (the edge function) so it can be delivered. Never audited.
- `otp_verify_challenge(p_user_id, p_purpose, p_otp)` — validates format,
  expiry (5 min), attempt cap (5) and the hash; marks the code consumed on
  success (one-time use).

## 4. Audit
`otp_sent`, `otp_verified`, `otp_failed`, `otp_channel_blocked` and
`otp_rate_limited` are written to `audit_logs`. The OTP value is NEVER written
to the audit log or to any table.

## 5. Retired table
`otp_codes` previously held plaintext codes. All rows are purged and every
browser grant is revoked so the retired table can no longer leak a code. The
table is left in place (not dropped) to avoid a destructive schema change.

## 6. RLS
`otp_challenges`: RLS enabled with no policies for browser roles, and all
INSERT/UPDATE/DELETE/SELECT grants revoked from anon and authenticated. Only
the SECURITY DEFINER functions touch it.
*/

-- ---------- 1. Retire the old plaintext OTP table ----------
DELETE FROM public.otp_codes;
REVOKE ALL ON public.otp_codes FROM anon, authenticated;
DROP POLICY IF EXISTS "no_direct_access_otp" ON public.otp_codes;
CREATE POLICY "no_direct_access_otp" ON public.otp_codes FOR ALL
  TO anon, authenticated USING (false) WITH CHECK (false);

-- ---------- 2. Revoke browser access to the leaked OTP functions ----------
REVOKE ALL ON FUNCTION public.generate_login_otp(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_login_otp(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_staff_login_otp(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_staff_login_otp(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_by_login_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_staff_id(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_login_otp(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_login_otp(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_staff_login_otp(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_staff_login_otp(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_by_login_id(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_staff_id(text) TO service_role;

-- ---------- 3. New secure OTP store ----------
CREATE TABLE IF NOT EXISTS public.otp_challenges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose             text NOT NULL CHECK (purpose IN ('login','verification','password_recovery','contact_change')),
  channel             text NOT NULL CHECK (channel IN ('email','sms')),
  destination         text NOT NULL,
  otp_hash            text NOT NULL,
  salt                text NOT NULL,
  expires_at          timestamptz NOT NULL,
  attempts            integer NOT NULL DEFAULT 0,
  resend_available_at timestamptz NOT NULL DEFAULT now(),
  send_count          integer NOT NULL DEFAULT 0,
  window_started_at   timestamptz NOT NULL DEFAULT now(),
  consumed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_challenges_user_purpose_key UNIQUE (user_id, purpose)
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_user ON public.otp_challenges(user_id, purpose);

ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;

-- No browser role may read or write OTP rows directly.
REVOKE ALL ON public.otp_challenges FROM anon, authenticated;

-- ---------- 4. Role -> channel truth table ----------
CREATE OR REPLACE FUNCTION public.otp_allowed_channels(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_role = 'user' THEN ARRAY['sms']::text[]
    ELSE ARRAY['email','sms']::text[]
  END;
$$;

REVOKE ALL ON FUNCTION public.otp_allowed_channels(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.otp_allowed_channels(text) TO anon, authenticated, service_role;

-- ---------- 5. Issue a challenge ----------
CREATE OR REPLACE FUNCTION public.otp_create_challenge(
  p_user_id     uuid,
  p_purpose     text,
  p_channel     text,
  p_destination text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_email       text;
  v_phone       text;
  v_allowed     text[];
  v_destination text;
  v_code        text;
  v_salt        text;
  v_row         public.otp_challenges%ROWTYPE;
  v_new_count   integer;
  v_window      timestamptz;
BEGIN
  IF p_purpose NOT IN ('login','verification','password_recovery','contact_change') THEN
    RAISE EXCEPTION 'Invalid purpose';
  END IF;
  IF p_channel NOT IN ('email','sms') THEN
    RAISE EXCEPTION 'Invalid channel';
  END IF;

  SELECT role, email, phone INTO v_role, v_email, v_phone
    FROM public.profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  -- Server-side role restriction: a resident may only ever use SMS.
  v_allowed := public.otp_allowed_channels(v_role);
  IF NOT (p_channel = ANY (v_allowed)) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
    VALUES (auth.uid(), 'otp_channel_blocked', 'account', p_user_id,
            jsonb_build_object('role', v_role, 'requested_channel', p_channel));
    RAISE EXCEPTION 'This verification method is not available for your account';
  END IF;

  -- Resolve and validate the destination for the chosen channel.
  IF p_channel = 'email' THEN
    v_destination := NULLIF(v_email, '');
    IF v_destination IS NULL THEN
      RAISE EXCEPTION 'No email address is on file for this account';
    END IF;
  ELSE
    v_destination := public.normalize_phone(COALESCE(NULLIF(p_destination, ''), v_phone));
    IF v_destination IS NULL OR v_destination !~ '^0[0-9]{10}$' THEN
      RAISE EXCEPTION 'A valid Philippine mobile number is required';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.otp_challenges
    WHERE user_id = p_user_id AND purpose = p_purpose FOR UPDATE;

  IF FOUND THEN
    -- 60-second resend cooldown.
    IF v_row.resend_available_at > now() THEN
      RAISE EXCEPTION 'Please wait % seconds before requesting another code',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.resend_available_at - now())))::int);
    END IF;

    -- Rolling one-hour rate limit: at most 5 codes per hour.
    v_window := v_row.window_started_at;
    IF v_window < now() - interval '1 hour' THEN
      v_new_count := 1;
      v_window := now();
    ELSE
      IF v_row.send_count >= 5 THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
        VALUES (auth.uid(), 'otp_rate_limited', 'account', p_user_id,
                jsonb_build_object('purpose', p_purpose, 'channel', p_channel));
        RAISE EXCEPTION 'Too many codes requested. Please try again later.';
      END IF;
      v_new_count := v_row.send_count + 1;
    END IF;
  ELSE
    v_new_count := 1;
    v_window := now();
  END IF;

  -- Cryptographically random 6-digit code.
  v_code := lpad(
    ((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text,
    6, '0'
  );
  v_salt := encode(gen_random_bytes(16), 'hex');

  INSERT INTO public.otp_challenges
    (user_id, purpose, channel, destination, otp_hash, salt, expires_at,
     attempts, resend_available_at, send_count, window_started_at, consumed_at, updated_at)
  VALUES
    (p_user_id, p_purpose, p_channel, v_destination,
     encode(digest(v_code || ':' || v_salt, 'sha256'), 'hex'),
     v_salt, now() + interval '5 minutes',
     0, now() + interval '60 seconds', v_new_count, v_window, NULL, now())
  ON CONFLICT (user_id, purpose) DO UPDATE SET
    channel             = EXCLUDED.channel,
    destination         = EXCLUDED.destination,
    otp_hash            = EXCLUDED.otp_hash,
    salt                = EXCLUDED.salt,
    expires_at          = EXCLUDED.expires_at,
    attempts            = 0,
    resend_available_at = EXCLUDED.resend_available_at,
    send_count          = EXCLUDED.send_count,
    window_started_at   = EXCLUDED.window_started_at,
    consumed_at         = NULL,
    updated_at          = now();

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'otp_sent', 'account', p_user_id,
          jsonb_build_object('purpose', p_purpose, 'channel', p_channel));

  -- The plaintext code is returned ONLY here, to the service-role caller.
  RETURN json_build_object(
    'ok', true,
    'otp', v_code,
    'destination', v_destination,
    'channel', p_channel,
    'expires_in', 300,
    'resend_in', 60
  );
END;
$$;

REVOKE ALL ON FUNCTION public.otp_create_challenge(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_create_challenge(uuid, text, text, text) TO service_role;

-- ---------- 6. Verify a challenge ----------
CREATE OR REPLACE FUNCTION public.otp_verify_challenge(
  p_user_id uuid,
  p_purpose text,
  p_otp     text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.otp_challenges%ROWTYPE;
BEGIN
  IF p_otp IS NULL OR p_otp !~ '^[0-9]{6}$' THEN
    RETURN json_build_object('ok', false, 'error', 'Enter the 6-digit code');
  END IF;

  SELECT * INTO v_row FROM public.otp_challenges
    WHERE user_id = p_user_id AND purpose = p_purpose FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'No verification is in progress. Request a new code.');
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'This code has already been used. Request a new one.');
  END IF;

  IF v_row.expires_at < now() THEN
    UPDATE public.otp_challenges SET consumed_at = now(), updated_at = now()
      WHERE user_id = p_user_id AND purpose = p_purpose;
    RETURN json_build_object('ok', false, 'error', 'This code has expired. Request a new one.');
  END IF;

  IF v_row.attempts >= 5 THEN
    RETURN json_build_object('ok', false, 'error', 'Too many incorrect attempts. Request a new code.');
  END IF;

  IF v_row.otp_hash <> encode(digest(p_otp || ':' || v_row.salt, 'sha256'), 'hex') THEN
    UPDATE public.otp_challenges
       SET attempts = attempts + 1, updated_at = now()
     WHERE user_id = p_user_id AND purpose = p_purpose;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
    VALUES (auth.uid(), 'otp_failed', 'account', p_user_id,
            jsonb_build_object('purpose', p_purpose, 'attempts', v_row.attempts + 1));
    RETURN json_build_object(
      'ok', false,
      'error', 'Incorrect code. Please try again.',
      'attempts_left', GREATEST(0, 4 - v_row.attempts)
    );
  END IF;

  UPDATE public.otp_challenges SET consumed_at = now(), updated_at = now()
    WHERE user_id = p_user_id AND purpose = p_purpose;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'otp_verified', 'account', p_user_id,
          jsonb_build_object('purpose', p_purpose, 'channel', v_row.channel));

  RETURN json_build_object('ok', true, 'channel', v_row.channel, 'destination', v_row.destination);
END;
$$;

REVOKE ALL ON FUNCTION public.otp_verify_challenge(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_verify_challenge(uuid, text, text) TO service_role;

-- ---------- 7. Update the login-id lookup to carry the role channel policy ----------
CREATE OR REPLACE FUNCTION public.get_user_by_login_id(p_login_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE staff_id = p_login_id;
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'staff_id', v_profile.staff_id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles
   WHERE public.normalize_phone(phone) = public.normalize_phone(p_login_id)
     AND role = 'user';
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    );
  END IF;

  RETURN json_build_object('error', 'No account found with that ID');
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_by_login_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_login_id(text) TO service_role;
