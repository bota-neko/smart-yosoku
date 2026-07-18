-- =============================================================================
-- Migration: 0003_functions
-- 目的: 組織作成のブートストラップと、現在ユーザーの所属判定など便利関数
-- 前提: 0001_schema, 0002_rls 適用済み
-- ロールバック: 末尾のロールバック手順コメント参照
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 組織作成ブートストラップ
--   課題: organization_members の INSERT ポリシーは can_manage（既存の
--     owner/admin）を要求するため、最初のオーナー登録が「鶏と卵」になる。
--   解決: この関数を SECURITY DEFINER にして、組織作成〜オーナー登録〜
--     既定設定作成をアトミックに実施する。呼び出し元(authenticated)は
--     自分自身を owner として登録することしかできない。
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
begin
  -- 未認証は拒否
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  -- 組織作成（作成者を記録）
  insert into public.organizations (name, slug, created_by)
  values (p_name, p_slug, v_uid)
  returning * into v_org;

  -- 作成者を owner として登録
  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_org.id, v_uid, 'owner', v_uid);

  -- 既定の組織設定を作成
  insert into public.organization_settings (organization_id)
  values (v_org.id);

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. 現在ユーザーの所属組織 id 一覧
--   用途: アプリ側で「所属組織セレクタ」やデフォルト組織の決定に使う
-- -----------------------------------------------------------------------------
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid();
$$;

grant execute on function public.current_org_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. 現在ユーザーの指定組織でのロール取得
--   用途: フロントでの UI 出し分け（viewer は編集ボタン非表示 等）
--   ※ 権限の最終判定は必ず RLS 側で行う。これは表示補助用。
-- -----------------------------------------------------------------------------
create or replace function public.current_role_in(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role::text
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = auth.uid();
$$;

grant execute on function public.current_role_in(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. CSV 取込のロールバック
--   概要: 取込で作成した行を created_record_type/id を辿って削除し、
--     取込ステータスを rolled_back に更新する。
--   SECURITY DEFINER 理由: 複数テーブルへの一括削除を安全に行うため。
--     ただし冒頭で「その組織の管理権限があるか」を必ず検証する。
-- -----------------------------------------------------------------------------
create or replace function public.rollback_csv_import(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  r record;
begin
  -- 対象取込の組織を取得
  select organization_id into v_org
  from public.csv_imports
  where id = p_import_id;

  if v_org is null then
    raise exception 'csv import not found';
  end if;

  -- 権限チェック: その組織で書込権限（staff 以上）が無ければ拒否
  if not public.can_write(v_org) then
    raise exception 'permission denied';
  end if;

  -- 取込で作成された行を、参照先テーブルごとに削除
  for r in
    select created_record_type, created_record_id
    from public.csv_import_rows
    where csv_import_id = p_import_id
      and status = 'success'
      and created_record_type is not null
      and created_record_id is not null
  loop
    -- テーブル名は取込処理側が限定した値のみを想定。format(%I) で識別子エスケープ。
    execute format(
      'delete from public.%I where id = $1 and organization_id = $2',
      r.created_record_type
    ) using r.created_record_id, v_org;
  end loop;

  -- 行ステータスを rolled_back に
  update public.csv_import_rows
  set status = 'rolled_back'
  where csv_import_id = p_import_id
    and status = 'success';

  -- 取込ステータスを更新
  update public.csv_imports
  set status = 'rolled_back',
      rolled_back_at = now()
  where id = p_import_id;
end;
$$;

grant execute on function public.rollback_csv_import(uuid) to authenticated;

-- =============================================================================
-- ロールバック手順:
--   drop function if exists public.rollback_csv_import(uuid);
--   drop function if exists public.current_role_in(uuid);
--   drop function if exists public.current_org_ids();
--   drop function if exists public.create_organization(text, text);
-- =============================================================================
