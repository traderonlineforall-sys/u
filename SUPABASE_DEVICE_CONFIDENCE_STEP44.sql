-- Step 4.4: Enhanced Device Confidence columns
-- Adds extra hashed components used only by server-side nickname recovery.
-- Safe to run more than once.

alter table public.support_user_devices add column if not exists client_hints_hash text;
alter table public.support_user_devices add column if not exists media_hash text;
alter table public.support_user_devices add column if not exists viewport_hash text;
alter table public.support_user_devices add column if not exists storage_hash text;
alter table public.support_user_devices add column if not exists audio_hash text;

create index if not exists idx_support_user_devices_client_hints_hash on public.support_user_devices(client_hints_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_media_hash on public.support_user_devices(media_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_viewport_hash on public.support_user_devices(viewport_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_storage_hash on public.support_user_devices(storage_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_audio_hash on public.support_user_devices(audio_hash) where revoked_at is null;

comment on column public.support_user_devices.client_hints_hash is 'Step 4.4 hashed browser client hints component.';
comment on column public.support_user_devices.media_hash is 'Step 4.4 hashed CSS media features component.';
comment on column public.support_user_devices.viewport_hash is 'Step 4.4 hashed viewport component.';
comment on column public.support_user_devices.storage_hash is 'Step 4.4 hashed storage estimate component.';
comment on column public.support_user_devices.audio_hash is 'Step 4.4 hashed audio fingerprint component.';
