import { describe, it, expect } from 'vitest';
import { finite, mean, safeDiv, stddev, median, clamp, weightedMean, roundQuantity } from '@/domain/math';

describe('math: NaN/Infinity guards', () => {
  it('finite falls back on non-finite', () => {
    expect(finite(NaN, 5)).toBe(5);
    expect(finite(Infinity, 5)).toBe(5);
    expect(finite(3)).toBe(3);
  });
  it('mean returns null for empty', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4, 6])).toBe(4);
  });
  it('safeDiv guards zero denominator', () => {
    expect(safeDiv(1, 0, -1)).toBe(-1);
    expect(safeDiv(10, 2)).toBe(5);
    expect(safeDiv(NaN, 2, 0)).toBe(0);
  });
  it('stddev of <2 is 0', () => {
    expect(stddev([5])).toBe(0);
    expect(stddev([])).toBe(0);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
  it('median handles odd/even', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('clamp bounds', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(NaN, 0, 3)).toBe(0);
  });
  it('weightedMean ignores zero-weight and null-total', () => {
    expect(weightedMean([])).toBeNull();
    expect(weightedMean([{ value: 10, weight: 0 }])).toBeNull();
    expect(weightedMean([{ value: 10, weight: 1 }, { value: 20, weight: 1 }])).toBe(15);
  });
  it('roundQuantity respects decimals', () => {
    expect(roundQuantity(3.14159, false)).toBe(3);
    expect(roundQuantity(3.14159, true)).toBe(3.14);
  });
});
