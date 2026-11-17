'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useSettings } from '@/lib/settings-store';
import { adviseSafetyRate, type SafetyAdvice } from '@/lib/safety-review';
import { productSafetyRate } from '@/lib/sample-data';
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
  const { products, update: updateProduct } = useProducts();
  const { settings } = useSettings();
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

  // 商品ごとの「多めに作る割合」の見直し
  const fromDate = addDays(today, -(DAYS - 1));
  const rateRows = prods.map((p) => {
    // 割合を変えた日以降の記録だけで判断する（変えた直後に何段も下げないように）
    const since = p.safetyRate != null ? p.safetyRateSince : settings.safetyRateSince;
    const from = since && since > fromDate ? addDays(since, 1) : fromDate;
    let deliveriesN = 0;
    let soldOut = 0;
    let delivered = 0;
    let waste = 0;
    let hasLoss = false;
    for (const [k, qty] of Object.entries(deliveries)) {
      const [date, , prod] = k.split('|');
      if (prod !== p.id || date < from || date > today || !(qty > 0)) continue;
      deliveriesN += 1;
      delivered += qty;
      const l = losses[k];
      if (l?.waste != null) {
        hasLoss = true;
        waste += l.waste;
      }
      if (l?.soldOut) {
        hasLoss = true;
        soldOut += 1;
      }
    }
    const rate = productSafetyRate(p, settings.safetyRate);
    const advice = adviseSafetyRate({ currentRate: rate, deliveries: deliveriesN, soldOutDays: soldOut, hasLossRecords: hasLoss });
    const changedRecently = from !== fromDate;
    return { product: p, rate, soldOut, wasteRate: delivered > 0 ? waste / delivered : null, hasLoss, advice, changedRecently };
  });

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

      {rateRows.length > 0 ? (
        <section className="space-y-2" aria-labelledby="rate-review">
          <h2 id="rate-review" className="text-lg font-bold">
            多めに作る割合の見直し
          </h2>
          <p className="text-sm text-muted">
            売り切れが出ていなければ、1段ずつ下げて廃棄を減らしていきます。売り切れが続くなら1段上げます。割合を変えたら、その日からの記録で次を判断します。
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {rateRows.map((r) => (
              <li key={r.product.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-base font-medium">{r.product.name}</p>
                  <p className="text-sm text-muted tabular">
                    いま {Math.round(r.rate * 100)}％多め
                    {r.changedRecently ? '（変えた日からの記録）' : ''}
                    {r.hasLoss ? (
                      <>
                        ・実際の廃棄 {r.wasteRate != null ? `${formatNumber(r.wasteRate * 100, 1)}％` : '—'}・売り切れ{' '}
                        {r.soldOut} 回
                      </>
                    ) : null}
                  </p>
                </div>
                <AdviceAction
                  advice={r.advice}
                  changedRecently={r.changedRecently}
                  onApply={(rate) => updateProduct(r.product.id, { safetyRate: rate, safetyRateSince: today })}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            割合は「設定」→「多めに作る割合」でも変えられます。お店ごとに割合を決めている場合は、そちらが優先されます。
          </p>
        </section>
      ) : null}

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

function AdviceAction({
  advice,
  changedRecently,
  onApply,
}: {
  advice: SafetyAdvice;
  changedRecently: boolean;
  onApply: (rate: number) => void;
}) {
  if (advice.action === 'need-data') {
    return (
      <span className="text-sm text-muted">
        {advice.reason === 'few-deliveries'
          ? changedRecently
            ? '変えたばかり。2週間ほど様子を見ます'
            : '記録がたまると判断できます'
          : '廃棄・売り切れを記録すると判断できます'}
      </span>
    );
  }
  if (advice.action === 'keep') {
    return <span className="text-sm text-state-good">このままでよさそう</span>;
  }
  const pct = Math.round(advice.toRate * 100);
  return advice.action === 'lower' ? (
    <div className="flex items-center gap-2">
      <span className="text-sm text-state-good">売り切れなし</span>
      <Button size="sm" variant="outline" onClick={() => onApply(advice.toRate)}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
        {pct}％に下げる
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span className="text-sm text-state-warn">売り切れが多め</span>
      <Button size="sm" variant="outline" onClick={() => onApply(advice.toRate)}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
        {pct}％に上げる
      </Button>
    </div>
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
