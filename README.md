# smart-yosoku — 汎用 需要予測・必要数量予測 Webサービス

過去の実績データと外部要因（曜日・天候・気温・祝日・イベント・特売・キャンペーン）から、
翌日以降に必要な数量を予測する **業種非依存** のSaaSです。
製造数・発注数・仕込み量・納品数・在庫補充・来客数・予約数・必要スタッフ数・作業件数などを
共通の枠組みで予測します。デモではなく、**データ登録 → 予測算出 → 予測と実績の差の記録 → 継続改善**
まで運用できることを目標に設計しています。

初期サンプルは食品製造業（豆腐店＝さつま食品株式会社）です。

---

## 目次
1. [技術構成](#技術構成)
2. [セットアップ手順](#セットアップ手順)
3. [環境変数一覧](#環境変数一覧)
4. [Supabase構築手順](#supabase構築手順)
5. [マイグレーション・シード投入](#マイグレーションシード投入)
6. [ローカル起動・テスト](#ローカル起動テスト)
7. [予測ロジックの説明](#予測ロジックの説明)
8. [データベース設計](#データベース設計)
9. [権限設計](#権限設計)
10. [CSV仕様](#csv仕様)
11. [Vercelデプロイ](#vercelデプロイ)
12. [置いた仮定・既知の制約](#置いた仮定既知の制約)
13. [今後の拡張案](#今後の拡張案)

---

## 技術構成
| 領域 | 採用 |
|---|---|
| フレームワーク | Next.js 14 (App Router) + TypeScript |
| DB / 認証 | Supabase (PostgreSQL 15 + Auth + RLS) |
| スタイル | Tailwind CSS + shadcn/ui 風の自前UIプリミティブ |
| フォーム / 検証 | React Hook Form + Zod |
| グラフ | Recharts |
| テスト | Vitest（単体・結合） / Playwright（E2E） |
| デプロイ | Vercel（フロント）/ Supabase（DB・認証） |

**設計の要**: 予測ロジックは UI から完全分離し `src/domain/` に純粋関数として実装。
`ForecastEngine` インターフェースを介するため、将来 Python/FastAPI/Prophet/LightGBM へ差し替え可能。

---

## セットアップ手順

```bash
# 1. 依存インストール
npm install

# 2. 環境変数
cp .env.example .env.local
#  → NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を設定
#    （シード投入や管理操作を行う場合は SUPABASE_SERVICE_ROLE_KEY も）

# 3. 型チェック・単体テスト（Supabaseなしで実行可能）
npm run typecheck
npm run test

# 4. 予測パイプラインのエンドツーエンド検証（Supabase不要）
npx tsx scripts/verify-pipeline.ts

# 5. 開発サーバー
npm run dev   # http://localhost:3000
```

> **Supabase を設定しなくても** 予測エンジン・精度計算・シード生成・E2E検証は動きます
> （`scripts/verify-pipeline.ts`）。UI画面もサンプルデータでエンジン計算結果を表示します。

---

## 環境変数一覧
| 変数 | 必須 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ○（DB利用時） | Supabase プロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ○（DB利用時） | 匿名キー（RLS適用下で使用） |
| `SUPABASE_SERVICE_ROLE_KEY` | シード/管理時 | サービスロールキー。**サーバー専用・クライアントに露出禁止** |
| `WEATHER_API_PROVIDER` / `WEATHER_API_KEY` | 任意 | 天気自動取得。未設定なら手動入力にフォールバック |
| `HOLIDAY_API_PROVIDER` / `HOLIDAY_COUNTRY` | 任意 | 祝日自動取得。未設定なら手動入力 |
| `CSV_MAX_UPLOAD_BYTES` | 任意 | CSV取込みの上限バイト数（既定5MB） |

秘密情報はコードに直書きせず、必ず環境変数で管理します。

---

## Supabase構築手順
1. [supabase.com](https://supabase.com) でプロジェクトを作成。
2. **Project Settings > API** から URL / anon key / service_role key を取得し `.env.local` へ。
3. **Authentication > Providers** で Email を有効化（初期版はメール+パスワード認証）。
4. SQL Editor で下記マイグレーションを順に実行（または Supabase CLI）。

## マイグレーション・シード投入
`supabase/migrations/` を番号順に SQL Editor へ貼り付けて実行します。

```
0001_schema.sql     -- テーブル・型・インデックス・制約
0002_rls.sql        -- RLS 有効化 + ポリシー + ヘルパー関数
0003_functions.sql  -- 補助関数
```

シードデータ:
```bash
# Supabase 未設定: supabase/seed/seed-data.json を生成（オフライン確認用）
npm run seed

# 生成物: 拠点4 × 予測対象5 × 400日 = 8,000 実績レコード
#   夏の冷奴/冬の鍋/年末年始/お盆/雨天/台風/特売/イベント/欠品/廃棄/異常値 を含む
```
Supabase 接続時の投入手順は [docs/setup.md](docs/setup.md) を参照。

---

## ローカル起動・テスト
```bash
npm run dev         # 開発サーバー
npm run build       # 本番ビルド
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run test        # Vitest（単体・結合）
npm run test:e2e    # Playwright（E2E。dev/preview サーバー要）
```

---

## 予測ロジックの説明
詳細は [docs/forecast-logic.md](docs/forecast-logic.md)。要点:

- **加重アンサンブル**（説明可能・非ブラックボックス）:
  直近7/14/28日平均・前週同曜日・過去4週同曜日平均・前年同日・前年同時期・
  直近トレンド・月別/季節係数 を、**データ蓄積期間に応じた重み**で合成。
- **蓄積期間別の動作**: 7日未満=参考値 / 7〜30日=直近平均+曜日 / 1〜3か月=+気温天候 /
  3か月〜1年=+月別季節イベント / 1年以上=前年比較重視 / 2年以上=複数年季節性。
  新しいデータを優先し、構造変化（価格改定・改装等）後のデータを優先。
- **補正**: 天候・気温・特売・キャンペーン・イベント・祝日・店休日。特売等は履歴から倍率を学習。
- **推奨数** = 予測需要 + 安全分 − 現在庫 − 既発注（下限0）。
- **説明可能AI**: 各要素・補正の寄与を保存し、日本語の理由文を自動生成
  （例「特売予定のため68増補正しました」）。
- **信頼度**（高い/標準/低い/参考値）: データ日数・欠損率・直近誤差・異常値・新規性から算出し、
  低い場合は理由も表示。
- **精度指標**: MAE / WAPE / MAPE / RMSE / Bias / 許容誤差内的中率。
  MAPE は実績0の行を除外しゼロ除算を回避、主指標は WAPE。
  画面表示は「予測精度」「平均誤差」「的中率」など平易な名称。
- **NaN/Infinity は全経路でガード**（`src/domain/math.ts`）。

将来 `ForecastEngine` 実装を Python/Prophet/LightGBM/外部AI へ差し替え可能。

---

## データベース設計
詳細は [docs/database.md](docs/database.md)。組織・拠点・予測対象・実績・外部要因・イベント・
予測・予測内訳・補正・予測結果・精度・欠品・変更履歴・CSV取込・通知・監査ログ・組織設定 の各テーブル。
全業務テーブルに `organization_id` を持ち、**Supabase RLS で組織単位に完全分離**。

## 権限設計
オーナー / 管理者 / 一般担当者 / 閲覧のみ の4ロール。
判定は `src/lib/permissions.ts`（純粋関数・テスト済み）と RLS ポリシーの二重防御。
- 閲覧のみ: 参照のみ。
- 一般担当者: 実績入力・手動補正。
- 管理者: マスタ・組織設定・メンバー管理。
- オーナー: すべて + 組織削除。

## CSV仕様
詳細は [docs/csv-spec.md](docs/csv-spec.md)。
最低限 **日付・拠点名・予測対象名・実績値** があれば取込み可能。
サンプルCSVダウンロード / 列自動判定 / 手動マッピング / 取込前プレビュー / エラー行表示 /
重複処理（新規追加・上書き・スキップ）/ 取込履歴 / ロールバック可能な設計。

---

## Vercelデプロイ
1. GitHub リポジトリを Vercel に接続。
2. 環境変数（`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ほか）を Vercel に設定。
   `SUPABASE_SERVICE_ROLE_KEY` は **Preview/Production のサーバー環境のみ**。
3. Build Command `next build` / Framework `Next.js`。
4. デプロイ。Supabase 側で本番URLを Auth の Redirect に追加。

---

## 置いた仮定・既知の制約
- **天気/祝日の自動取得**はアダプタ構成のみ用意し、キー未設定時は手動入力にフォールバック。
  実プロバイダ連携（OpenWeatherMap等）の呼び出し実装は環境依存のため差し替え式。
- **予測は説明可能な統計モデル**（加重アンサンブル）。機械学習（Prophet/LightGBM等）は将来拡張。
- サンプルデータは決定論的生成（乱数シード固定）で再現可能。気温は鹿児島を想定した近似値。
- メール通知はアプリ内通知を実装し拡張余地を残す構成。
- E2E は主要フロー（登録→初期設定→実績入力→予測→補正→精度）を対象。
- Supabase を接続しない場合、UI はサンプルデータ + ドメインエンジンで計算表示（永続化なし）。

## 今後の拡張案
- Python/FastAPI + Prophet/LightGBM/XGBoost による予測エンジン差し替え（`ForecastEngine` 契約は維持）。
- Supabase Edge Functions での夜間バッチ予測生成。
- 天気/祝日の実API連携、メール/LINE通知、多言語化（i18n）、モバイルアプリ。
- モデル別成績に基づく重みの自動学習の高度化（対象×拠点×曜日粒度）。
