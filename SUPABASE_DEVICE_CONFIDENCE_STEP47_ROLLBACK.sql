-- Step 4.7 rollback: remove bonus columns and indexes only.
-- Use only if Step 4.7 creates problems. It does not remove the main Step 4.3/4.4 device confidence table.

drop index if exists public.idx_support_user_devices_keyboard_hash;
drop index if exists public.idx_support_user_devices_capabilities_hash;
drop index if exists public.idx_support_user_devices_network_hash;
drop index if exists public.idx_support_user_devices_battery_hash;
drop index if exists public.idx_support_user_devices_media_devices_hash;

alter table public.support_user_devices drop column if exists keyboard_hash;
alter table public.support_user_devices drop column if exists capabilities_hash;
alter table public.support_user_devices drop column if exists network_hash;
alter table public.support_user_devices drop column if exists battery_hash;
alter table public.support_user_devices drop column if exists media_devices_hash;
