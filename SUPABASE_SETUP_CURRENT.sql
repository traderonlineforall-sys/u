-- Clean combined Supabase setup/migration SQL.
-- Built from the current non-rollback SQL files in the original archive.
-- Review on staging/backup before running in Supabase SQL Editor.


-- ============================================================
-- Source: SUPABASE_RLS_STARTER_STEP2.sql
-- ============================================================

-- Supabase RLS starter for Step 2
-- IMPORTANT:
-- Run this on a staging/project backup first.
-- This is a starter because your exact table columns may differ.
-- If any statement fails because a table/column does not exist, stop and adjust it.

-- 1) Enable RLS on known public tables.
alter table if exists public.announcements enable row level security;
alter table if exists public.suggestions enable row level security;
alter table if exists public.suggestion_replies enable row level security;
alter table if exists public.support_messages enable row level security;
alter table if exists public.support_users enable row level security;
alter table if exists public.blocks enable row level security;
alter table if exists public.suggestion_reactions enable row level security;
alter table if exists public.suggestion_item_reactions enable row level security;

-- 2) Public read policies for the legacy browser UI.
-- Keep reads open only if this whole site is already protected behind login/Cloudflare Access.
drop policy if exists "sr read announcements" on public.announcements;
create policy "sr read announcements" on public.announcements for select to anon using (true);

drop policy if exists "sr read suggestions" on public.suggestions;
create policy "sr read suggestions" on public.suggestions for select to anon using (true);

drop policy if exists "sr read suggestion_replies" on public.suggestion_replies;
create policy "sr read suggestion_replies" on public.suggestion_replies for select to anon using (true);

drop policy if exists "sr read support_users" on public.support_users;
create policy "sr read support_users" on public.support_users for select to anon using (true);

drop policy if exists "sr read blocks" on public.blocks;
create policy "sr read blocks" on public.blocks for select to anon using (true);

drop policy if exists "sr read suggestion_reactions" on public.suggestion_reactions;
create policy "sr read suggestion_reactions" on public.suggestion_reactions for select to anon using (true);

drop policy if exists "sr read suggestion_item_reactions" on public.suggestion_item_reactions;
create policy "sr read suggestion_item_reactions" on public.suggestion_item_reactions for select to anon using (true);

-- 3) Temporary legacy write policies.
-- WARNING: These keep the current frontend working, but they do NOT prove real user identity.
-- They are better than no RLS, but Step 3 should move writes to server APIs.

drop policy if exists "sr insert suggestions legacy" on public.suggestions;
create policy "sr insert suggestions legacy" on public.suggestions
for insert to anon with check (true);

drop policy if exists "sr insert suggestion_replies legacy" on public.suggestion_replies;
create policy "sr insert suggestion_replies legacy" on public.suggestion_replies
for insert to anon with check (true);

drop policy if exists "sr upsert support_users legacy" on public.support_users;
create policy "sr upsert support_users legacy" on public.support_users
for insert to anon with check (true);

drop policy if exists "sr update support_users legacy" on public.support_users;
create policy "sr update support_users legacy" on public.support_users
for update to anon using (true) with check (true);

drop policy if exists "sr insert support_messages legacy" on public.support_messages;
create policy "sr insert support_messages legacy" on public.support_messages
for insert to anon with check (true);

drop policy if exists "sr insert suggestion_reactions legacy" on public.suggestion_reactions;
create policy "sr insert suggestion_reactions legacy" on public.suggestion_reactions
for insert to anon with check (true);

drop policy if exists "sr delete suggestion_reactions legacy" on public.suggestion_reactions;
create policy "sr delete suggestion_reactions legacy" on public.suggestion_reactions
for delete to anon using (true);

drop policy if exists "sr insert suggestion_item_reactions legacy" on public.suggestion_item_reactions;
create policy "sr insert suggestion_item_reactions legacy" on public.suggestion_item_reactions
for insert to anon with check (true);

drop policy if exists "sr delete suggestion_item_reactions legacy" on public.suggestion_item_reactions;
create policy "sr delete suggestion_item_reactions legacy" on public.suggestion_item_reactions
for delete to anon using (true);

-- 4) Storage bucket starter policy for support uploads.
-- Adjust bucket name if needed.
-- You may need to enable RLS on storage.objects from Supabase Storage policies UI instead.

drop policy if exists "sr read support uploads" on storage.objects;
create policy "sr read support uploads" on storage.objects
for select to anon using (bucket_id = 'support-uploads');

drop policy if exists "sr upload support uploads legacy" on storage.objects;
create policy "sr upload support uploads legacy" on storage.objects
for insert to anon with check (bucket_id = 'support-uploads');

-- ============================================================
-- Source: SUPABASE_RLS_STEP2_LOCK_WRITES.sql
-- ============================================================

-- Step 2: lock browser writes after the Step 2 code deploy succeeds.
-- IMPORTANT ORDER:
-- 1) Deploy the GitHub/Cloudflare Step 2 code first.
-- 2) Test that the site opens.
-- 3) Run this SQL in Supabase SQL Editor.
-- 4) Test suggestions, replies, support chat, reactions, and admin actions.
--
-- What this does:
-- - Enables RLS on known tables.
-- - Keeps browser reads working for the existing UI/realtime.
-- - Removes legacy anon insert/update/delete policies for database tables.
-- - Server API routes keep writes working through the service-role key.
--
-- This is not the final perfect security model because the legacy UI still has
-- a local browser user_id. Step 3 should bind user_id to a server-signed identity.

-- Announcements: browser can read only; admin writes via server.
do $$
begin
  if to_regclass('public.announcements') is not null then
    execute 'alter table public.announcements enable row level security';
    execute 'drop policy if exists "Allow public read announcements for realtime" on public.announcements';
    execute 'drop policy if exists "sr read announcements" on public.announcements';
    execute 'create policy "sr read announcements" on public.announcements for select to anon, authenticated using (true)';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements'
    ) then
      execute 'alter publication supabase_realtime add table public.announcements';
    end if;
  end if;
end $$;

-- Suggestions: reads stay public; inserts now go through /api/public-suggestion.
do $$
begin
  if to_regclass('public.suggestions') is not null then
    execute 'alter table public.suggestions enable row level security';
    execute 'drop policy if exists "sr read suggestions" on public.suggestions';
    execute 'create policy "sr read suggestions" on public.suggestions for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr insert suggestions legacy" on public.suggestions';
    execute 'drop policy if exists "sr update suggestions legacy" on public.suggestions';
    execute 'drop policy if exists "sr delete suggestions legacy" on public.suggestions';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestions'
    ) then
      execute 'alter publication supabase_realtime add table public.suggestions';
    end if;
  end if;
end $$;

-- Suggestion replies: reads stay public; inserts now go through /api/public-suggestion-reply.
do $$
begin
  if to_regclass('public.suggestion_replies') is not null then
    execute 'alter table public.suggestion_replies enable row level security';
    execute 'drop policy if exists "sr read suggestion_replies" on public.suggestion_replies';
    execute 'create policy "sr read suggestion_replies" on public.suggestion_replies for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr insert suggestion_replies legacy" on public.suggestion_replies';
    execute 'drop policy if exists "sr update suggestion_replies legacy" on public.suggestion_replies';
    execute 'drop policy if exists "sr delete suggestion_replies legacy" on public.suggestion_replies';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestion_replies'
    ) then
      execute 'alter publication supabase_realtime add table public.suggestion_replies';
    end if;
  end if;
end $$;

-- Support users: browser reads names; writes now go through /api/support-profile.
do $$
begin
  if to_regclass('public.support_users') is not null then
    execute 'alter table public.support_users enable row level security';
    execute 'drop policy if exists "sr read support_users" on public.support_users';
    execute 'create policy "sr read support_users" on public.support_users for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr upsert support_users legacy" on public.support_users';
    execute 'drop policy if exists "sr update support_users legacy" on public.support_users';
    execute 'drop policy if exists "sr insert support_users legacy" on public.support_users';
    execute 'drop policy if exists "sr delete support_users legacy" on public.support_users';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_users'
    ) then
      execute 'alter publication supabase_realtime add table public.support_users';
    end if;
  end if;
end $$;

-- Support messages: browser reads/realtime stay public for current UI; inserts now go through /api/support-message.
do $$
begin
  if to_regclass('public.support_messages') is not null then
    execute 'alter table public.support_messages enable row level security';
    execute 'drop policy if exists "sr read support_messages" on public.support_messages';
    execute 'create policy "sr read support_messages" on public.support_messages for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr insert support_messages legacy" on public.support_messages';
    execute 'drop policy if exists "sr update support_messages legacy" on public.support_messages';
    execute 'drop policy if exists "sr delete support_messages legacy" on public.support_messages';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.support_messages';
    end if;
  end if;
end $$;

-- Blocks: browser needs to read its block state; admin writes via server.
do $$
begin
  if to_regclass('public.blocks') is not null then
    execute 'alter table public.blocks enable row level security';
    execute 'drop policy if exists "sr read blocks" on public.blocks';
    execute 'create policy "sr read blocks" on public.blocks for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr insert blocks legacy" on public.blocks';
    execute 'drop policy if exists "sr update blocks legacy" on public.blocks';
    execute 'drop policy if exists "sr delete blocks legacy" on public.blocks';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'blocks'
    ) then
      execute 'alter publication supabase_realtime add table public.blocks';
    end if;
  end if;
end $$;

-- Suggestion reactions: reads stay public; writes already go through /api/suggestion-reactions.
do $$
begin
  if to_regclass('public.suggestion_reactions') is not null then
    execute 'alter table public.suggestion_reactions enable row level security';
    execute 'drop policy if exists "sr read suggestion_reactions" on public.suggestion_reactions';
    execute 'create policy "sr read suggestion_reactions" on public.suggestion_reactions for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr insert suggestion_reactions legacy" on public.suggestion_reactions';
    execute 'drop policy if exists "sr update suggestion_reactions legacy" on public.suggestion_reactions';
    execute 'drop policy if exists "sr delete suggestion_reactions legacy" on public.suggestion_reactions';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestion_reactions'
    ) then
      execute 'alter publication supabase_realtime add table public.suggestion_reactions';
    end if;
  end if;
end $$;

-- Suggestion item reactions: reads stay public; writes already go through /api/suggestion-item-reactions.
do $$
begin
  if to_regclass('public.suggestion_item_reactions') is not null then
    execute 'alter table public.suggestion_item_reactions enable row level security';
    execute 'drop policy if exists "sr read suggestion_item_reactions" on public.suggestion_item_reactions';
    execute 'create policy "sr read suggestion_item_reactions" on public.suggestion_item_reactions for select to anon, authenticated using (true)';
    execute 'drop policy if exists "sr insert suggestion_item_reactions legacy" on public.suggestion_item_reactions';
    execute 'drop policy if exists "sr update suggestion_item_reactions legacy" on public.suggestion_item_reactions';
    execute 'drop policy if exists "sr delete suggestion_item_reactions legacy" on public.suggestion_item_reactions';
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestion_item_reactions'
    ) then
      execute 'alter publication supabase_realtime add table public.suggestion_item_reactions';
    end if;
  end if;
end $$;

-- Storage attachments: the current browser uploader still needs insert access.
-- Keep this until a later signed-upload step.
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "sr read support uploads" on storage.objects';
    execute 'create policy "sr read support uploads" on storage.objects for select to anon, authenticated using (bucket_id = ''support-uploads'')';
    execute 'drop policy if exists "sr upload support uploads legacy" on storage.objects';
    execute 'create policy "sr upload support uploads legacy" on storage.objects for insert to anon, authenticated with check (bucket_id = ''support-uploads'')';
  end if;
end $$;

-- ============================================================
-- Source: SUPABASE_REALTIME_ANNOUNCEMENTS.sql
-- ============================================================

-- Enable instant admin announcements through Supabase Realtime.
-- Run this once in Supabase SQL Editor.
-- It does NOT allow users to create/update/delete announcements.
-- It only allows users to read public admin announcements so Realtime can deliver them.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;

alter table public.announcements enable row level security;

drop policy if exists "Allow public read announcements for realtime" on public.announcements;

create policy "Allow public read announcements for realtime"
on public.announcements
for select
to anon, authenticated
using (true);

-- ============================================================
-- Source: SUPABASE_NICKNAME_IDENTITY_STEP4.sql
-- ============================================================

-- Step 4: Central Nickname Identity
-- Run this AFTER the Step 4 code deploy succeeds.
-- Safe design: adds columns only; does not delete user data.

begin;

create table if not exists public.support_users (
  user_id text primary key,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_users
  add column if not exists display_name text not null default '';

alter table public.support_users
  add column if not exists created_at timestamptz not null default now();

alter table public.support_users
  add column if not exists updated_at timestamptz not null default now();

alter table public.support_users
  add column if not exists nickname_reset_required boolean not null default false;

alter table public.support_users
  add column if not exists nickname_locked boolean not null default true;

create unique index if not exists support_users_user_id_uidx
  on public.support_users(user_id);

-- Store the nickname used at the time of writing so old rows remain readable even
-- if an admin resets the user's future nickname.
do $$
begin
  if to_regclass('public.suggestions') is not null then
    alter table public.suggestions add column if not exists name text;
  end if;

  if to_regclass('public.suggestion_replies') is not null then
    alter table public.suggestion_replies add column if not exists name text;
  end if;
end $$;

-- Normalize existing rows.
update public.support_users
set nickname_reset_required = false,
    nickname_locked = true,
    updated_at = coalesce(updated_at, now())
where btrim(coalesce(display_name, '')) <> '';

commit;

-- ============================================================
-- Source: SUPABASE_DEVICE_CONFIDENCE_STEP43.sql
-- ============================================================

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

-- ============================================================
-- Source: SUPABASE_DEVICE_CONFIDENCE_STEP44.sql
-- ============================================================

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

-- ============================================================
-- Source: SUPABASE_DEVICE_CONFIDENCE_STEP47.sql
-- ============================================================

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
