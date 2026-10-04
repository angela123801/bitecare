import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export type OtpChannel = 'email' | 'sms';
export type OtpPurpose = 'login' | 'verification' | 'password_recovery' | 'contact_change';

export interface OtpChannelOption {
  channel: OtpChannel;
  destination_masked: string;
}

export interface OtpChannelsResult {
  ok: true;
  role: UserRole;
  channels: OtpChannelOption[];
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

/** Only a resident is restricted to SMS; every staff role may use email or SMS. */
export function allowedChannelsForRole(role: UserRole | undefined): OtpChannel[] {
  return role === 'user' ? ['sms'] : ['email', 'sms'];
}

export const CHANNEL_LABELS: Record<OtpChannel, string> = {
  email: 'Email',
  sms: 'SMS',
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
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

/** Which verification methods this sign-in ID may use, with masked destinations.
 *  Omit the identifier to use the signed-in caller's own account. */
export function fetchOtpChannels(identifier?: string): Promise<OtpChannelsResult> {
  return call<OtpChannelsResult>({ action: 'channels', identifier: identifier ?? '' });
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
