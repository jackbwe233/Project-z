-- Apply to your own Supabase project after reviewing the privacy implications.
-- RLS limits each signed-in user to one backup owned by their auth identity.
create table if not exists public.z_user_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.z_user_backups enable row level security;
revoke all on public.z_user_backups from anon;
grant select, insert, update on public.z_user_backups to authenticated;
drop policy if exists "z users read own backup" on public.z_user_backups;
create policy "z users read own backup" on public.z_user_backups for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "z users create own backup" on public.z_user_backups;
create policy "z users create own backup" on public.z_user_backups for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "z users update own backup" on public.z_user_backups;
create policy "z users update own backup" on public.z_user_backups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
