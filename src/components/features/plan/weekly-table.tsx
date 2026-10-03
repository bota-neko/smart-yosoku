'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { useRestDays, isRestDay } from '@/lib/rest-days-store';
import { formatNumber } from '@/lib/utils';
import { addDays, dowLabel, type DailyRecord } from '@/domain';

/**
 * 明日から N 日ぶんの「日×商品」の作る数の表（1週間表示）。
 * 各セルは、その日にその商品を扱う全てのお店へ卸す数の合計。
 */
export function WeeklyTable({ days }: { days: 7 | 14 }) {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map } = useDeliveries();
  const { map: factorMap } = useFactors();
  const { map: restMap } = useRestDays();

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
        // その日「休み」のお店は含めない
        const locs = activeLocs.filter((l) => handlesProduct(l, p.id) && !isRestDay(restMap, date, l.id));
        if (locs.length === 0) return { product: p, qty: null as number | null };
        const s = computeProductSummaryFor(p, locs, date, getHistory, factorsByDate[date]);
        totalsByProduct[p.id] = (totalsByProduct[p.id] ?? 0) + s.totalRecommended;
        return { product: p, qty: s.totalRecommended };
      });
      return { date, dow: dowLabel(date), factor, cells };
    });
    return { rows, totals: totalsByProduct };
  }, [activeProds, activeLocs, map, factorMap, restMap, days]);

  const num = (p: ProductInfo, n: number) => formatNumber(n, p.allowDecimal ? 2 : 0);

  return (
    <div className="space-y-6">

      {activeProds.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted">
            商品が登録されていません。「設定」→「商品」で登録してください。
          </CardContent>
        </Card>
      ) : (
        <Card>
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

      <p className="text-sm text-muted">
        「期間合計」を材料の仕入れ・仕込みの目安にできます。天気・特売・祝日は各日に反映済みです。
      </p>
    </div>
  );
}
