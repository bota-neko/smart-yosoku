'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cleanupLegacyStorage } from '@/lib/demo-data';
import {
  LayoutDashboard,
  PencilLine,
  TrendingUp,
  Target,
  Factory,
  Store,
  Package,
  Coins,
  CalendarRange,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * サイドナビ。現在地を pathname で判定してハイライトする。
 * usePathname を使うため Client Component。
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/products', label: '商品管理', icon: Package },
  { href: '/locations', label: '卸先管理', icon: Store },
  { href: '/input', label: '納品入力', icon: PencilLine },
  { href: '/summary', label: '製造計画（合計予測）', icon: Factory },
  { href: '/weekly', label: '週間予測', icon: CalendarRange },
  { href: '/forecast', label: '予測詳細', icon: TrendingUp },
  { href: '/loss', label: 'ロス・効果', icon: Coins },
  { href: '/accuracy', label: '予測精度', icon: Target },
];

export function AppNav() {
  const pathname = usePathname();

  // アプリ起動時に、使われなくなった旧バージョンの保存データを一度だけ掃除する
  useEffect(() => {
    cleanupLegacyStorage();
  }, []);

  return (
    <nav aria-label="メインナビゲーション" className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        // 前方一致で現在セクションを判定（/forecast/xxx も「予測詳細」を選択状態に）
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 text-base transition-colors',
              active
                ? 'bg-primary text-primary-fg'
                : 'text-foreground hover:bg-muted-bg',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
