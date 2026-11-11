/*
# Super Admin: view-only, part 2 - submissions and attachments

## 1. Purpose

Closes the two remaining write paths a Super Admin session still had in the
bite report module after migration 041:

1. Creating a new bite report (`insert_bite_reports`).
2. Uploading a new incident photo or attachment (`bite_photo_insert` in
   storage, which was `USING (true)` for every signed-in user).

Read access is untouched, so a Super Admin still opens and reviews every
report, victim detail, incident detail, photo, attachment, status history,
assigned Health Worker and vaccination record.

## 2. Policies changed on `public.bite_reports`

- `insert_bite_reports` (INSERT) - a report can only be filed by the person
  recorded as its reporter, and only by a resident. Previously any signed-in
  user could insert a row claiming any `reporter_id`, which also let a Super
  Admin add a report. The Super Admin is now excluded along with every other
  non-resident role.
- `select_bite_reports` (SELECT) - unchanged.
- `update_own_bite_reports` (UPDATE) - unchanged from migration 041.

## 3. Policies changed on storage `objects`

- `bite_photo_insert` (INSERT) - restricted to residents and Health Workers,
  and only into their own folder. Previously it allowed every signed-in user to
  upload anywhere in the `bite-photos` bucket.
- `bite_photo_select` (SELECT) - unchanged, so photos and attachments stay
  viewable by the Super Admin.
- `bite_photo_delete` (DELETE) - unchanged from migration 041.

## 4. Important notes

1. Nothing is created, altered or deleted; only write permissions change.
2. `admin`, `health_worker` and `user` keep their existing permissions.
   An Admin never filed reports through the app, so excluding `admin` from
   report creation changes nothing they could previously reach through the
   interface; an Admin retains every case-management action.
3. A resident may still file a report and upload its photos exactly as before.
4. Read access for every role is unchanged.
*/

-- ---------------------------------------------------------------------------
-- bite_reports: a report may only be filed by its own reporter, by a resident
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "insert_bite_reports" ON public.bite_reports;
CREATE POLICY "insert_bite_reports"
  ON public.bite_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND public.get_my_role() = 'user'
  );

-- ---------------------------------------------------------------------------
-- storage: only a resident or Health Worker may add a bite photo, in own folder
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bite_photo_insert" ON storage.objects;
CREATE POLICY "bite_photo_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bite-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND public.get_my_role() IN ('user', 'health_worker')
  );
