# セットアップ詳細（Supabase接続・シード投入）

## 1. Supabase プロジェクト作成
1. Supabase で新規プロジェクト作成。リージョンは日本（Tokyo）推奨。
2. Project Settings > API から取得し `.env.local` に設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`（サーバー専用）

## 2. スキーマ・RLS 適用
SQL Editor で以下を **番号順** に実行:
```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_functions.sql
```
または Supabase CLI:
```bash
supabase link --project-ref <ref>
supabase db push
```

## 3. 認証設定
- Authentication > Providers > Email を有効化。
- ローカル確認時は「Confirm email」をオフにすると検証が容易。
- 本番は Redirect URL に Vercel の本番 URL を追加。

## 4. シードデータ
### オフライン（DB不要）
```bash
npm run seed   # supabase/seed/seed-data.json を生成（8,000実績）
```

### Supabase へ投入
1. まずアプリで新規登録 → 組織「さつま食品株式会社」を作成（初回セットアップ画面）。
2. 業種テンプレート「食品製造」を選択。
3. 拠点（本社工場/中央スーパー/南町マート/北部ストア）と
   予測対象（木綿豆腐/絹ごし豆腐/厚揚げ/油揚げ/おぼろ豆腐）を登録。
4. `supabase/seed/seed-data.json` を **CSV取込み画面** から取り込む
   （日付・拠点名・予測対象名・実績値のマッピングは自動判定）。
   もしくは service role を使う投入スクリプトを `scripts/seed.ts` に実装して実行
   （組織ID・拠点ID・対象IDの解決が必要なため、アプリ登録後の実行を推奨）。

## 5. 動作確認
```bash
npm run typecheck && npm run test
npx tsx scripts/verify-pipeline.ts   # 予測→精度のE2E検証（Supabase不要）
npm run dev
```

## トラブルシューティング
- **RLSで403/空データ**: ログインユーザーが `organization_members` に登録されているか確認。
- **`SUPABASE_SERVICE_ROLE_KEY が未設定`**: サーバー専用。クライアントバンドルに載せないこと。
- **CSV取込みで拠点/対象が一致しない**: 事前にマスタ登録した名称と一致させるか、手動マッピングで調整。
