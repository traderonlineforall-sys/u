-- Primary Device Owner Identity v3
--
-- Required order:
--   1. Apply the earlier support_users and trusted-device migrations.
--   2. Apply this migration while DEVICE_IDENTITY_V2_MODE=off or shadow.
--   3. Deploy the v3 application code.
--   4. Start with DEVICE_IDENTITY_V2_MODE=verified_only.
--   5. Observe decisions/conflicts before considering full mode.
--
-- This migration is additive. It keeps legacy nickname/device rows for audit and
-- compatibility, but makes server-side user_id ownership, random credentials,
-- one-time recovery tickets and registered sessions the security boundary.

begin;

create extension if not exists pgcrypto;

alter table public.support_users
  add column if not exists account_status text not null default 'active',
  add column if not exists disabled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_users_account_status_chk'
  ) then
    alter table public.support_users
      add constraint support_users_account_status_chk
      check (account_status in ('active', 'suspended', 'cancelled'));
  end if;
end $$;

create table if not exists public.support_device_identities (
  device_id uuid primary key default gen_random_uuid(),
  user_id text not null references public.support_users(user_id) on delete cascade,
  device_key_hash text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.support_device_identities
  add column if not exists owner_state text not null default 'enrolled_from_verified_selection',
  add column if not exists owner_source text not null default 'legacy_client_enrollment',
  add column if not exists owner_display_name_snapshot text not null default '',
  add column if not exists owner_linked_at timestamptz not null default now(),
  add column if not exists owner_verified_at timestamptz,
  add column if not exists conflicted_at timestamptz,
  add column if not exists conflict_code text,
  add column if not exists policy_version text not null default 'primary-owner-v3';

update public.support_device_identities
set owner_display_name_snapshot = coalesce(nullif(owner_display_name_snapshot, ''), display_name, ''),
    owner_state = coalesce(nullif(owner_state, ''), 'enrolled_from_verified_selection'),
    owner_source = coalesce(nullif(owner_source, ''), 'legacy_client_enrollment'),
    owner_verified_at = case
      when owner_state in ('verified_device_owner', 'promoted_after_independent_confirmation')
        then coalesce(owner_verified_at, created_at)
      else owner_verified_at
    end
where true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_device_owner_state_chk'
  ) then
    alter table public.support_device_identities
      add constraint support_device_owner_state_chk
      check (owner_state in (
        'verified_device_owner',
        'enrolled_from_verified_selection',
        'promoted_after_independent_confirmation',
        'conflicted',
        'revoked'
      ));
  end if;
end $$;

create unique index if not exists support_device_identities_key_owner_uidx
  on public.support_device_identities(device_key_hash);
create index if not exists support_device_identities_owner_idx
  on public.support_device_identities(user_id, owner_state);
create index if not exists support_device_identities_conflict_idx
  on public.support_device_identities(conflicted_at desc)
  where conflicted_at is not null;

create or replace function public.sr_enforce_device_owner_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'device owner user_id is immutable' using errcode = '23514';
  end if;

  if old.owner_state = 'revoked' and new.owner_state <> 'revoked' then
    raise exception 'revoked device identity cannot be reactivated' using errcode = '23514';
  end if;
  if old.owner_state = 'conflicted' and new.owner_state not in ('conflicted', 'revoked') then
    raise exception 'conflicted device identity requires explicit reset' using errcode = '23514';
  end if;
  if old.owner_state = 'enrolled_from_verified_selection'
     and new.owner_state not in (
       'enrolled_from_verified_selection',
       'promoted_after_independent_confirmation',
       'conflicted',
       'revoked'
     ) then
    raise exception 'selected enrollment requires independent promotion' using errcode = '23514';
  end if;
  if old.owner_state = 'verified_device_owner'
     and new.owner_state not in ('verified_device_owner', 'conflicted', 'revoked') then
    raise exception 'verified owner transition is not allowed' using errcode = '23514';
  end if;
  if old.owner_state = 'promoted_after_independent_confirmation'
     and new.owner_state not in ('promoted_after_independent_confirmation', 'conflicted', 'revoked') then
    raise exception 'promoted owner transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists support_device_owner_transition_guard on public.support_device_identities;
create trigger support_device_owner_transition_guard
before update of user_id, owner_state on public.support_device_identities
for each row execute function public.sr_enforce_device_owner_transition();

revoke all on function public.sr_enforce_device_owner_transition() from public, anon, authenticated;

create table if not exists public.support_device_credentials (
  credential_id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique references public.support_device_identities(device_id) on delete cascade,
  secret_hash text not null unique,
  previous_secret_hash text,
  previous_valid_until timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  suspended_at timestamptz,
  last_context_hash text,
  replay_detected_at timestamptz,
  replay_count integer not null default 0 check (replay_count >= 0)
);

create index if not exists support_device_credentials_active_idx
  on public.support_device_credentials(expires_at, last_used_at desc)
  where revoked_at is null and suspended_at is null;
create index if not exists support_device_credentials_previous_idx
  on public.support_device_credentials(previous_secret_hash)
  where previous_secret_hash is not null;

create table if not exists public.support_device_identity_decisions (
  decision_id uuid primary key default gen_random_uuid(),
  device_id uuid references public.support_device_identities(device_id) on delete set null,
  user_id text references public.support_users(user_id) on delete set null,
  decision_type text not null check (decision_type in (
    'AUTO_LOGIN_VERIFIED',
    'AUTO_LOGIN_RECOVERED',
    'SELECTION_REQUIRED',
    'INSUFFICIENT_EVIDENCE',
    'CONFLICTED',
    'REJECTED',
    'NEW_DEVICE'
  )),
  decision_source text not null,
  truth_level text not null default 'unverified',
  evidence_groups text[] not null default '{}'::text[],
  evidence_lineage jsonb not null default '{}'::jsonb,
  parent_decision_id uuid references public.support_device_identity_decisions(decision_id) on delete set null,
  automatic boolean not null default false,
  executed boolean not null default false,
  can_strengthen boolean not null default false,
  shadow_only boolean not null default false,
  conflict boolean not null default false,
  rejection_code text,
  evidence_group_count integer not null default 0,
  score_margin numeric,
  algorithm_version text not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_device_decisions_created_idx
  on public.support_device_identity_decisions(created_at desc);
create index if not exists support_device_decisions_device_idx
  on public.support_device_identity_decisions(device_id, created_at desc);
create index if not exists support_device_decisions_conflict_idx
  on public.support_device_identity_decisions(created_at desc)
  where conflict is true;

create table if not exists public.support_device_identity_observations (
  observation_id uuid primary key default gen_random_uuid(),
  device_id uuid references public.support_device_identities(device_id) on delete set null,
  user_id text references public.support_users(user_id) on delete set null,
  source text not null,
  truth_level text not null default 'unverified',
  evidence_groups text[] not null default '{}'::text[],
  evidence_lineage jsonb not null default '{}'::jsonb,
  decision_id uuid references public.support_device_identity_decisions(decision_id) on delete set null,
  can_strengthen boolean not null default false,
  shadow_only boolean not null default false,
  algorithm_version text not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_device_observations_device_idx
  on public.support_device_identity_observations(device_id, created_at desc);
create index if not exists support_device_observations_user_idx
  on public.support_device_identity_observations(user_id, created_at desc);

create table if not exists public.support_device_identity_conflicts (
  conflict_id uuid primary key default gen_random_uuid(),
  device_id uuid references public.support_device_identities(device_id) on delete set null,
  credential_id uuid references public.support_device_credentials(credential_id) on delete set null,
  expected_user_id text references public.support_users(user_id) on delete set null,
  observed_user_id text references public.support_users(user_id) on delete set null,
  conflict_code text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);

create index if not exists support_device_conflicts_open_idx
  on public.support_device_identity_conflicts(created_at desc)
  where resolved_at is null;

create table if not exists public.support_device_recovery_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  parent_decision_id uuid,
  nonce_hash text not null unique,
  context_hash text not null,
  fingerprint_context_hash text not null,
  choices jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz,
  check (jsonb_typeof(choices) = 'array')
);

alter table public.support_device_recovery_tickets
  add column if not exists parent_decision_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_device_recovery_parent_decision_fk'
      and conrelid = 'public.support_device_recovery_tickets'::regclass
  ) then
    alter table public.support_device_recovery_tickets
      add constraint support_device_recovery_parent_decision_fk
      foreign key (parent_decision_id)
      references public.support_device_identity_decisions(decision_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_device_recovery_choice_count_chk'
      and conrelid = 'public.support_device_recovery_tickets'::regclass
  ) then
    alter table public.support_device_recovery_tickets
      add constraint support_device_recovery_choice_count_chk
      check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 3);
  end if;
end $$;

create unique index if not exists support_device_recovery_attempt_uidx
  on public.support_device_recovery_tickets(attempt_id)
  where used_at is null and cancelled_at is null;
create index if not exists support_device_recovery_expiry_idx
  on public.support_device_recovery_tickets(expires_at)
  where used_at is null and cancelled_at is null;

create table if not exists public.support_auth_sessions (
  session_id_hash text primary key,
  user_id text not null references public.support_users(user_id) on delete cascade,
  decision_id uuid references public.support_device_identity_decisions(decision_id) on delete set null,
  assurance text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists support_auth_sessions_user_idx
  on public.support_auth_sessions(user_id, created_at desc);
create index if not exists support_auth_sessions_active_idx
  on public.support_auth_sessions(expires_at)
  where revoked_at is null;

create table if not exists public.support_auth_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  counter integer not null default 0 check (counter >= 0),
  expires_at timestamptz not null,
  primary key (scope, key_hash)
);

create index if not exists support_auth_rate_limits_expiry_idx
  on public.support_auth_rate_limits(expires_at);

-- No browser role may read identity credentials, recovery choices, session
-- hashes, audit lineage or limiter keys. Server routes use service_role only.
alter table public.support_device_identities enable row level security;
alter table public.support_device_credentials enable row level security;
alter table public.support_device_identity_decisions enable row level security;
alter table public.support_device_identity_observations enable row level security;
alter table public.support_device_identity_conflicts enable row level security;
alter table public.support_device_recovery_tickets enable row level security;
alter table public.support_auth_sessions enable row level security;
alter table public.support_auth_rate_limits enable row level security;

revoke all on table public.support_device_identities from public, anon, authenticated;
revoke all on table public.support_device_credentials from public, anon, authenticated;
revoke all on table public.support_device_identity_decisions from public, anon, authenticated;
revoke all on table public.support_device_identity_observations from public, anon, authenticated;
revoke all on table public.support_device_identity_conflicts from public, anon, authenticated;
revoke all on table public.support_device_recovery_tickets from public, anon, authenticated;
revoke all on table public.support_auth_sessions from public, anon, authenticated;
revoke all on table public.support_auth_rate_limits from public, anon, authenticated;

grant select, insert, update, delete on table public.support_device_identities to service_role;
grant select, insert, update, delete on table public.support_device_credentials to service_role;
grant select, insert, update, delete on table public.support_device_identity_decisions to service_role;
grant select, insert, update, delete on table public.support_device_identity_observations to service_role;
grant select, insert, update, delete on table public.support_device_identity_conflicts to service_role;
grant select, insert, update, delete on table public.support_device_recovery_tickets to service_role;
grant select, insert, update, delete on table public.support_auth_sessions to service_role;
grant select, insert, update, delete on table public.support_auth_rate_limits to service_role;

create or replace function public.sr_auth_rate_limit_take(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(1, least(86400, p_window_seconds)));
  v_count integer;
  v_started timestamptz;
begin
  if p_scope is null or length(p_scope) < 1 or p_key_hash is null or length(p_key_hash) < 32 then
    return query select false, 0, greatest(1, p_window_seconds);
    return;
  end if;

  insert into public.support_auth_rate_limits(scope, key_hash, window_started_at, counter, expires_at)
  values (
    left(p_scope, 64),
    left(p_key_hash, 128),
    v_now,
    greatest(1, p_cost),
    v_now + (v_window * 2)
  )
  on conflict (scope, key_hash) do update
  set window_started_at = case
        when support_auth_rate_limits.window_started_at + v_window <= v_now then v_now
        else support_auth_rate_limits.window_started_at
      end,
      counter = case
        when support_auth_rate_limits.window_started_at + v_window <= v_now then greatest(1, p_cost)
        else support_auth_rate_limits.counter + greatest(1, p_cost)
      end,
      expires_at = case
        when support_auth_rate_limits.window_started_at + v_window <= v_now then v_now + (v_window * 2)
        else support_auth_rate_limits.window_started_at + (v_window * 2)
      end
  returning counter, window_started_at into v_count, v_started;

  delete from public.support_auth_rate_limits
  where expires_at < v_now - interval '1 day';

  delete from public.support_device_recovery_tickets
  where expires_at < v_now - interval '7 days';

  delete from public.support_auth_sessions
  where expires_at < v_now - interval '30 days';

  return query select
    v_count <= greatest(1, p_limit),
    greatest(0, greatest(1, p_limit) - v_count),
    greatest(1, ceil(extract(epoch from ((v_started + v_window) - v_now)))::integer);
end;
$$;

create or replace function public.sr_consume_device_recovery_ticket(
  p_ticket_id uuid,
  p_attempt_id uuid,
  p_nonce_hash text,
  p_choice_id uuid
)
returns table(selected_user_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_choices jsonb;
  v_user_id text;
begin
  select t.choices
  into v_choices
  from public.support_device_recovery_tickets t
  where t.ticket_id = p_ticket_id
    and t.attempt_id = p_attempt_id
    and t.nonce_hash = p_nonce_hash
    and t.used_at is null
    and t.cancelled_at is null
    and t.expires_at > clock_timestamp()
  for update;

  if not found then return; end if;

  select c->>'user_id'
  into v_user_id
  from jsonb_array_elements(v_choices) c
  where c->>'choice_id' = p_choice_id::text
  limit 1;

  if v_user_id is null or length(v_user_id) < 8 then return; end if;

  update public.support_device_recovery_tickets
  set used_at = clock_timestamp()
  where ticket_id = p_ticket_id
    and used_at is null
    and cancelled_at is null;

  if not found then return; end if;
  return query select v_user_id;
end;
$$;

create or replace function public.sr_forget_device_credential(
  p_credential_id uuid,
  p_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  select c.device_id
  into v_device_id
  from public.support_device_credentials c
  join public.support_device_identities d on d.device_id = c.device_id
  where c.credential_id = p_credential_id
    and d.user_id = p_user_id
  for update of c, d;

  if not found then return false; end if;

  update public.support_device_credentials
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where device_id = v_device_id;

  update public.support_device_identities
  set owner_state = 'revoked',
      revoked_at = coalesce(revoked_at, clock_timestamp())
  where device_id = v_device_id
    and user_id = p_user_id;

  update public.support_auth_sessions s
  set revoked_at = coalesce(s.revoked_at, clock_timestamp())
  from public.support_device_identity_decisions d
  where s.decision_id = d.decision_id
    and d.device_id = v_device_id
    and s.user_id = p_user_id;

  return true;
end;
$$;

create or replace function public.sr_forget_device_identity(
  p_device_id uuid,
  p_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  select d.device_id
  into v_device_id
  from public.support_device_identities d
  where d.device_id = p_device_id
    and d.user_id = p_user_id
  for update;

  if not found then return false; end if;

  update public.support_device_credentials
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where device_id = v_device_id;

  update public.support_device_identities
  set owner_state = 'revoked',
      revoked_at = coalesce(revoked_at, clock_timestamp())
  where device_id = v_device_id
    and user_id = p_user_id;

  update public.support_auth_sessions s
  set revoked_at = coalesce(s.revoked_at, clock_timestamp())
  from public.support_device_identity_decisions d
  where s.decision_id = d.decision_id
    and d.device_id = v_device_id
    and s.user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.sr_auth_rate_limit_take(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.sr_consume_device_recovery_ticket(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.sr_forget_device_credential(uuid, text) from public, anon, authenticated;
revoke all on function public.sr_forget_device_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.sr_auth_rate_limit_take(text, text, integer, integer, integer) to service_role;
grant execute on function public.sr_consume_device_recovery_ticket(uuid, uuid, text, uuid) to service_role;
grant execute on function public.sr_forget_device_credential(uuid, text) to service_role;
grant execute on function public.sr_forget_device_identity(uuid, text) to service_role;

comment on table public.support_device_identities is
  'Server-only primary device owner binding. user_id is truth; display_name columns are audit snapshots only.';
comment on table public.support_device_credentials is
  'Hashed, rotatable, revocable HttpOnly device credentials. Raw secrets are never stored.';
comment on table public.support_device_recovery_tickets is
  'Short-lived, server-side, one-time nickname selections. Client tickets contain no user ids or scores.';
comment on table public.support_device_identity_observations is
  'Decision provenance. can_strengthen prevents circular learning from inferred/selected sessions.';

commit;
