import Link from 'next/link';
import { PackageSearch, ArrowRight, FlaskConical, CloudUpload } from 'lucide-react';

/**
 * ランディング（入口）。
 * 「お試しで使う（ログイン不要）」と「アカウント（クラウド保存）」の2つの入口を提示する。
 * Supabase 未接続のときはお試しのみ表示（アカウントは準備中）。
 */
export default function LandingPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-14 items-center gap-2 border-b border-border bg-primary px-5 text-primary-fg">
        <PackageSearch className="h-6 w-6" aria-hidden="true" />
        <span className="text-lg font-semibold">smart-yosoku</span>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-5 py-16 text-center">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
          毎日の納品を記録して、
          <br className="hidden sm:block" />
          明日つくる数をらくに決める
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          過去の実績と、曜日・天気・特売・イベント・祝日から、明日以降に必要な数量を予測します。
          豆腐店・パン店・弁当店・小売店など、業種を問わず使えます。
        </p>

        <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {/* お試し */}
          <div className="flex flex-col rounded-lg border border-border bg-surface p-6 text-left shadow-card">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              お試し（ログイン不要）
            </span>
            <p className="mt-2 flex-1 text-sm text-muted">
              見本データですぐに全機能を試せます。データはこのブラウザに保存されます。
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 font-medium text-primary-fg hover:opacity-90"
            >
              お試しで使ってみる
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {/* アカウント */}
          <div className="flex flex-col rounded-lg border border-border bg-surface p-6 text-left shadow-card">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
              アカウント（クラウド保存）
            </span>
            <p className="mt-2 flex-1 text-sm text-muted">
              登録すると、自分のデータをクラウドに保存。どの端末からでも続きから使えます。
            </p>
            {configured ? (
              <div className="mt-4 flex gap-2">
                <Link
                  href="/signup"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-fg hover:opacity-90"
                >
                  新規登録
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-border px-4 font-medium hover:bg-muted-bg"
                >
                  ログイン
                </Link>
              </div>
            ) : (
              <p className="mt-4 rounded-md bg-muted-bg px-3 py-2 text-sm text-muted">
                クラウド保存は準備中です（Supabase接続後に有効化されます）。
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
