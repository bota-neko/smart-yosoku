-- =====================================================================
-- 0004_app_state.sql
-- アカウントごとのアプリ状態をまるごと保存するテーブル（MVPのクラウド保存）。
-- 商品・卸先・納品実績・外部要因・設定を1つの JSONB として user 単位で保持する。
-- RLS により、各ユーザーは自分の行のみ読み書き可能（他人のデータは見えない）。
-- =====================================================================

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "app_state_select_own" on public.app_state;
create policy "app_state_select_own" on public.app_state
  for select using (auth.uid() = user_id);

drop policy if exists "app_state_insert_own" on public.app_state;
create policy "app_state_insert_own" on public.app_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "app_state_update_own" on public.app_state;
create policy "app_state_update_own" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "app_state_delete_own" on public.app_state;
create policy "app_state_delete_own" on public.app_state
  for delete using (auth.uid() = user_id);
