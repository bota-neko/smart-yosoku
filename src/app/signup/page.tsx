'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PackageSearch, UserPlus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/use-user';

/** 新規登録（メール＋パスワード）。 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'confirm' | 'signedin' | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください。');
      return;
    }
    setBusy(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(
          /already registered/i.test(err.message)
            ? 'このメールアドレスは既に登録されています。ログインしてください。'
            : err.message,
        );
      } else if (data.session) {
        // メール確認オフ → そのままログイン状態
        setDone('signedin');
        router.push('/dashboard');
        router.refresh();
      } else {
        // メール確認オン → 確認メール送信
        setDone('confirm');
      }
    } catch {
      setError('登録に失敗しました。時間をおいて再度お試しください。');
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-lg font-semibold text-primary">
        <PackageSearch className="h-6 w-6" aria-hidden="true" />
        smart-yosoku
      </Link>

      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-card">
        <h1 className="text-xl font-bold">新規登録</h1>

        {!configured ? (
          <p className="mt-4 rounded-md bg-muted-bg px-3 py-2 text-sm text-muted">
            クラウド保存は準備中です。<Link href="/dashboard" className="text-primary hover:underline">お試しモード</Link>はログイン不要で使えます。
          </p>
        ) : done === 'confirm' ? (
          <p className="mt-4 flex items-start gap-1.5 rounded-md bg-muted-bg px-3 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-state-good" aria-hidden="true" />
            確認メールを送信しました。メール内のリンクを開くと登録が完了します。
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-muted">メールアドレス</label>
              <input
                id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-muted">パスワード（6文字以上）</label>
              <input
                id="password" type="password" autoComplete="new-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            {error ? (
              <p className="flex items-start gap-1.5 text-sm text-state-bad">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <button
              type="submit" disabled={busy}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {busy ? '登録中…' : 'アカウントを作成'}
            </button>
          </form>
        )}

        <p className="mt-4 text-sm text-muted">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-primary hover:underline">ログイン</Link>
        </p>
      </div>
    </div>
  );
}
