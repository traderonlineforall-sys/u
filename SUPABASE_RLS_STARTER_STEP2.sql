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
