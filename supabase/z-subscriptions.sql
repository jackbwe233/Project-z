create table if not exists public.z_subscriptions(
 user_id uuid primary key references auth.users(id) on delete cascade,
 stripe_customer_id text,
 stripe_subscription_id text,
 status text not null default 'pending',
 current_period_end timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.z_subscriptions enable row level security;
revoke all on public.z_subscriptions from anon, authenticated;
grant select on public.z_subscriptions to authenticated;
drop policy if exists "z subscription owner read" on public.z_subscriptions;
create policy "z subscription owner read" on public.z_subscriptions for select to authenticated using ((select auth.uid())=user_id);
-- Users must not be granted INSERT or UPDATE; only verified server-side webhooks write here.
