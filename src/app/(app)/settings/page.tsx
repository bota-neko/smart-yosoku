'use client';

import Link from 'next/link';
import { ChevronRight, Package, Store, MapPin } from 'lucide-react';
import { ApiKeyCard } from '@/components/features/settings/api-key-card';
import { AreaSetting } from '@/components/features/factors/area-setting';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations } from '@/lib/locations-store';

/** 設定：商品・お店・地域・APIキーをここにまとめる。 */
export default function SettingsPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const nProd = activeProducts(products).length;
  const nLoc = activeLocations(locations).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">商品とお店</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          <SettingLink href="/products" icon={<Package className="h-5 w-5 text-primary" aria-hidden="true" />} label="商品" note={`${nProd} 品目`} />
          <SettingLink href="/locations" icon={<Store className="h-5 w-5 text-primary" aria-hidden="true" />} label="お店（卸先）" note={`${nLoc} 店`} />
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          地域（天気の自動取得に使います）
        </h2>
        <AreaSetting />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">納品書の読み取り</h2>
        <ApiKeyCard />
      </section>
    </div>
  );
}

function SettingLink({ href, icon, label, note }: { href: string; icon: React.ReactNode; label: string; note: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center justify-between gap-3 px-4 text-lg hover:bg-muted-bg">
        <span className="inline-flex items-center gap-3">
          {icon}
          {label}
        </span>
        <span className="inline-flex items-center gap-1 text-base text-muted">
          {note}
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}
