-- Faster and more forgiving Philippine mobile normalisation.
--
-- The previous version only accepted a leading +63/63 or an already-normalised
-- number. A number typed without the leading zero (9XXXXXXXXX, 10 digits) was
-- rejected, which is a common way people write their mobile number. This version
-- also strips the +63/63 prefix in one pass instead of a positional substr.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_phone is null then null
    else (
      select case
        when length(d) = 10 and d like '9%' then '0' || d
        else d
      end
      from (
        select regexp_replace(
          case
            when p_phone ~ '^\s*\+?63' then '0' || regexp_replace(p_phone, '^\s*\+?63', '')
            else p_phone
          end,
          '[^0-9]', '', 'g'
        ) as d
      ) s
    )
  end;
$function$;

-- The unique phone index is built on this function, so rebuild it to match the
-- new normalisation and keep lookups correct.
reindex index public.idx_profiles_phone_unique;
