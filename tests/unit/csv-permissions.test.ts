import { describe, it, expect } from 'vitest';
import { parseCsv, autoMapColumns, mapAndValidate, buildPreview, sampleCsv } from '@/lib/csv';
import { can, outranks } from '@/lib/permissions';
import { nullableNumber } from '@/lib/validation';

describe('csv import', () => {
  it('parses quoted fields, commas and newlines', () => {
    const csv = 'a,b,c\n1,"x,y",3\n"line\nbreak",5,6';
    const p = parseCsv(csv);
    expect(p.headers).toEqual(['a', 'b', 'c']);
    expect(p.rows[0]).toEqual(['1', 'x,y', '3']);
    expect(p.rows[1][0]).toBe('line\nbreak');
  });

  it('auto-maps Japanese headers', () => {
    const p = parseCsv(sampleCsv());
    const map = autoMapColumns(p.headers);
    const fields = Object.values(map);
    expect(fields).toContain('date');
    expect(fields).toContain('location');
    expect(fields).toContain('target');
    expect(fields).toContain('sold');
  });

  it('validates minimal required fields', () => {
    const p = parseCsv('日付,拠点,商品,販売数\n2025-07-01,本社工場,木綿豆腐,120\nbad-date,,,7');
    const map = autoMapColumns(p.headers);
    const mapped = mapAndValidate(p, map);
    expect(mapped[0].errors.length).toBe(0);
    expect(mapped[1].errors.length).toBeGreaterThan(0);
  });

  it('preview detects duplicates', () => {
    const p = parseCsv('日付,拠点,商品,販売数\n2025-07-01,本社工場,木綿豆腐,120\n2025-07-01,本社工場,木綿豆腐,130');
    const mapped = mapAndValidate(p, autoMapColumns(p.headers));
    const preview = buildPreview(mapped);
    expect(preview.duplicateKeys.length).toBe(1);
    expect(preview.valid).toBe(2);
  });
});

describe('permissions', () => {
  it('viewer can only view', () => {
    expect(can('viewer', 'view')).toBe(true);
    expect(can('viewer', 'record.write')).toBe(false);
    expect(can('viewer', 'settings.write')).toBe(false);
  });
  it('staff can write records and adjust but not settings/members', () => {
    expect(can('staff', 'record.write')).toBe(true);
    expect(can('staff', 'forecast.adjust')).toBe(true);
    expect(can('staff', 'settings.write')).toBe(false);
    expect(can('staff', 'members.manage')).toBe(false);
  });
  it('only owner can delete org', () => {
    expect(can('owner', 'org.delete')).toBe(true);
    expect(can('admin', 'org.delete')).toBe(false);
  });
  it('rank ordering', () => {
    expect(outranks('owner', 'admin')).toBe(true);
    expect(outranks('staff', 'admin')).toBe(false);
  });
});

describe('nullableNumber: 0 vs empty distinction', () => {
  it('empty string → null (未入力)', () => {
    expect(nullableNumber.parse('')).toBeNull();
    expect(nullableNumber.parse(null)).toBeNull();
    expect(nullableNumber.parse(undefined)).toBeNull();
  });
  it('"0" → 0 (ゼロ実績)', () => {
    expect(nullableNumber.parse('0')).toBe(0);
    expect(nullableNumber.parse(0)).toBe(0);
  });
  it('strips thousands separators', () => {
    expect(nullableNumber.parse('1,200')).toBe(1200);
  });
});
