-- Step 4.7: Extra Passive Device Signals bonus columns
-- Adds five low-weight passive signal hashes used as bonus confidence only.
-- Safe to run more than once.

alter table public.support_user_devices add column if not exists keyboard_hash text;
alter table public.support_user_devices add column if not exists capabilities_hash text;
alter table public.support_user_devices add column if not exists network_hash text;
alter table public.support_user_devices add column if not exists battery_hash text;
alter table public.support_user_devices add column if not exists media_devices_hash text;

create index if not exists idx_support_user_devices_keyboard_hash on public.support_user_devices(keyboard_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_capabilities_hash on public.support_user_devices(capabilities_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_network_hash on public.support_user_devices(network_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_battery_hash on public.support_user_devices(battery_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_media_devices_hash on public.support_user_devices(media_devices_hash) where revoked_at is null;

comment on column public.support_user_devices.keyboard_hash is 'Step 4.7 bonus hash from keyboard layout hints when available.';
comment on column public.support_user_devices.capabilities_hash is 'Step 4.7 bonus hash from passive browser capability flags.';
comment on column public.support_user_devices.network_hash is 'Step 4.7 bonus hash from browser network information when available.';
comment on column public.support_user_devices.battery_hash is 'Step 4.7 bonus hash from battery information when available.';
comment on column public.support_user_devices.media_devices_hash is 'Step 4.7 bonus hash from media device counts/kinds without labels.';
