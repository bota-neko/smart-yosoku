'use client';

import { useMemo, useState } from 'react';
import { CalendarRange, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  computeProductSummaryFor,
  getTomorrow,
  type ProductInfo,
} from '@/lib/sample-data';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useDeliveries, historyFromMap } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { formatNumber } from '@/lib/utils';
import { addDays, dowLabel, type DailyRecord } from '@/domain';

/**
 * 週間予測。明日から N 日ぶんの「日×商品」の推奨製造数を一覧化し、
 * 仕入れ・仕込みの計画に使えるようにする。天気・特売・祝日はその日ぶん反映。
 */
export default function WeeklyPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map } = useDeliveries();
  const { map: factorMap } = useFactors();
  const [days, setDays] = useState<7 | 14>(7);

  const activeProds = activeProducts(products);
  const activeLocs = activeLocations(locations);

  const { rows, totals } = useMemo(() => {
    const factorsByDate = toDailyFactorsMap(factorMap);
    // (卸先,商品) の履歴はキャッシュ（日をまたいで同じ）
    const histCache = new Map<string, DailyRecord[]>();
    const getHistory = (locId: string, prodId: string) => {
      const k = `${locId}|${prodId}`;
      let h = histCache.get(k);
      if (!h) {
        h = historyFromMap(map, locId, prodId, factorsByDate);
        histCache.set(k, h);
      }
      return h;
    };

    const prods = activeProds; // 表の列
    const start = getTomorrow();
    const totalsByProduct: Record<string, number> = {};
    const rows = Array.from({ length: days }, (_, i) => {
      const date = addDays(start, i);
      const factor = factorsByDate[date];
      const cells = prods.map((p) => {
        const locs = activeLocs.filter((l) => handlesProduct(l, p.id));
        if (locs.length === 0) return { product: p, qty: null as number | null };
        const s = computeProductSummaryFor(p, locs, date, getHistory, factorsByDate[date]);
        totalsByProduct[p.id] = (totalsByProduct[p.id] ?? 0) + s.totalRecommended;
        return { product: p, qty: s.totalRecommended };
      });
      return { date, dow: dowLabel(date), factor, cells };
    });
    return { rows, totals: totalsByProduct };
  }, [activeProds, activeLocs, map, factorMap, days]);

  const num = (p: ProductInfo, n: number) => formatNumber(n, p.allowDecimal ? 2 : 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">週間予測</h1>
          <p className="text-muted">
            明日からの製造見込みを日ごとに表示します。仕入れ・仕込みの計画にお使いください（天気・特売・祝日も反映）。
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
          {([7, 14] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`min-h-9 rounded px-3 text-sm font-medium ${
                days === d ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-muted-bg'
              }`}
            >
              {d === 7 ? '1週間' : '2週間'}
            </button>
          ))}
        </div>
      </header>

      {activeProds.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted">
            商品が登録されていません。「商品管理」で登録してください。
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" aria-hidden="true" />
              日ごとの推奨製造数
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="text-sm text-muted">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 border-b border-border bg-muted-bg px-3 py-2 text-left font-semibold"
                    >
                      日付
                    </th>
                    {activeProds.map((p) => (
                      <th key={p.id} scope="col" className="border-b border-border bg-muted-bg px-3 py-2 text-right font-semibold">
                        <span className="block whitespace-nowrap text-foreground">{p.name}</span>
                        <span className="block whitespace-nowrap text-xs font-normal text-muted">{p.unit}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isWeekend = r.dow === '土' || r.dow === '日';
                    return (
                      <tr key={r.date} className="border-b border-border last:border-0">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2 text-left font-medium"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={isWeekend ? 'text-recommend' : ''}>
                              {r.date.slice(5).replace('-', '/')}（{r.dow}）
                            </span>
                            {r.factor?.isHoliday ? <Badge variant="warn">祝</Badge> : null}
                            {r.factor?.sale ? <Badge variant="up">特売</Badge> : null}
                            {r.factor?.event ? <Badge variant="up">催</Badge> : null}
                            {r.factor?.weather === 'rainy' || r.factor?.weather === 'storm' ? (
                              <Badge variant="down">☔</Badge>
                            ) : null}
                            {r.factor?.closed ? <Badge variant="ref">休</Badge> : null}
                          </div>
                        </th>
                        {r.cells.map((c) => (
                          <td key={c.product.id} className="tabular px-3 py-2 text-right">
                            {c.qty === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span className="font-semibold">{num(c.product, c.qty)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted-bg/50 font-bold">
                    <th scope="row" className="sticky left-0 z-10 bg-muted-bg/50 px-3 py-2 text-left">
                      期間合計
                    </th>
                    {activeProds.map((p) => (
                      <td key={p.id} className="tabular px-3 py-2 text-right text-recommend">
                        {num(p, totals[p.id] ?? 0)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          各セルは、その日にその商品を扱う全卸先へ卸す推奨数の合計（＝製造すべき数）です。
          「期間合計」を仕入れ・仕込みの目安にできます。土日祝や特売・天気の予定は各日に反映されます。
        </span>
      </p>
    </div>
  );
}
