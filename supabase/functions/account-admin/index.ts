import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'BiteCare <onboarding@resend.dev>';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: 'Your BiteCare verification code',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="color:#0f766e;margin:0 0 8px">BiteCare</h2>
            <p style="color:#374151">Use this code to verify the new account:</p>
            <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#111827;margin:16px 0">${code}</p>
            <p style="color:#6b7280;font-size:14px">This code expires in 10 minutes and can only be used once. If you did not expect this, ignore this email.</p>
          </div>`,
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

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // ---------- Create an account ----------
    if (action === 'create') {
      const { email, fullName, role, phone, requireVerification } = body as {
        email: string; fullName: string; role: string; phone?: string; requireVerification?: boolean;
      };

      if (!email || !fullName || !role) {
        return json({ error: 'Full name, email and role are required' }, 400);
      }

      // Authorise + validate the role via the database (server-side, not UI).
      const { error: authErr } = await callerClient.rpc('admin_create_account', {
        p_email: email,
        p_full_name: fullName,
        p_role: role,
        p_phone: phone ?? '',
      });
      if (authErr) return json({ error: authErr.message }, 403);

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: randomPassword(),
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
          verification_status: requireVerification ? 'pending_verification' : 'verified',
        })
        .eq('id', newUserId);
      if (updateErr) return json({ error: updateErr.message }, 500);

      // Keep the sign-in token's role claim in step with the profile, so the
      // new account's first session carries the correct role immediately.
      const { error: metaErr } = await adminClient.rpc('set_user_app_metadata', {
        p_user_id: newUserId,
        p_role: role,
      });
      if (metaErr) return json({ error: metaErr.message }, 500);

      let code: string | null = null;
      let emailSent = false;

      if (requireVerification) {
        const { data: otpData, error: otpErr } = await adminClient.rpc('generate_verification_otp', {
          p_user_id: newUserId,
        });
        if (otpErr) return json({ error: otpErr.message }, 500);
        code = (otpData as { otp: string }).otp;
        emailSent = await sendOtpEmail(email, code);
      } else {
        await adminClient.rpc('mark_account_verified', { p_user_id: newUserId });
      }

      await adminClient.from('audit_logs').insert({
        actor_id: user.id,
        action: 'account_created',
        entity_type: 'account',
        entity_id: newUserId,
        new_values: { email, role, full_name: fullName, verification_required: !!requireVerification },
      });

      // When no email provider is configured we surface the code to the
      // authorised creator only, clearly flagged as development mode.
      return json({
        ok: true,
        user_id: newUserId,
        email,
        role,
        requires_verification: !!requireVerification,
        email_sent: emailSent,
        dev_otp: !emailSent && requireVerification ? code : undefined,
      });
    }

    // ---------- Resend code ----------
    if (action === 'resend') {
      const { userId } = body as { userId: string };
      if (!userId) return json({ error: 'Missing account' }, 400);

      const { data: target } = await adminClient
        .from('profiles')
        .select('email, verification_status')
        .eq('id', userId)
        .maybeSingle();
      if (!target) return json({ error: 'Account not found' }, 404);
      if (target.verification_status === 'verified') {
        return json({ error: 'This account is already verified' }, 400);
      }

      const { data: otpData, error: otpErr } = await adminClient.rpc('generate_verification_otp', {
        p_user_id: userId,
      });
      if (otpErr) return json({ error: otpErr.message }, 400);

      const code = (otpData as { otp: string }).otp;
      const emailSent = await sendOtpEmail(target.email, code);

      return json({ ok: true, email_sent: emailSent, dev_otp: emailSent ? undefined : code });
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
