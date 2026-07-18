'use client';

import Link from 'next/link';
import {
  Factory,
  ClipboardCheck,
  Info,
  ChevronRight,
  Store,
} from 'lucide-react';
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
  type ProductSummary,
} from '@/lib/sample-data';
import { useLocations, activeLocations, handlesProduct } from '@/lib/locations-store';
import { useProducts, activeProducts } from '@/lib/products-store';
import { useDeliveries, historyFromMap } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { formatNumber } from '@/lib/utils';
import { dowLabel } from '@/domain';

/**
 * 製造計画（店舗別予測と合計）ページ。
 *
 * 各商品について、出荷先の店舗ごとに需要を予測し、
 * その合計＝工場で用意すべき総数（推奨製造数）を弾き出す。
 * 合計の推奨製造数は濃い赤・太字で強調しつつ、色だけに頼らず
 * アイコン + ラベル + 単位 + 補足文を併用する（WCAG 2.2 AA）。
 */
export default function ForecastSummaryPage() {
  const { locations } = useLocations();
  const { products } = useProducts();
  const { map } = useDeliveries();
  const { map: factorMap } = useFactors();
  const date = getTomorrow();
  const activeLocs = activeLocations(locations);
  const factorsByDate = toDailyFactorsMap(factorMap);
  const targetFactors = factorsByDate[date];
  const getHistory = (locId: string, prodId: string) =>
    historyFromMap(map, locId, prodId, factorsByDate);
  const summaries = activeProducts(products)
    .map((p) =>
      computeProductSummaryFor(
        p,
        activeLocs.filter((l) => handlesProduct(l, p.id)),
        date,
        getHistory,
        targetFactors,
      ),
    )
    .filter((s) => s.stores.length > 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">明日の製造計画</h1>
        <p className="text-muted">
          卸先（お店）ごとに必要数を予測し、その合計＝自店で用意すべき製造総数を算出します。
          対象日: {date}（{dowLabel(date)}曜日）
        </p>
      </header>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted">
            予測対象が登録されていません。
          </CardContent>
        </Card>
      ) : (
        summaries.map((summary) => (
          <ProductSummaryCard key={summary.product.id} summary={summary} />
        ))
      )}
    </div>
  );
}

/** 1商品ぶんの「店舗別予測 + 合計」カード。 */
function ProductSummaryCard({ summary }: { summary: ProductSummary }) {
  const { product } = summary;
  const dec = product.allowDecimal ? 2 : 0;
  const num = (n: number) => formatNumber(n, dec);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" aria-hidden="true" />
          {product.name}
          <span className="text-base font-normal text-muted">
            （単位: {product.unit}）
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-0 pb-4">
        {/* 店舗別予測テーブル */}
        <div className="w-full overflow-x-auto px-4">
          <table className="w-full border-collapse text-base">
            <thead>
              <tr className="text-sm text-muted">
                <th scope="col" className="border-b border-border px-3 py-2 text-left font-semibold">
                  卸先（お店）
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">
                  予測必要数
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">
                  安全分
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">
                  在庫
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">
                  手配済
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">
                  卸す数（推奨）
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">
                  詳細
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.stores.map((s) => (
                <tr key={s.targetId} className="border-b border-border">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Store className="h-4 w-4 text-muted" aria-hidden="true" />
                      {s.location.name}
                      {s.location.kind ? (
                        <span className="text-xs font-normal text-muted">
                          （{s.location.kind}）
                        </span>
                      ) : null}
                    </span>
                  </th>
                  <td className="tabular px-3 py-2 text-right">
                    {num(s.result.adjustedDemand)}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted">
                    {num(s.result.safetyStock)}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted">
                    {num(s.result.currentStock)}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted">
                    {num(s.result.alreadyOrdered)}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-semibold">
                    {num(s.shipUnits)}
                    <span className="ml-1 text-sm font-normal text-muted">
                      {product.unit}
                    </span>
                    {s.cases != null && s.caseSize != null ? (
                      <span className="ml-1 block text-xs font-normal text-muted">
                        {s.cases}ケース
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/forecast/${s.targetId}`}
                      className="inline-flex items-center gap-0.5 text-sm text-primary hover:underline"
                      aria-label={`${s.location.name}の${product.name}の予測詳細を見る`}
                    >
                      予測根拠
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* 合計行 */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted-bg/50 font-bold">
                <th scope="row" className="px-3 py-2 text-left">
                  合計（{summary.stores.length}卸先）
                </th>
                <td className="tabular px-3 py-2 text-right">
                  {num(summary.totalDemand)}
                </td>
                <td className="tabular px-3 py-2 text-right text-muted">
                  {num(summary.totalSafety)}
                </td>
                <td className="tabular px-3 py-2 text-right text-muted">
                  {num(summary.totalStock)}
                </td>
                <td className="tabular px-3 py-2 text-right text-muted">
                  {num(summary.totalOrdered)}
                </td>
                <td className="tabular px-3 py-2 text-right text-recommend">
                  {num(summary.totalRecommended)}
                  <span className="ml-1 text-sm font-normal text-muted">
                    {product.unit}
                  </span>
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 合計推奨製造数（最重要・濃い赤・強調） */}
        <div className="mx-4 rounded-md border border-recommend/40 p-4">
          <div className="flex items-center gap-2 text-recommend">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-base font-semibold">
              合計 推奨製造数（全卸先へ卸す数の合計）
            </span>
          </div>
          <p
            className="tabular mt-1 text-4xl font-extrabold leading-none text-recommend"
            aria-label={`${product.name}の合計推奨製造数は${num(summary.totalRecommended)}${product.unit}です`}
          >
            {num(summary.totalRecommended)}
            <span className="ml-2 text-xl font-bold text-foreground">
              {product.unit}
            </span>
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              各卸先へ卸す推奨数を合計した、自店で用意すべき製造総数です。
              合計予測必要数 {num(summary.totalDemand)}
              {product.unit} に安全分を加え、在庫・手配済を差し引いて算出しています。
              予測範囲は {num(summary.totalRangeLow)}〜{num(summary.totalRangeHigh)}
              {product.unit} です。
            </span>
          </p>
          <div className="mt-2">
            <Badge variant="neutral">
              卸先別: {summary.stores.map((s) => `${s.location.name} ${num(s.shipUnits)}`).join(' ＋ ')} ＝ {num(summary.totalRecommended)}{product.unit}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
