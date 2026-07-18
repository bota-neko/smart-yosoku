/** NaN/Infinity を絶対に外へ出さないための安全な数値ユーティリティ */

/** 有限数でなければ fallback を返す */
export function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/** 平均。空配列は null（未定義を明示） */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return finite(sum / values.length, null as unknown as number) ?? null;
}

/** 安全な除算。分母0や非有限なら fallback */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return finite(numerator / denominator, fallback);
}

/** 標準偏差（母標準偏差）。要素1件以下は0 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  if (m === null) return 0;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return finite(Math.sqrt(variance), 0);
}

/** 中央値 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 値を[min,max]に収める */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(finite(n, min), min), max);
}

/** 加重平均。重み合計0なら null */
export function weightedMean(pairs: Array<{ value: number; weight: number }>): number | null {
  const valid = pairs.filter((p) => Number.isFinite(p.value) && Number.isFinite(p.weight) && p.weight > 0);
  const totalWeight = valid.reduce((a, p) => a + p.weight, 0);
  if (totalWeight === 0) return null;
  const sum = valid.reduce((a, p) => a + p.value * p.weight, 0);
  return finite(sum / totalWeight, null as unknown as number) ?? null;
}

/** 四捨五入（小数許容フラグで整数丸め切替） */
export function roundQuantity(n: number, allowDecimal: boolean): number {
  const v = finite(n, 0);
  if (allowDecimal) return Math.round(v * 100) / 100;
  return Math.round(v);
}
