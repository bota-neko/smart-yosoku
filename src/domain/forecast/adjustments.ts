import type { DailyRecord, DailyFactors, ForecastAdjustment } from '../types';
import { demandOf } from './features';
import { mean, safeDiv, clamp } from '../math';
import { dayOfWeek } from '../dateutil';

/**
 * 履歴から「特売あり日 / なし日」の平均需要比を学習して補正率を返す。
 * データが無ければ既定倍率を使う。
 */
function learnedMultiplier(
  history: DailyRecord[],
  predicate: (f: DailyFactors) => boolean,
  fallback: number,
): number {
  const withVals: number[] = [];
  const withoutVals: number[] = [];
  for (const r of history) {
    const d = demandOf(r);
    if (d === null) continue;
    if (r.factors && predicate(r.factors)) withVals.push(d);
    else withoutVals.push(d);
  }
  const mWith = mean(withVals);
  const mWithout = mean(withoutVals);
  if (mWith === null || mWithout === null || mWithout === 0 || withVals.length < 3) {
    return fallback;
  }
  return clamp(safeDiv(mWith, mWithout, fallback), 0.5, 2.5);
}

interface AdjustmentContext {
  history: DailyRecord[];
  factors: DailyFactors | undefined;
  date: string;
}

/**
 * ベース需要へ各種補正を順に適用し、補正後需要と補正明細を返す。
 * 乗算補正を積み上げ、各段の差分(delta)を記録する。
 */
export function applyAdjustments(
  baseDemand: number,
  ctx: AdjustmentContext,
): { adjusted: number; adjustments: ForecastAdjustment[] } {
  const adjustments: ForecastAdjustment[] = [];
  let current = baseDemand;
  const f = ctx.factors;
  if (!f) return { adjusted: current, adjustments };

  const push = (key: string, label: string, mult: number, reasonBuilder: (delta: number) => string) => {
    if (mult === 1 || !Number.isFinite(mult)) return;
    const before = current;
    current = current * mult;
    const delta = current - before;
    if (Math.abs(delta) < 0.5) {
      current = before; // 影響が小さすぎる補正は無視
      return;
    }
    adjustments.push({ key, label, delta, reason: reasonBuilder(delta) });
  };

  // 天候補正
  if (f.weather) {
    const map: Record<string, number> = { sunny: 1.03, cloudy: 1.0, rainy: 0.9, snowy: 0.85, storm: 0.7 };
    const mult = map[f.weather] ?? 1;
    const wj: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', snowy: '雪', storm: '荒天' };
    push('weather', '天候補正', mult, (d) =>
      `${wj[f.weather!]}予報のため${d >= 0 ? '' : '来客減を見込み'}${Math.abs(Math.round(d))}${d >= 0 ? '増' : '減'}補正しました`,
    );
  }

  // 気温補正（履歴の気温感応度は簡易に固定係数。高温で需要微増を仮定）
  if (typeof f.tempHigh === 'number') {
    let mult = 1;
    if (f.tempHigh >= 30) mult = 1.05;
    else if (f.tempHigh <= 5) mult = 1.04; // 寒い日も鍋需要等で微増
    push('temp', '気温補正', mult, (d) =>
      `気温${f.tempHigh}℃の予報のため${Math.abs(Math.round(d))}${d >= 0 ? '増' : '減'}補正しました`,
    );
  }

  // 特売補正（履歴から学習、なければ+15%）
  if (f.sale) {
    const mult = learnedMultiplier(ctx.history, (x) => !!x.sale, 1.15);
    push('sale', '特売補正', mult, (d) => `特売予定のため${Math.abs(Math.round(d))}${d >= 0 ? '増' : '減'}補正しました`);
  }

  // キャンペーン補正
  if (f.campaign) {
    const mult = learnedMultiplier(ctx.history, (x) => !!x.campaign, 1.1);
    push('campaign', 'キャンペーン補正', mult, (d) => `キャンペーンのため${Math.abs(Math.round(d))}増補正しました`);
  }

  // イベント補正
  if (f.event) {
    const mult = learnedMultiplier(ctx.history, (x) => !!x.event, 1.08);
    push('event', 'イベント補正', mult, (d) => `イベント予定のため${Math.abs(Math.round(d))}増補正しました`);
  }

  // 祝日補正（曜日傾向とは別に、祝日平均比を学習）
  if (f.isHoliday) {
    const mult = learnedMultiplier(ctx.history, (x) => !!x.isHoliday, 1.05);
    push('holiday', '祝日補正', mult, (d) => `祝日のため${Math.abs(Math.round(d))}${d >= 0 ? '増' : '減'}補正しました`);
  }

  // 店休日
  if (f.closed) {
    const before = current;
    current = 0;
    adjustments.push({ key: 'closed', label: '店休日', delta: current - before, reason: '店休日のため予測を0にしました' });
  }

  return { adjusted: Math.max(0, current), adjustments };
}

/** 曜日名（日本語） */
export function dowLabel(date: string): string {
  return ['日', '月', '火', '水', '木', '金', '土'][dayOfWeek(date)];
}
