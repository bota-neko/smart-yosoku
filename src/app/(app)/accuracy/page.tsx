'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useDeliveries } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { computeBacktest, accuracyLabel } from '@/lib/backtest';
import { getToday } from '@/lib/sample-data';
import { formatNumber, formatPercent } from '@/lib/utils';
import { addDays, calcAccuracy } from '@/domain';

const PERIODS = [7, 30, 90] as const;

/**
 * 当たり具合の内訳。
 * 記録した納品実績から、過去の各日について「その日より前の記録だけ」で見込みを出し、
 * 実際の納品数と比べる（許容誤差 10% 以内を「当たり」とする）。
 */
export default function AccuracyPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map: deliveries } = useDeliveries();
  const { map: factorMap } = useFactors();
  const today = getToday();

  const result = useMemo(() => {
    const prods = activeProducts(products);
    const locs = activeLocations(locations);
    return computeBacktest({
      deliveries,
      factorsByDate: toDailyFactorsMap(factorMap),
      pairs: locs.flatMap((l) => prods.filter((p) => handlesProduct(l, p.id)).map((p) => ({ location: l, product: p }))),
      today,
      days: 90,
    });
  }, [deliveries, factorMap, products, locations, today]);

  const allPairs = result.targets.flatMap((t) => t.pairs);
  const byPeriod = PERIODS.map((d) => ({
    days: d,
    metrics: calcAccuracy(allPairs.filter((p) => p.date >= addDays(today, -d))),
  }));
  const from30 = addDays(today, -30);
  const perTarget = result.targets
    .map((t) => ({ ...t, m30: calcAccuracy(t.pairs.filter((p) => p.date >= from30)) }))
    .filter((t) => t.m30.count > 0);

  return (
    <div className="space-y-6">
      <Link href="/review" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        ふりかえりへ戻る
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">当たり具合の内訳</h1>
        <p className="text-muted">
          過去の各日について、その日より前の記録だけで出した見込みと、実際の納品数を比べています。ずれが 10% 以内なら「当たり」です。
        </p>
      </header>

      {allPairs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted">
            納品の記録が2週間以上たまると表示されます。
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>期間ごと</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>期間</TableHead>
                    <TableHead className="text-right">評価</TableHead>
                    <TableHead className="text-right">当たった割合</TableHead>
                    <TableHead className="text-right">平均のずれ</TableHead>
                    <TableHead className="text-right">多すぎ</TableHead>
                    <TableHead className="text-right">足りない</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPeriod.map(({ days, metrics }) => (
                    <TableRow key={days}>
                      <TableCell className="font-medium">直近{days}日</TableCell>
                      <TableCell className="text-right">{accuracyLabel(metrics)?.label ?? '—'}</TableCell>
                      <TableCell className="tabular text-right">{metrics.count ? formatPercent(metrics.hitRate) : '—'}</TableCell>
                      <TableCell className="tabular text-right">{metrics.count ? `±${formatPercent(metrics.wape, 1)}` : '—'}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(metrics.overCount)}回</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(metrics.underCount)}回</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>お店・商品ごと（直近30日）</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>お店</TableHead>
                    <TableHead>商品</TableHead>
                    <TableHead className="text-right">評価</TableHead>
                    <TableHead className="text-right">平均のずれ</TableHead>
                    <TableHead className="text-right">多すぎ</TableHead>
                    <TableHead className="text-right">足りない</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perTarget.map((t) => (
                    <TableRow key={`${t.location.id}|${t.product.id}`}>
                      <TableCell className="text-muted">{t.location.name}</TableCell>
                      <TableCell className="font-medium">{t.product.name}</TableCell>
                      <TableCell className="text-right">{accuracyLabel(t.m30)?.label ?? '記録不足'}</TableCell>
                      <TableCell className="tabular text-right">±{formatPercent(t.m30.wape, 1)}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(t.m30.overCount)}回</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(t.m30.underCount)}回</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
