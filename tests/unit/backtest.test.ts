import { describe, it, expect } from 'vitest';
import { computeBacktest, accuracyLabel } from '@/lib/backtest';
import { addDays } from '@/domain';

const location = { id: 'chuo', name: '中央スーパー' };
const product = { id: 'momen', name: '木綿豆腐', unit: '丁', allowDecimal: false };
const today = '2026-10-03';

function constantMap(days: number, qty: number) {
  const m: Record<string, number> = {};
  for (let i = 1; i <= days; i++) m[`${addDays(today, -i)}|chuo|momen`] = qty;
  return m;
}

describe('computeBacktest', () => {
  it('記録がなければ件数0・評価なし', () => {
    const r = computeBacktest({ deliveries: {}, factorsByDate: {}, pairs: [{ location, product }], today, days: 30 });
    expect(r.overall.count).toBe(0);
    expect(r.targets.length).toBe(0);
    expect(accuracyLabel(r.overall)).toBeNull();
  });

  it('毎日同じ数なら、ほぼ当たる', () => {
    const r = computeBacktest({ deliveries: constantMap(60, 100), factorsByDate: {}, pairs: [{ location, product }], today, days: 30 });
    expect(r.overall.count).toBe(30);
    expect(r.overall.wape).toBeLessThan(0.05);
    expect(accuracyLabel(r.overall)?.label).toBe('よく当たる');
  });

  it('過去14日未満の記録しかない日は評価しない', () => {
    const r = computeBacktest({ deliveries: constantMap(20, 100), factorsByDate: {}, pairs: [{ location, product }], today, days: 30 });
    expect(r.overall.count).toBe(20 - 14);
  });

  it('今日の記録は評価に含めない', () => {
    const m = { ...constantMap(40, 100), [`${today}|chuo|momen`]: 999 };
    const r = computeBacktest({ deliveries: m, factorsByDate: {}, pairs: [{ location, product }], today, days: 30 });
    expect(r.targets[0].pairs.every((p) => p.date < today)).toBe(true);
  });
});
