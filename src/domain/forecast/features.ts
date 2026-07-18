import type { DailyRecord } from '../types';
import { mean, safeDiv, clamp } from '../math';
import { addDays, diffDays, dayOfWeek, monthOf, sameDayLastYear, toEpoch } from '../dateutil';

/**
 * 実績から「需要」の代理値を求める。
 * 売り切れ日は販売数が需要の上限を示さないため、欠品推定分を加える。
 * 欠品推定が無く soldOut のみの場合は控えめに10%上乗せ（説明可能な既定）。
 */
export function demandOf(r: DailyRecord): number | null {
  if (r.sales === null || r.sales === undefined) return null;
  let demand = r.sales;
  if (r.stockout && r.stockout > 0) {
    demand += r.stockout;
  } else if (r.soldOut) {
    demand = r.sales * 1.1;
  }
  return demand;
}

/** 有効な需要値を持つ (date, demand) の配列を昇順で返す */
export function demandSeries(history: DailyRecord[]): Array<{ date: string; demand: number; r: DailyRecord }> {
  return history
    .map((r) => ({ date: r.date, demand: demandOf(r), r }))
    .filter((x): x is { date: string; demand: number; r: DailyRecord } => x.demand !== null)
    .sort((a, b) => toEpoch(a.date) - toEpoch(b.date));
}

/** asOf の「直前」windowDays 日間の平均需要（asOf当日は含めない） */
export function recentAverage(history: DailyRecord[], asOf: string, windowDays: number): number | null {
  const start = addDays(asOf, -windowDays);
  const vals = demandSeries(history)
    .filter((x) => x.date >= start && x.date < asOf)
    .map((x) => x.demand);
  return mean(vals);
}

/** 前週同曜日の需要 */
export function sameDowLastWeek(history: DailyRecord[], asOf: string): number | null {
  const target = addDays(asOf, -7);
  const hit = demandSeries(history).find((x) => x.date === target);
  return hit ? hit.demand : null;
}

/** 過去 weeks 週間の同曜日平均需要 */
export function sameDowAverage(history: DailyRecord[], asOf: string, weeks: number): number | null {
  const dow = dayOfWeek(asOf);
  const earliest = addDays(asOf, -7 * weeks);
  const vals = demandSeries(history)
    .filter((x) => x.date < asOf && x.date >= earliest && dayOfWeek(x.date) === dow)
    .map((x) => x.demand);
  return mean(vals);
}

/** 曜日別の係数（全体平均を1とした時の各曜日の比） */
export function dayOfWeekFactors(history: DailyRecord[]): Record<number, number> {
  const series = demandSeries(history);
  const overall = mean(series.map((x) => x.demand));
  const factors: Record<number, number> = {};
  for (let d = 0; d < 7; d++) {
    const vals = series.filter((x) => dayOfWeek(x.date) === d).map((x) => x.demand);
    const m = mean(vals);
    factors[d] = overall && m !== null ? clamp(safeDiv(m, overall, 1), 0.3, 3) : 1;
  }
  return factors;
}

/** 月別の係数（全体平均を1とした比）→ 季節性の近似 */
export function monthFactors(history: DailyRecord[]): Record<number, number> {
  const series = demandSeries(history);
  const overall = mean(series.map((x) => x.demand));
  const factors: Record<number, number> = {};
  for (let mo = 1; mo <= 12; mo++) {
    const vals = series.filter((x) => monthOf(x.date) === mo).map((x) => x.demand);
    const m = mean(vals);
    factors[mo] = overall && m !== null ? clamp(safeDiv(m, overall, 1), 0.4, 2.5) : 1;
  }
  return factors;
}

/**
 * 直近の増減トレンド。直近 window 日平均 と その前 window 日平均 の比。
 * 1.0=横ばい, >1=増加, <1=減少。データ不足時は1.0。
 */
export function recentTrend(history: DailyRecord[], asOf: string, window = 14): number {
  const recent = recentAverage(history, asOf, window);
  const prevEnd = addDays(asOf, -window);
  const prev = recentAverage(history, prevEnd, window);
  if (recent === null || prev === null || prev === 0) return 1;
  return clamp(safeDiv(recent, prev, 1), 0.6, 1.6);
}

/** 前年同日の需要 */
export function lastYearSameDay(history: DailyRecord[], asOf: string): number | null {
  const target = sameDayLastYear(asOf);
  const hit = demandSeries(history).find((x) => x.date === target);
  return hit ? hit.demand : null;
}

/** 前年同時期（±3日）の平均需要 */
export function lastYearSamePeriod(history: DailyRecord[], asOf: string): number | null {
  const center = sameDayLastYear(asOf);
  const vals = demandSeries(history)
    .filter((x) => Math.abs(diffDays(x.date, center)) <= 3)
    .map((x) => x.demand);
  return mean(vals);
}

/** 有効な実績日数 */
export function effectiveDays(history: DailyRecord[]): number {
  return demandSeries(history).length;
}

/** データ蓄積期間（最古〜最新の日数） */
export function dataSpanDays(history: DailyRecord[]): number {
  const series = demandSeries(history);
  if (series.length < 2) return series.length;
  return diffDays(series[series.length - 1].date, series[0].date) + 1;
}

/** 構造変化日以降のみへ履歴を絞る（changePoint未設定なら全件） */
export function applyChangePoint(history: DailyRecord[], changePointDate?: string | null): DailyRecord[] {
  if (!changePointDate) return history;
  return history.filter((r) => r.date >= changePointDate);
}
