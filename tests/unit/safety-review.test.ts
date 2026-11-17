import { describe, it, expect } from 'vitest';
import { adviseSafetyRate, stepDown, stepUp } from '@/lib/safety-review';

describe('多めに作る割合の見直し', () => {
  it('1段ずつ上げ下げする', () => {
    expect(stepDown(0.2)).toBe(0.15);
    expect(stepDown(0)).toBeNull();
    expect(stepUp(0.1)).toBe(0.15);
    expect(stepUp(0.3)).toBeNull();
    // 選択肢にない値（12%）でも隣の段へ
    expect(stepDown(0.12)).toBe(0.1);
  });

  it('データが少ないうちは判断しない', () => {
    expect(adviseSafetyRate({ currentRate: 0.2, deliveries: 5, soldOutDays: 0, hasLossRecords: true })).toEqual({
      action: 'need-data',
      reason: 'few-deliveries',
    });
    expect(adviseSafetyRate({ currentRate: 0.2, deliveries: 30, soldOutDays: 0, hasLossRecords: false })).toEqual({
      action: 'need-data',
      reason: 'no-loss-records',
    });
  });

  it('売り切れがなければ1段下げ、多ければ1段上げる', () => {
    expect(adviseSafetyRate({ currentRate: 0.2, deliveries: 30, soldOutDays: 0, hasLossRecords: true })).toEqual({
      action: 'lower',
      toRate: 0.15,
    });
    expect(adviseSafetyRate({ currentRate: 0.1, deliveries: 30, soldOutDays: 4, hasLossRecords: true })).toEqual({
      action: 'raise',
      toRate: 0.15,
    });
    expect(adviseSafetyRate({ currentRate: 0.1, deliveries: 30, soldOutDays: 1, hasLossRecords: true })).toEqual({
      action: 'keep',
    });
    expect(adviseSafetyRate({ currentRate: 0, deliveries: 30, soldOutDays: 0, hasLossRecords: true })).toEqual({
      action: 'keep',
    });
  });
});
