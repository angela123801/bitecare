import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'BiteCare <onboarding@resend.dev>';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}


async function sendOtpEmail(email: string, code: string, name: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: 'Your BiteCare login code',
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px"><h2 style="color:#0f766e;margin:0 0 8px">BiteCare</h2><p style="color:#374151">Hi ${name}, here is your verification code:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#111827;margin:16px 0">${code}</p><p style="color:#6b7280;font-size:14px">This code expires in 10 minutes. If you did not request this, ignore this email.</p></div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // --- Staff: verify password, then send OTP (no session yet) ---
    if (action === 'send_staff_otp') {
      const { staffId, password } = body as { staffId: string; password: string };
      if (!staffId || !password) return json({ error: 'Please enter your staff ID and password' }, 400);

      // Resolve staff_id to the auth email.
      const { data: resolved, error: resolveErr } = await adminClient.rpc('get_user_by_login_id', {
        p_login_id: staffId.trim(),
      });
      if (resolveErr) return json({ error: resolveErr.message }, 500);
      const r = resolved as Record<string, unknown>;
      if (r?.error) return json({ error: String(r.error) }, 404);
      if (r?.role === 'user') return json({ error: 'This ID belongs to a resident account' }, 400);

      const email = r.email as string;

      // Verify the password server-side. No session is created in the browser.
      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr || !signInData.user) return json({ error: 'Invalid staff ID or password' }, 401);

      // Generate and send the 2FA code.
      const { data: otpData, error: otpErr } = await adminClient.rpc('generate_staff_login_otp', {
        p_user_id: signInData.user.id,
      });
      if (otpErr) return json({ error: otpErr.message }, 500);

      const code = (otpData as Record<string, unknown>)?.dev_otp as string;
      const emailSent = await sendOtpEmail(email, code, (r.full_name as string) || 'Staff');

      return json({
        ok: true,
        user_id: signInData.user.id,
        email,
        email_sent: emailSent,
        dev_otp: !emailSent ? code : undefined,
        masked_email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      });
    }

    // --- Staff: verify OTP, then issue a session ---
    if (action === 'verify_staff_otp') {
      const { userId, otp, email, password } = body as { userId: string; otp: string; email: string; password: string };
      if (!userId || !otp) return json({ error: 'Missing code' }, 400);

      const { data: verifyResult, error: verifyErr } = await adminClient.rpc('verify_staff_login_otp', {
        p_user_id: userId,
        p_otp: String(otp).trim(),
      });
      if (verifyErr) return json({ error: verifyErr.message }, 500);

      const vr = verifyResult as Record<string, unknown>;
      if (vr?.error) return json({ error: String(vr.error) }, 400);

      // OTP passed — now create the real session and return its tokens.
      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr || !signInData.session) return json({ error: 'Could not start session' }, 500);

      return json({
        ok: true,
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
    }

    // --- Resident: login with phone number + password ---
    if (action === 'resident_login') {
      const { phone, password } = body as { phone: string; password: string };
      if (!phone || !password) return json({ error: 'Please enter your phone number and password' }, 400);

      // Resolve the phone number to an auth account.
      const { data, error: resolveErr } = await adminClient.rpc('get_user_by_login_id', {
        p_login_id: phone.trim(),
      });
      if (resolveErr) return json({ error: resolveErr.message }, 500);
      const resolved = data as Record<string, unknown>;
      if (resolved?.error) return json({ error: 'No account found with this phone number' }, 404);
      if (resolved?.role !== 'user') {
        return json({ error: 'This number belongs to a staff account. Use the staff login instead.' }, 400);
      }
      if (resolved?.is_active === false) {
        return json({ error: 'Your account has been deactivated. Contact an administrator.' }, 403);
      }

      const email = resolved.email as string;

      // Verify the resident's password through Supabase Auth.
      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr || !signInData.session) {
        return json({ error: 'Incorrect phone number or password' }, 401);
      }

      return json({
        ok: true,
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
    }

    // --- Resident: send OTP (registration verification only) ---
    if (action === 'send_resident_otp') {
      const { phone } = body as { phone: string };
      if (!phone) return json({ error: 'Please enter your phone number' }, 400);

      const { data } = await adminClient.rpc('get_user_by_login_id', {
        p_login_id: phone.trim(),
      });
      const resolved = data as Record<string, unknown>;
      if (resolved?.error) return json({ error: 'No account found with this phone number' }, 404);
      if (resolved?.role !== 'user') {
        return json({ error: 'This number belongs to a staff account. Use the staff login instead.' }, 400);
      }

      const uid = resolved.id as string;
      const { data: otpData, error: otpErr } = await adminClient.rpc('generate_login_otp', {
        p_user_id: uid,
      });
      if (otpErr) return json({ error: otpErr.message }, 500);

      const otpResult = otpData as Record<string, unknown>;
      if (otpResult?.error) return json({ error: String(otpResult.error) }, 400);

      const code = otpResult?.dev_otp as string;
      let emailSent = false;
      const residentEmail = resolved.email as string;
      if (residentEmail) {
        emailSent = await sendOtpEmail(residentEmail, code, (resolved.full_name as string) || 'Resident');
      }

      return json({
        ok: true,
        email_sent: emailSent,
        dev_otp: !emailSent ? code : undefined,
        user_id: uid,
        masked_phone: phone.trim().slice(0, 4) + '****' + phone.trim().slice(-2),
      });
    }

    // --- Resident: verify OTP (registration verification only) ---
    if (action === 'verify_resident_otp') {
      const { userId, otp } = body as { userId: string; otp: string };
      if (!userId || !otp) return json({ error: 'Missing code' }, 400);

      const { data: verifyResult, error: verifyErr } = await adminClient.rpc('verify_login_otp', {
        p_user_id: userId,
        p_otp: String(otp).trim(),
      });
      if (verifyErr) return json({ error: verifyErr.message }, 500);

      const vr = verifyResult as Record<string, unknown>;
      if (vr?.error) return json({ error: String(vr.error) }, 400);

      return json({ ok: true });
    }

    // --- Resident: forgot password (reset via email) ---
    if (action === 'resident_forgot_password') {
      const { phone } = body as { phone: string };
      if (!phone) return json({ error: 'Please enter your phone number' }, 400);

      const { data } = await adminClient.rpc('get_user_by_login_id', {
        p_login_id: phone.trim(),
      });
      const resolved = data as Record<string, unknown>;
      if (resolved?.error) return json({ error: 'No account found with this phone number' }, 404);
      if (resolved?.role !== 'user') {
        return json({ error: 'This number belongs to a staff account.' }, 400);
      }

      const email = resolved.email as string;
      // Supabase will send a password-reset email to the resident's email.
      const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${req.headers.get('origin') ?? ''}/reset-password`,
      });
      if (resetErr) return json({ error: 'Could not send reset email' }, 500);

      return json({
        ok: true,
        masked_email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
