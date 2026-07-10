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
