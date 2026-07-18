/**
 * CSV 取込みの純粋ロジック（パース・列自動判定・マッピング・検証・重複処理）。
 * ファイルI/OやDBに依存しないため単体テスト可能。
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC4180 準拠に近い簡易CSVパーサ（ダブルクオート・改行・カンマ対応） */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: dataRows };
}

/** 取込み先の論理フィールド */
export type ImportField =
  | 'date' | 'location' | 'target' | 'sold' | 'delivered' | 'produced'
  | 'ordered' | 'stock' | 'returns' | 'waste' | 'stockout' | 'visitors'
  | 'reservations' | 'salesAmount' | 'note';

/** 列見出しから論理フィールドを推測するための日本語/英語同義語 */
const SYNONYMS: Record<ImportField, string[]> = {
  date: ['日付', '年月日', 'date', '日'],
  location: ['拠点', '店舗', '店', '工場', 'location', 'store'],
  target: ['商品', 'メニュー', '品目', '予測対象', 'item', 'product', 'target'],
  sold: ['販売数', '販売', '売上数', '売れた', 'sold', 'sales_qty'],
  delivered: ['納品数', '納品', 'delivered'],
  produced: ['製造数', '製造', '生産', 'produced'],
  ordered: ['発注数', '発注', 'ordered'],
  stock: ['在庫数', '在庫', 'stock'],
  returns: ['返品数', '返品', 'returns'],
  waste: ['廃棄数', '廃棄', 'ロス', 'waste'],
  stockout: ['欠品数', '欠品', 'stockout'],
  visitors: ['来客数', '来客', '客数', 'visitors'],
  reservations: ['予約数', '予約', 'reservations'],
  salesAmount: ['売上金額', '売上', '金額', 'amount', 'revenue'],
  note: ['備考', 'メモ', 'note', 'memo'],
};

/** ヘッダ配列から列→フィールドの自動マッピングを推測 */
export function autoMapColumns(headers: string[]): Partial<Record<number, ImportField>> {
  const map: Partial<Record<number, ImportField>> = {};
  headers.forEach((h, idx) => {
    const norm = h.trim().toLowerCase();
    for (const [field, syns] of Object.entries(SYNONYMS) as [ImportField, string[]][]) {
      if (syns.some((s) => norm === s.toLowerCase() || norm.includes(s.toLowerCase()))) {
        // 既に割当済みのフィールドは先勝ち
        if (!Object.values(map).includes(field)) { map[idx] = field; break; }
      }
    }
  });
  return map;
}

export interface MappedRow {
  index: number;
  data: Partial<Record<ImportField, string>>;
  errors: string[];
}

/** 行をマッピングし、日付/拠点/対象/実績値の最小要件を検証 */
export function mapAndValidate(
  parsed: ParsedCsv,
  mapping: Partial<Record<number, ImportField>>,
): MappedRow[] {
  const fieldByCol = mapping;
  return parsed.rows.map((cols, index) => {
    const data: Partial<Record<ImportField, string>> = {};
    for (const [colStr, field] of Object.entries(fieldByCol)) {
      const col = Number(colStr);
      if (field) data[field] = (cols[col] ?? '').trim();
    }
    const errors: string[] = [];
    if (!data.date || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(data.date.replace(/\//g, '-'))) {
      errors.push('日付が不正です（YYYY-MM-DD）');
    }
    if (!data.location) errors.push('拠点名がありません');
    if (!data.target) errors.push('予測対象名がありません');
    const hasAnyValue = (['sold', 'delivered', 'produced', 'ordered', 'stock', 'visitors', 'salesAmount'] as ImportField[])
      .some((f) => data[f] !== undefined && data[f] !== '');
    if (!hasAnyValue) errors.push('実績値が1つもありません');
    return { index, data, errors };
  });
}

export type DuplicateStrategy = 'insert' | 'overwrite' | 'skip';

/** (date,location,target) の重複キーを生成 */
export function rowKey(r: MappedRow): string {
  const d = (r.data.date ?? '').replace(/\//g, '-');
  return `${d}__${r.data.location ?? ''}__${r.data.target ?? ''}`;
}

/** 取込みプレビュー集計 */
export interface ImportPreview {
  total: number;
  valid: number;
  errorRows: MappedRow[];
  duplicateKeys: string[];
}

export function buildPreview(mapped: MappedRow[]): ImportPreview {
  const errorRows = mapped.filter((r) => r.errors.length > 0);
  const seen = new Map<string, number>();
  const duplicateKeys: string[] = [];
  for (const r of mapped) {
    if (r.errors.length > 0) continue;
    const k = rowKey(r);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, c] of seen) if (c > 1) duplicateKeys.push(k);
  return {
    total: mapped.length,
    valid: mapped.length - errorRows.length,
    errorRows,
    duplicateKeys,
  };
}

/** サンプルCSVテンプレート文字列 */
export function sampleCsv(): string {
  return [
    '日付,拠点,商品,販売数,製造数,廃棄数,備考',
    '2025-07-01,本社工場,木綿豆腐,120,130,5,',
    '2025-07-01,本社工場,絹ごし豆腐,98,105,3,',
    '2025-07-02,中央スーパー,木綿豆腐,88,90,2,雨天',
  ].join('\n');
}
