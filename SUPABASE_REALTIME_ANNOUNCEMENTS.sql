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
