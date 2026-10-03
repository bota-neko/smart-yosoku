'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cleanupLegacyStorage } from '@/lib/demo-data';
import { ChefHat, Camera, BarChart3, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * メニューは毎日の流れに合わせた4つだけ。
 * 詳しい画面（お店ごとの根拠・ロスの内訳・商品やお店の登録など）は、
 * それぞれの親メニューの中から開き、そのあいだ親メニューを選択状態にする。
 */
interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** この項目を選択状態にする下位ページ */
  also: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'あした作る数', short: '作る数', icon: ChefHat, also: ['/forecast', '/summary', '/weekly'] },
  { href: '/input', label: 'きょうの納品', short: '納品', icon: Camera, also: [] },
  { href: '/review', label: 'ふりかえり', short: 'ふりかえり', icon: BarChart3, also: ['/loss', '/accuracy'] },
  { href: '/settings', label: '設定', short: '設定', icon: Settings, also: ['/products', '/locations'] },
];

function isActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** PC 用：左のサイドメニュー。 */
export function AppNav() {
  const pathname = usePathname();

  // アプリ起動時に、使われなくなった旧バージョンの保存データを一度だけ掃除する
  useEffect(() => {
    cleanupLegacyStorage();
  }, []);

  return (
    <nav aria-label="メインメニュー" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-md px-3 text-lg transition-colors',
              active ? 'bg-primary text-primary-fg' : 'text-foreground hover:bg-muted-bg',
            )}
          >
            <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** スマホ用：画面下のタブ。 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs',
              active ? 'font-semibold text-primary' : 'text-muted',
            )}
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
            <span>{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
