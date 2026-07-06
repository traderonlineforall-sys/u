-- Step 4 Rollback: remove only the new nickname-control columns.
-- It intentionally keeps support_users.display_name and suggestions.name data.
-- Run only if Step 4 caused a problem and you need to return to legacy behavior.

begin;

alter table if exists public.support_users
  drop column if exists nickname_reset_required;

alter table if exists public.support_users
  drop column if exists nickname_locked;

-- Keep `name` columns by default to avoid losing display labels already written.
-- If you truly need to remove them later, run these manually after backup:
-- alter table if exists public.suggestions drop column if exists name;
-- alter table if exists public.suggestion_replies drop column if exists name;

commit;
