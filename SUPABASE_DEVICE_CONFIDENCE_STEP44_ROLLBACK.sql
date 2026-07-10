-- Step 4.4 rollback note
-- This rollback removes only extra Step 4.4 indexes/columns. It is usually NOT needed.
-- Run only if you deliberately want to return to the Step 4.3 device confidence schema.

drop index if exists public.idx_support_user_devices_client_hints_hash;
drop index if exists public.idx_support_user_devices_media_hash;
drop index if exists public.idx_support_user_devices_viewport_hash;
drop index if exists public.idx_support_user_devices_storage_hash;
drop index if exists public.idx_support_user_devices_audio_hash;

alter table public.support_user_devices drop column if exists client_hints_hash;
alter table public.support_user_devices drop column if exists media_hash;
alter table public.support_user_devices drop column if exists viewport_hash;
alter table public.support_user_devices drop column if exists storage_hash;
alter table public.support_user_devices drop column if exists audio_hash;
