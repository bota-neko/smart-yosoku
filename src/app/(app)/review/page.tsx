'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useDeliveries } from '@/lib/deliveries-store';
import { useLosses } from '@/lib/losses-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { computeLossSummary } from '@/lib/loss-analysis';
import { computeBacktest, accuracyLabel } from '@/lib/backtest';
import { getToday } from '@/lib/sample-data';
import { formatNumber } from '@/lib/utils';
import { addDays } from '@/domain';

const DAYS = 30;

/**
 * ふりかえり：この30日を3つの数字だけで見る。
 * 詳しい内訳（商品ごと・お店ごと）は、それぞれの「内訳を見る」から開く。
 */
export default function ReviewPage() {
  const { products } = useProducts();
  const { locations } = useLocations();
  const { map: deliveries } = useDeliveries();
  const { map: losses } = useLosses();
  const { map: factorMap } = useFactors();

  const today = getToday();
  const prods = activeProducts(products);
  const locs = activeLocations(locations);

  const loss = computeLossSummary({
    deliveries,
    losses,
    products: prods,
    fromDate: addDays(today, -(DAYS - 1)),
    toDate: today,
  });

  const backtest = useMemo(
    () =>
      computeBacktest({
        deliveries,
        factorsByDate: toDailyFactorsMap(factorMap),
        pairs: locs.flatMap((l) => prods.filter((p) => handlesProduct(l, p.id)).map((p) => ({ location: l, product: p }))),
        today,
        days: DAYS,
      }),
    // locs/prods は毎レンダー生成のため、元データの変化で再計算する
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliveries, factorMap, products, locations, today],
  );
  const acc = accuracyLabel(backtest.overall);

  const yen = (n: number) => `${formatNumber(Math.round(n))} 円`;
  const hasWaste = loss.totalWasteQty > 0;
  const toneClass = (t: 'good' | 'warn' | 'bad') =>
    t === 'good' ? 'text-state-good' : t === 'warn' ? 'text-state-warn' : 'text-state-bad';

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">ふりかえり</h1>
        <p className="text-muted">この{DAYS}日</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="捨てた分（廃棄）" value={hasWaste ? yen(loss.totalWasteYen) : '—'}>
          {!hasWaste ? (
            '納品のときに廃棄を記録すると表示されます'
          ) : loss.improvedYen > 0 ? (
            <span className="text-state-good">前半より {yen(loss.improvedYen)} 減りました</span>
          ) : loss.secondHalfWasteRate > loss.firstHalfWasteRate ? (
            <span className="text-state-warn">前半より増えています</span>
          ) : (
            `${formatNumber(loss.totalWasteQty)} 個ぶん`
          )}
        </Metric>

        <Metric label="売り切れ" value={`${formatNumber(loss.totalSoldOutDays)} 回`}>
          {loss.totalSoldOutDays > 0 ? `売り逃し（推定）${yen(loss.totalLostYen)}` : '売り切れの記録はありません'}
        </Metric>

        <Metric label="見込みの当たり具合" value={acc ? acc.label : '—'} valueClass={acc ? toneClass(acc.tone) : ''}>
          {acc
            ? `ずれは平均 ±${formatNumber(backtest.overall.wape * 100)}%`
            : '納品の記録が2週間以上たまると表示されます'}
        </Metric>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        <DetailLink href="/loss" label="ロスの内訳を見る（商品ごと・金額）" />
        <DetailLink href="/accuracy" label="当たり具合の内訳を見る（お店・商品ごと）" />
      </ul>

      <p className="text-sm text-muted">
        金額は「設定」→「商品」の単価・原価から計算します。当たり具合は、過去の各日について「その日より前の記録だけ」で出した見込みと、実際の納品数を比べたものです。
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass = '',
  children,
}: {
  label: string;
  value: string;
  valueClass?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm text-muted">{label}</p>
        <p className={`tabular text-3xl font-extrabold ${valueClass}`}>{value}</p>
        <p className="text-sm text-muted">{children}</p>
      </CardContent>
    </Card>
  );
}

function DetailLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center justify-between px-4 text-base hover:bg-muted-bg">
        {label}
        <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}
