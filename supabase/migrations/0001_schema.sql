-- =============================================================================
-- Migration: 0001_schema
-- 目的: smart-yosoku（需要予測SaaS）の全テーブル・型・制約・インデックスを定義
-- 方針: マルチテナント（organization_id で完全分離）。RLS は 0002 で有効化。
-- ロールバック: このマイグレーションで作成した全テーブル・型・関数を DROP する
--   （末尾のロールバック手順コメント参照）。
-- 対象: PostgreSQL 15 (Supabase)
-- =============================================================================

-- gen_random_uuid() は PostgreSQL 13+ のコア関数。Supabase では利用可能。

-- -----------------------------------------------------------------------------
-- 0. 共通: updated_at 自動更新トリガー関数
--   理由: 更新時刻を DB 側で確実に記録し、アプリ実装のミスを防ぐ
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. 列挙型（enum）
--   理由: 値の揺れを防ぎ、意味を型で強制する
-- -----------------------------------------------------------------------------

-- 組織内ロール: 権限の強い順に owner > admin > staff > viewer
create type public.organization_role as enum ('owner', 'admin', 'staff', 'viewer');

-- カスタム指標のデータ型
create type public.metric_data_type as enum ('numeric', 'integer', 'boolean', 'text');

-- 繰り返しイベントの周期
create type public.recurrence_type as enum ('once', 'weekly', 'monthly', 'yearly');

-- 変更履歴の種別（価格変更/リニューアル/開店/閉店/移転/その他）
create type public.change_type as enum ('price_change', 'renewal', 'open', 'close', 'relocation', 'other');

-- CSV 取込のステータス（rolled_back でロールバック済みを表現）
create type public.csv_import_status as enum ('pending', 'processing', 'completed', 'failed', 'rolled_back');

-- 予測精度集計の期間種別
create type public.accuracy_period as enum ('day', 'week', 'month', 'quarter', 'year');

-- =============================================================================
-- 2. 組織・ユーザー・メンバー
-- =============================================================================

-- 組織（テナントの最上位）
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,                          -- URL 等で使う一意な短縮名（任意）
  created_by  uuid references auth.users(id) on delete set null, -- 作成者。退会しても組織は残すため SET NULL
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ユーザープロフィール（auth.users と 1:1 で連携）
--   理由: auth.users を直接参照せず public 側にプロフィールを持たせ、RLS/JOIN を容易にする
create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email        text,
  avatar_url   text,
  locale       text not null default 'ja',
  timezone     text not null default 'Asia/Tokyo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 組織メンバー（ユーザーと組織の多対多 + ロール）
create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.organization_role not null default 'staff',
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 同一組織に同一ユーザーは 1 レコードのみ
  unique (organization_id, user_id)
);

-- 組織設定（1 組織 1 レコード）
create table public.organization_settings (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null unique references public.organizations(id) on delete cascade,
  -- 許容誤差（誤差率のしきい値）。hit=命中, near=ニアピン, caution=要注意
  tolerance_hit        numeric(6,4) not null default 0.1000,
  tolerance_near       numeric(6,4) not null default 0.2000,
  tolerance_caution    numeric(6,4) not null default 0.3000,
  allow_decimal        boolean not null default false,   -- 小数の在庫/数量を許容するか
  safety_stock_rate    numeric(6,4) not null default 0.1000, -- 安全在庫率
  industry_id          uuid,                              -- 採用中の業種（FK は industries 定義後に付与）
  industry_template_id uuid,                              -- 採用中の業種テンプレ（同上）
  default_location_id  uuid,                              -- 既定拠点（FK は locations 定義後に付与）
  rounding_mode        text not null default 'round' check (rounding_mode in ('round', 'ceil', 'floor')),
  settings             jsonb not null default '{}'::jsonb, -- 拡張用の自由設定
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- =============================================================================
-- 3. マスタ（グローバル: 業種・業種テンプレ）
--   理由: 業種は全テナント共通の参照マスタ。org_id を持たず read-only 運用
-- =============================================================================

create table public.industries (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.industry_templates (
  id          uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.industries(id) on delete cascade,
  name        text not null,
  description text,
  -- 既定の単位/指標/許容誤差などのプリセットを JSON で保持
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 上で参照だけしていた organization_settings の FK を付与
alter table public.organization_settings
  add constraint organization_settings_industry_fk
    foreign key (industry_id) references public.industries(id) on delete set null,
  add constraint organization_settings_industry_template_fk
    foreign key (industry_template_id) references public.industry_templates(id) on delete set null;

-- =============================================================================
-- 4. 組織内マスタ（拠点・単位・カテゴリ・予測対象・カスタム指標）
-- =============================================================================

-- 拠点（店舗/工場/学校など）
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  code            text,
  address         text,
  timezone        text not null default 'Asia/Tokyo',
  is_active       boolean not null default true,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);

-- organization_settings.default_location_id の FK を付与
alter table public.organization_settings
  add constraint organization_settings_default_location_fk
    foreign key (default_location_id) references public.locations(id) on delete set null;

-- 単位（個/食/本/箱/kg/人/件/時間 など。組織ごとに自由設定）
create table public.units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,             -- 例: 個, 食, 本
  symbol          text,                      -- 例: pcs
  allow_decimal   boolean not null default false, -- kg など小数可の単位向け
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

-- 予測対象カテゴリ（親子構造可）
create table public.forecast_target_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id       uuid references public.forecast_target_categories(id) on delete set null,
  name            text not null,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 予測対象（商品/メニュー/サービス等）
create table public.forecast_targets (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  category_id       uuid references public.forecast_target_categories(id) on delete set null,
  unit_id           uuid references public.units(id) on delete set null,
  name              text not null,
  price             numeric(14,2),           -- 売価
  cost              numeric(14,2),           -- 原価
  is_active         boolean not null default true,
  is_new            boolean not null default false, -- 新商品フラグ（実績が少ない予測の補正に使用）
  change_point_date date,                     -- リニューアル等で傾向が変わった基準日
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- カスタム指標（任意の実績値を定義）
create table public.custom_metrics (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id         uuid references public.units(id) on delete set null,
  name            text not null,
  code            text,                       -- API/CSV 用の識別子
  data_type       public.metric_data_type not null default 'numeric',
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);

-- =============================================================================
-- 5. 実績（daily_records / カスタム指標値）
-- =============================================================================

-- 日次実績。数値カラムは NULL 許容（NULL=未入力, 0=ゼロ実績 を区別する）
create table public.daily_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  location_id        uuid not null references public.locations(id) on delete cascade,
  forecast_target_id uuid not null references public.forecast_targets(id) on delete cascade,
  record_date        date not null,
  delivered          numeric(14,3),  -- 納品数
  sold               numeric(14,3),  -- 販売数
  produced           numeric(14,3),  -- 製造/仕込み数
  ordered            numeric(14,3),  -- 発注数
  stock              numeric(14,3),  -- 在庫数
  returns            numeric(14,3),  -- 返品数
  waste              numeric(14,3),  -- 廃棄数
  stockout           numeric(14,3),  -- 欠品数
  visitors           numeric(14,3),  -- 来客数
  reservations       numeric(14,3),  -- 予約数
  cancellations      numeric(14,3),  -- キャンセル数
  task_count         numeric(14,3),  -- 業務件数
  sales_amount       numeric(16,2),  -- 売上金額
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- 1 日・1 拠点・1 対象で 1 レコード
  unique (record_date, location_id, forecast_target_id)
);

-- カスタム指標の実績値（daily_records に紐づく任意の値）
create table public.daily_metric_values (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  daily_record_id  uuid not null references public.daily_records(id) on delete cascade,
  custom_metric_id uuid not null references public.custom_metrics(id) on delete cascade,
  value_numeric    numeric(18,4),
  value_text       text,
  value_bool       boolean,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (daily_record_id, custom_metric_id)
);

-- =============================================================================
-- 6. 外部要因（天候・イベント・特売など）
-- =============================================================================

-- 日次の外部要因（拠点別。location_id NULL = 全社共通）
create table public.external_factors (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  location_id         uuid references public.locations(id) on delete cascade,
  factor_date         date not null,
  weather             text,               -- 天気（晴/曇/雨 等）
  temp_high           numeric(5,2),
  temp_low            numeric(5,2),
  precip_probability  numeric(5,2),       -- 降水確率(%)
  is_sale             boolean not null default false, -- 特売
  is_campaign         boolean not null default false, -- キャンペーン
  is_point_day        boolean not null default false, -- ポイントデー
  is_event            boolean not null default false, -- 何らかのイベントあり
  is_holiday          boolean not null default false, -- 祝日
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, location_id, factor_date)
);

-- 繰り返しイベント定義（今回のみ/毎週/毎月/毎年）
create table public.recurring_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  recurrence_type public.recurrence_type not null default 'once',
  weekday         integer check (weekday between 0 and 6),   -- weekly 用（0=日）
  day_of_month    integer check (day_of_month between 1 and 31), -- monthly 用
  month           integer check (month between 1 and 12),    -- yearly 用
  start_date      date,
  end_date        date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 個別イベント（地域/店舗/学校など）
create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  location_id        uuid references public.locations(id) on delete cascade, -- NULL=全社
  recurring_event_id uuid references public.recurring_events(id) on delete set null,
  name               text not null,
  description        text,
  scope              text not null default 'store' check (scope in ('region', 'store', 'school', 'other')),
  impact_level       integer not null default 0 check (impact_level between -3 and 3), -- 需要への影響度
  start_date         date not null,
  end_date           date,
  start_time         time,
  end_time           time,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 天候実績（外部 API 等から取得した観測値）
create table public.weather_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  location_id        uuid references public.locations(id) on delete cascade,
  weather_date       date not null,
  weather            text,
  temp_high          numeric(5,2),
  temp_low           numeric(5,2),
  temp_avg           numeric(5,2),
  precip_mm          numeric(6,2),
  precip_probability numeric(5,2),
  humidity           numeric(5,2),
  wind_speed         numeric(5,2),
  source             text,               -- データ提供元
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, location_id, weather_date)
);

-- =============================================================================
-- 7. 予測（forecasts / components / adjustments / results / accuracy）
-- =============================================================================

-- 予測本体
create table public.forecasts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  location_id         uuid not null references public.locations(id) on delete cascade,
  forecast_target_id  uuid not null references public.forecast_targets(id) on delete cascade,
  target_date         date not null,       -- 予測対象日
  model_version       text not null default 'v1',
  base_demand         numeric(14,3),       -- 基礎需要（補正前）
  adjusted_demand     numeric(14,3),       -- 補正後需要
  recommended_quantity numeric(14,3),      -- 推奨数量（発注/仕込み）
  range_low           numeric(14,3),       -- 予測レンジ下限
  range_high          numeric(14,3),       -- 予測レンジ上限
  confidence_level    text check (confidence_level in ('low', 'medium', 'high')),
  confidence_score    numeric(5,4),        -- 0.0000〜1.0000
  status              text not null default 'active' check (status in ('draft', 'active', 'archived')),
  generated_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- 同一対象日・モデルで最新を一意にする
  unique (organization_id, location_id, forecast_target_id, target_date, model_version)
);

-- 予測の内訳（基礎需要・曜日係数・天候係数などの寄与）
create table public.forecast_components (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  forecast_id     uuid not null references public.forecasts(id) on delete cascade,
  component_type  text not null,           -- 例: base, weekday, weather, event, trend
  label           text,
  value           numeric(14,4),
  weight          numeric(10,4),
  contribution    numeric(14,4),           -- 需要への寄与量
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- 予測への手動/自動補正
create table public.forecast_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  forecast_id     uuid not null references public.forecasts(id) on delete cascade,
  adjustment_type text not null default 'manual' check (adjustment_type in ('manual', 'rule', 'event', 'safety_stock')),
  reason          text,
  amount          numeric(14,3),           -- 補正量（+/-）
  adjusted_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- 予測結果（予測 vs 実績）。差分系は生成列で自動計算
create table public.forecast_results (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  forecast_id        uuid references public.forecasts(id) on delete set null,
  location_id        uuid not null references public.locations(id) on delete cascade,
  forecast_target_id uuid not null references public.forecast_targets(id) on delete cascade,
  target_date        date not null,
  predicted          numeric(14,3),
  actual             numeric(14,3),
  -- diff = 予測 - 実績
  diff               numeric(14,3) generated always as (predicted - actual) stored,
  abs_error          numeric(14,3) generated always as (abs(predicted - actual)) stored,
  -- 誤差率 = |予測-実績| / |実績|（実績 0 は NULL）
  error_rate         numeric(14,6) generated always as (
                        abs(predicted - actual) / nullif(abs(actual), 0)
                      ) stored,
  -- over=予測過剰, under=予測不足, exact=一致
  over_under         text generated always as (
                        case
                          when predicted is null or actual is null then null
                          when predicted > actual then 'over'
                          when predicted < actual then 'under'
                          else 'exact'
                        end
                      ) stored,
  within_tolerance   boolean,              -- 許容誤差内か（設定依存のためアプリ側で判定・保存）
  tolerance_band     text check (tolerance_band in ('hit', 'near', 'caution', 'miss')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, location_id, forecast_target_id, target_date)
);

-- 予測精度の集計（対象/拠点/期間別）
create table public.forecast_accuracy (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  location_id        uuid references public.locations(id) on delete cascade, -- NULL=全拠点
  forecast_target_id uuid references public.forecast_targets(id) on delete cascade, -- NULL=全対象
  period_type        public.accuracy_period not null,
  period_start       date not null,
  period_end         date not null,
  sample_count       integer not null default 0,
  mae                numeric(14,4),  -- 平均絶対誤差
  wape               numeric(14,6),  -- 加重絶対誤差率
  mape               numeric(14,6),  -- 平均絶対誤差率
  rmse               numeric(14,4),  -- 二乗平均平方根誤差
  bias               numeric(14,4),  -- 偏り（過剰/不足の傾向）
  hit_rate           numeric(6,4),   -- 命中率
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, location_id, forecast_target_id, period_type, period_start)
);

-- =============================================================================
-- 8. 欠品・変更履歴
-- =============================================================================

-- 欠品/売り切れ記録
create table public.stockout_records (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  location_id         uuid not null references public.locations(id) on delete cascade,
  forecast_target_id  uuid not null references public.forecast_targets(id) on delete cascade,
  record_date         date not null,
  sold_out            boolean not null default false, -- 完売したか
  sold_out_time       time,                            -- 完売時刻
  additional_order    boolean not null default false,  -- 追加発注したか
  additional_qty      numeric(14,3),                   -- 追加発注量
  estimated_stockout  numeric(14,3),                   -- 推定欠品数
  lost_sales          numeric(16,2),                   -- 推定機会損失（金額）
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (record_date, location_id, forecast_target_id)
);

-- 変更履歴（価格変更/リニューアル/開店閉店など。予測傾向の断絶点として利用）
create table public.change_histories (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  location_id         uuid references public.locations(id) on delete cascade,
  forecast_target_id  uuid references public.forecast_targets(id) on delete cascade,
  change_type         public.change_type not null,
  title               text not null,
  description         text,
  old_value           text,
  new_value           text,
  effective_date      date not null,       -- 変更が有効になる日
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- =============================================================================
-- 9. CSV 取込（履歴・行・ロールバック用）
-- =============================================================================

create table public.csv_imports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name       text not null,
  file_path       text,                    -- Storage 上のパス
  import_type     text not null,           -- 例: daily_records, forecast_targets
  status          public.csv_import_status not null default 'pending',
  total_rows      integer not null default 0,
  processed_rows  integer not null default 0,
  success_rows    integer not null default 0,
  error_rows      integer not null default 0,
  error_message   text,
  imported_by     uuid references auth.users(id) on delete set null,
  rolled_back_at  timestamptz,             -- ロールバック実施時刻
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 取込の各行（ロールバックのため作成レコードの参照を保持）
create table public.csv_import_rows (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  csv_import_id       uuid not null references public.csv_imports(id) on delete cascade,
  row_number          integer not null,
  raw_data            jsonb not null default '{}'::jsonb, -- 取込元の生データ
  status              text not null default 'pending' check (status in ('pending', 'success', 'error', 'rolled_back')),
  error_message       text,
  created_record_type text,                -- ロールバック対象のテーブル名
  created_record_id   uuid,                -- ロールバック対象の行 id
  created_at          timestamptz not null default now(),
  unique (csv_import_id, row_number)
);

-- =============================================================================
-- 10. 通知・監査ログ
-- =============================================================================

-- 通知（user_id NULL = 組織全体宛て）
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  type            text not null default 'info',
  title           text not null,
  body            text,
  link            text,
  is_read         boolean not null default false,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- 監査ログ（重要操作の追跡。追記のみ・不変）
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  action          text not null,           -- 例: create, update, delete, rollback
  entity_type     text,                    -- 対象テーブル名
  entity_id       uuid,                    -- 対象行 id
  before_data     jsonb,
  after_data      jsonb,
  ip_address      text,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- 11. インデックス
--   理由: organization_id は全 RLS/クエリの起点。date/location/target は
--         時系列・拠点別・対象別の絞り込みで多用されるため個別に付与
-- =============================================================================

-- organization_id インデックス（RLS と一覧取得の高速化）
create index idx_org_members_org         on public.organization_members(organization_id);
create index idx_org_members_user        on public.organization_members(user_id);
create index idx_locations_org           on public.locations(organization_id);
create index idx_units_org               on public.units(organization_id);
create index idx_ft_categories_org       on public.forecast_target_categories(organization_id);
create index idx_forecast_targets_org    on public.forecast_targets(organization_id);
create index idx_forecast_targets_cat    on public.forecast_targets(category_id);
create index idx_custom_metrics_org      on public.custom_metrics(organization_id);

-- 実績: 組織 + 日付 + 拠点 + 対象で頻繁に絞り込む
create index idx_daily_records_org       on public.daily_records(organization_id);
create index idx_daily_records_date      on public.daily_records(record_date);
create index idx_daily_records_lookup    on public.daily_records(organization_id, location_id, forecast_target_id, record_date);
create index idx_metric_values_org       on public.daily_metric_values(organization_id);
create index idx_metric_values_record    on public.daily_metric_values(daily_record_id);

-- 外部要因/天候/イベント
create index idx_external_factors_org    on public.external_factors(organization_id);
create index idx_external_factors_date   on public.external_factors(organization_id, factor_date);
create index idx_recurring_events_org    on public.recurring_events(organization_id);
create index idx_events_org              on public.events(organization_id);
create index idx_events_date             on public.events(organization_id, start_date);
create index idx_weather_records_org     on public.weather_records(organization_id);
create index idx_weather_records_date    on public.weather_records(organization_id, weather_date);

-- 予測
create index idx_forecasts_org           on public.forecasts(organization_id);
create index idx_forecasts_lookup        on public.forecasts(organization_id, location_id, forecast_target_id, target_date);
create index idx_forecast_components_fc   on public.forecast_components(forecast_id);
create index idx_forecast_components_org  on public.forecast_components(organization_id);
create index idx_forecast_adjustments_fc  on public.forecast_adjustments(forecast_id);
create index idx_forecast_adjustments_org on public.forecast_adjustments(organization_id);
create index idx_forecast_results_org     on public.forecast_results(organization_id);
create index idx_forecast_results_lookup  on public.forecast_results(organization_id, location_id, forecast_target_id, target_date);
create index idx_forecast_accuracy_org    on public.forecast_accuracy(organization_id);
create index idx_forecast_accuracy_period on public.forecast_accuracy(organization_id, period_type, period_start);

-- 欠品/変更履歴
create index idx_stockout_org            on public.stockout_records(organization_id);
create index idx_stockout_lookup         on public.stockout_records(organization_id, location_id, forecast_target_id, record_date);
create index idx_change_histories_org    on public.change_histories(organization_id);
create index idx_change_histories_date   on public.change_histories(organization_id, effective_date);

-- CSV/通知/監査
create index idx_csv_imports_org         on public.csv_imports(organization_id);
create index idx_csv_import_rows_org     on public.csv_import_rows(organization_id);
create index idx_csv_import_rows_import  on public.csv_import_rows(csv_import_id);
create index idx_notifications_org       on public.notifications(organization_id);
create index idx_notifications_user      on public.notifications(user_id, is_read);
create index idx_audit_logs_org          on public.audit_logs(organization_id, created_at);

-- 業種テンプレ
create index idx_industry_templates_ind  on public.industry_templates(industry_id);

-- =============================================================================
-- 12. updated_at トリガー
--   理由: updated_at を持つ全テーブルに set_updated_at を一括で付与
-- =============================================================================
do $$
declare
  t text;
  tables_with_updated_at text[] := array[
    'organizations', 'user_profiles', 'organization_members', 'organization_settings',
    'industries', 'industry_templates', 'locations', 'units',
    'forecast_target_categories', 'forecast_targets', 'custom_metrics',
    'daily_records', 'daily_metric_values', 'external_factors', 'recurring_events',
    'events', 'weather_records', 'forecasts', 'forecast_results', 'forecast_accuracy',
    'stockout_records', 'change_histories', 'csv_imports'
  ];
begin
  foreach t in array tables_with_updated_at loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.update_updated_at();',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- 13. 新規ユーザー登録時に user_profiles を自動作成
--   SECURITY DEFINER 理由: auth スキーマの INSERT トリガーから public への
--   書き込みを行うため。search_path を固定し安全性を確保。
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- ロールバック手順（逆順で実行）:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_user();
--   drop table if exists public.audit_logs, public.notifications, public.csv_import_rows,
--     public.csv_imports, public.change_histories, public.stockout_records,
--     public.forecast_accuracy, public.forecast_results, public.forecast_adjustments,
--     public.forecast_components, public.forecasts, public.weather_records, public.events,
--     public.recurring_events, public.external_factors, public.daily_metric_values,
--     public.daily_records, public.custom_metrics, public.forecast_targets,
--     public.forecast_target_categories, public.units, public.locations,
--     public.industry_templates, public.industries, public.organization_settings,
--     public.organization_members, public.user_profiles, public.organizations cascade;
--   drop function if exists public.update_updated_at();
--   drop type if exists public.accuracy_period, public.csv_import_status, public.change_type,
--     public.recurrence_type, public.metric_data_type, public.organization_role;
-- =============================================================================
