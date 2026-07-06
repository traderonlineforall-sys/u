-- Step 4.3: Device Confidence Nickname Lock
-- Purpose: recover the same nickname after cookies/site-data are cleared by using
-- a multi-signal confidence fingerprint. This stores only hashed identifiers and
-- sanitized admin summaries; it does not store MAC addresses or local device IPs.

create table if not exists public.support_user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  display_name text,
  device_hash text not null unique,
  ip_hash text,
  ua_hash text,
  lang_hash text,
  platform_hash text,
  screen_hash text,
  timezone_hash text,
  graphics_hash text,
  canvas_hash text,
  fonts_hash text,
  signal_summary jsonb not null default '{}'::jsonb,
  confidence_score integer not null default 100,
  match_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.support_user_devices enable row level security;

-- No anon access is granted here. The app reads/writes this table from server-side
-- APIs using the service role key. This keeps fingerprint hashes out of public reads.
drop policy if exists "support_user_devices_no_anon_select" on public.support_user_devices;
drop policy if exists "support_user_devices_no_anon_insert" on public.support_user_devices;
drop policy if exists "support_user_devices_no_anon_update" on public.support_user_devices;
drop policy if exists "support_user_devices_no_anon_delete" on public.support_user_devices;

create index if not exists idx_support_user_devices_user_id on public.support_user_devices(user_id);
create index if not exists idx_support_user_devices_device_hash on public.support_user_devices(device_hash);
create index if not exists idx_support_user_devices_active_last_seen on public.support_user_devices(last_seen_at desc) where revoked_at is null;
create index if not exists idx_support_user_devices_ua_hash on public.support_user_devices(ua_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_ip_hash on public.support_user_devices(ip_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_platform_hash on public.support_user_devices(platform_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_screen_hash on public.support_user_devices(screen_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_timezone_hash on public.support_user_devices(timezone_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_graphics_hash on public.support_user_devices(graphics_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_canvas_hash on public.support_user_devices(canvas_hash) where revoked_at is null;
create index if not exists idx_support_user_devices_fonts_hash on public.support_user_devices(fonts_hash) where revoked_at is null;

-- Helpful comment for future maintenance.
comment on table public.support_user_devices is 'Step 4.3 server-only table for nickname recovery using hashed multi-signal device confidence fingerprints.';
