import type {
  DailyRecord, ForecastTargetMeta, ForecastConditions,
  ForecastResult, ForecastComponent, ForecastEngine,
} from '../types';
import {
  recentAverage, sameDowLastWeek, sameDowAverage, dayOfWeekFactors, monthFactors,
  recentTrend, lastYearSameDay, lastYearSamePeriod, effectiveDays, dataSpanDays,
  applyChangePoint,
} from './features';
import { applyAdjustments, dowLabel } from './adjustments';
import { selectTier, adjustByPerformance } from './weighting';
import { calcConfidence, type ConfidenceInput } from '../confidence/confidence';
import { weightedMean, clamp, roundQuantity, finite } from '../math';
import { dayOfWeek, monthOf } from '../dateutil';

export const MODEL_VERSION = 'ensemble-v1';

export interface EngineOptions {
  /** モデル別の過去成績スコア（対象/拠点別に外部から与える） */
  modelScores?: Record<string, number>;
  /** 信頼度算出の追加入力 */
  confidenceExtra?: Partial<ConfidenceInput>;
}

/**
 * 加重アンサンブル予測エンジン（説明可能・純粋関数）。
 * 将来 Python/Prophet/LightGBM 実装へ ForecastEngine 契約のまま差し替え可能。
 */
export class EnsembleForecastEngine implements ForecastEngine {
  readonly version = MODEL_VERSION;
  constructor(private opts: EngineOptions = {}) {}

  forecast(
    rawHistory: DailyRecord[],
    target: ForecastTargetMeta,
    conditions: ForecastConditions,
  ): ForecastResult {
    // 構造変化日以降を優先
    const history = applyChangePoint(rawHistory, target.changePointDate);
    const asOf = conditions.date;
    const eff = effectiveDays(history);
    const span = dataSpanDays(history);

    const tier = selectTier(span, eff);
    const weights = adjustByPerformance(tier.weights, this.opts.modelScores);

    // 各モデル要素の予測値を計算
    const dowFac = dayOfWeekFactors(history);
    const monFac = monthFactors(history);
    const overallAvg = recentAverage(history, asOf, Math.max(28, span)) ?? recentAverage(history, asOf, 9999);

    const raw: Array<{ key: string; label: string; value: number | null }> = [
      { key: 'avg7', label: '直近7日平均', value: recentAverage(history, asOf, 7) },
      { key: 'avg14', label: '直近14日平均', value: recentAverage(history, asOf, 14) },
      { key: 'avg28', label: '直近28日平均', value: recentAverage(history, asOf, 28) },
      { key: 'sameDowLastWeek', label: '前週同曜日', value: sameDowLastWeek(history, asOf) },
      { key: 'sameDowAvg4', label: '過去4週の同曜日平均', value: sameDowAverage(history, asOf, 4) },
      { key: 'lastYearSameDay', label: '前年同日', value: lastYearSameDay(history, asOf) },
      { key: 'lastYearSamePeriod', label: '前年同時期平均', value: lastYearSamePeriod(history, asOf) },
    ];

    // trend / month は「基準平均へ係数を掛けた予測値」として合成
    const components: ForecastComponent[] = [];
    for (const item of raw) {
      const w = weights[item.key];
      if (!w || item.value === null) continue;
      components.push({ key: item.key, label: item.label, value: item.value, weight: w });
    }

    if (weights.trend && overallAvg !== null) {
      const t = recentTrend(history, asOf);
      components.push({
        key: 'trend', label: '直近の増減トレンド', value: overallAvg * t, weight: weights.trend,
        note: t > 1.02 ? '直近は増加傾向' : t < 0.98 ? '直近は減少傾向' : '直近は横ばい',
      });
    }
    if (weights.month && overallAvg !== null) {
      const mf = monFac[monthOf(asOf)] ?? 1;
      components.push({
        key: 'month', label: '月別・季節傾向', value: overallAvg * mf, weight: weights.month,
      });
    }

    // アンサンブル（曜日係数で全体基準を補正した値もフォールバックに）
    let baseDemand = weightedMean(components.map((c) => ({ value: c.value, weight: c.weight })));
    if (baseDemand === null) {
      // データが乏しい場合のフォールバック：全体平均×曜日係数、無ければ0
      const fac = dowFac[dayOfWeek(asOf)] ?? 1;
      baseDemand = overallAvg !== null ? overallAvg * fac : 0;
    }
    baseDemand = Math.max(0, finite(baseDemand, 0));

    // 補正適用
    const { adjusted, adjustments } = applyAdjustments(baseDemand, {
      history, factors: conditions.factors, date: asOf,
    });

    // 安全分・在庫・既発注から最終推奨数
    const safetyRate = conditions.safetyRate ?? 0.1;
    const safetyStock = adjusted * clamp(safetyRate, 0, 1);
    const currentStock = conditions.currentStock ?? 0;
    const alreadyOrdered = conditions.alreadyOrdered ?? 0;
    const recommendedRaw = adjusted + safetyStock - currentStock - alreadyOrdered;
    const recommended = Math.max(0, recommendedRaw);

    // 予測範囲（±ばらつき。データ少なめほど広く）
    const spread = clamp(0.35 - Math.min(0.2, eff / 400), 0.12, 0.35);
    const rangeLow = Math.max(0, adjusted * (1 - spread));
    const rangeHigh = adjusted * (1 + spread);

    // 信頼度
    const confidence = calcConfidence({
      history, target,
      hasEventInfo: !!conditions.factors?.event,
      hasSimilarPast: this.opts.confidenceExtra?.hasSimilarPast,
      ...this.opts.confidenceExtra,
    });

    // 予測理由（日本語・一般利用者向け）
    const reasons = this.buildReasons(history, asOf, baseDemand, adjustments, components);

    const allowDecimal = target.allowDecimal;
    return {
      targetId: target.id,
      date: asOf,
      baseDemand: roundQuantity(baseDemand, allowDecimal),
      adjustedDemand: roundQuantity(adjusted, allowDecimal),
      safetyStock: roundQuantity(safetyStock, allowDecimal),
      currentStock: roundQuantity(currentStock, allowDecimal),
      alreadyOrdered: roundQuantity(alreadyOrdered, allowDecimal),
      recommendedQuantity: roundQuantity(recommended, allowDecimal),
      rangeLow: roundQuantity(rangeLow, allowDecimal),
      rangeHigh: roundQuantity(rangeHigh, allowDecimal),
      components: components.map((c) => ({ ...c, value: roundQuantity(c.value, allowDecimal) })),
      adjustments,
      reasons,
      confidence,
      learnedFeatures: tier.learnedFeatures,
      modelVersion: this.version,
    };
  }

  private buildReasons(
    history: DailyRecord[], asOf: string, baseDemand: number,
    adjustments: ForecastResult['adjustments'], components: ForecastComponent[],
  ): string[] {
    const reasons: string[] = [];
    const dow = dowLabel(asOf);

    const sameDow4 = components.find((c) => c.key === 'sameDowAvg4');
    if (sameDow4) reasons.push(`過去4週間の${dow}曜日平均は${Math.round(sameDow4.value)}です`);

    const lastWeek = sameDowLastWeek(history, asOf);
    if (lastWeek !== null) {
      const diff = Math.round(baseDemand - lastWeek);
      if (Math.abs(diff) >= 1) {
        reasons.push(`前週同曜日（${Math.round(lastWeek)}）より${Math.abs(diff)}${diff >= 0 ? '増加' : '減少'}の見込みです`);
      }
    }

    const ly = lastYearSameDay(history, asOf);
    if (ly !== null && ly > 0) {
      const pct = Math.round(((baseDemand - ly) / ly) * 100);
      if (Math.abs(pct) >= 2) reasons.push(`昨年同日より全体需要が${Math.abs(pct)}％${pct >= 0 ? '増加' : '減少'}しています`);
    }

    for (const adj of adjustments) reasons.push(adj.reason);
    return reasons;
  }
}

/** 既定エンジン生成 */
export function createForecastEngine(opts?: EngineOptions): ForecastEngine {
  return new EnsembleForecastEngine(opts);
}
