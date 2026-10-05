import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// SMS verification. TextBee is the configured gateway; Semaphore is a fallback.
const TEXTBEE_API_KEY = Deno.env.get('TEXTBEE_API_KEY');
const TEXTBEE_DEVICE_ID = Deno.env.get('TEXTBEE_DEVICE_ID');
const TEXTBEE_SIM_ID = Deno.env.get('TEXTBEE_SIM_ID');
const SEMAPHORE_API_KEY = Deno.env.get('SEMAPHORE_API_KEY');
const SEMAPHORE_SENDER = Deno.env.get('SEMAPHORE_SENDER_NAME');

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Philippine mobile numbers only: 09XXXXXXXXX (11 digits). */
function isValidPhMobile(phone: string): boolean {
  return /^09[0-9]{9}$/.test(phone);
}

/** Mask a phone number, keeping the prefix and last two digits. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '******';
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
}

/** TextBee expects international format, so 09XXXXXXXXX becomes +639XXXXXXXXX. */
function toInternationalPh(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('63')) return `+${digits}`;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  return `+63${digits}`;
}

/**
 * Send a verification code by SMS. Returns false when no gateway is configured
 * or the send failed, so the caller reports delivery honestly instead of
 * pretending the message went out.
 */
async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  const text = `Your BiteCare verification code is ${code}. Use it to verify the new account. It expires in 5 minutes. Never share this code.`;
  try {
    if (TEXTBEE_API_KEY) {
      const simId = Number(TEXTBEE_SIM_ID);
      const res = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEXTBEE_API_KEY },
        body: JSON.stringify({
          recipients: [toInternationalPh(phone)],
          message: text,
          ...(TEXTBEE_DEVICE_ID ? { deviceId: TEXTBEE_DEVICE_ID } : {}),
          ...(Number.isInteger(simId) ? { simSubscriptionId: simId } : {}),
        }),
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      return data?.data?.success !== false;
    }

    if (SEMAPHORE_API_KEY) {
      const res = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: SEMAPHORE_API_KEY,
          number: phone,
          message: text,
          ...(SEMAPHORE_SENDER ? { sendername: SEMAPHORE_SENDER } : {}),
        }),
      });
      return res.ok;
    }

    return false;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid session' }, 401);

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    const callerRole = callerProfile?.role ?? 'user';
    if (!['super_admin', 'admin', 'health_worker'].includes(callerRole)) {
      return json({ error: 'Your role cannot create accounts' }, 403);
    }

    // Authoritative, server-side determination of the Super Admin exemption.
    // `callerProfile.role` is read from the database for the signed-in user's
    // verified session, so it cannot be influenced by anything in the request
    // body. A resident or admin cannot claim this by editing the UI or payload.
    const isSuperAdmin = callerRole === 'super_admin';

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // ---------- Create an account ----------
    if (action === 'create') {
      const { email, fullName, role, phone, password, requireVerification } = body as {
        email: string; fullName: string; role: string; phone?: string; password?: string; requireVerification?: boolean;
      };

      if (!email || !fullName || !role) {
        return json({ error: 'Full name, email and role are required' }, 400);
      }
      if (!password || password.length < 8) {
        return json({ error: 'A password of at least 8 characters is required' }, 400);
      }

      // Super Admin provisioning exemption: accounts created by a Super Admin are
      // activated immediately. No code is generated or sent, and the account is
      // never held back waiting on email or SMS verification.
      const verificationRequired = isSuperAdmin ? false : !!requireVerification;

      // Verification is by SMS only, so a reachable mobile number is required
      // whenever a code will be sent.
      if (verificationRequired && !isValidPhMobile(phone ?? '')) {
        return json({ error: 'A valid Philippine mobile number is required for SMS verification' }, 400);
      }

      // Authorise + validate the role and record the audit trail. This runs as
      // the signed-in caller, so the database's own role matrix is the source
      // of truth (not the UI).
      const { error: authErr } = await callerClient.rpc('admin_create_account', {
        p_email: email,
        p_full_name: fullName,
        p_role: role,
        p_phone: phone ?? '',
      });
      if (authErr) return json({ error: authErr.message }, 403);

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr) {
        return json({ error: createErr.message }, 400);
      }

      const newUserId = created.user.id;

      // The signup trigger created a 'user' profile; apply the authorised role
      // and profile fields directly (service role bypasses RLS).
      const { error: updateErr } = await adminClient
        .from('profiles')
        .update({
          role,
          full_name: fullName,
          phone: phone ?? '',
          verification_status: verificationRequired ? 'pending_verification' : 'verified',
        })
        .eq('id', newUserId);
      if (updateErr) {
        // Do not leave a half-created account behind: the profile could not be
        // given its role, so remove the auth user and report the failure.
        try {
          await adminClient.auth.admin.deleteUser(newUserId);
        } catch {
          // Best effort cleanup; the error below is what matters.
        }
        return json({ error: updateErr.message }, 500);
      }

      // Keep the sign-in token's role claim in step with the profile, so the
      // new account's first session carries the correct role immediately.
      const { error: metaErr } = await adminClient.rpc('set_user_app_metadata', {
        p_user_id: newUserId,
        p_role: role,
      });
      if (metaErr) return json({ error: metaErr.message }, 500);

      // Read back the generated Staff ID so the creator can share it.
      const { data: newProfile } = await adminClient
        .from('profiles')
        .select('staff_id')
        .eq('id', newUserId)
        .maybeSingle();

      let otpSent = false;

      if (verificationRequired) {
        const { data: otpData, error: otpErr } = await adminClient.rpc('generate_verification_otp', {
          p_user_id: newUserId,
        });
        if (otpErr) return json({ error: otpErr.message }, 500);
        const code = (otpData as { otp: string }).otp;
        otpSent = await sendOtpSms(phone ?? '', code);
      } else {
        // No verification step at all: activate the account now.
        await adminClient.rpc('mark_account_verified', { p_user_id: newUserId });
      }

      // Staff sign in with the generated Staff ID; residents sign in with the
      // mobile number they registered.
      const loginId = role === 'user' ? (phone ?? '') : (newProfile?.staff_id ?? null);

      await adminClient.from('audit_logs').insert({
        actor_id: user.id,
        action: 'account_created',
        entity_type: 'account',
        entity_id: newUserId,
        new_values: {
          email,
          role,
          full_name: fullName,
          staff_id: newProfile?.staff_id ?? null,
          login_id: loginId,
          verification_required: verificationRequired,
          provisioning_mode: isSuperAdmin ? 'super_admin_exempt' : 'standard',
          otp_sent: otpSent,
        },
      });

      // The verification code is NEVER returned to the client. When the email
      // could not be sent we say so plainly instead of pretending it was.
      return json({
        ok: true,
        user_id: newUserId,
        email,
        role,
        staff_id: newProfile?.staff_id ?? null,
        login_id: loginId,
        requires_verification: verificationRequired,
        provisioning_mode: isSuperAdmin ? 'super_admin_exempt' : 'standard',
        otp_sent: otpSent,
        destination_masked: verificationRequired ? maskPhone(phone ?? '') : null,
      });
    }

    // ---------- Resend code ----------
    if (action === 'resend') {
      const { userId } = body as { userId: string };
      if (!userId) return json({ error: 'Missing account' }, 400);

      const { data: target } = await adminClient
        .from('profiles')
        .select('phone, verification_status')
        .eq('id', userId)
        .maybeSingle();
      if (!target) return json({ error: 'Account not found' }, 404);
      if (target.verification_status === 'verified') {
        return json({ error: 'This account is already verified' }, 400);
      }
      if (!isValidPhMobile(target.phone ?? '')) {
        return json({ error: 'No valid mobile number is on file for this account' }, 400);
      }

      const { data: otpData, error: otpErr } = await adminClient.rpc('generate_verification_otp', {
        p_user_id: userId,
      });
      if (otpErr) return json({ error: otpErr.message }, 400);

      const code = (otpData as { otp: string }).otp;
      const otpSent = await sendOtpSms(target.phone ?? '', code);

      return json({ ok: true, otp_sent: otpSent, destination_masked: maskPhone(target.phone ?? '') });
    }

    // ---------- Verify code ----------
    if (action === 'verify') {
      const { userId, otp } = body as { userId: string; otp: string };
      if (!userId || !otp) return json({ error: 'Missing code' }, 400);

      const { data: result, error: verifyErr } = await adminClient.rpc('verify_account_otp', {
        p_user_id: userId,
        p_otp: String(otp).trim(),
      });
      if (verifyErr) return json({ error: verifyErr.message }, 500);
      if (!(result as { ok: boolean }).ok) {
        return json({ error: (result as { error: string }).error }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
