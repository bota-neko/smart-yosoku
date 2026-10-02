-- =====================================================================
-- 0005_user_api_keys.sql
-- 利用者ごとの Claude API キー（納品書の読み取り用・費用は本人負担）。
-- キーはアプリのサーバーで AES-256-GCM 暗号化してから保存する（平文は保存しない）。
-- RLS により、各ユーザーは自分の行のみ読み書き可能（他人のキーは見えない）。
-- 画面には末尾4文字（key_last4）だけを表示し、キー本体は二度と返さない。
-- =====================================================================

create table if not exists public.user_api_keys (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  encrypted_key text not null,
  key_last4     text not null,
  updated_at    timestamptz not null default now()
);

alter table public.user_api_keys enable row level security;

drop policy if exists "user_api_keys_select_own" on public.user_api_keys;
create policy "user_api_keys_select_own" on public.user_api_keys
  for select using (auth.uid() = user_id);

drop policy if exists "user_api_keys_insert_own" on public.user_api_keys;
create policy "user_api_keys_insert_own" on public.user_api_keys
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_api_keys_update_own" on public.user_api_keys;
create policy "user_api_keys_update_own" on public.user_api_keys
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_api_keys_delete_own" on public.user_api_keys;
create policy "user_api_keys_delete_own" on public.user_api_keys
  for delete using (auth.uid() = user_id);
