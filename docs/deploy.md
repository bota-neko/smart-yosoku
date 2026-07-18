# Vercel デプロイ手順（公開URLを作る）

このアプリを Vercel にデプロイして、誰でもアクセスできる公開URLを作る手順です。
Supabase（クラウド保存）はすでに接続済みなので、環境変数を Vercel に設定するだけで動きます。

> **秘密情報について**: `.env.local`（Supabaseキー）は Git 管理外なので **push しても漏れません**。
> キーは Vercel の環境変数に別途設定します。

---

## 前提
- GitHub アカウント
- Vercel アカウント（無料。GitHubでログイン可）
- Supabase プロジェクト（作成済み・マイグレーション実行済み）

---

## 手順A：GitHub 経由でデプロイ（おすすめ・自動デプロイ）

### 1. GitHub にリポジトリを作成
GitHub で **New repository** →（Private でも Public でもOK）→ 作成。
（README等は追加しないでください。空のリポジトリでOK）

### 2. コードを push
このプロジェクトのフォルダで、GitHub が表示するURLを使って：

```bash
git remote add origin https://github.com/<あなた>/<リポジトリ名>.git
git branch -M main
git push -u origin main
```

（初回コミットはこちらで用意済みです。上の3行で push できます）

### 3. Vercel でインポート
1. Vercel ダッシュボード → **Add New… > Project**
2. さきほどの GitHub リポジトリを **Import**
3. Framework Preset は **Next.js**（自動検出）でOK

### 4. 環境変数を設定（重要）
Import 画面の **Environment Variables** に、`.env.local` と同じ値を追加：

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://csbgejtoqaonhcusfktt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...`（Publishable key） |

→ **Deploy** を押す。数分で `https://<プロジェクト>.vercel.app` が発行されます。

### 5. Supabase 側にURLを登録
Supabase → **Authentication > URL Configuration**：
- **Site URL** に発行された Vercel の本番URL（`https://xxx.vercel.app`）を設定
- **Redirect URLs** にも同じURLを追加

（メール確認をオンにした場合の戻り先や、認証の基準URLになります）

### 6. 動作確認
公開URLを開いて：新規登録 → 空から始まる → 商品・卸先を登録 → 再読み込みで保存されていればOK。

---

## 手順B：Vercel CLI（GitHub不要・手早く試す）

```bash
npm i -g vercel
vercel login          # ブラウザで認証
vercel                # 初回はプロジェクト作成 → デプロイ
# 環境変数を設定：
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod         # 本番デプロイ
```

その後、手順A-5（Supabaseへ本番URL登録）を行ってください。

---

## よくあるつまずき
- **ログインできない／保存されない** → Vercel の環境変数が未設定、または Supabase の Site URL 未設定が多いです。
- **画面が真っ白／崩れる** → 環境変数を設定後、Vercel で **Redeploy**（環境変数は再ビルドで反映）。
- **秘密鍵を push してしまった** → このプロジェクトは `.env.local` を `.gitignore` 済みなので通常は起きません。
- 本番で「お試しモード」しか出ない → `NEXT_PUBLIC_*` の環境変数が Vercel に無い状態です。設定して Redeploy。
