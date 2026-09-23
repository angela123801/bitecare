/*
# Align staff ID format with specification

The original prefixes (SA/AD/HW) are replaced with the required format:
  - Super Admin  -> BC-SADM-XXXXXX
  - Admin        -> BC-ADM-XXXXXX
  - Health Worker-> BC-HW-XXXXXX

Existing staff accounts are re-issued IDs in the new format. Resident accounts
are unaffected (their login ID is their phone number).
*/

-- Rebuild the sequence table with the new prefixes
UPDATE public.staff_id_sequences SET prefix = 'BC-SADM' WHERE prefix = 'SA';
UPDATE public.staff_id_sequences SET prefix = 'BC-ADM'  WHERE prefix = 'AD';
UPDATE public.staff_id_sequences SET prefix = 'BC-HW'   WHERE prefix = 'HW';

INSERT INTO public.staff_id_sequences (prefix, next_id)
VALUES ('BC-SADM', 1), ('BC-ADM', 1), ('BC-HW', 1)
ON CONFLICT (prefix) DO NOTHING;

-- Regenerate the ID generator to use the new prefixes
CREATE OR REPLACE FUNCTION public.generate_staff_id(p_role text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_num    integer;
BEGIN
  IF p_role = 'super_admin' THEN v_prefix := 'BC-SADM';
  ELSIF p_role = 'admin' THEN v_prefix := 'BC-ADM';
  ELSIF p_role = 'health_worker' THEN v_prefix := 'BC-HW';
  ELSE RAISE EXCEPTION 'Role % cannot receive a staff ID', p_role;
  END IF;

  UPDATE public.staff_id_sequences
     SET next_id = next_id + 1
   WHERE prefix = v_prefix
   RETURNING next_id - 1 INTO v_num;

  IF NOT FOUND THEN
    INSERT INTO public.staff_id_sequences (prefix, next_id) VALUES (v_prefix, 2)
    RETURNING 1 INTO v_num;
  END IF;

  RETURN v_prefix || '-' || lpad(v_num::text, 6, '0');
END;
$$;

-- Re-issue IDs for all existing staff accounts in the new format.
-- The sequence is advanced to stay ahead of any manually assigned numbers.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, role FROM public.profiles
           WHERE role IN ('super_admin', 'admin', 'health_worker')
           ORDER BY created_at
  LOOP
    UPDATE public.profiles SET staff_id = public.generate_staff_id(r.role) WHERE id = r.id;
  END LOOP;
END;
$$;
