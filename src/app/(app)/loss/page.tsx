'use client';

import { useState } from 'react';
import { Trash2, TrendingDown, Coins, ArrowDownRight, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useDeliveries } from '@/lib/deliveries-store';
import { useLosses } from '@/lib/losses-store';
import { computeLossSummary } from '@/lib/loss-analysis';
import { getToday } from '@/lib/sample-data';
import { formatNumber, formatPercent } from '@/lib/utils';
import { addDays } from '@/domain';

type Period = 30 | 90 | 0; // 0=全期間

/**
 * ロス・効果の見える化。
 * 廃棄・機会損失・粗利を金額で集計し、「毎日の記録がいくらのムダ削減につながるか」を見せる。
 */
export default function LossPage() {
  const { products } = useProducts();
  const { map: deliveries } = useDeliveries();
  const { map: losses } = useLosses();
  const [period, setPeriod] = useState<Period>(30);

  const today = getToday();
  const fromDate = period === 0 ? '2000-01-01' : addDays(today, -(period - 1));

  const summary = computeLossSummary({
    deliveries,
    losses,
    products: activeProducts(products),
    fromDate,
    toDate: today,
  });

  const yen = (n: number) => `${formatNumber(Math.round(n))}円`;

  const periodLabel = period === 0 ? '全期間' : `直近${period}日`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">ロス・効果の見える化</h1>
          <p className="text-muted">
            廃棄・売り切れ（機会損失）・粗利を金額で確認できます。納品入力で「廃棄」「売り切れ」を記録するほど正確になります。
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
          {([30, 90, 0] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`min-h-9 rounded px-3 text-sm font-medium ${
                period === p ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-muted-bg'
              }`}
            >
              {p === 0 ? '全期間' : `直近${p}日`}
            </button>
          ))}
        </div>
      </header>

      {/* サマリーカード */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyCard
          icon={<Trash2 className="h-5 w-5" aria-hidden="true" />}
          tone="bad"
          label="廃棄ロス"
          value={yen(summary.totalWasteYen)}
          sub={`${formatNumber(summary.totalWasteQty)}個ぶん（廃棄率 ${formatPercent(summary.wasteRate, 1)}）`}
        />
        <MoneyCard
          icon={<TrendingDown className="h-5 w-5" aria-hidden="true" />}
          tone="warn"
          label="機会損失（推定）"
          value={yen(summary.totalLostYen)}
          sub={`売り切れ ${formatNumber(summary.totalSoldOutDays)}回`}
        />
        <MoneyCard
          icon={<Coins className="h-5 w-5" aria-hidden="true" />}
          tone="good"
          label="粗利（実績）"
          value={yen(summary.totalGrossYen)}
          sub={`${periodLabel}・納品 ${formatNumber(summary.totalDeliveredQty)}個`}
        />
        <MoneyCard
          icon={<ArrowDownRight className="h-5 w-5" aria-hidden="true" />}
          tone="good"
          label="廃棄の改善（推定）"
          value={summary.improvedYen > 0 ? `−${yen(summary.improvedYen)}` : '—'}
          sub={
            summary.firstHalfWasteRate > 0 || summary.secondHalfWasteRate > 0
              ? `廃棄率 ${formatPercent(summary.firstHalfWasteRate, 1)} → ${formatPercent(summary.secondHalfWasteRate, 1)}`
              : 'データ蓄積で表示'
          }
        />
      </section>

      {/* 商品別 */}
      <Card>
        <CardHeader>
          <CardTitle>商品別のロス（{periodLabel}）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.byProduct.length === 0 ? (
            <p className="p-8 text-center text-muted">
              対象データがありません。納品入力で納品数・廃棄を記録すると集計されます。
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr className="text-sm text-muted">
                    <th className="border-b border-border px-4 py-2 text-left font-semibold">商品</th>
                    <th className="border-b border-border px-4 py-2 text-right font-semibold">納品</th>
                    <th className="border-b border-border px-4 py-2 text-right font-semibold">廃棄</th>
                    <th className="border-b border-border px-4 py-2 text-right font-semibold">廃棄率</th>
                    <th className="border-b border-border px-4 py-2 text-right font-semibold">廃棄ロス</th>
                    <th className="border-b border-border px-4 py-2 text-right font-semibold">粗利</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byProduct.map((r) => (
                    <tr key={r.product.id} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-2 text-left font-medium">{r.product.name}</th>
                      <td className="tabular px-4 py-2 text-right text-muted">
                        {formatNumber(r.deliveredQty)}{r.product.unit}
                      </td>
                      <td className="tabular px-4 py-2 text-right">
                        {formatNumber(r.wasteQty)}{r.product.unit}
                      </td>
                      <td className="tabular px-4 py-2 text-right">
                        {formatPercent(r.wasteRate, 1)}
                      </td>
                      <td className="tabular px-4 py-2 text-right font-semibold text-state-bad">
                        {yen(r.wasteYen)}
                      </td>
                      <td className="tabular px-4 py-2 text-right text-state-good">
                        {yen(r.grossYen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          金額は商品の「単価・原価」（商品管理で設定）から計算します。廃棄ロス＝廃棄数×原価、粗利＝（納品−廃棄）×（単価−原価）、機会損失＝売り切れ日の推定不足×粗利（推定）。
          お試しモードでは見本の廃棄データが入っています。
        </span>
      </p>
    </div>
  );
}

function MoneyCard({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  tone: 'bad' | 'warn' | 'good';
  label: string;
  value: string;
  sub: string;
}) {
  const toneClass =
    tone === 'bad' ? 'text-state-bad' : tone === 'warn' ? 'text-state-warn' : 'text-state-good';
  return (
    <Card>
      <CardContent className="p-5">
        <div className={`flex items-center gap-2 ${toneClass}`}>
          {icon}
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <p className={`tabular mt-1 text-3xl font-extrabold ${toneClass}`}>{value}</p>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </CardContent>
    </Card>
  );
}
