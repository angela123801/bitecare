export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Reduce a Philippine mobile number to its canonical 09XXXXXXXXX form.
 * Accepts +63 9XX, 63 9XX, 09XX, 9XX (with or without spaces, dashes or
 * parentheses) so the same number is always recognised as one account.
 */
export function normalizePhMobile(input: string): string {
  const trimmed = (input ?? '').trim();
  const withoutPrefix = /^\+?63/.test(trimmed) ? '0' + trimmed.replace(/^\+?63/, '') : trimmed;
  const digits = withoutPrefix.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return '0' + digits;
  return digits;
}

/** True when the value is a valid Philippine mobile number (09XXXXXXXXX). */
export function isValidPhMobile(input: string): boolean {
  return /^09[0-9]{9}$/.test(normalizePhMobile(input));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

export function isRoleAtLeast(
  role: string,
  minimum: string,
): boolean {
  const hierarchy: Record<string, number> = {
    user: 0,
    health_worker: 1,
    admin: 2,
    super_admin: 3,
  };
  return (hierarchy[role] ?? -1) >= (hierarchy[minimum] ?? 999);
}
