/**
 * 「多めに作る割合（廃棄の目安）」の見直し提案（純粋関数・UI非依存）。
 *
 * 考え方：わざと少し余るように作り、売り切れが出なければ1段ずつ下げる。
 * 売り切れが目立つようなら1段上げる。データが少ないうちは判断しない。
 */

export const SAFETY_STEPS_PCT = [0, 5, 10, 15, 20, 25, 30] as const;

/** 判断に必要な最低限の納品回数（お店×日） */
export const MIN_DELIVERIES = 14;
/** 売り切れがこの割合以上なら、上げることをすすめる */
export const RAISE_SOLDOUT_RATIO = 0.1;

export type SafetyAdvice =
  | { action: 'need-data'; reason: 'few-deliveries' | 'no-loss-records' }
  | { action: 'lower'; toRate: number }
  | { action: 'raise'; toRate: number }
  | { action: 'keep' };

export interface SafetyAdviceInput {
  /** いまの割合（0-1） */
  currentRate: number;
  /** 期間内の納品回数（お店×日、数量 > 0） */
  deliveries: number;
  /** 期間内の売り切れ回数（お店×日） */
  soldOutDays: number;
  /** 廃棄か売り切れを1回でも記録しているか（記録していない人には判断できない） */
  hasLossRecords: boolean;
}

/** 1段下・1段上の割合（0-1）。端なら null。 */
export function stepDown(rate: number): number | null {
  const pct = Math.round(rate * 100);
  const lower = SAFETY_STEPS_PCT.filter((s) => s < pct);
  return lower.length ? lower[lower.length - 1] / 100 : null;
}
export function stepUp(rate: number): number | null {
  const pct = Math.round(rate * 100);
  const upper = SAFETY_STEPS_PCT.find((s) => s > pct);
  return upper != null ? upper / 100 : null;
}

export function adviseSafetyRate(input: SafetyAdviceInput): SafetyAdvice {
  if (input.deliveries < MIN_DELIVERIES) return { action: 'need-data', reason: 'few-deliveries' };
  if (!input.hasLossRecords) return { action: 'need-data', reason: 'no-loss-records' };

  const ratio = input.soldOutDays / input.deliveries;
  if (ratio >= RAISE_SOLDOUT_RATIO) {
    const up = stepUp(input.currentRate);
    return up != null ? { action: 'raise', toRate: up } : { action: 'keep' };
  }
  if (input.soldOutDays === 0) {
    const down = stepDown(input.currentRate);
    return down != null ? { action: 'lower', toRate: down } : { action: 'keep' };
  }
  return { action: 'keep' };
}
