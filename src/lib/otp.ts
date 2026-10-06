import { supabase } from '@/lib/supabase';

export type OtpChannel = 'email' | 'sms';
export type OtpPurpose = 'login' | 'verification' | 'password_recovery' | 'contact_change';

export interface OtpChannelOption {
  channel: OtpChannel;
  destination_masked: string;
}

export interface OtpSendResult {
  ok: true;
  channel: OtpChannel;
  destination_masked: string;
  delivered: boolean;
  provider_configured: boolean;
  expires_in: number;
  resend_in: number;
}

export interface OtpVerifyResult {
  ok: true;
  purpose: OtpPurpose;
  access_token?: string;
  refresh_token?: string;
  user_id?: string;
  email?: string;
  recovery_token?: string | null;
  phone?: string | null;
}

export class OtpError extends Error {
  attemptsLeft?: number;
  constructor(message: string, attemptsLeft?: number) {
    super(message);
    this.name = 'OtpError';
    this.attemptsLeft = attemptsLeft;
  }
}

export const CHANNEL_LABELS: Record<OtpChannel, string> = {
  email: 'Email',
  sms: 'SMS',
};

/** The verification methods an account may use. SMS only, for every role. */
export function allowedChannelsForRole(): OtpChannel[] {
  return ['sms'];
}

/**
 * Plain-language outcome for a code send. Keeps "no provider is set up" apart
 * from "a provider is set up but the send failed" — a rejected or expired key
 * must not read to the user as if delivery was never configured.
 */
export function otpDeliveryMessage(
  channel: OtpChannel,
  delivered: boolean,
  providerConfigured: boolean,
): string {
  const label = channel === 'email' ? 'email' : 'SMS';
  if (delivered) return `A new code was sent by ${label}.`;
  if (!providerConfigured) return `No ${label} provider is configured, so delivery is unavailable.`;
  return `We couldn't send the ${label} code right now. Please try again in a moment.`;
}

// Coalesce identical requests that are already in flight, so a double tap or an
// impatient second press cannot fire two codes or two session exchanges.
const inFlight = new Map<string, Promise<unknown>>();

function call<T>(body: Record<string, unknown>): Promise<T> {
  const key = JSON.stringify(body);
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = request<T>(body).finally(() => { inFlight.delete(key); });
  inFlight.set(key, promise);
  return promise;
}

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/otp`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Attach the signed-in session when there is one: verification and contact
  // changes act on the caller's own account. Login has no session yet, so it
  // falls back to the anon key.
  let token = anonKey;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) token = data.session.access_token;
  } catch {
    // No session available; proceed as an anonymous caller.
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
  };

  let res: Response;
  try {
    res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new OtpError('Could not reach the server. Check your connection and try again.');
  }

  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON body; fall through to the status-based error below.
  }

  if (!res.ok) {
    throw new OtpError(
      typeof data.error === 'string' ? data.error : 'Request failed. Please try again.',
      typeof data.attempts_left === 'number' ? data.attempts_left : undefined,
    );
  }
  return data as T;
}

export function sendOtp(input: {
  purpose: OtpPurpose;
  channel: OtpChannel;
  identifier?: string;
  password?: string;
  newPhone?: string;
}): Promise<OtpSendResult> {
  return call<OtpSendResult>({ action: 'send', ...input });
}

export function verifyOtp(input: {
  purpose: OtpPurpose;
  otp: string;
  identifier?: string;
  password?: string;
}): Promise<OtpVerifyResult> {
  return call<OtpVerifyResult>({ action: 'verify', ...input });
}
