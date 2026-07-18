import type { DailyRecord, ForecastTargetMeta, ConfidenceResult } from '../types';
import { demandSeries, effectiveDays, dataSpanDays } from '../forecast/features';
import { clamp } from '../math';

export interface ConfidenceInput {
  history: DailyRecord[];
  target: ForecastTargetMeta;
  /** 直近の予測誤差率(0-1)。未算出なら undefined */
  recentErrorRate?: number;
  /** 異常値件数 */
  anomalyCount?: number;
  /** 対象日と類似条件の過去実績があるか */
  hasSimilarPast?: boolean;
  isNewLocation?: boolean;
  /** 大きな価格/構造変化が最近あったか */
  recentStructuralChange?: boolean;
  /** 対象日にイベント情報が登録されているか */
  hasEventInfo?: boolean;
}

/**
 * 今回の予測の信頼度を算出。過去精度とは独立に、
 * データ量・欠損・直近誤差・異常値・新規性などから0-100スコアと理由を返す。
 */
export function calcConfidence(input: ConfidenceInput): ConfidenceResult {
  const reasons: string[] = [];
  let score = 100;

  const eff = effectiveDays(input.history);
  const span = dataSpanDays(input.history);

  // データ蓄積日数
  if (eff < 7) {
    score -= 55;
    reasons.push(`過去データが${eff}日分しかありません`);
  } else if (eff < 14) {
    score -= 35;
    reasons.push(`過去データが${eff}日分しかありません`);
  } else if (eff < 30) {
    score -= 18;
    reasons.push('データ蓄積が1か月未満のため精度が安定しない可能性があります');
  } else if (eff < 90) {
    score -= 8;
  }

  // データ欠損率（期間に対する有効実績の割合）
  if (span > 0) {
    const coverage = clamp(eff / span, 0, 1);
    if (coverage < 0.5) {
      score -= 20;
      reasons.push('入力されていない日が多く、データの欠損が目立ちます');
    } else if (coverage < 0.8) {
      score -= 8;
    }
  }

  // 新商品・新規拠点
  if (input.target.isNew) {
    score -= 25;
    reasons.push('新商品のため参考予測です');
  }
  if (input.isNewLocation) {
    score -= 20;
    reasons.push('新規拠点のため実績が十分ではありません');
  }

  // 構造変化
  if (input.recentStructuralChange || input.target.changePointDate) {
    score -= 12;
    reasons.push('最近の価格・仕様変更があり、変更後のデータを優先しています');
  }

  // 直近誤差
  if (typeof input.recentErrorRate === 'number') {
    if (input.recentErrorRate > 0.3) {
      score -= 20;
      reasons.push('最近の予測のずれが大きくなっています');
    } else if (input.recentErrorRate > 0.15) {
      score -= 8;
    }
  }

  // 異常値
  if (input.anomalyCount && input.anomalyCount > 0) {
    score -= Math.min(15, input.anomalyCount * 3);
    reasons.push('確認待ちの異常値があります');
  }

  // 需要変動の大きさ
  const vals = demandSeries(input.history).map((x) => x.demand);
  if (vals.length >= 14) {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
    const cv = m > 0 ? sd / m : 0;
    if (cv > 0.6) {
      score -= 12;
      reasons.push('最近の売上変動が大きくなっています');
    }
  }

  // 類似条件の有無
  if (input.hasSimilarPast === false) {
    score -= 10;
    reasons.push('同様の条件・イベントの実績がありません');
  }

  score = clamp(score, 0, 100);

  let level: ConfidenceResult['level'];
  if (eff < 7) level = 'reference';
  else if (score >= 75) level = 'high';
  else if (score >= 50) level = 'standard';
  else level = 'low';

  return { level, score: Math.round(score), reasons };
}

/** 信頼度レベルの日本語ラベル */
export function confidenceLabel(level: ConfidenceResult['level']): string {
  return { high: '高い', standard: '標準', low: '低い', reference: '参考値' }[level];
}
