# smart-yosoku データベース設計

需要予測・必要数量予測 SaaS「smart-yosoku」の PostgreSQL / Supabase スキーマ仕様です。
Next.js App Router + Supabase Auth 構成、マルチテナント（組織単位で完全分離）を前提としています。

## マイグレーション構成

| ファイル | 内容 |
|---|---|
| `supabase/migrations/0001_schema.sql` | 全テーブル・enum 型・制約・インデックス・updated_at/新規ユーザートリガー |
| `supabase/migrations/0002_rls.sql` | RLS 有効化・権限判定ヘルパー関数・全ポリシー |
| `supabase/migrations/0003_functions.sql` | 組織作成ブートストラップ・所属判定・CSV ロールバック関数 |

適用順は 0001 → 0002 → 0003。順に流せば通る前提で書いています（冪等ではありません）。

---

## マルチテナントの基本方針

- 全業務テーブルに **`organization_id`（FK → `organizations`）** を持たせる。
- データ分離は **RLS（Row Level Security）** で強制する。アプリ側の WHERE 句に依存しない。
- 「**デフォルト拒否・明示的に許可**」を徹底。RLS 有効化した時点でポリシーが無ければ全拒否。
- 他組織のデータには一切アクセスできない。

### ロール（`organization_members.role`）

権限の強い順に 4 段階。enum 型 `organization_role`。

| ロール | 説明 | 主な権限 |
|---|---|---|
| `owner` | 組織オーナー | 全操作 + 組織削除 |
| `admin` | 管理者 | 組織設定・メンバー管理・全業務データ |
| `staff` | 一般担当者 | 業務データの読み書き |
| `viewer` | 閲覧者 | 業務データの閲覧のみ（書込不可） |

---

## テーブル一覧

### 組織・ユーザー・権限

| テーブル | 説明 | 主なFK |
|---|---|---|
| `organizations` | 組織（テナントの最上位） | created_by → auth.users |
| `user_profiles` | ユーザープロフィール（auth.users と 1:1） | id → auth.users |
| `organization_members` | 組織メンバー + ロール（多対多） | organization_id, user_id |
| `organization_settings` | 組織ごとの設定（1 組織 1 レコード） | organization_id, industry_id, default_location_id |

### マスタ（グローバル）

| テーブル | 説明 |
|---|---|
| `industries` | 業種マスタ（全テナント共通・参照専用） |
| `industry_templates` | 業種テンプレ（単位・指標・許容誤差プリセット、JSON 保持） |

### 組織内マスタ

| テーブル | 説明 | 主なFK |
|---|---|---|
| `locations` | 拠点（店舗/工場/学校） | organization_id |
| `units` | 単位（個/食/本/箱/kg/人/件/時間 等、組織ごと自由設定） | organization_id |
| `forecast_target_categories` | 予測対象カテゴリ（親子構造可） | organization_id, parent_id |
| `forecast_targets` | 予測対象（商品/メニュー/サービス） | organization_id, category_id, unit_id |
| `custom_metrics` | カスタム指標（任意実績値の定義） | organization_id, unit_id |

### 実績

| テーブル | 説明 | 主なFK / 制約 |
|---|---|---|
| `daily_records` | 日次実績（納品/販売/製造/発注/在庫/廃棄/来客 等） | location_id, forecast_target_id / unique(record_date, location_id, forecast_target_id) |
| `daily_metric_values` | カスタム指標の実績値 | daily_record_id, custom_metric_id / unique(daily_record_id, custom_metric_id) |

`daily_records` の数値カラムは **すべて NULL 許容**。これは **NULL=未入力 / 0=ゼロ実績** を明確に区別するため。

### 外部要因

| テーブル | 説明 |
|---|---|
| `external_factors` | 日次の外部要因（天候・気温・降水確率・特売/キャンペーン/ポイントデー/祝日フラグ） |
| `recurring_events` | 繰り返しイベント定義（今回のみ/毎週/毎月/毎年） |
| `events` | 個別イベント（地域/店舗/学校）。recurring_events から生成可 |
| `weather_records` | 天候実績（外部 API 等からの観測値） |

### 予測

| テーブル | 説明 |
|---|---|
| `forecasts` | 予測本体（base_demand / adjusted_demand / recommended_quantity / range_low・high / confidence_level・score） |
| `forecast_components` | 予測の内訳（基礎/曜日/天候/イベント/トレンド等の寄与） |
| `forecast_adjustments` | 予測への補正（manual/rule/event/safety_stock） |
| `forecast_results` | 予測 vs 実績（diff/abs_error/error_rate/over_under は生成列） |
| `forecast_accuracy` | 精度集計（期間・拠点・対象別に mae/wape/mape/rmse/bias/hit_rate） |

`forecast_results` の `diff` `abs_error` `error_rate` `over_under` は **生成列（GENERATED ALWAYS ... STORED）** で自動計算します。`within_tolerance` / `tolerance_band` は組織設定の許容誤差に依存するためアプリ側で判定して保存します。

### 欠品・変更履歴

| テーブル | 説明 |
|---|---|
| `stockout_records` | 欠品/売切記録（sold_out/sold_out_time/additional_order/additional_qty/estimated_stockout/lost_sales） |
| `change_histories` | 変更履歴（価格変更/リニューアル/開店/閉店/移転）。予測傾向の断絶点として利用。change_type + effective_date |

### CSV 取込

| テーブル | 説明 |
|---|---|
| `csv_imports` | 取込履歴（status: pending/processing/completed/failed/rolled_back、件数、rolled_back_at） |
| `csv_import_rows` | 取込各行（raw_data、created_record_type/id でロールバック追跡） |

### 通知・監査

| テーブル | 説明 |
|---|---|
| `notifications` | 通知（user_id NULL = 組織全体宛て） |
| `audit_logs` | 監査ログ（追記のみ・不変。UPDATE/DELETE 不可） |

---

## ER 概要

```
auth.users ─┬─ user_profiles (1:1)
            └─ organization_members ─┐
                                     │
organizations ─┬────────────────────┘
               ├─ organization_settings (1:1)
               ├─ locations ─┐
               ├─ units ─────┤
               ├─ forecast_target_categories ─ forecast_targets
               │                                  │
               ├─ custom_metrics                  │
               │                                  │
               ├─ daily_records ◀ location + forecast_target
               │      └─ daily_metric_values ◀ custom_metrics
               │
               ├─ external_factors / weather_records / events / recurring_events
               │
               ├─ forecasts ─┬─ forecast_components
               │             ├─ forecast_adjustments
               │             └─ forecast_results ─ forecast_accuracy
               │
               ├─ stockout_records / change_histories
               ├─ csv_imports ─ csv_import_rows
               └─ notifications / audit_logs
```

---

## RLS 方針の詳細

### 権限判定ヘルパー関数（0002_rls.sql）

すべて **SECURITY DEFINER**。`organization_members` を参照する際に呼び出し元テーブルの RLS を
再評価させないことで **無限再帰を防止** します（definer 権限で RLS をバイパスして所属を判定）。
`stable` + `search_path = public` 固定でパフォーマンスと安全性を確保。

| 関数 | 戻り値 | 用途 |
|---|---|---|
| `is_org_member(org uuid)` | boolean | 指定組織のメンバーか |
| `has_role(org uuid, roles text[])` | boolean | 指定ロール群のいずれかを持つか |
| `can_write(org uuid)` | boolean | owner/admin/staff か（viewer は false） |
| `can_manage(org uuid)` | boolean | owner/admin か |
| `shares_org(target_user uuid)` | boolean | 対象ユーザーと組織を共有するか（プロフィール相互参照用） |

### 標準業務テーブルのポリシー

`organization_id` を持つ全業務テーブルに、以下の共通パターンを一括適用（DO ループ）。

| 操作 | 条件 |
|---|---|
| SELECT | `is_org_member(organization_id)` — 所属組織のデータのみ（viewer 含む全員） |
| INSERT | `can_write(organization_id)` — staff 以上 |
| UPDATE | `can_write(organization_id)`（USING と WITH CHECK 両方） |
| DELETE | `can_write(organization_id)` |

### 特別扱いのテーブル

| テーブル | ポリシー要点 |
|---|---|
| `organizations` | SELECT=所属者 / INSERT=本人が created_by / UPDATE=owner・admin / DELETE=owner のみ |
| `organization_members` | SELECT=同組織全員 / 追加・更新・削除=owner・admin のみ |
| `organization_settings` | SELECT=所属者 / 変更=owner・admin のみ |
| `user_profiles` | SELECT=本人 or 同組織メンバー / 変更=本人のみ |
| `notifications` | SELECT=自分宛て or 組織全体宛て / UPDATE=本人（既読化） |
| `audit_logs` | SELECT=owner・admin / INSERT=所属者 / UPDATE・DELETE=不可（不変） |
| `industries` / `industry_templates` | SELECT=認証済み全員（共通マスタ） / 書込=service_role のみ |

### 「鶏と卵」問題への対処（組織作成）

`organization_members` の INSERT は `can_manage`（既存の owner/admin）を要求するため、
最初のオーナー登録ができません。これを解決するため、**`create_organization(name, slug)`**
（SECURITY DEFINER）で「組織作成 → 自分を owner 登録 → 既定設定作成」を
アトミックに実施します。クライアントはこの関数経由でのみ新規組織を作成します。

```sql
select * from public.create_organization('わたしの店', 'my-shop');
```

### その他の便利関数（0003_functions.sql）

| 関数 | 用途 |
|---|---|
| `current_org_ids()` | 現在ユーザーの所属組織 id 一覧（組織セレクタ用） |
| `current_role_in(org)` | 指定組織での自分のロール（UI 出し分け用。最終判定は RLS） |
| `rollback_csv_import(import_id)` | CSV 取込のロールバック（権限チェック後、作成行を削除） |

---

## 命名・共通ルール

- テーブル名: snake_case。カラム: snake_case。外部キー: `<単数形>_id`。
- 主キー: `id uuid default gen_random_uuid()`（`user_profiles` のみ auth.users と共有する id）。
- 時刻列は **`timestamptz`**（タイムゾーン対応）。日付は `date`。
- 全テーブルに `created_at`。更新のあるテーブルに `updated_at`（`set_updated_at` トリガーで自動更新）。
- 外部キーは `ON DELETE` を明示（CASCADE=親削除で連動 / SET NULL=参照だけ外す）。

## インデックス方針

- 全テーブルの `organization_id` にインデックス（RLS と一覧取得の起点）。
- 時系列・拠点別・対象別の絞り込み用に `(organization_id, ..., date)` の複合インデックス。
- 外部キー（`forecast_id`, `daily_record_id`, `csv_import_id` 等）にインデックス。

## 型生成（frontend / backend 共有）

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

テーブル変更後は必ず再生成し、生成物は手動編集しないこと。

## 新規ユーザー登録時の自動処理

`auth.users` への INSERT を契機に `handle_new_user()`（SECURITY DEFINER）が
`user_profiles` を自動作成します（display_name はメタデータ or メールのローカル部）。
