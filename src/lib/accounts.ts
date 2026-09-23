import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'super_admin', label: 'Super Admin', description: 'Full system control and account management' },
  { value: 'admin', label: 'Admin', description: 'Manage users, reports, facilities and schedules' },
  { value: 'health_worker', label: 'Health Worker', description: 'Patient care, vaccinations and appointments' },
  { value: 'user', label: 'Resident', description: 'Report bites and view their own records' },
];

/** Roles the signed-in creator is allowed to assign. Mirrors server-side rules. */
export function rolesForCreator(role: UserRole | undefined): UserRole[] {
  if (role === 'super_admin') return ['super_admin', 'admin', 'health_worker', 'user'];
  if (role === 'admin') return ['health_worker', 'user'];
  if (role === 'health_worker') return ['user'];
  return [];
}

export interface CreateAccountResult {
  ok: true;
  user_id: string;
  email: string;
  role: UserRole;
  requires_verification: boolean;
  email_sent: boolean;
  dev_otp?: string;
}

export interface ResendResult {
  ok: true;
  email_sent: boolean;
  dev_otp?: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('account-admin', { body });

  if (error) {
    let message = error.message || 'Request failed';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.clone === 'function') {
      try {
        const parsed = await ctx.clone().json();
        if (parsed?.error) message = parsed.error as string;
      } catch {
        // Non-JSON error body; keep the default message.
      }
    }
    throw new Error(message);
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export function createAccount(input: {
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  requireVerification: boolean;
}): Promise<CreateAccountResult> {
  return invoke<CreateAccountResult>({ action: 'create', ...input });
}

export function resendAccountOtp(userId: string): Promise<ResendResult> {
  return invoke<ResendResult>({ action: 'resend', userId });
}

export function verifyAccountOtp(userId: string, otp: string): Promise<{ ok: boolean }> {
  return invoke<{ ok: boolean }>({ action: 'verify', userId, otp });
}
