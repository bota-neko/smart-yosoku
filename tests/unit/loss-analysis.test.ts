import { describe, it, expect } from 'vitest';
import { computeLossSummary } from '@/lib/loss-analysis';

const products = [{ id: 'momen', name: '木綿豆腐', unit: '丁', price: 150, cost: 60 }];

describe('computeLossSummary', () => {
  it('empty input → all zero, no NaN', () => {
    const s = computeLossSummary({ deliveries: {}, losses: {}, products, fromDate: '2026-01-01', toDate: '2026-12-31' });
    expect(s.totalWasteYen).toBe(0);
    expect(s.totalGrossYen).toBe(0);
    expect(Number.isFinite(s.wasteRate)).toBe(true);
    expect(s.byProduct.length).toBe(0);
  });

  it('waste → 廃棄額=数量×原価, 粗利=(納品−廃棄)×(単価−原価)', () => {
    const s = computeLossSummary({
      deliveries: { '2026-07-10|chuo|momen': 100 },
      losses: { '2026-07-10|chuo|momen': { waste: 10 } },
      products,
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    });
    expect(s.totalWasteQty).toBe(10);
    expect(s.totalWasteYen).toBe(10 * 60); // 600
    expect(s.totalGrossYen).toBe((100 - 10) * (150 - 60)); // 8100
    expect(s.wasteRate).toBeCloseTo(0.1, 5);
    expect(s.byProduct[0].product.id).toBe('momen');
  });

  it('売り切れ → 機会損失（推定）と回数', () => {
    const s = computeLossSummary({
      deliveries: { '2026-07-10|chuo|momen': 100 },
      losses: { '2026-07-10|chuo|momen': { soldOut: true } },
      products,
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      lostSalesRate: 0.1,
    });
    expect(s.totalSoldOutDays).toBe(1);
    // round(100*0.1)=10 × 粗利90 = 900
    expect(s.totalLostYen).toBe(900);
  });

  it('期間外は除外される', () => {
    const s = computeLossSummary({
      deliveries: { '2026-06-30|chuo|momen': 100, '2026-07-10|chuo|momen': 50 },
      losses: {},
      products,
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    });
    expect(s.totalDeliveredQty).toBe(50); // 6/30は除外
  });

  it('原価未設定の商品は廃棄額0（NaNにしない）', () => {
    const s = computeLossSummary({
      deliveries: { '2026-07-10|chuo|x': 100 },
      losses: { '2026-07-10|chuo|x': { waste: 5 } },
      products: [{ id: 'x', name: 'テスト', unit: '個' }],
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    });
    expect(s.totalWasteYen).toBe(0);
    expect(Number.isFinite(s.totalGrossYen)).toBe(true);
  });
});
