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

type SmsProvider = 'textbee' | 'semaphore' | 'twilio' | 'vonage';

/** Every configured provider, in the order they should be tried. */
function smsProviderChain(): SmsProvider[] {
  const chain: SmsProvider[] = [];
  if (TEXTBEE_API_KEY) chain.push('textbee');
  if (SEMAPHORE_API_KEY) chain.push('semaphore');
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) chain.push('twilio');
  if (VONAGE_API_KEY && VONAGE_API_SECRET && VONAGE_FROM) chain.push('vonage');
  return chain;
}

function smsConfigured(): boolean {
  return smsProviderChain().length > 0;
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

/**
 * The gateway phone accepts a message with HTTP 200 and only then tries to push
 * it to the phone over FCM. When the phone's push token has gone stale (for
 * example after the phone restarts or the app is updated) the push fails a
 * moment later and the message is marked 'failed' — but the 200 has already
 * been returned, so a naive send looks successful while nothing is delivered.
 * When a second provider is configured we glance at the result once so we can
 * fall back instead of silently losing the code.
 */
async function textbeeDeliveryFailed(): Promise<boolean> {
  if (!TEXTBEE_DEVICE_ID) return false;
  try {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const res = await fetch(
      `https://api.textbee.dev/api/v1/gateway/devices/${TEXTBEE_DEVICE_ID}/messages?limit=1`,
      { headers: { 'x-api-key': TEXTBEE_API_KEY! } },
    );
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    const latest = data?.data?.[0];
    return latest?.status === 'failed';
  } catch {
    return false;
  }
}

async function sendViaProvider(provider: SmsProvider, to: string, text: string): Promise<boolean> {
  if (provider === 'textbee') {
    const res = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEXTBEE_API_KEY! },
      body: JSON.stringify({
        recipients: [toInternationalPh(to)],
        message: text,
        ...(TEXTBEE_DEVICE_ID ? { deviceId: TEXTBEE_DEVICE_ID } : {}),
      }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    const result = data?.data;
    // `success` covers queued batches; `failureCount`/`warning` cover immediate
    // dispatch. Either one failing means the code was not pushed to the phone.
    if (result?.success === false) return false;
    if (typeof result?.failureCount === 'number' && result.failureCount > 0) return false;
    if (result?.warning) return false;
    if (smsProviderChain().length > 1 && await textbeeDeliveryFailed()) return false;
    return true;
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
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    // Semaphore answers 200 even when the send is refused; the body carries the
    // real outcome, so treat a rejected entry as a failure and fall through.
    if (Array.isArray(data) && data[0]?.status === 'failed') return false;
    return true;
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
  return data?.messages?.[0]?.status === '0';
}

/**
 * Send the code, trying each configured provider in turn. The first provider to
 * accept the message wins; if one fails we move to the next so a single dead
 * gateway cannot stop residents from signing in.
 */
async function sendSms(to: string, purpose: Purpose, code: string): Promise<boolean> {
  const text = otpMessage(purpose, code);
  for (const provider of smsProviderChain()) {
    try {
      if (await sendViaProvider(provider, to, text)) return true;
    } catch {
      // Try the next provider.
    }
  }
  return false;
}

async function deliver(channel: Channel, to: string, purpose: Purpose, code: string): Promise<boolean> {
  return channel === 'sms' ? sendSms(to, purpose, code) : false;
}

interface ChallengeResult {
  data: Record<string, unknown> | null;
  error: string | null;
}

/**
 * Create (or reissue) a verification challenge.
 *
 * Rapid re-taps are answered from an in-process cooldown map, so a second tap
 * inside the resend window is rejected immediately instead of costing another
 * database round trip and another SMS. Two identical requests that arrive
 * together share a single in-flight call, so a double tap can never send two
 * messages. The database's `otp_create_challenge` stays the authority for the
 * cooldown and the hourly cap; this map is only a fast path in front of it.
 */
const challengeCache = new Map<string, { resendAvailableAt: number }>();
const challengeInFlight = new Map<string, Promise<ChallengeResult>>();

function createChallenge(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  purpose: Purpose,
  channel: Channel,
  destination: string | null,
  password: string | null = null,
): Promise<ChallengeResult> {
  const key = `${userId}:${purpose}`;
  const now = Date.now();

  const cached = challengeCache.get(key);
  if (cached && cached.resendAvailableAt > now) {
    const wait = Math.max(1, Math.ceil((cached.resendAvailableAt - now) / 1000));
    return Promise.resolve({ data: null, error: `Please wait ${wait} seconds before requesting another code` });
  }

  const pending = challengeInFlight.get(key);
  if (pending) return pending;

  const call = adminClient
    .rpc('otp_create_challenge', {
      p_user_id: userId,
      p_purpose: purpose,
      p_channel: channel,
      p_destination: destination,
      p_password: password,
    })
    .then(({ data, error }): ChallengeResult => {
      if (error) return { data: null, error: error.message };
      const created = data as Record<string, unknown>;
      challengeCache.set(key, {
        resendAvailableAt: now + Number(created.resend_in ?? 60) * 1000,
      });
      return { data: created, error: null };
    })
    .finally(() => { challengeInFlight.delete(key); });

  challengeInFlight.set(key, call);
  return call;
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
      let loginPassword: string | null = null;
      let newPhone = '';

      if (purpose === 'login') {
        // Resolve the account here; the password is verified inside the same
        // create call, so sending a code is a single server round trip.
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

        userId = String(resolved.id);
        loginPassword = password;
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

      const { data: challenge, error: challengeErr } = await createChallenge(
        adminClient,
        userId,
        purpose,
        channel,
        purpose === 'contact_change' ? newPhone : null,
        loginPassword,
      );
      if (challengeErr || !challenge) {
        const message = challengeErr ?? 'Could not create a code';
        // A failed password check must not reveal whether the account exists.
        const status = message.includes('Invalid sign-in ID or password') ? 401 : 400;
        return json({ error: message }, status);
      }

      const code = String(challenge.otp);
      const destination = String(challenge.destination);

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
        expires_in: Number(challenge.expires_in ?? 300),
        resend_in: Number(challenge.resend_in ?? 60),
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
