'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, FlaskConical, User as UserIcon } from 'lucide-react';
import { useUser, signOut } from '@/lib/supabase/use-user';

/**
 * ヘッダ右側の認証状態表示。
 * - 未接続/未ログイン: 「お試しモード」+ ログイン/新規登録
 * - ログイン中: メールアドレス + ログアウト
 */
export function AuthStatus() {
  const { loading, user, configured } = useUser();
  const router = useRouter();

  if (loading) {
    return <span className="text-sm text-primary-fg/70">…</span>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-sm text-primary-fg/90 sm:inline-flex">
          <UserIcon className="h-4 w-4" aria-hidden="true" />
          {user.email}
        </span>
        <button
          onClick={async () => {
            await signOut();
            router.push('/');
            router.refresh();
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-primary-fg/30 px-3 text-sm hover:bg-primary-fg/10"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          ログアウト
        </button>
      </div>
    );
  }

  // 未ログイン（お試しモード）
  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 rounded-md bg-primary-fg/15 px-2 py-1 text-xs font-medium text-primary-fg sm:inline-flex">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        お試しモード
      </span>
      {configured ? (
        <>
          <Link
            href="/login"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-primary-fg/10"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            ログイン
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-9 items-center rounded-md bg-primary-fg px-3 text-sm font-medium text-primary hover:opacity-90"
          >
            新規登録
          </Link>
        </>
      ) : (
        <span className="hidden text-xs text-primary-fg/60 md:inline">
          （クラウド保存は準備中）
        </span>
      )}
    </div>
  );
}
