/**
 * ロス（廃棄・機会損失）と粗利の集計（純粋関数・UI非依存）。
 * 納品数(deliveries) × 廃棄/売り切れ(losses) × 商品の価格/原価 から金額を算出する。
 */

export interface LossProduct {
  id: string;
  name: string;
  unit: string;
  price?: number | null;
  cost?: number | null;
}

export interface LossInput {
  /** `${date}|${loc}|${prod}` -> 納品数 */
  deliveries: Record<string, number>;
  /** `${date}|${loc}|${prod}` -> { waste?, soldOut? } */
  losses: Record<string, { waste?: number; soldOut?: boolean }>;
  products: LossProduct[];
  /** 集計期間（両端含む・'YYYY-MM-DD'） */
  fromDate: string;
  toDate: string;
  /** 売り切れ日の推定不足率（納品数に対する割合・既定0.1） */
  lostSalesRate?: number;
}

export interface ProductLoss {
  product: LossProduct;
  deliveredQty: number;
  wasteQty: number;
  wasteYen: number;
  soldOutDays: number;
  lostYen: number;
  grossYen: number;
  /** 廃棄率（廃棄/納品, 0-1） */
  wasteRate: number;
}

export interface LossSummary {
  totalDeliveredQty: number;
  totalWasteQty: number;
  totalWasteYen: number;
  totalSoldOutDays: number;
  totalLostYen: number;
  totalGrossYen: number;
  wasteRate: number;
  byProduct: ProductLoss[];
  /** 期間前半・後半の廃棄率（改善の見える化） */
  firstHalfWasteRate: number;
  secondHalfWasteRate: number;
  /** 改善で減らせた廃棄金額の推定（後半が改善した場合のみ正） */
  improvedYen: number;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** deliveries から、期間内の (key, date, loc, prod, qty) を列挙。 */
function* iterate(
  deliveries: Record<string, number>,
  fromDate: string,
  toDate: string,
): Generator<{ key: string; date: string; loc: string; prod: string; qty: number }> {
  for (const key of Object.keys(deliveries)) {
    const bar1 = key.indexOf('|');
    const bar2 = key.indexOf('|', bar1 + 1);
    if (bar1 < 0 || bar2 < 0) continue;
    const date = key.slice(0, bar1);
    if (date < fromDate || date > toDate) continue;
    const loc = key.slice(bar1 + 1, bar2);
    const prod = key.slice(bar2 + 1);
    yield { key, date, loc, prod, qty: num(deliveries[key]) };
  }
}

export function computeLossSummary(input: LossInput): LossSummary {
  const rate = input.lostSalesRate ?? 0.1;
  const productById = new Map(input.products.map((p) => [p.id, p]));

  const midDate = midpoint(input.fromDate, input.toDate);

  const per = new Map<string, ProductLoss>();
  const ensure = (p: LossProduct): ProductLoss => {
    let r = per.get(p.id);
    if (!r) {
      r = { product: p, deliveredQty: 0, wasteQty: 0, wasteYen: 0, soldOutDays: 0, lostYen: 0, grossYen: 0, wasteRate: 0 };
      per.set(p.id, r);
    }
    return r;
  };

  let firstDelivered = 0;
  let firstWaste = 0;
  let secondDelivered = 0;
  let secondWaste = 0;

  for (const it of iterate(input.deliveries, input.fromDate, input.toDate)) {
    const p = productById.get(it.prod);
    if (!p) continue; // 削除された商品などは除外
    const loss = input.losses[it.key] ?? {};
    const waste = num(loss.waste);
    const price = num(p.price);
    const cost = num(p.cost);
    const margin = price - cost;
    const sold = Math.max(0, it.qty - waste);

    const r = ensure(p);
    r.deliveredQty += it.qty;
    r.wasteQty += waste;
    r.wasteYen += waste * cost;
    r.grossYen += sold * margin;
    if (loss.soldOut) {
      r.soldOutDays += 1;
      r.lostYen += Math.round(it.qty * rate) * margin;
    }

    if (it.date < midDate) {
      firstDelivered += it.qty;
      firstWaste += waste;
    } else {
      secondDelivered += it.qty;
      secondWaste += waste;
    }
  }

  const byProduct = [...per.values()]
    .map((r) => ({ ...r, wasteRate: r.deliveredQty > 0 ? r.wasteQty / r.deliveredQty : 0 }))
    .sort((a, b) => b.wasteYen - a.wasteYen);

  const totalDeliveredQty = byProduct.reduce((s, r) => s + r.deliveredQty, 0);
  const totalWasteQty = byProduct.reduce((s, r) => s + r.wasteQty, 0);
  const totalWasteYen = byProduct.reduce((s, r) => s + r.wasteYen, 0);
  const totalSoldOutDays = byProduct.reduce((s, r) => s + r.soldOutDays, 0);
  const totalLostYen = byProduct.reduce((s, r) => s + r.lostYen, 0);
  const totalGrossYen = byProduct.reduce((s, r) => s + r.grossYen, 0);

  const firstHalfWasteRate = firstDelivered > 0 ? firstWaste / firstDelivered : 0;
  const secondHalfWasteRate = secondDelivered > 0 ? secondWaste / secondDelivered : 0;
  // 後半が改善したぶん、後半の納品量に対して減らせた廃棄金額（平均原価で概算）
  const avgCost = totalWasteQty > 0 ? totalWasteYen / totalWasteQty : 0;
  const improvedYen =
    firstHalfWasteRate > secondHalfWasteRate
      ? Math.round((firstHalfWasteRate - secondHalfWasteRate) * secondDelivered * avgCost)
      : 0;

  return {
    totalDeliveredQty,
    totalWasteQty,
    totalWasteYen,
    totalSoldOutDays,
    totalLostYen,
    totalGrossYen,
    wasteRate: totalDeliveredQty > 0 ? totalWasteQty / totalDeliveredQty : 0,
    byProduct,
    firstHalfWasteRate,
    secondHalfWasteRate,
    improvedYen,
  };
}

/** 2日付の中間日（'YYYY-MM-DD'）。前半/後半の境界に使う。 */
function midpoint(from: string, to: string): string {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return to;
  const mid = new Date((a + b) / 2);
  return mid.toISOString().slice(0, 10);
}
