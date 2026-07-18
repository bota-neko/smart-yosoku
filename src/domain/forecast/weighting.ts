/**
 * データ蓄積期間に応じて、使用する予測要素(モデル)と基本重みを決める。
 * 「新しいデータを優先」しつつ、期間が延びるほど季節性・前年比較の重みを上げる。
 * さらに各モデルの過去成績(スコア)があれば重みへ乗算する。
 */

export interface ModelWeightTier {
  /** このティアの名称（表示用） */
  tier: string;
  /** 要素キー -> 基本重み */
  weights: Record<string, number>;
  /** 蓄積により学習できた傾向 */
  learnedFeatures: string[];
}

/** データ蓄積日数に応じた基本重みティア */
export function selectTier(dataSpanDays: number, effectiveDays: number): ModelWeightTier {
  // 有効実績が極端に少ない場合は参考値
  if (effectiveDays < 7) {
    return {
      tier: '参考値（データ7日未満）',
      weights: { avg7: 1 },
      learnedFeatures: [],
    };
  }
  if (dataSpanDays < 30) {
    return {
      tier: '直近平均・曜日傾向中心（7〜30日）',
      weights: { avg7: 1.2, avg14: 0.8, sameDowLastWeek: 1.0, sameDowAvg4: 0.8 },
      learnedFeatures: ['曜日傾向を学習中'],
    };
  }
  if (dataSpanDays < 90) {
    return {
      tier: '曜日・直近傾向・気温/天候（1〜3か月）',
      weights: { avg7: 1.0, avg14: 0.9, avg28: 0.7, sameDowLastWeek: 1.0, sameDowAvg4: 1.2, trend: 0.8 },
      learnedFeatures: ['曜日傾向を学習済み', '直近トレンドを学習済み'],
    };
  }
  if (dataSpanDays < 365) {
    return {
      tier: '月別・季節・イベント傾向を追加（3か月〜1年）',
      weights: { avg7: 0.9, avg14: 0.8, avg28: 0.8, sameDowAvg4: 1.2, trend: 0.7, month: 1.0 },
      learnedFeatures: ['曜日傾向を学習済み', '月別傾向を学習済み', '季節傾向を学習中'],
    };
  }
  if (dataSpanDays < 730) {
    return {
      tier: '前年同日・前年同週・季節性を重視（1年以上）',
      weights: {
        avg7: 0.7, avg28: 0.7, sameDowAvg4: 1.0, trend: 0.6, month: 1.1,
        lastYearSameDay: 1.2, lastYearSamePeriod: 1.0,
      },
      learnedFeatures: ['曜日傾向を学習済み', '月別傾向を学習済み', '季節傾向を学習済み', '前年比較が利用可能'],
    };
  }
  return {
    tier: '複数年の季節性・年次トレンド（2年以上）',
    weights: {
      avg7: 0.6, avg28: 0.6, sameDowAvg4: 1.0, trend: 0.6, month: 1.2,
      lastYearSameDay: 1.3, lastYearSamePeriod: 1.2,
    },
    learnedFeatures: [
      '曜日傾向を学習済み', '月別傾向を学習済み', '季節傾向を学習済み',
      '前年比較が利用可能', '年間イベント傾向を学習済み',
    ],
  };
}

/**
 * モデル別の過去成績（0-1、高いほど良い）を基本重みへ乗算して調整。
 * scores 未指定のキーは 1.0 として扱う。
 */
export function adjustByPerformance(
  base: Record<string, number>,
  scores?: Record<string, number>,
): Record<string, number> {
  if (!scores) return base;
  const out: Record<string, number> = {};
  for (const [k, w] of Object.entries(base)) {
    const s = scores[k];
    out[k] = Number.isFinite(s) ? w * Math.max(0.2, Math.min(2, s!)) : w;
  }
  return out;
}
