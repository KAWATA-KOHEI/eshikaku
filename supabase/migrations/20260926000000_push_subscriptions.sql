-- 毎日のリマインド通知（Web Push）の購読先。1端末1行
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  notify_hour smallint not null default 20 check (notify_hour between 0 and 23), -- 日本時間
  last_sent_on date,                                                              -- 日本時間の日付
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: select own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions: insert own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions: update own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions: delete own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
