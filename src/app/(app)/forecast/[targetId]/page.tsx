'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardCheck,
  Info,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceBadge } from '@/components/features/forecast/confidence-badge';
import {
  findTarget,
  findProduct,
  computeStoreForecast,
  getTomorrow,
} from '@/lib/sample-data';
import { useLocations } from '@/lib/locations-store';
import { useProducts } from '@/lib/products-store';
import { useDeliveries, historyFromMap } from '@/lib/deliveries-store';
import { useFactors, toDailyFactorsMap } from '@/lib/factors-store';
import { formatNumber, formatPercent } from '@/lib/utils';
import {
  addDays,
  recentAverage,
  sameDowLastWeek,
  lastYearSameDay,
  dowLabel,
  confidenceLabel,
  type ForecastResult,
} from '@/domain';

/**
 * 予測詳細ページ（クライアント）。
 * seed 履歴を持つ既定の卸先はその履歴で、マスタ登録された新規卸先は
 * 履歴なし＝参考値として計算する。最上部に「明日の推奨数」を濃い赤・特大で表示。
 */
export default function ForecastDetailPage() {
  const params = useParams<{ targetId: string }>();
  const targetId = params.targetId;
  const { locations } = useLocations();
  const { products } = useProducts();
  const { map } = useDeliveries();
  const { map: factorMap } = useFactors();

  const [locId, productId] = targetId.split('__');
  const seedEntry = findTarget(targetId);
  const product =
    findProduct(productId ?? '') ?? products.find((p) => p.id === productId);
  const location = locations.find((l) => l.id === locId);

  const productName = seedEntry?.productName ?? product?.name;
  const unit = seedEntry?.unit ?? product?.unit ?? '';
  const locationName =
    location?.name ?? seedEntry?.location.name ?? locId ?? '不明な卸先';

  // 商品が特定できない targetId は不正
  if (!productName) {
    return (
      <div className="space-y-4">
        <Link href="/forecast" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          予測詳細一覧へ戻る
        </Link>
        <Card>
          <CardContent className="p-8 text-center text-muted">
            指定された予測対象が見つかりませんでした。
          </CardContent>
        </Card>
      </div>
    );
  }

  const date = getTomorrow();
  const allowDecimal = seedEntry?.meta.allowDecimal ?? product?.allowDecimal ?? false;
  const dec = allowDecimal ? 2 : 0;
  const num = (n: number) => formatNumber(n, dec);

  // 納品実績＋外部要因ストアから履歴を取得し、製造計画と同じロジックで予測
  const factorsByDate = toDailyFactorsMap(factorMap);
  const history = historyFromMap(map, locId ?? '', productId ?? '', factorsByDate);
  const locLike = location
    ? {
        id: location.id, name: location.name, kind: location.kind,
        orderByCase: location.orderByCase, safetyRate: location.safetyRate,
        safetyRates: location.safetyRates,
      }
    : { id: locId ?? '', name: locationName };
  const shipment = computeStoreForecast(locLike, product!, date, history, factorsByDate[date]);
  const result: ForecastResult = shipment.result;

  // 参考指標も同じ履歴から算出
  const yesterday = history.find((r) => r.date === addDays(date, -1))?.sales ?? null;
  const lastWeekSameDow = sameDowLastWeek(history, date);
  const lastYear = lastYearSameDay(history, date);
  const avg30 = recentAverage(history, date, 30);

  const updatedAt = new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/summary" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          製造計画へ戻る
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-muted">
          卸先: {locationName}
          {location?.kind ? `（${location.kind}）` : ''}
        </p>
        <h1 className="text-2xl font-bold">{productName}</h1>
        <p className="text-muted">
          対象日: {date}（{dowLabel(date)}曜日）
        </p>
      </header>

      {/* 明日の推奨数（最重要・濃い赤・特大） */}
      <Card className="border-recommend/40">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-recommend">
            <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
            <span className="text-lg font-semibold">この卸先へ卸す推奨数</span>
          </div>
          <p
            className="tabular mt-2 text-6xl font-extrabold leading-none text-recommend"
            aria-label={`推奨数は${num(shipment.shipUnits)}${unit}です`}
          >
            {num(shipment.shipUnits)}
            <span className="ml-2 text-2xl font-bold text-foreground">{unit}</span>
            {shipment.cases != null && shipment.caseSize != null ? (
              <span className="ml-3 text-xl font-bold text-foreground">
                （{shipment.cases}ケース）
              </span>
            ) : null}
          </p>
          <p className="mt-3 flex items-start gap-1.5 text-base text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {date}（{dowLabel(date)}曜日）に {locationName} へ卸すことをおすすめする数量です。
              予測需要に安全分（安全率 {Math.round(shipment.safetyRate * 100)}％）を加え、現在庫と既発注を差し引いて算出しています。
              {shipment.caseSize != null
                ? `1ケース${shipment.caseSize}${unit}のため、ケースの倍数へ切り上げています。`
                : ''}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* 主要指標グリッド */}
      <section aria-label="予測の内訳指標">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="予測需要" value={`${num(result.adjustedDemand)}${unit}`} />
          <Metric label="安全分" value={`${num(result.safetyStock)}${unit}`} />
          <Metric label="現在庫" value={`${num(result.currentStock)}${unit}`} />
          <Metric label="既発注" value={`${num(result.alreadyOrdered)}${unit}`} />
          <Metric
            label="最終推奨"
            value={
              shipment.cases != null
                ? `${num(shipment.shipUnits)}${unit}（${shipment.cases}ケース）`
                : `${num(shipment.shipUnits)}${unit}`
            }
            highlight
          />
          <Metric label="予測範囲" value={`${num(result.rangeLow)}〜${num(result.rangeHigh)}${unit}`} />
          <Metric label="前日実績" value={yesterday === null ? '未入力' : `${num(yesterday)}${unit}`} />
          <Metric label="前週同曜日" value={lastWeekSameDow === null ? '—' : `${num(lastWeekSameDow)}${unit}`} />
          <Metric label="前年同日" value={lastYear === null ? '—' : `${num(lastYear)}${unit}`} />
          <Metric label="過去30日平均" value={avg30 === null ? '—' : `${num(avg30)}${unit}`} />
          <Metric label="データ日数" value={`${history.length}日`} />
          <Metric label="信頼度" value={`${confidenceLabel(result.confidence.level)}（${result.confidence.score}）`} />
        </div>
        <p className="mt-2 text-sm text-muted">最終更新: {updatedAt}</p>
      </section>

      {/* 予測理由 */}
      <Card>
        <CardHeader><CardTitle>予測の理由</CardTitle></CardHeader>
        <CardContent>
          {result.reasons.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-5 text-base">
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-muted">
              過去の納品実績がまだ少ないため、参考値として表示しています。データが貯まると理由が具体的になります。
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* モデル内訳 */}
        <Card>
          <CardHeader><CardTitle>予測モデルの内訳</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {result.components.length > 0 ? (
              result.components.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-base">{c.label}</p>
                    {c.note ? <p className="text-sm text-muted">{c.note}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="tabular text-base font-semibold">{num(c.value)}{unit}</p>
                    <p className="text-sm text-muted">重み {formatPercent(c.weight)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted">実績が貯まると各モデルの内訳が表示されます。</p>
            )}
          </CardContent>
        </Card>

        {/* 補正内訳 */}
        <Card>
          <CardHeader><CardTitle>適用した補正</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {result.adjustments.length > 0 ? (
              result.adjustments.map((a) => (
                <div key={a.key} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-base">{a.label}</p>
                    <p className="text-sm text-muted">{a.reason}</p>
                  </div>
                  <DeltaBadge delta={a.delta} unit={unit} decimals={dec} />
                </div>
              ))
            ) : (
              <p className="text-muted">今回適用された補正はありません。</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 信頼度と理由 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            信頼度
            <ConfidenceBadge level={result.confidence.level} score={result.confidence.score} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.confidence.reasons.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-5 text-base">
              {result.confidence.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-muted">十分なデータが蓄積されており、信頼度を下げる要因は見当たりません。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className={`tabular mt-0.5 text-lg font-semibold ${highlight ? 'text-recommend' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function DeltaBadge({ delta, unit, decimals }: { delta: number; unit: string; decimals: number }) {
  const rounded = Number(delta.toFixed(decimals));
  if (rounded > 0) {
    return (
      <Badge variant="up" className="shrink-0">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />+{formatNumber(rounded, decimals)}{unit}
      </Badge>
    );
  }
  if (rounded < 0) {
    return (
      <Badge variant="down" className="shrink-0">
        <TrendingDown className="h-4 w-4" aria-hidden="true" />{formatNumber(rounded, decimals)}{unit}
      </Badge>
    );
  }
  return (
    <Badge variant="ref" className="shrink-0">
      <Minus className="h-4 w-4" aria-hidden="true" />変化なし
    </Badge>
  );
}
