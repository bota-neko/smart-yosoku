# manager.md — 需要予測・必要数量予測Webサービス「smart-yosoku」開発統括

Manager（PM/ディレクター）が本開発全体を統括する。自らは方針決定・分割・統合・レビューを行い、
実装は各専門サブエージェントおよび Manager 本体（Claude Code）が分担する。

## 1. プロダクト定義
- 名称: **smart-yosoku（スマート予測）**
- 目的: 過去実績＋外部要因（曜日/天候/気温/祝日/イベント/特売/キャンペーン）から翌日以降の必要数量を予測する汎用SaaS。
- 汎用設計（業種非依存）。初期サンプルは食品製造業（豆腐店＝さつま食品株式会社）。
- 「デモではなく運用できるサービス」＝データ登録→予測算出→予測実績差の記録→継続改善まで動作させる。

## 2. 技術構成（確定）
Next.js 14 (App Router) / TypeScript / Supabase (PostgreSQL + Auth + RLS) /
Tailwind CSS / shadcn/ui / React Hook Form / Zod / Recharts / Vitest / Playwright / Vercel想定。

## 3. サブエージェント役割分担
| 領域 | 担当エージェント | 成果物 |
|---|---|---|
| 要件整理・技術選定・設計 | planner | 要件定義・設計方針（本ファイルへ反映） |
| DB設計・RLS・Auth | supabase | `supabase/migrations/*.sql`, RLSポリシー |
| バックエンド(API/Server Actions/認証権限) | backend | `src/lib/*`, Server Actions, Zodスキーマ |
| 需要予測ロジック（新規専門） | **demand-forecast**（新規作成） | `src/domain/forecast/*` 予測エンジン |
| データ分析・精度/信頼度（新規専門） | **data-analyst**（新規作成） | `src/domain/accuracy/*`, `src/domain/confidence/*` |
| フロントエンド実装 | frontend | `src/app/**` 画面 |
| UI/UX設計 | designer | デザイン仕様（`docs/design.md`） |
| アクセシビリティ（新規専門） | **accessibility**（新規作成） | WCAG 2.2 AAチェック |
| テスト・QA | qa | Vitest/Playwright |
| コードレビュー・SEO | reviewer / seo | 指摘 |
| セキュリティ | security | 脆弱性レビュー |
| デバッグ | debugger | 不具合修正 |
| デプロイ構成 | devops | Vercel/Supabase構成 |

新規作成した専門サブエージェント定義は `.claude/agents/` に配置（demand-forecast.md, data-analyst.md, accessibility.md, ux-researcher.md）。

## 4. 実装方針の要点
- **ドメインロジック分離**: 予測処理はUIから完全分離（`src/domain/`）。純粋関数として単体テスト可能。将来 Python/FastAPI/Prophet/LightGBM へ差し替え可能な `ForecastEngine` インターフェース。
- **予測モデルバージョン管理**: `forecasts.model_version` に保存。
- **説明可能AI**: 各補正の寄与を `forecast_components` に保存し、日本語で理由文を生成。
- **マルチテナント**: 全業務テーブルに `organization_id`。Supabase RLSで組織分離。
- **0と未入力の区別**: 数値は nullable。null=未入力、0=ゼロ実績。
- **MAPEゼロ除算対策**: 実績0の行はMAPEから除外し、代わりにWAPE/MAEを主指標に。

## 5. 実装順序（進捗）
1. [x] 現状確認 / 2. [x] manager依頼 / 3. [x] 役割分担
4. [x] 要件整理 / 5. [x] システム設計 / 6. [x] DB設計 (`supabase/migrations`)
7. [x] 認証・組織・権限（RLS）/ 8. [x] 基本マスタ
9. [x] 実績入力 / 10. [x] CSV取込み設計 / 11. [x] 外部要因
12. [x] 予測エンジン（`src/domain/forecast`）/ 13. [x] 予測結果画面
14. [x] 精度計算（`src/domain/accuracy`）/ 15. [x] ダッシュボード
16. [x] 年間分析 / 17. [x] 効果測定 / 18. [x] 通知
19. [x] テスト（単体・E2E）/ 20. [x] セキュリティレビュー / 21. [x] UIレビュー
22. [x] 不具合修正 / 23. [x] ドキュメント / 24. [x] 最終確認

## 6. 統合レビュー観点（Managerチェックリスト）
- 仕様矛盾なし / 実装漏れなし / RLSで他組織アクセス不可 / UI整合 / NaN・Infinity非発生 /
  色のみ依存の状態表示なし / 予測理由が一般利用者向け / ドキュメントだけで再現可能。

## 7. 既知の制約（READMEにも記載）
- 天気/祝日の外部API連携はアダプタ実装（キー未設定時は手動入力へフォールバック）。
- 予測は説明可能な統計モデル（加重アンサンブル）。ML置換は将来拡張。
