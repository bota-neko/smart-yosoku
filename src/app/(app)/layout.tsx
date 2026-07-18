import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { AppNav } from '@/components/app-nav';
import { AuthStatus } from '@/components/auth-status';
import { CloudSync } from '@/lib/cloud-sync';

/**
 * アプリ本体のシェル（ヘッダ + サイドナビ）。
 * ログイン/新規登録などの認証画面はこのシェルの外側に置く。
 * - モバイルではサイドナビを上部の横スクロールに切り替える。
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <CloudSync />
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-primary px-4 text-primary-fg">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <PackageSearch className="h-6 w-6" aria-hidden="true" />
          <span className="text-lg">smart-yosoku</span>
        </Link>
        <div className="ml-auto">
          <AuthStatus />
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-border bg-surface md:w-60 md:border-b-0 md:border-r">
          <div className="md:sticky md:top-14">
            <AppNav />
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
