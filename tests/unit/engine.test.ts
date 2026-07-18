import { describe, it, expect } from 'vitest';
import { EnsembleForecastEngine } from '@/domain/forecast/engine';
import type { ForecastTargetMeta, ForecastConditions } from '@/domain/types';
import { buildHistory } from './fixtures';

const target: ForecastTargetMeta = { id: 't1', name: '木綿豆腐', unit: '丁', allowDecimal: false };
const engine = new EnsembleForecastEngine();

function assertFinite(r: ReturnType<typeof engine.forecast>) {
  const nums = [
    r.baseDemand, r.adjustedDemand, r.recommendedQuantity, r.safetyStock,
    r.rangeLow, r.rangeHigh, r.confidence.score,
  ];
  for (const n of nums) {
    expect(Number.isFinite(n), `value ${n} not finite`).toBe(true);
    expect(Number.isNaN(n)).toBe(false);
  }
  for (const c of r.components) expect(Number.isFinite(c.value)).toBe(true);
}

describe('forecast engine', () => {
  it('never produces NaN/Infinity even with empty history', () => {
    const r = engine.forecast([], target, { date: '2026-07-16' });
    assertFinite(r);
    expect(r.recommendedQuantity).toBeGreaterThanOrEqual(0);
  });

  it('empty history → reference confidence', () => {
    const r = engine.forecast([], target, { date: '2026-07-16' });
    expect(r.confidence.level).toBe('reference');
    expect(r.confidence.reasons.length).toBeGreaterThan(0);
  });

  it('1 year of data → high/standard confidence and last-year features', () => {
    const history = buildHistory('2026-07-16', 400, 100);
    const r = engine.forecast(history, target, { date: '2026-07-16' });
    assertFinite(r);
    expect(['high', 'standard']).toContain(r.confidence.level);
    expect(r.learnedFeatures).toContain('前年比較が利用可能');
    expect(r.baseDemand).toBeGreaterThan(0);
  });

  it('recommended = max(0, adjusted + safety - stock - ordered)', () => {
    const history = buildHistory('2026-07-16', 120, 100);
    const cond: ForecastConditions = {
      date: '2026-07-16', currentStock: 20, alreadyOrdered: 10, safetyRate: 0.1,
    };
    const r = engine.forecast(history, target, cond);
    const expected = Math.max(0, Math.round(r.adjustedDemand + r.safetyStock - 20 - 10));
    expect(r.recommendedQuantity).toBe(expected);
  });

  it('closed day forces zero prediction', () => {
    const history = buildHistory('2026-07-16', 90, 100);
    const r = engine.forecast(history, target, { date: '2026-07-16', factors: { closed: true } });
    expect(r.adjustedDemand).toBe(0);
    expect(r.adjustments.some((a) => a.key === 'closed')).toBe(true);
  });

  it('sale factor increases demand and records an adjustment reason', () => {
    const history = buildHistory('2026-07-16', 120, 100);
    const noSale = engine.forecast(history, target, { date: '2026-07-16' });
    const withSale = engine.forecast(history, target, { date: '2026-07-16', factors: { sale: true } });
    expect(withSale.adjustedDemand).toBeGreaterThanOrEqual(noSale.adjustedDemand);
    expect(withSale.reasons.join('')).toContain('特売');
  });

  it('generates human-readable Japanese reasons', () => {
    const history = buildHistory('2026-07-16', 200, 100);
    const r = engine.forecast(history, target, { date: '2026-07-16' });
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.join('')).toMatch(/曜日|前週|前年|平均/);
  });

  it('integer target rounds to integers', () => {
    const history = buildHistory('2026-07-16', 90, 37);
    const r = engine.forecast(history, target, { date: '2026-07-16' });
    expect(Number.isInteger(r.recommendedQuantity)).toBe(true);
  });

  it('range low <= adjusted <= range high', () => {
    const history = buildHistory('2026-07-16', 200, 100);
    const r = engine.forecast(history, target, { date: '2026-07-16' });
    expect(r.rangeLow).toBeLessThanOrEqual(r.adjustedDemand);
    expect(r.rangeHigh).toBeGreaterThanOrEqual(r.adjustedDemand);
  });
});
