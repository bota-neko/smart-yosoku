import { describe, it, expect } from 'vitest';
import { normalizeSlipResult, type RawSlipResult } from '@/lib/slip-scan';

const products = [
  { id: 'momen', name: '木綿豆腐', unit: '丁' },
  { id: 'atsuage', name: '厚揚げ', unit: '枚', caseSize: 20 },
];
const locations = [{ id: 'chuo', name: '中央スーパー' }];

const base: RawSlipResult = {
  readable: true,
  slip_date: '2026-10-02',
  location_id: 'chuo',
  location_name_on_slip: '(株)中央スーパー',
  items: [],
  note: null,
};

describe('normalizeSlipResult', () => {
  it('登録済みIDはそのまま、日付・卸先を採用', () => {
    const r = normalizeSlipResult(
      { ...base, items: [{ product_id: 'momen', name_on_slip: 'もめん', quantity: 30, unit_kind: 'piece' }] },
      products,
      locations,
    );
    expect(r.date).toBe('2026-10-02');
    expect(r.locationId).toBe('chuo');
    expect(r.items).toEqual([{ productId: 'momen', nameOnSlip: 'もめん', qty: 30, fromCases: null }]);
  });

  it('ケース表記は入数を掛けて換算', () => {
    const r = normalizeSlipResult(
      { ...base, items: [{ product_id: 'atsuage', name_on_slip: '厚揚', quantity: 2, unit_kind: 'case' }] },
      products,
      locations,
    );
    expect(r.items[0].qty).toBe(40);
    expect(r.items[0].fromCases).toBe(2);
  });

  it('入数未設定の商品のケース表記は換算しない', () => {
    const r = normalizeSlipResult(
      { ...base, items: [{ product_id: 'momen', name_on_slip: '木綿', quantity: 3, unit_kind: 'case' }] },
      products,
      locations,
    );
    expect(r.items[0].qty).toBe(3);
    expect(r.items[0].fromCases).toBeNull();
  });

  it('未登録ID・不正な日付・未登録卸先は null に落とす', () => {
    const r = normalizeSlipResult(
      {
        ...base,
        slip_date: '10/2',
        location_id: 'unknown',
        items: [{ product_id: 'ghost', name_on_slip: 'がんも', quantity: 5, unit_kind: 'piece' }],
      },
      products,
      locations,
    );
    expect(r.date).toBeNull();
    expect(r.locationId).toBeNull();
    expect(r.items[0].productId).toBeNull();
    expect(r.items[0].nameOnSlip).toBe('がんも');
  });

  it('同一商品の複数行は合算、負数は除外', () => {
    const r = normalizeSlipResult(
      {
        ...base,
        items: [
          { product_id: 'momen', name_on_slip: '木綿', quantity: 10, unit_kind: 'piece' },
          { product_id: 'momen', name_on_slip: '木綿(追加)', quantity: 5, unit_kind: 'piece' },
          { product_id: 'momen', name_on_slip: '返品', quantity: -2, unit_kind: 'piece' },
        ],
      },
      products,
      locations,
    );
    expect(r.items.length).toBe(1);
    expect(r.items[0].qty).toBe(15);
  });
});
