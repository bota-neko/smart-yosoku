/**
 * 納品書読み取りの共通型と、読み取り結果 → 納品数への変換（純粋関数・テスト対象）。
 * API ルート（サーバー）と画面（クライアント）の両方から使う。
 */

export interface SlipProductRef {
  id: string;
  name: string;
  unit: string;
  caseSize?: number;
}

export interface SlipLocationRef {
  id: string;
  name: string;
}

/** Claude が返す構造（API ルート内で Zod 検証済みのもの）。 */
export interface RawSlipItem {
  product_id: string | null;
  name_on_slip: string;
  quantity: number;
  unit_kind: 'piece' | 'case';
}

export interface RawSlipResult {
  readable: boolean;
  slip_date: string | null;
  location_id: string | null;
  location_name_on_slip: string | null;
  items: RawSlipItem[];
  note: string | null;
}

/** 画面へ返す、ID 照合・ケース換算済みの結果。 */
export interface SlipScanItem {
  /** 登録商品に一致した場合の ID（一致しなければ null） */
  productId: string | null;
  /** 納品書に書かれていた品名 */
  nameOnSlip: string;
  /** 納品数（商品の単位。ケース表記は入数を掛けて換算済み） */
  qty: number;
  /** ケース表記から換算したか（確認画面で表示する） */
  fromCases: number | null;
}

export interface SlipScanResult {
  readable: boolean;
  /** 納品書の日付（YYYY-MM-DD）。読めなければ null */
  date: string | null;
  locationId: string | null;
  locationNameOnSlip: string | null;
  items: SlipScanItem[];
  note: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Claude の出力を、登録済みの商品・卸先 ID と突き合わせて正規化する。
 * - 未登録 ID は null に落とす（モデルの取り違え・捏造を画面に持ち込まない）
 * - ケース表記は caseSize を掛けて個数へ換算（入数未設定ならケース数のまま）
 * - 同じ商品が複数行あれば合算
 * - 数量は 0 以上の有限値のみ採用
 */
export function normalizeSlipResult(
  raw: RawSlipResult,
  products: SlipProductRef[],
  locations: SlipLocationRef[],
): SlipScanResult {
  const prodById = new Map(products.map((p) => [p.id, p]));
  const locIds = new Set(locations.map((l) => l.id));

  const merged = new Map<string, SlipScanItem>();
  const unmatched: SlipScanItem[] = [];

  for (const it of raw.items) {
    if (!Number.isFinite(it.quantity) || it.quantity < 0) continue;
    const product = it.product_id ? prodById.get(it.product_id) : undefined;
    const caseSize = product?.caseSize && product.caseSize > 1 ? product.caseSize : null;
    const isCase = it.unit_kind === 'case' && caseSize !== null;
    const qty = isCase ? it.quantity * caseSize : it.quantity;
    const item: SlipScanItem = {
      productId: product ? product.id : null,
      nameOnSlip: it.name_on_slip,
      qty,
      fromCases: isCase ? it.quantity : null,
    };
    if (!product) {
      unmatched.push(item);
      continue;
    }
    const prev = merged.get(product.id);
    if (prev) {
      prev.qty += item.qty;
      prev.fromCases = prev.fromCases !== null && item.fromCases !== null ? prev.fromCases + item.fromCases : null;
    } else {
      merged.set(product.id, item);
    }
  }

  return {
    readable: raw.readable,
    date: raw.slip_date && DATE_RE.test(raw.slip_date) ? raw.slip_date : null,
    locationId: raw.location_id && locIds.has(raw.location_id) ? raw.location_id : null,
    locationNameOnSlip: raw.location_name_on_slip,
    items: [...merged.values(), ...unmatched],
    note: raw.note,
  };
}
