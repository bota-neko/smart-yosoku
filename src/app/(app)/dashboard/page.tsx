'use client';

import Link from 'next/link';
import { ArrowRight, Boxes, Store, Gauge } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ForecastChart } from '@/components/features/dashboard/forecast-chart';
import {
  computeProductSummaryFor,
  getTomorrow,
  getToday,
  type TrendPoint,
} from '@/lib/sample-data';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useDeliveries, historyFromMap } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { formatNumber } from '@/lib/utils';
import { addDays, dowLabel } from '@/domain';

/**
 * ダッシュボード（クライアント）。
 * 商品・卸先・納品実績の各ストア（唯一のデータ源）から集計・予測して表示する。
 * これにより「製造計画」など他画面と数が完全に一致する。
 */
export default function DashboardPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map } = useDeliveries();
  const { map: factorMap } = useFactors();

  const tomorrow = getTomorrow();
  const activeProds = activeProducts(products);
  const activeLocs = activeLocations(locations);
  const factorsByDate = toDailyFactorsMap(factorMap);
  const getHistory = (locId: string, prodId: string) =>
    historyFromMap(map, locId, prodId, factorsByDate);

  // 商品ごとに、その商品を扱う卸先で予測し合計（製造計画と同じロジック）
  const summaries = activeProds
    .map((p) =>
      computeProductSummaryFor(
        p,
        activeLocs.filter((l) => handlesProduct(l, p.id)),
        tomorrow,
        getHistory,
        factorsByDate[tomorrow],
      ),
    )
    .filter((s) => s.stores.length > 0);

  const productCount = summaries.length;
  const locationCount = activeLocs.length;
  const allStores = summaries.flatMap((s) => s.stores);
  const avgConfidence = allStores.length
    ? Math.round(allStores.reduce((a, s) => a + s.result.confidence.score, 0) / allStores.length)
    : 0;

  const tomorrowDemand = summaries.reduce((a, s) => a + s.totalDemand, 0);
  // 有効な (卸先×商品) の組み合わせ（取扱商品でフィルタ）
  const pairs = activeLocs.flatMap((l) =>
    activeProds.filter((p) => handlesProduct(l, p.id)).map((p) => ({ loc: l.id, prod: p.id })),
  );
  const trend = buildTrend(map, pairs, tomorrowDemand);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-muted">
          明日 {tomorrow}（{dowLabel(tomorrow)}曜日）の見通しと直近の推移
        </p>
      </header>

      {/* 集計カード */}
      <section aria-label="集計" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
          label="商品"
          value={formatNumber(productCount)}
          suffix="品目"
        />
        <SummaryCard
          icon={<Store className="h-5 w-5" aria-hidden="true" />}
          label="卸先（お店）"
          value={formatNumber(locationCount)}
          suffix="件"
        />
        <SummaryCard
          icon={<Gauge className="h-5 w-5" aria-hidden="true" />}
          label="平均の予測の確かさ"
          value={formatNumber(avgConfidence)}
          suffix="/ 100"
        />
      </section>

      {/* 推移グラフ */}
      <Card>
        <CardHeader>
          <CardTitle>売れ数（実績）と予測の推移（直近30日 + 明日）</CardTitle>
          <CardDescription>
            全商品・全卸先の合計。実線が実績、破線が予測です。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForecastChart data={trend} />
        </CardContent>
      </Card>

      {/* 明日の製造数（商品ごとの合計） */}
      <section aria-label="明日の製造数" className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">明日の製造数（商品ごと）</h2>
          <Link
            href="/summary"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            製造計画をくわしく見る
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {summaries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted">
              予測対象がありません。「商品管理」「卸先管理」で登録してください。
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <Link
                key={s.product.id}
                href="/summary"
                className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Card className="h-full transition-colors hover:border-primary">
                  <CardContent className="space-y-3 p-5">
                    <div>
                      <p className="text-lg font-semibold">{s.product.name}</p>
                      <p className="text-sm text-muted">
                        {s.stores.length}卸先へ卸す
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted">合計 製造数（推奨）</p>
                      <p className="tabular text-4xl font-bold text-recommend">
                        {formatNumber(s.totalRecommended, s.product.allowDecimal ? 2 : 0)}
                        <span className="ml-1 text-base font-medium text-foreground">
                          {s.product.unit}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted">
                      <span>
                        予測需要 {formatNumber(s.totalDemand, s.product.allowDecimal ? 2 : 0)}
                        {s.product.unit}
                      </span>
                      <span className="inline-flex items-center gap-1 text-primary">
                        内訳
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * 推移グラフ用データを納品実績ストアから作る。
 * 実績＝各日の全（卸先×商品）の合計。予測＝直近7日の移動平均（かんたんな予測）。
 * 明日の点は、予測エンジンの合計予測需要を使う。
 */
function buildTrend(
  map: Record<string, number>,
  pairs: Array<{ loc: string; prod: string }>,
  tomorrowDemand: number,
): TrendPoint[] {
  const today = getToday();
  const days = 30;

  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDays(today, -i));

  const actuals = dates.map((date) => {
    let sum = 0;
    let hasAny = false;
    for (const pr of pairs) {
      const v = map[`${date}|${pr.loc}|${pr.prod}`];
      if (v != null) {
        sum += v;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  });

  const points: TrendPoint[] = dates.map((date, k) => {
    // 予測＝直近7日の実績平均（移動平均）
    const window: number[] = [];
    for (let j = Math.max(0, k - 7); j < k; j++) {
      if (actuals[j] != null) window.push(actuals[j] as number);
    }
    const predicted = window.length
      ? Math.round(window.reduce((a, b) => a + b, 0) / window.length)
      : actuals[k] ?? 0;
    return {
      date,
      label: date.slice(5).replace('-', '/'),
      actual: actuals[k],
      predicted,
    };
  });

  const tomorrow = addDays(today, 1);
  points.push({
    date: tomorrow,
    label: tomorrow.slice(5).replace('-', '/'),
    actual: null,
    predicted: Math.round(tomorrowDemand),
  });

  return points;
}

/** 集計カード（小さな指標表示用）。 */
function SummaryCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted-bg text-primary">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="tabular text-2xl font-bold">
            {value}
            {suffix ? (
              <span className="ml-1 text-base font-medium text-muted">{suffix}</span>
            ) : null}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
