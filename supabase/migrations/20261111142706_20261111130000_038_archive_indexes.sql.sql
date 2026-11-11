/*
# Indexes for archive filtering

1. Purpose
- The active-list queries now filter on `is_archived` in bite_reports and
  notifications, and the unread badge counts on (user_id, is_read,
  is_archived). Partial indexes keep those lookups cheap as data grows.

2. Security changes
- None. Indexes only; RLS, grants and policies are untouched.
*/

CREATE INDEX IF NOT EXISTS bite_reports_is_archived_idx
  ON public.bite_reports (is_archived)
  WHERE is_archived;

CREATE INDEX IF NOT EXISTS notifications_user_archive_idx
  ON public.notifications (user_id, is_archived, is_read);
