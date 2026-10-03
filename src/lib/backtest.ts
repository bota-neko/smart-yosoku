import { computeStoreForecast, type LocationLike, type ProductInfo } from '@/lib/sample-data';
import { historyFromMap, type DeliveryMap } from '@/lib/deliveries-store';
import { addDays, calcAccuracy, type AccuracyMetrics, type DailyFactors, type ForecastActualPair } from '@/domain';

/**
 * 当たり具合の振り返り（バックテスト）。
 * 過去の各日について「その日より前の記録だけ」で見込みを出し、実際の納品数と比べる。
 * 見本データではなく、利用者が記録した納品実績から計算する。
 */

/** 見込みを出すのに最低限必要な過去記録の日数（これ未満の日は評価しない）。 */
const MIN_HISTORY = 14;

export interface BacktestTarget {
  location: LocationLike;
  product: ProductInfo;
  pairs: ForecastActualPair[];
  metrics: AccuracyMetrics;
}

export interface BacktestResult {
  overall: AccuracyMetrics;
  targets: BacktestTarget[];
}

export function computeBacktest({
  deliveries,
  factorsByDate,
  pairs: targetPairs,
  today,
  days,
  toleranceRate = 0.1,
}: {
  deliveries: DeliveryMap;
  factorsByDate: Record<string, DailyFactors>;
  /** 評価する（お店, 商品）の組み合わせ */
  pairs: Array<{ location: LocationLike; product: ProductInfo }>;
  /** 今日（この日は含めない） */
  today: string;
  /** 直近何日を評価するか */
  days: number;
  toleranceRate?: number;
}): BacktestResult {
  const from = addDays(today, -days);
  const targets: BacktestTarget[] = [];

  for (const { location, product } of targetPairs) {
    const history = historyFromMap(deliveries, location.id, product.id, factorsByDate);
    const pairs: ForecastActualPair[] = [];
    // history は日付昇順。i 番目の記録の評価には、それより前（0..i-1）だけを使う
    for (let i = 0; i < history.length; i++) {
      const rec = history[i];
      if (rec.date < from || rec.date >= today) continue;
      if (rec.sales === null || i < MIN_HISTORY) continue;
      const f = computeStoreForecast(location, product, rec.date, history.slice(0, i), factorsByDate[rec.date]);
      pairs.push({
        date: rec.date,
        actual: rec.sales,
        predicted: f.result.adjustedDemand,
        toleranceRate,
      });
    }
    if (pairs.length > 0) {
      targets.push({ location, product, pairs, metrics: calcAccuracy(pairs, toleranceRate) });
    }
  }

  return {
    overall: calcAccuracy(targets.flatMap((t) => t.pairs), toleranceRate),
    targets,
  };
}

/** 平均のずれ（WAPE）を、ふだんの言葉の評価に置き換える。 */
export function accuracyLabel(m: AccuracyMetrics): { label: string; tone: 'good' | 'warn' | 'bad' } | null {
  if (m.count < 10) return null;
  if (m.wape <= 0.1) return { label: 'よく当たる', tone: 'good' };
  if (m.wape <= 0.2) return { label: 'まずまず', tone: 'warn' };
  return { label: 'ずれが大きめ', tone: 'bad' };
}
