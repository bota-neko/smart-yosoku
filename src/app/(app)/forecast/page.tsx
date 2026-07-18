'use client';

import Link from 'next/link';
import { ChevronRight, Package } from 'lucide-react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { ConfidenceBadge } from '@/components/features/forecast/confidence-badge';
import { computeStoreForecast, getTomorrow } from '@/lib/sample-data';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useDeliveries, historyFromMap } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { formatNumber } from '@/lib/utils';

/**
 * 予測詳細の入口となる一覧（クライアント）。
 * 各ストア（商品・卸先・納品実績）から、商品ごとに卸先を並べる。
 * 1件選ぶと、その卸先×商品の予測詳細へ遷移する。
 */
export default function ForecastIndexPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map } = useDeliveries();
  const { map: factorMap } = useFactors();
  const date = getTomorrow();

  const activeProds = activeProducts(products);
  const activeLocs = activeLocations(locations);
  const factorsByDate = toDailyFactorsMap(factorMap);
  const targetFactors = factorsByDate[date];

  const groups = activeProds
    .map((product) => {
      const rows = activeLocs
        .filter((l) => handlesProduct(l, product.id))
        .map((location) => ({
          location,
          sf: computeStoreForecast(
            location,
            product,
            date,
            historyFromMap(map, location.id, product.id, factorsByDate),
            targetFactors,
          ),
        }));
      return { product, rows };
    })
    .filter((g) => g.rows.length > 0);

  const total = groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">予測詳細</h1>
        <p className="text-muted">
          卸先×商品ごとに、予測の根拠をくわしく確認できます（全 {formatNumber(total)} 件）。
        </p>
      </header>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted">
            予測対象がありません。「商品管理」「卸先管理」で登録してください。
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.product.id}>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Package className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="text-lg font-semibold">{g.product.name}</span>
                <span className="text-sm text-muted">（{g.rows.length}卸先）</span>
              </div>
              <ul>
                {g.rows.map(({ location, sf }) => (
                  <li key={sf.targetId} className="border-b border-border last:border-0">
                    <Link
                      href={`/forecast/${sf.targetId}`}
                      className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                      <div>
                        <p className="text-base font-medium">{location.name}</p>
                        {location.kind ? (
                          <p className="text-sm text-muted">{location.kind}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted">卸す数（推奨）</p>
                          <p className="tabular text-xl font-bold text-recommend">
                            {formatNumber(sf.shipUnits, g.product.allowDecimal ? 2 : 0)}
                            <span className="ml-1 text-sm font-medium text-foreground">
                              {g.product.unit}
                            </span>
                          </p>
                        </div>
                        <ConfidenceBadge level={sf.result.confidence.level} />
                        <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
