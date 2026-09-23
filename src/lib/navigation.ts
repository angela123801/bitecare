import type { UserRole } from '@/types';

/** The four roles offered on the sign-in screen, highest authority first. */
export const LOGIN_ROLES: UserRole[] = ['super_admin', 'admin', 'health_worker', 'user'];

export const ROLE_MISMATCH_MESSAGE =
  'The selected role does not match this account. Please select the correct role and try again.';
