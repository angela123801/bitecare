/*
# Enable realtime updates for bite reports

1. Purpose
   - The map's incident heatmap must refresh on its own when a bite report is
     added, changed or removed, without the user reloading the page.
   - Supabase streams row changes only for tables added to the realtime
     publication, so `bite_reports` is added here.

2. Changes
   - Adds `bite_reports` to the `supabase_realtime` publication.

3. Security
   - Realtime respects the existing Row Level Security policies on
     `bite_reports`. A subscriber only receives change events for rows that
     their role is already allowed to SELECT (own reports for residents; the
     wider set for health workers, admins and super admins). No new access is
     granted by this change.

4. Notes
   - No columns, tables or policies are modified. Only change notifications are
     turned on.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bite_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bite_reports;
  END IF;
END $$;
