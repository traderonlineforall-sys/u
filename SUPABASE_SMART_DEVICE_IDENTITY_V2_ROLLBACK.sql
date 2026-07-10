-- Optional rollback for Smart Device Identity v2 schema additions only.
-- This does not remove the existing trusted-device or nickname tables.

begin;

drop index if exists public.idx_support_user_devices_hardware_profile;
drop index if exists public.idx_support_user_devices_rendering_profile;
drop index if exists public.idx_support_user_devices_os_family;
drop index if exists public.idx_support_user_devices_browser_family;
drop index if exists public.idx_support_user_devices_locale_profile;

alter table if exists public.support_user_devices
  drop column if exists hardware_profile_hash,
  drop column if exists rendering_profile_hash,
  drop column if exists os_family_hash,
  drop column if exists browser_family_hash,
  drop column if exists locale_profile_hash;

commit;
