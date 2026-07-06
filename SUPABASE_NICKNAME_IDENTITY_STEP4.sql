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
