import type { DailyRecord } from '../types';
import { demandSeries } from '../forecast/features';
import { mean, stddev, median } from '../math';

export type AnomalyType =
  | 'outlierHigh' | 'outlierLow' | 'suddenSpike' | 'suddenDrop'
  | 'wasteSpike' | 'returnSpike' | 'stockoutSpike' | 'unexpectedZero' | 'duplicate';

export interface Anomaly {
  date: string;
  type: AnomalyType;
  message: string;
  /** 該当値 */
  value: number | null;
}

const TYPE_LABEL: Record<AnomalyType, string> = {
  outlierHigh: '過去平均から大幅に高い値',
  outlierLow: '過去平均から大幅に低い値',
  suddenSpike: '急激な販売増',
  suddenDrop: '急激な販売減',
  wasteSpike: '廃棄数の急増',
  returnSpike: '返品数の急増',
  stockoutSpike: '欠品数の急増',
  unexpectedZero: '通常は0でない項目が0',
  duplicate: '重複入力の疑い',
};

/**
 * 実績データの異常値を検知（削除せず「確認待ち」として返す）。
 * 平均±3σ、直近比の急変、廃棄/返品/欠品の急増、想定外0、重複日を検出。
 */
export function detectAnomalies(history: DailyRecord[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const series = demandSeries(history);
  if (series.length < 5) return anomalies;

  const vals = series.map((x) => x.demand);
  const m = mean(vals) ?? 0;
  const sd = stddev(vals);
  const med = median(vals) ?? m;

  // 重複日検知
  const seen = new Set<string>();
  for (const r of history) {
    if (seen.has(r.date)) {
      anomalies.push({ date: r.date, type: 'duplicate', message: `${r.date}: ${TYPE_LABEL.duplicate}`, value: null });
    }
    seen.add(r.date);
  }

  for (let i = 0; i < series.length; i++) {
    const { date, demand } = series[i];

    // 外れ値（3σ）
    if (sd > 0) {
      if (demand > m + 3 * sd) {
        anomalies.push({ date, type: 'outlierHigh', message: `${date}: ${TYPE_LABEL.outlierHigh}（${Math.round(demand)}）`, value: demand });
      } else if (demand < m - 3 * sd) {
        anomalies.push({ date, type: 'outlierLow', message: `${date}: ${TYPE_LABEL.outlierLow}（${Math.round(demand)}）`, value: demand });
      }
    }

    // 直近比の急変（前日比3倍/1/3、かつ中央値の一定以上）
    if (i > 0 && med > 0) {
      const prev = series[i - 1].demand;
      if (prev > 0 && demand >= prev * 3 && demand > med * 2) {
        anomalies.push({ date, type: 'suddenSpike', message: `${date}: ${TYPE_LABEL.suddenSpike}`, value: demand });
      } else if (prev > med && demand <= prev / 3 && demand < med * 0.5) {
        anomalies.push({ date, type: 'suddenDrop', message: `${date}: ${TYPE_LABEL.suddenDrop}`, value: demand });
      }
    }
  }

  // 廃棄・返品・欠品の急増（各系列の3σ）
  checkSpike(history, (r) => r.waste ?? null, 'wasteSpike', anomalies);
  checkSpike(history, (r) => r.returns ?? null, 'returnSpike', anomalies);
  checkSpike(history, (r) => r.stockout ?? null, 'stockoutSpike', anomalies);

  // 想定外0（通常は正の販売がある系列で、直近14日中央値>10 なのに 0）
  const recent = series.slice(-30);
  const recentMed = median(recent.map((x) => x.demand)) ?? 0;
  if (recentMed > 10) {
    for (const r of history) {
      if (r.sales === 0 && !r.factors?.closed) {
        anomalies.push({ date: r.date, type: 'unexpectedZero', message: `${r.date}: ${TYPE_LABEL.unexpectedZero}`, value: 0 });
      }
    }
  }

  return dedupe(anomalies);
}

function checkSpike(
  history: DailyRecord[], pick: (r: DailyRecord) => number | null,
  type: AnomalyType, out: Anomaly[],
): void {
  const vals = history.map(pick).filter((v): v is number => v !== null);
  if (vals.length < 5) return;
  const m = mean(vals) ?? 0;
  const sd = stddev(vals);
  if (sd === 0) return;
  for (const r of history) {
    const v = pick(r);
    if (v !== null && v > m + 3 * sd && v > 0) {
      out.push({ date: r.date, type, message: `${r.date}: ${TYPE_LABEL[type]}（${Math.round(v)}）`, value: v });
    }
  }
}

function dedupe(anomalies: Anomaly[]): Anomaly[] {
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    const key = `${a.date}:${a.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { TYPE_LABEL as anomalyTypeLabel };
