'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Camera, Settings, Store } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WeeklyTable } from '@/components/features/plan/weekly-table';
import {
  computeProductSummaryFor,
  getToday,
  getTomorrow,
  type ProductSummary,
} from '@/lib/sample-data';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useDeliveries, historyFromMap } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap, WEATHER_LABELS } from '@/lib/factors-store';
import { useRestDays, isRestDay } from '@/lib/rest-days-store';
import { formatNumber } from '@/lib/utils';
import { dowLabel } from '@/domain';

/**
 * ホーム：あした作る数。
 * 商品ごとに「全てのお店へ卸す数の合計＝作る数」を大きく出す。
 * お店ごとの内訳・根拠は、開いたときだけ見せる。
 */
export default function PlanPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map } = useDeliveries();
  const { map: factorMap, getFactors } = useFactors();
  const { map: restMap } = useRestDays();
  const [view, setView] = useState<'tomorrow' | 'week'>('tomorrow');

  const today = getToday();
  const tomorrow = getTomorrow();
  const prods = activeProducts(products);
  const locs = activeLocations(locations);
  const factorsByDate = toDailyFactorsMap(factorMap);
  const getHistory = (locId: string, prodId: string) => historyFromMap(map, locId, prodId, factorsByDate);

  const summaries = prods
    .map((p) =>
      computeProductSummaryFor(
        p,
        // 明日「休み」のお店は作る数に含めない
        locs.filter((l) => handlesProduct(l, p.id) && !isRestDay(restMap, tomorrow, l.id)),
        tomorrow,
        getHistory,
        factorsByDate[tomorrow],
      ),
    )
    .filter((s) => s.stores.length > 0);

  // きょうの納品がまだのお店（休み・店休日は除く）
  const notRecorded = getFactors(today).closed
    ? 0
    : locs.filter(
        (l) =>
          !isRestDay(restMap, today, l.id) &&
          prods.some((p) => handlesProduct(l, p.id)) &&
          !prods.some((p) => handlesProduct(l, p.id) && map[`${today}|${l.id}|${p.id}`] != null),
      ).length;

  const f = getFactors(tomorrow);
  const dayNotes = [
    f.weather ? `${WEATHER_LABELS[f.weather]}${f.tempHigh != null ? ` ${f.tempHigh}℃` : ''}` : null,
    f.isHoliday ? '祝日' : null,
    f.sale ? '特売' : null,
    f.event ? 'イベント' : null,
    f.closed ? '店休日' : null,
  ].filter(Boolean);
  const [, m, d] = tomorrow.split('-').map(Number);

  if (prods.length === 0 || locs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">あした作る数</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-lg">まず、作っている商品と卸しているお店を登録しましょう。</p>
            <Link href="/settings">
              <Button>
                <Settings className="h-5 w-5" aria-hidden="true" />
                設定で登録する
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">あした作る数</h1>
        <p className="text-muted">
          {m}月{d}日（{dowLabel(tomorrow)}）{dayNotes.length > 0 ? `・${dayNotes.join('・')}` : ''}
        </p>
      </header>

      {notRecorded > 0 ? (
        <Link
          href="/input"
          className="flex items-center justify-between gap-3 rounded-md border border-state-warn bg-state-warn/10 px-4 py-3 text-base"
        >
          <span className="inline-flex items-center gap-2">
            <Camera className="h-5 w-5 text-state-warn" aria-hidden="true" />
            きょうの納品がまだのお店が {notRecorded} 店あります
          </span>
          <span className="inline-flex items-center text-primary">
            記録する
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="group" aria-label="表示する期間">
        {(
          [
            ['tomorrow', '明日'],
            ['week', '1週間'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`min-h-10 rounded px-5 text-base font-medium ${
              view === key ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-muted-bg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'week' ? (
        <WeeklyTable days={7} />
      ) : (
        <>
          {summaries.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted">
                明日はすべてのお店が休み（または店休日）です。
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {summaries.map((s) => (
                <ProductRow key={s.product.id} summary={s} />
              ))}
            </ul>
          )}
          <p className="text-sm text-muted">
            天気・特売・祝日を反映し、売り切れないよう少し多めの数にしています。商品を押すとお店ごとの内訳が見られます。
          </p>
        </>
      )}
    </div>
  );
}

/** 1商品ぶん：作る数を大きく。押すとお店ごとの内訳を開く。 */
function ProductRow({ summary }: { summary: ProductSummary }) {
  const { product } = summary;
  const num = (n: number) => formatNumber(n, product.allowDecimal ? 2 : 0);
  return (
    <li>
      <details className="group rounded-lg border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-lg font-medium">
            <ChevronDown
              className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            {product.name}
          </span>
          <span className="tabular text-right">
            <span className="text-4xl font-extrabold leading-none text-recommend">{num(summary.totalRecommended)}</span>
            <span className="ml-1.5 text-base text-muted">{product.unit}</span>
          </span>
        </summary>
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-sm text-muted">お店ごとの内訳</p>
          <ul className="divide-y divide-border">
            {summary.stores.map((s) => (
              <li key={s.targetId}>
                <Link
                  href={`/forecast/${s.targetId}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted-bg/50"
                  aria-label={`${s.location.name}へ ${num(s.shipUnits)}${product.unit}。見込みの根拠を見る`}
                >
                  <span className="inline-flex items-center gap-2 text-base">
                    <Store className="h-4 w-4 text-muted" aria-hidden="true" />
                    {s.location.name}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular text-base">
                    <span className="font-semibold">{num(s.shipUnits)}</span>
                    <span className="text-sm text-muted">{product.unit}</span>
                    {s.cases != null ? <span className="text-sm text-muted">（{s.cases}ケース）</span> : null}
                    <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">
            見込みの幅：{num(summary.totalRangeLow)}〜{num(summary.totalRangeHigh)}
            {product.unit}（お店を押すと、見込みの根拠が見られます）
          </p>
        </div>
      </details>
    </li>
  );
}
