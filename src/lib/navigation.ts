import type { UserRole } from '@/types';

/** The four roles offered on the sign-in screen, highest authority first. */
export const LOGIN_ROLES: UserRole[] = ['super_admin', 'admin', 'health_worker', 'user'];

/**
 * Roles offered on phones. Super Admin and Admin are hidden on mobile only as a
 * navigation convenience — this is NOT a security boundary. Access is enforced
 * by the database and edge functions against the signed-in account's real role,
 * so hiding a card never grants or denies anything on its own.
 */
export const MOBILE_LOGIN_ROLES: UserRole[] = ['health_worker', 'user'];

export const ROLE_MISMATCH_MESSAGE =
  'The selected role does not match this account. Please select the correct role and try again.';
