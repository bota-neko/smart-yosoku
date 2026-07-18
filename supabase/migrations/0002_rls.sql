-- =============================================================================
-- Migration: 0002_rls
-- 目的: 全テーブルの RLS 有効化 + ポリシー定義 + 権限判定ヘルパー関数
-- 方針: 「デフォルト拒否・明示的に許可」。所属組織のデータのみアクセス可。
--   SELECT       : 所属組織メンバー全員
--   INSERT/UPDATE/DELETE: staff 以上（viewer は書込不可）
--   組織設定・メンバー管理: owner/admin のみ
-- ロールバック: 末尾のロールバック手順コメント参照
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 権限判定ヘルパー関数
--   重要: これらは SECURITY DEFINER。organization_members への参照時に
--   呼び出し元テーブルの RLS を再評価させない＝無限再帰を防ぐための設計。
--   （organization_members の RLS ポリシー内でこれらを呼んでも、関数内の
--    参照は definer 権限で RLS をバイパスするため再帰しない）
--   stable + search_path 固定でパフォーマンスと安全性を確保。
-- -----------------------------------------------------------------------------

-- 指定組織のメンバーか
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;

-- 指定組織で、指定ロール群のいずれかを持つか
create or replace function public.has_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role::text = any(roles)
  );
$$;

-- 書き込み可能か（owner/admin/staff）。viewer は false
create or replace function public.can_write(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(org, array['owner', 'admin', 'staff']);
$$;

-- 組織管理者か（owner/admin）。設定・メンバー管理に使用
create or replace function public.can_manage(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(org, array['owner', 'admin']);
$$;

-- 対象ユーザーと少なくとも 1 つの組織を共有しているか（プロフィール相互参照用）
create or replace function public.shares_org(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members other
      on other.organization_id = me.organization_id
    where me.user_id = auth.uid()
      and other.user_id = target_user
  );
$$;

-- 認証済みユーザーが実行できるよう明示付与
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;
grant execute on function public.can_write(uuid) to authenticated;
grant execute on function public.can_manage(uuid) to authenticated;
grant execute on function public.shares_org(uuid) to authenticated;

-- =============================================================================
-- 2. 標準業務テーブルへの一括ポリシー適用
--   全テーブルが organization_id を持つため、同一パターンを DO ループで付与:
--     SELECT = is_org_member / 書込 = can_write
--   （notifications, audit_logs は宛先/不変性の都合で個別定義するため除外）
-- =============================================================================
do $$
declare
  t text;
  business_tables text[] := array[
    'locations', 'units', 'forecast_target_categories', 'forecast_targets',
    'custom_metrics', 'daily_records', 'daily_metric_values', 'external_factors',
    'recurring_events', 'events', 'weather_records', 'forecasts',
    'forecast_components', 'forecast_adjustments', 'forecast_results',
    'forecast_accuracy', 'stockout_records', 'change_histories',
    'csv_imports', 'csv_import_rows'
  ];
begin
  foreach t in array business_tables loop
    -- RLS 有効化（ポリシーが無ければ全拒否 = デフォルト拒否）
    execute format('alter table public.%I enable row level security;', t);

    -- SELECT: 所属組織のデータのみ閲覧可（viewer 含む全メンバー）
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.is_org_member(organization_id));',
      t || '_select', t
    );

    -- INSERT: staff 以上のみ作成可
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.can_write(organization_id));',
      t || '_insert', t
    );

    -- UPDATE: staff 以上のみ更新可（更新前後どちらも自組織であること）
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.can_write(organization_id))
         with check (public.can_write(organization_id));',
      t || '_update', t
    );

    -- DELETE: staff 以上のみ削除可
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.can_write(organization_id));',
      t || '_delete', t
    );
  end loop;
end $$;

-- =============================================================================
-- 3. 組織 (organizations)
-- =============================================================================
alter table public.organizations enable row level security;

-- 閲覧: 自分が所属する組織のみ
create policy "organizations_select" on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

-- 作成: 認証済みなら誰でも新規組織を作成可（作成者本人であること）
--   ※ 作成直後のオーナーメンバー登録は create_organization() で行う
create policy "organizations_insert" on public.organizations
  for insert to authenticated
  with check (created_by = auth.uid());

-- 更新: owner/admin のみ
create policy "organizations_update" on public.organizations
  for update to authenticated
  using (public.can_manage(id))
  with check (public.can_manage(id));

-- 削除: owner のみ（組織の解体は最上位権限に限定）
create policy "organizations_delete" on public.organizations
  for delete to authenticated
  using (public.has_role(id, array['owner']));

-- =============================================================================
-- 4. 組織メンバー (organization_members)
-- =============================================================================
alter table public.organization_members enable row level security;

-- 閲覧: 同一組織のメンバー一覧を全メンバーが閲覧可
create policy "organization_members_select" on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

-- 追加: owner/admin のみ（初回オーナー登録は create_organization() が definer で実施）
create policy "organization_members_insert" on public.organization_members
  for insert to authenticated
  with check (public.can_manage(organization_id));

-- 更新（ロール変更等）: owner/admin のみ
create policy "organization_members_update" on public.organization_members
  for update to authenticated
  using (public.can_manage(organization_id))
  with check (public.can_manage(organization_id));

-- 削除（メンバー除外）: owner/admin のみ
create policy "organization_members_delete" on public.organization_members
  for delete to authenticated
  using (public.can_manage(organization_id));

-- =============================================================================
-- 5. 組織設定 (organization_settings)
-- =============================================================================
alter table public.organization_settings enable row level security;

-- 閲覧: 所属メンバー全員（アプリ表示に必要）
create policy "organization_settings_select" on public.organization_settings
  for select to authenticated
  using (public.is_org_member(organization_id));

-- 作成/更新/削除: owner/admin のみ
create policy "organization_settings_insert" on public.organization_settings
  for insert to authenticated
  with check (public.can_manage(organization_id));

create policy "organization_settings_update" on public.organization_settings
  for update to authenticated
  using (public.can_manage(organization_id))
  with check (public.can_manage(organization_id));

create policy "organization_settings_delete" on public.organization_settings
  for delete to authenticated
  using (public.can_manage(organization_id));

-- =============================================================================
-- 6. ユーザープロフィール (user_profiles)
-- =============================================================================
alter table public.user_profiles enable row level security;

-- 閲覧: 本人 + 同一組織のメンバー（メンバー名などの表示に必要）
create policy "user_profiles_select" on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org(id));

-- 作成: 本人のみ（通常はトリガーが自動作成）
create policy "user_profiles_insert" on public.user_profiles
  for insert to authenticated
  with check (id = auth.uid());

-- 更新: 本人のみ
create policy "user_profiles_update" on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 削除: 本人のみ
create policy "user_profiles_delete" on public.user_profiles
  for delete to authenticated
  using (id = auth.uid());

-- =============================================================================
-- 7. 通知 (notifications)
-- =============================================================================
alter table public.notifications enable row level security;

-- 閲覧: 自組織で、自分宛て or 組織全体宛て(user_id is null)
create policy "notifications_select" on public.notifications
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (user_id is null or user_id = auth.uid())
  );

-- 作成: staff 以上（システム通知の生成）
create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (public.can_write(organization_id));

-- 更新: 自分宛て通知の既読化など（本人のみ）
create policy "notifications_update" on public.notifications
  for update to authenticated
  using (public.is_org_member(organization_id) and user_id = auth.uid())
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

-- 削除: 本人 or 管理者
create policy "notifications_delete" on public.notifications
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and (user_id = auth.uid() or public.can_manage(organization_id))
  );

-- =============================================================================
-- 8. 監査ログ (audit_logs)
--   方針: 追記のみ・不変。閲覧は管理者に限定（UPDATE/DELETE ポリシーは作らない=全拒否）
-- =============================================================================
alter table public.audit_logs enable row level security;

-- 閲覧: owner/admin のみ
create policy "audit_logs_select" on public.audit_logs
  for select to authenticated
  using (public.can_manage(organization_id));

-- 作成: 所属メンバーの操作を記録（本人の行動ログ）
create policy "audit_logs_insert" on public.audit_logs
  for insert to authenticated
  with check (public.is_org_member(organization_id));

-- UPDATE/DELETE ポリシー無し = 改ざん・削除は全拒否（不変性を保証）

-- =============================================================================
-- 9. グローバルマスタ (industries / industry_templates)
--   方針: 全テナント共通の参照専用マスタ。認証済みは閲覧のみ可。
--   書込は service_role（BYPASSRLS）経由のみ = 一般ユーザーからは全拒否。
-- =============================================================================
alter table public.industries enable row level security;
alter table public.industry_templates enable row level security;

-- 閲覧: 認証済みユーザーは全件閲覧可（共通マスタのため）
create policy "industries_select" on public.industries
  for select to authenticated
  using (true);

create policy "industry_templates_select" on public.industry_templates
  for select to authenticated
  using (true);

-- INSERT/UPDATE/DELETE ポリシー無し = 一般ユーザーからの書込は全拒否

-- =============================================================================
-- ロールバック手順:
--   1) 各テーブルのポリシーを drop（例: drop policy "organizations_select" on public.organizations;）
--      標準テーブルは以下のループで一括削除可:
--        do $$ declare t text; declare p text;
--        begin ... drop policy ... end $$;
--   2) alter table public.<table> disable row level security;
--   3) drop function if exists public.shares_org(uuid), public.can_manage(uuid),
--        public.can_write(uuid), public.has_role(uuid, text[]), public.is_org_member(uuid);
-- =============================================================================
