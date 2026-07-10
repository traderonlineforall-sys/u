-- Trusted Device Identity upgrade
-- Run once in Supabase SQL Editor AFTER deploying the upgraded application.
-- It does not delete users, nicknames, messages, suggestions, or old device data.

begin;

create table if not exists public.support_device_identities (
  device_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.support_users(user_id) on delete cascade,
  device_key_hash text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.support_device_identities enable row level security;

-- Intentionally create no anon/authenticated policies. Only server routes using
-- SUPABASE_SERVICE_ROLE_KEY may read or write trusted device credentials.
drop policy if exists "support_device_identities_anon_select" on public.support_device_identities;
drop policy if exists "support_device_identities_anon_insert" on public.support_device_identities;
drop policy if exists "support_device_identities_anon_update" on public.support_device_identities;
drop policy if exists "support_device_identities_anon_delete" on public.support_device_identities;

create index if not exists idx_support_device_identities_user
  on public.support_device_identities(user_id);

create index if not exists idx_support_device_identities_active_seen
  on public.support_device_identities(last_seen_at desc)
  where revoked_at is null;

-- Private support messages must never be readable with the public anon key.
-- The upgraded UI reads them only through authenticated server APIs which
-- filter DM rooms by the signed session user id.
alter table if exists public.support_messages enable row level security;
drop policy if exists "sr read support_messages" on public.support_messages;
drop policy if exists "Allow public read support_messages" on public.support_messages;
drop policy if exists "support_messages_select" on public.support_messages;

comment on table public.support_device_identities is
  'Server-only exact device identity: random browser key mapped to one immutable user id and nickname.';

commit;
