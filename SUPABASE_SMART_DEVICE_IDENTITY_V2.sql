-- Smart Device Identity v2
-- Run once in Supabase SQL Editor AFTER deploying this code.
-- Safe to run more than once. It does not delete users, nicknames or messages.

begin;

alter table if exists public.support_user_devices
  add column if not exists hardware_profile_hash text,
  add column if not exists rendering_profile_hash text,
  add column if not exists os_family_hash text,
  add column if not exists browser_family_hash text,
  add column if not exists locale_profile_hash text;

create index if not exists idx_support_user_devices_hardware_profile
  on public.support_user_devices(hardware_profile_hash)
  where revoked_at is null and hardware_profile_hash is not null;

create index if not exists idx_support_user_devices_rendering_profile
  on public.support_user_devices(rendering_profile_hash)
  where revoked_at is null and rendering_profile_hash is not null;

create index if not exists idx_support_user_devices_os_family
  on public.support_user_devices(os_family_hash)
  where revoked_at is null and os_family_hash is not null;

create index if not exists idx_support_user_devices_browser_family
  on public.support_user_devices(browser_family_hash)
  where revoked_at is null and browser_family_hash is not null;

create index if not exists idx_support_user_devices_locale_profile
  on public.support_user_devices(locale_profile_hash)
  where revoked_at is null and locale_profile_hash is not null;

comment on column public.support_user_devices.hardware_profile_hash is
  'Smart Identity v2 HMAC of stable hardware/browser-exposed characteristics.';
comment on column public.support_user_devices.rendering_profile_hash is
  'Smart Identity v2 HMAC of WebGL/canvas/fonts/audio rendering characteristics.';
comment on column public.support_user_devices.os_family_hash is
  'Smart Identity v2 HMAC of OS family, architecture and device class.';
comment on column public.support_user_devices.browser_family_hash is
  'Smart Identity v2 HMAC of normalized browser family without volatile version numbers.';
comment on column public.support_user_devices.locale_profile_hash is
  'Smart Identity v2 HMAC of locale, timezone and keyboard-layout characteristics.';

commit;
