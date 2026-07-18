import { describe, it, expect } from 'vitest';
import { calcConfidence } from '@/domain/confidence/confidence';
import { detectAnomalies } from '@/domain/anomaly/detect';
import type { ForecastTargetMeta } from '@/domain/types';
import { buildHistory } from './fixtures';

const target: ForecastTargetMeta = { id: 't1', name: '木綿豆腐', unit: '丁', allowDecimal: false };

describe('confidence', () => {
  it('few days → reference with reason', () => {
    const history = buildHistory('2026-07-16', 5, 100);
    const c = calcConfidence({ history, target });
    expect(c.level).toBe('reference');
    expect(c.reasons.some((r) => r.includes('日分'))).toBe(true);
    expect(c.score).toBeGreaterThanOrEqual(0);
    expect(c.score).toBeLessThanOrEqual(100);
  });

  it('new product lowers confidence with reason', () => {
    const history = buildHistory('2026-07-16', 200, 100);
    const c = calcConfidence({ history, target: { ...target, isNew: true } });
    expect(c.reasons.join('')).toContain('新商品');
  });

  it('ample stable data → high confidence', () => {
    const history = buildHistory('2026-07-16', 300, 100);
    const c = calcConfidence({ history, target });
    expect(['high', 'standard']).toContain(c.level);
  });
});

describe('anomaly detection', () => {
  it('flags an extreme outlier without deleting data', () => {
    const history = buildHistory('2026-07-16', 90, 100);
    history[45] = { ...history[45], sales: 100000 };
    const found = detectAnomalies(history);
    expect(found.some((a) => a.type === 'outlierHigh')).toBe(true);
  });

  it('normal data produces no false positives', () => {
    const history = buildHistory('2026-07-16', 90, 100);
    const found = detectAnomalies(history);
    // 決定論データはスパイクを含まないため 0 に近い
    expect(found.filter((a) => a.type === 'outlierHigh').length).toBe(0);
  });

  it('detects duplicate dates', () => {
    const history = buildHistory('2026-07-16', 30, 100);
    history.push({ ...history[10] });
    const found = detectAnomalies(history);
    expect(found.some((a) => a.type === 'duplicate')).toBe(true);
  });
});
