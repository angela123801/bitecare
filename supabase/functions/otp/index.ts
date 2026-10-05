import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// SMS providers. TextBee is the free default: it sends through an Android
// phone paired with the account, so it costs nothing per message. Semaphore,
// Twilio and Vonage remain as fallbacks. The first configured one is used.
const TEXTBEE_API_KEY = Deno.env.get('TEXTBEE_API_KEY');
const TEXTBEE_DEVICE_ID = Deno.env.get('TEXTBEE_DEVICE_ID');
// Which SIM in the gateway phone sends the messages. The phone's default SIM is
// used when unset. Android reassigns these ids when a SIM is swapped, so read
// the current value from the SIM Cards screen in the textbee app.
const TEXTBEE_SIM_ID = Deno.env.get('TEXTBEE_SIM_ID');
const SEMAPHORE_API_KEY = Deno.env.get('SEMAPHORE_API_KEY');
const SEMAPHORE_SENDER = Deno.env.get('SEMAPHORE_SENDER_NAME');
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER');
const VONAGE_API_KEY = Deno.env.get('VONAGE_API_KEY');
const VONAGE_API_SECRET = Deno.env.get('VONAGE_API_SECRET');
const VONAGE_FROM = Deno.env.get('VONAGE_FROM');

type Purpose = 'login' | 'verification' | 'password_recovery' | 'contact_change';
type Channel = 'email' | 'sms';

const PURPOSES: Purpose[] = ['login', 'verification', 'password_recovery', 'contact_change'];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Mask a phone number, keeping the prefix and last two digits. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '******';
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
}

/** Philippine mobile numbers only: 09XXXXXXXXX (11 digits). */
function isValidPhMobile(phone: string): boolean {
  return /^09[0-9]{9}$/.test(phone);
}

/** TextBee requires international format, so 09XXXXXXXXX becomes +639XXXXXXXXX. */
function toInternationalPh(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('63')) return `+${digits}`;
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`;
  return `+63${digits}`;
}

const textbeeSimId = Number(TEXTBEE_SIM_ID);

function smsProvider(): 'textbee' | 'semaphore' | 'twilio' | 'vonage' | null {
  if (TEXTBEE_API_KEY) return 'textbee';
  if (SEMAPHORE_API_KEY) return 'semaphore';
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) return 'twilio';
  if (VONAGE_API_KEY && VONAGE_API_SECRET && VONAGE_FROM) return 'vonage';
  return null;
}

function smsConfigured(): boolean {
  return smsProvider() !== null;
}

function providerConfigured(channel: Channel): boolean {
  return channel === 'sms' && smsConfigured();
}

function otpMessage(purpose: Purpose, code: string): string {
  const context =
    purpose === 'password_recovery'
      ? 'to reset your password'
      : purpose === 'contact_change'
        ? 'to confirm your new number'
        : 'to sign in';
  return `Your BiteCare verification code is ${code}. Use it ${context}. It expires in 5 minutes. Never share this code.`;
}

async function sendSms(to: string, purpose: Purpose, code: string): Promise<boolean> {
  const provider = smsProvider();
  const text = otpMessage(purpose, code);
  try {
    if (provider === 'textbee') {
      const res = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': TEXTBEE_API_KEY! },
        body: JSON.stringify({
          recipients: [toInternationalPh(to)],
          message: text,
          ...(TEXTBEE_DEVICE_ID ? { deviceId: TEXTBEE_DEVICE_ID } : {}),
          ...(Number.isInteger(textbeeSimId) ? { simSubscriptionId: textbeeSimId } : {}),
        }),
      });
      if (!res.ok) return false;
      // A 200 only means the phone accepted the message into its queue; the
      // device still has to be online to actually send it.
      const data = await res.json().catch(() => null);
      return data?.data?.success !== false;
    }

    if (provider === 'semaphore') {
      const res = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: SEMAPHORE_API_KEY,
          number: to,
          message: text,
          ...(SEMAPHORE_SENDER ? { sendername: SEMAPHORE_SENDER } : {}),
        }),
      });
      return res.ok;
    }

    if (provider === 'twilio') {
      const body = new URLSearchParams({ To: to, From: TWILIO_FROM!, Body: text });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        },
      );
      return res.ok;
    }

    if (provider === 'vonage') {
      const res = await fetch('https://rest.nexmo.com/sms/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: VONAGE_API_KEY,
          api_secret: VONAGE_API_SECRET,
          to,
          from: VONAGE_FROM,
          text,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      const first = data?.messages?.[0];
      return first?.status === '0';
    }

    return false;
  } catch {
    return false;
  }
}

async function deliver(channel: Channel, to: string, purpose: Purpose, code: string): Promise<boolean> {
  return channel === 'sms' ? sendSms(to, purpose, code) : false;
}

/** Resolve a signed-in caller from the Authorization header, if present. */
async function getCaller(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}

/**
 * Check an email/password pair on a throwaway client. This MUST NOT be the
 * shared service client: signInWithPassword attaches the user's session to the
 * client it runs on, which would make every later call run as that user
 * (authenticated) instead of service_role.
 */
async function checkPassword(email: string, password: string) {
  const probe = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return data.session;
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

    // ------------------------------------------------------------------
    // Which verification methods may this account use?
    // ------------------------------------------------------------------
    if (action === 'channels') {
      const identifier = String(body.identifier ?? '').trim();
      if (!identifier) return json({ error: 'Enter your sign-in ID' }, 400);

      const { data, error } = await adminClient.rpc('get_user_by_login_id', {
        p_login_id: identifier,
      });
      if (error) return json({ error: 'Could not look up that account' }, 500);
      const resolved = data as Record<string, unknown>;
      if (resolved?.error) return json({ error: 'No account found with that sign-in ID' }, 404);

      const role = String(resolved.role);
      const phone = String(resolved.phone ?? '');

      const { data: allowed } = await adminClient.rpc('otp_allowed_channels', { p_role: role });
      const allowedList = (allowed as string[]) ?? [];

      const channels: { channel: Channel; destination_masked: string }[] = [];
      if (allowedList.includes('sms') && isValidPhMobile(phone)) {
        channels.push({ channel: 'sms', destination_masked: maskPhone(phone) });
      }

      return json({ ok: true, role, channels });
    }

    // ------------------------------------------------------------------
    // Send a code
    // ------------------------------------------------------------------
    if (action === 'send') {
      const purpose = body.purpose as Purpose;
      const channel = body.channel as Channel;
      if (!PURPOSES.includes(purpose)) return json({ error: 'Invalid request' }, 400);
      if (channel !== 'sms') return json({ error: 'SMS is the only verification method' }, 400);

      let userId: string | null = null;
      let newPhone = '';

      if (purpose === 'login') {
        // Password is verified here and the session is discarded: the OTP is
        // what actually completes the sign-in.
        const identifier = String(body.identifier ?? '').trim();
        const password = String(body.password ?? '');
        if (!identifier || !password) return json({ error: 'Enter your sign-in ID and password' }, 400);

        const { data, error } = await adminClient.rpc('get_user_by_login_id', { p_login_id: identifier });
        if (error) return json({ error: 'Could not complete sign-in' }, 500);
        const resolved = data as Record<string, unknown>;
        if (resolved?.error) return json({ error: 'Invalid sign-in ID or password' }, 401);
        if (resolved.is_active === false) {
          return json({ error: 'This account is deactivated. Contact an administrator.' }, 403);
        }

        const session = await checkPassword(String(resolved.email), password);
        if (!session) return json({ error: 'Invalid sign-in ID or password' }, 401);

        userId = String(resolved.id);
      } else if (purpose === 'password_recovery') {
        // The user cannot sign in, so identity is proven by the OTP itself.
        // Respond identically whether or not the account exists, so this
        // endpoint cannot be used to discover which numbers are registered.
        const identifier = String(body.identifier ?? '').trim();
        if (!identifier) return json({ error: 'Enter your phone number or staff ID' }, 400);

        const { data } = await adminClient.rpc('get_user_by_login_id', { p_login_id: identifier });
        const resolved = data as Record<string, unknown>;
        if (resolved?.error) {
          return json({
            ok: true, channel, destination_masked: '•••', delivered: false,
            provider_configured: providerConfigured(channel), expires_in: 300, resend_in: 60,
          });
        }
        userId = String(resolved.id);
      } else {
        // Verification and contact changes require a signed-in caller acting on
        // their own account, so a stranger cannot trigger codes for someone else.
        const caller = await getCaller(req);
        if (!caller) return json({ error: 'Please sign in again to continue' }, 401);
        userId = caller.id;

        if (purpose === 'contact_change') {
          newPhone = String(body.newPhone ?? '').trim();
          const normalized = newPhone.replace(/\D/g, '');
          if (!isValidPhMobile(normalized)) {
            return json({ error: 'Enter a valid Philippine mobile number (09XXXXXXXXX)' }, 400);
          }
          newPhone = normalized;
        }
      }

      if (!userId) return json({ error: 'Invalid request' }, 400);

      const { data: challenge, error: challengeErr } = await adminClient.rpc('otp_create_challenge', {
        p_user_id: userId,
        p_purpose: purpose,
        p_channel: channel,
        p_destination: purpose === 'contact_change' ? newPhone : null,
      });
      if (challengeErr) return json({ error: challengeErr.message }, 400);

      const created = challenge as Record<string, unknown>;
      const code = String(created.otp);
      const destination = String(created.destination);

      const configured = providerConfigured(channel);
      const delivered = configured ? await deliver(channel, destination, purpose, code) : false;

      // The code is never returned. When no provider is configured we say so
      // plainly instead of pretending the message was sent.
      return json({
        ok: true,
        channel,
        destination_masked: maskPhone(destination),
        delivered,
        provider_configured: configured,
        expires_in: Number(created.expires_in ?? 300),
        resend_in: Number(created.resend_in ?? 60),
      });
    }

    // ------------------------------------------------------------------
    // Verify a code
    // ------------------------------------------------------------------
    if (action === 'verify') {
      const purpose = body.purpose as Purpose;
      const otp = String(body.otp ?? '').trim();
      if (!PURPOSES.includes(purpose)) return json({ error: 'Invalid request' }, 400);
      if (!/^[0-9]{6}$/.test(otp)) return json({ error: 'Enter the 6-digit code' }, 400);

      // Login is pre-session, so the caller proves identity with the sign-in
      // ID and password they already supplied; every other purpose requires a
      // signed-in caller acting on their own account.
      let userId = '';
      let loginEmail = '';
      let loginPassword = '';
      if (purpose === 'login') {
        const identifier = String(body.identifier ?? '').trim();
        loginPassword = String(body.password ?? '');
        if (!identifier || !loginPassword) {
          return json({ error: 'Please sign in again to continue' }, 401);
        }
        const { data: resolved, error: resolveErr } = await adminClient.rpc('get_user_by_login_id', {
          p_login_id: identifier,
        });
        if (resolveErr) return json({ error: 'Verification failed' }, 500);
        const r = resolved as Record<string, unknown>;
        if (r?.error) return json({ error: 'Invalid sign-in ID or password' }, 401);
        userId = String(r.id);
        loginEmail = String(r.email);
      } else if (purpose === 'password_recovery') {
        const identifier = String(body.identifier ?? '').trim();
        if (!identifier) return json({ error: 'Please restart the reset process' }, 401);
        const { data: resolved, error: resolveErr } = await adminClient.rpc('get_user_by_login_id', {
          p_login_id: identifier,
        });
        if (resolveErr) return json({ error: 'Verification failed' }, 500);
        const r = resolved as Record<string, unknown>;
        if (r?.error) return json({ error: 'Verification failed' }, 400);
        userId = String(r.id);
      } else {
        const caller = await getCaller(req);
        if (!caller) return json({ error: 'Please sign in again to continue' }, 401);
        userId = caller.id;
      }

      const { data, error } = await adminClient.rpc('otp_verify_challenge', {
        p_user_id: userId,
        p_purpose: purpose,
        p_otp: otp,
      });
      if (error) return json({ error: 'Verification failed' }, 500);

      const result = data as Record<string, unknown>;
      if (!result?.ok) {
        return json({ error: String(result?.error ?? 'Verification failed'), attempts_left: result?.attempts_left }, 400);
      }

      // Contact change: apply the verified number now.
      if (purpose === 'contact_change') {
        const { data: pending } = await adminClient
          .from('otp_challenges')
          .select('destination')
          .eq('user_id', userId)
          .eq('purpose', 'contact_change')
          .maybeSingle();
        if (pending?.destination) {
          await adminClient.from('profiles').update({ phone: pending.destination }).eq('id', userId);
        }
        return json({ ok: true, purpose, phone: pending?.destination ?? null });
      }

      // Password recovery: hand back a one-time recovery token so the client
      // can open a session and set a new password, without ever seeing a
      // password or the OTP again.
      if (purpose === 'password_recovery') {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle();
        if (!profile?.email) return json({ error: 'No email is on file for this account' }, 400);

        const { data: link, error: linkErr } = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: profile.email,
        });
        if (linkErr) return json({ error: 'Could not start password reset' }, 500);
        return json({
          ok: true,
          purpose,
          email: profile.email,
          recovery_token: link.properties?.hashed_token ?? null,
        });
      }

      // Login: the OTP has passed, so issue the real session now.
      if (purpose === 'login') {
        const session = await checkPassword(loginEmail, loginPassword);
        if (!session) {
          return json({ error: 'Could not start your session. Please try again.' }, 500);
        }
        return json({
          ok: true,
          purpose,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      // Registration verification: activate the account now that the code has
      // been confirmed. Self-registered accounts start as pending, so this is
      // the step that lets them sign in.
      if (purpose === 'verification') {
        await adminClient.rpc('mark_account_verified', { p_user_id: userId });
      }
      return json({ ok: true, purpose, user_id: userId });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
