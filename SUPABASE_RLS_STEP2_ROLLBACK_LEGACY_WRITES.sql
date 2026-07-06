-- Emergency rollback for Step 2 RLS if something breaks after running the lock script.
-- Run this in Supabase SQL Editor only if suggestions/support/reactions stop working.
-- It temporarily re-allows legacy browser writes. After rollback, tell ChatGPT the error.

do $$
begin
  if to_regclass('public.suggestions') is not null then
    execute 'drop policy if exists "sr insert suggestions legacy" on public.suggestions';
    execute 'create policy "sr insert suggestions legacy" on public.suggestions for insert to anon, authenticated with check (true)';
  end if;
  if to_regclass('public.suggestion_replies') is not null then
    execute 'drop policy if exists "sr insert suggestion_replies legacy" on public.suggestion_replies';
    execute 'create policy "sr insert suggestion_replies legacy" on public.suggestion_replies for insert to anon, authenticated with check (true)';
  end if;
  if to_regclass('public.support_users') is not null then
    execute 'drop policy if exists "sr upsert support_users legacy" on public.support_users';
    execute 'create policy "sr upsert support_users legacy" on public.support_users for insert to anon, authenticated with check (true)';
    execute 'drop policy if exists "sr update support_users legacy" on public.support_users';
    execute 'create policy "sr update support_users legacy" on public.support_users for update to anon, authenticated using (true) with check (true)';
  end if;
  if to_regclass('public.support_messages') is not null then
    execute 'drop policy if exists "sr insert support_messages legacy" on public.support_messages';
    execute 'create policy "sr insert support_messages legacy" on public.support_messages for insert to anon, authenticated with check (true)';
  end if;
  if to_regclass('public.suggestion_reactions') is not null then
    execute 'drop policy if exists "sr insert suggestion_reactions legacy" on public.suggestion_reactions';
    execute 'create policy "sr insert suggestion_reactions legacy" on public.suggestion_reactions for insert to anon, authenticated with check (true)';
    execute 'drop policy if exists "sr delete suggestion_reactions legacy" on public.suggestion_reactions';
    execute 'create policy "sr delete suggestion_reactions legacy" on public.suggestion_reactions for delete to anon, authenticated using (true)';
  end if;
  if to_regclass('public.suggestion_item_reactions') is not null then
    execute 'drop policy if exists "sr insert suggestion_item_reactions legacy" on public.suggestion_item_reactions';
    execute 'create policy "sr insert suggestion_item_reactions legacy" on public.suggestion_item_reactions for insert to anon, authenticated with check (true)';
    execute 'drop policy if exists "sr delete suggestion_item_reactions legacy" on public.suggestion_item_reactions';
    execute 'create policy "sr delete suggestion_item_reactions legacy" on public.suggestion_item_reactions for delete to anon, authenticated using (true)';
  end if;
end $$;
