import { safeDiv, finite } from '../math';

/** 予測 vs 実績のペア */
export interface ForecastActualPair {
  date: string;
  predicted: number;
  actual: number;
  /** 許容誤差率(0-1)。省略時は組織既定を呼び出し側で埋める */
  toleranceRate?: number;
}

export interface AccuracyMetrics {
  /** 有効件数 */
  count: number;
  /** 平均絶対誤差 */
  mae: number;
  /** 加重絶対誤差率(0-1)。実績0でも破綻しない主指標 */
  wape: number;
  /** 平均絶対誤差率(0-1)。実績0の行は除外して算出 */
  mape: number;
  /** MAPE算出に使えた件数（実績0を除く） */
  mapeCount: number;
  /** 二乗平均平方根誤差 */
  rmse: number;
  /** 偏り（正=過剰予測傾向, 負=不足傾向） */
  bias: number;
  /** 許容誤差内に収まった割合(0-1) */
  hitRate: number;
  /** 過剰予測回数 */
  overCount: number;
  /** 不足予測回数 */
  underCount: number;
  /** 適正（許容内）回数 */
  onTargetCount: number;
}

const EMPTY: AccuracyMetrics = {
  count: 0, mae: 0, wape: 0, mape: 0, mapeCount: 0, rmse: 0, bias: 0,
  hitRate: 0, overCount: 0, underCount: 0, onTargetCount: 0,
};

/**
 * 予測精度指標を算出。
 * - MAPEは実績0の行を除外（ゼロ除算破綻の回避）。全行0ならMAPE=0, mapeCount=0。
 * - WAPEはΣ|誤差|/Σ実績。実績合計0のときは0（破綻させない）。
 * - hitRateは各行の許容誤差率内(既定10%)に収まった割合。
 */
export function calcAccuracy(pairs: ForecastActualPair[], defaultTolerance = 0.1): AccuracyMetrics {
  const valid = pairs.filter(
    (p) => Number.isFinite(p.predicted) && Number.isFinite(p.actual),
  );
  if (valid.length === 0) return { ...EMPTY };

  let absSum = 0;
  let sqSum = 0;
  let signedSum = 0;
  let actualSum = 0;
  let mapeSum = 0;
  let mapeCount = 0;
  let over = 0;
  let under = 0;
  let onTarget = 0;
  let hit = 0;

  for (const p of valid) {
    const err = p.predicted - p.actual;
    const absErr = Math.abs(err);
    absSum += absErr;
    sqSum += err * err;
    signedSum += err;
    actualSum += p.actual;

    if (p.actual !== 0) {
      mapeSum += absErr / Math.abs(p.actual);
      mapeCount += 1;
    }

    if (err > 0.0001) over += 1;
    else if (err < -0.0001) under += 1;

    // 許容誤差判定：実績0のときは「予測も0なら的中」とする
    const tol = p.toleranceRate ?? defaultTolerance;
    const within =
      p.actual === 0 ? p.predicted === 0 : absErr / Math.abs(p.actual) <= tol;
    if (within) {
      onTarget += 1;
      hit += 1;
    }
  }

  const n = valid.length;
  return {
    count: n,
    mae: finite(absSum / n, 0),
    wape: safeDiv(absSum, actualSum, 0),
    mape: mapeCount > 0 ? finite(mapeSum / mapeCount, 0) : 0,
    mapeCount,
    rmse: finite(Math.sqrt(sqSum / n), 0),
    bias: finite(signedSum / n, 0),
    hitRate: finite(hit / n, 0),
    overCount: over,
    underCount: under,
    onTargetCount: onTarget,
  };
}

/** 正答率の4段階分類（利用者設定の許容誤差ベース） */
export type AccuracyBand = 'hit' | 'nearHit' | 'caution' | 'off';

export interface AccuracyThresholds {
  /** 的中（既定0.05） */
  hit: number;
  /** ほぼ的中（既定0.10） */
  nearHit: number;
  /** 要注意（既定0.20） */
  caution: number;
}

export const DEFAULT_THRESHOLDS: AccuracyThresholds = { hit: 0.05, nearHit: 0.1, caution: 0.2 };

/** 1件の予測実績を4段階へ分類 */
export function classifyBand(
  predicted: number, actual: number, t: AccuracyThresholds = DEFAULT_THRESHOLDS,
): AccuracyBand {
  if (actual === 0) return predicted === 0 ? 'hit' : 'off';
  const rate = Math.abs(predicted - actual) / Math.abs(actual);
  if (rate <= t.hit) return 'hit';
  if (rate <= t.nearHit) return 'nearHit';
  if (rate <= t.caution) return 'caution';
  return 'off';
}

export function bandLabel(band: AccuracyBand): string {
  return { hit: '的中', nearHit: 'ほぼ的中', caution: '要注意', off: '大きなずれ' }[band];
}

/** モデル別成績スコア（0-1, 高いほど良い）。WAPEを1-WAPEでスコア化 */
export function modelScoreFromPairs(pairs: ForecastActualPair[]): number {
  const m = calcAccuracy(pairs);
  if (m.count === 0) return 1;
  return Math.max(0.2, Math.min(2, 1 - m.wape + 0.5));
}
