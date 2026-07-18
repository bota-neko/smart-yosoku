import { describe, it, expect } from 'vitest';
import { calcAccuracy, classifyBand, modelScoreFromPairs } from '@/domain/accuracy/metrics';

describe('accuracy metrics', () => {
  it('empty pairs return zeros, no NaN', () => {
    const m = calcAccuracy([]);
    expect(m.count).toBe(0);
    expect(Number.isFinite(m.mape)).toBe(true);
    expect(Number.isFinite(m.wape)).toBe(true);
  });

  it('MAPE excludes actual=0 rows (no division blowup)', () => {
    const m = calcAccuracy([
      { date: '2026-01-01', predicted: 10, actual: 0 }, // 除外
      { date: '2026-01-02', predicted: 12, actual: 10 }, // 20%
    ]);
    expect(m.mapeCount).toBe(1);
    expect(m.mape).toBeCloseTo(0.2, 5);
    expect(Number.isFinite(m.mape)).toBe(true);
  });

  it('all-zero actuals: MAPE=0 mapeCount=0, WAPE=0 (no NaN)', () => {
    const m = calcAccuracy([
      { date: '2026-01-01', predicted: 5, actual: 0 },
      { date: '2026-01-02', predicted: 3, actual: 0 },
    ]);
    expect(m.mapeCount).toBe(0);
    expect(m.mape).toBe(0);
    expect(m.wape).toBe(0);
  });

  it('perfect forecast → zero error, hitRate 1', () => {
    const m = calcAccuracy([
      { date: '2026-01-01', predicted: 100, actual: 100 },
      { date: '2026-01-02', predicted: 80, actual: 80 },
    ]);
    expect(m.mae).toBe(0);
    expect(m.wape).toBe(0);
    expect(m.hitRate).toBe(1);
    expect(m.onTargetCount).toBe(2);
  });

  it('bias sign: over-prediction positive', () => {
    const m = calcAccuracy([
      { date: '2026-01-01', predicted: 110, actual: 100 },
      { date: '2026-01-02', predicted: 105, actual: 100 },
    ]);
    expect(m.bias).toBeGreaterThan(0);
    expect(m.overCount).toBe(2);
    expect(m.underCount).toBe(0);
  });

  it('WAPE = sum|err| / sum(actual)', () => {
    const m = calcAccuracy([
      { date: '2026-01-01', predicted: 90, actual: 100 },
      { date: '2026-01-02', predicted: 120, actual: 100 },
    ]);
    // |−10|+|20| = 30, actualSum=200 → 0.15
    expect(m.wape).toBeCloseTo(0.15, 5);
  });

  it('classifyBand 4-level', () => {
    expect(classifyBand(100, 100)).toBe('hit');
    expect(classifyBand(108, 100)).toBe('nearHit');
    expect(classifyBand(118, 100)).toBe('caution');
    expect(classifyBand(150, 100)).toBe('off');
    expect(classifyBand(0, 0)).toBe('hit');
    expect(classifyBand(5, 0)).toBe('off');
  });

  it('modelScore is finite and bounded', () => {
    const s = modelScoreFromPairs([{ date: '2026-01-01', predicted: 100, actual: 100 }]);
    expect(s).toBeGreaterThan(0);
    expect(Number.isFinite(s)).toBe(true);
  });
});
