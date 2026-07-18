/**
 * サンプルデータ生成モジュール。
 *
 * 目的: Supabase 接続前でも各画面が「動いて見える」ように、
 * さつま食品（豆腐店）の拠点・予測対象と、決定論的なダミー実績を用意する。
 *
 * 方針:
 * - 乱数はシード付き PRNG（mulberry32）で、同じ入力からは常に同じ結果を返す（決定論的）。
 * - 生成した実績は `@/domain` の DailyRecord[] 形式で、EnsembleForecastEngine へそのまま渡せる。
 * - 実 DB ロジックは含めない（別担当が Supabase 接続を行う）。
 */

import {
  EnsembleForecastEngine,
  addDays,
  dayOfWeek,
  fromEpoch,
  type DailyRecord,
  type DailyFactors,
  type ForecastConditions,
  type ForecastResult,
  type ForecastTargetMeta,
  type ForecastActualPair,
} from '@/domain';

/**
 * 卸先（自店が商品を卸す取引先のお店）。
 * 本サービスの利用者は1つの製造元（自店）で、複数の卸先へ商品を卸す。
 * 卸先ごとに卸した個数を入力し、卸先ごとに必要数を予測し、合計＝製造総数を弾き出す。
 */
export interface SampleLocation {
  id: string;
  /** 卸先の名称（お店の名前） */
  name: string;
  /** 卸先の種別（スーパー / 飲食店 など） */
  kind?: string;
  /** 卸す量の規模係数（1.0が標準）。卸先ごとに卸数が異なることを表現する。 */
  scale?: number;
  /** ケース単位で卸す既定値（飲食店などケース発注） */
  orderByCase?: boolean;
}

/** 画面で扱う「拠点 × 商品」の予測対象エントリ。 */
export interface SampleTargetEntry {
  /** 一意ID（`拠点__商品` 形式） */
  id: string;
  /** 商品名 */
  productName: string;
  /** 拠点 */
  location: SampleLocation;
  /** 単位（丁 / パック 等） */
  unit: string;
  /** ドメインへ渡す予測対象メタ */
  meta: ForecastTargetMeta;
  /** ベース需要水準（1日あたりの目安） */
  baseLevel: number;
}

/** 組織情報（自店＝製造元）。 */
export const ORGANIZATION = {
  name: 'さつま食品',
  industry: '豆腐・大豆加工品の製造・卸売',
} as const;

/** 卸先一覧（自店が商品を卸す取引先のお店）。 */
export const LOCATIONS: SampleLocation[] = [
  { id: 'chuo', name: '中央スーパー', kind: 'スーパー', scale: 1.0 },
  { id: 'minami', name: '南町マート', kind: 'スーパー', scale: 0.75 },
  { id: 'shokudo', name: 'みなみ食堂', kind: '飲食店', scale: 0.4, orderByCase: true },
  { id: 'hokubu', name: '北部ストア', kind: '小売店', scale: 0.6 },
];

/** 商品定義（拠点非依存の共通スペック）。 */
interface ProductDef {
  id: string;
  name: string;
  unit: string;
  allowDecimal: boolean;
  base: number;
  isNew?: boolean;
  caseSize?: number;
}

const PRODUCTS: ProductDef[] = [
  { id: 'momen', name: '木綿豆腐', unit: '丁', allowDecimal: false, base: 120 },
  { id: 'kinu', name: '絹ごし豆腐', unit: '丁', allowDecimal: false, base: 96 },
  { id: 'atsuage', name: '厚揚げ', unit: 'パック', allowDecimal: false, base: 70, caseSize: 20 },
  { id: 'aburaage', name: '油揚げ', unit: 'パック', allowDecimal: false, base: 58, caseSize: 20 },
  { id: 'okfrom', name: 'おから', unit: 'kg', allowDecimal: true, base: 14 },
];

/** 予測対象エントリ一覧（拠点 × 商品）。 */
export const TARGETS: SampleTargetEntry[] = LOCATIONS.flatMap((location) =>
  PRODUCTS.map((p) => ({
    id: `${location.id}__${p.id}`,
    productName: p.name,
    location,
    unit: p.unit,
    baseLevel: Math.max(1, Math.round(p.base * (location.scale ?? 1))),
    meta: {
      id: `${location.id}__${p.id}`,
      name: p.name,
      unit: p.unit,
      allowDecimal: p.allowDecimal,
      isNew: p.isNew,
    },
  })),
);

/** ID からエントリを取得。 */
export function findTarget(id: string): SampleTargetEntry | undefined {
  return TARGETS.find((t) => t.id === id);
}

/* ------------------------------------------------------------------ */
/* 決定論的 PRNG                                                        */
/* ------------------------------------------------------------------ */

/** 文字列から 32bit シードを作る簡易ハッシュ。 */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: 決定論的な 0-1 乱数生成器を返す。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* 日付ヘルパー（システム日付基準）                                     */
/* ------------------------------------------------------------------ */

/** 本日（ローカル日付）を 'YYYY-MM-DD' で返す。 */
export function getToday(): string {
  const now = new Date();
  return fromEpoch(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
}

/** 明日を 'YYYY-MM-DD' で返す。 */
export function getTomorrow(): string {
  return addDays(getToday(), 1);
}

/** 曜日別の需要倍率（豆腐店: 週末と金曜がやや多い）。0=日..6=土 */
const DOW_FACTOR: Record<number, number> = {
  0: 1.15, // 日
  1: 0.86, // 月
  2: 0.92, // 火
  3: 0.95, // 水
  4: 0.98, // 木
  5: 1.12, // 金
  6: 1.25, // 土
};

/**
 * 1エントリぶんの決定論的な実績履歴を生成する。
 * @param entry 予測対象エントリ
 * @param days  生成日数（既定 150 日）
 * @param endDate 最終日（既定 = 昨日）。この日まで実績あり、翌日以降が予測対象。
 */
export function buildHistory(
  entry: SampleTargetEntry,
  days = 150,
  endDate: string = addDays(getToday(), -1),
): DailyRecord[] {
  const rand = mulberry32(hashSeed(entry.id));
  const records: DailyRecord[] = [];
  const start = addDays(endDate, -(days - 1));

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dow = dayOfWeek(date);

    // 緩やかな上昇トレンド（期間全体で +12% 程度）
    const trend = 1 + (i / days) * 0.12;
    // 曜日変動
    const dowFac = DOW_FACTOR[dow] ?? 1;
    // ノイズ（±12%程度）
    const noise = 0.88 + rand() * 0.24;

    // まれに欠品/イベント等の外れ値（決定論的）
    const spike = rand() < 0.05 ? 1.3 : 1;

    let sales = Math.round(entry.baseLevel * trend * dowFac * noise * spike);
    sales = Math.max(0, sales);

    // ごく一部の日は未入力（null）にして「欠損あり」を表現
    const missing = rand() < 0.02;

    const record: DailyRecord = {
      date,
      sales: missing ? null : sales,
      produced: missing ? null : Math.round(sales * (1.02 + rand() * 0.08)),
      waste: missing ? null : Math.round(sales * (rand() * 0.05)),
      factors: {
        dayOfWeek: dow,
        // 週末に時々特売（決定論的）
        sale: (dow === 6 || dow === 0) && rand() < 0.35,
      },
    };
    records.push(record);
  }
  return records;
}

/** 明日の予測条件を決定論的に生成する。 */
export function buildTomorrowConditions(
  entry: SampleTargetEntry,
  date: string = getTomorrow(),
): ForecastConditions {
  const rand = mulberry32(hashSeed(entry.id + ':cond'));
  const dow = dayOfWeek(date);
  return {
    date,
    currentStock: Math.round(entry.baseLevel * 0.1 * rand()),
    alreadyOrdered: 0,
    safetyRate: 0.1,
    factors: {
      dayOfWeek: dow,
      weather: rand() < 0.25 ? 'rainy' : 'sunny',
      sale: (dow === 6 || dow === 0) && rand() < 0.5,
    },
  };
}

/** 共有エンジンインスタンス（純粋関数のため使い回して問題ない）。 */
const engine = new EnsembleForecastEngine();

/** 1エントリの「明日」の予測結果を計算する。 */
export function computeForecast(
  entry: SampleTargetEntry,
  date: string = getTomorrow(),
): ForecastResult {
  const history = buildHistory(entry, 150, addDays(date, -1));
  const conditions = buildTomorrowConditions(entry, date);
  return engine.forecast(history, entry.meta, conditions);
}

/** 全エントリの明日の予測をまとめて計算する。 */
export function computeAllForecasts(
  date: string = getTomorrow(),
): Array<{ entry: SampleTargetEntry; result: ForecastResult }> {
  return TARGETS.map((entry) => ({
    entry,
    result: computeForecast(entry, date),
  }));
}

/* ------------------------------------------------------------------ */
/* 商品別サマリー（店舗ごとの予測 → 合計）                                */
/* ------------------------------------------------------------------ */

/** 公開用の商品一覧（拠点非依存）。 */
export interface ProductInfo {
  id: string;
  name: string;
  unit: string;
  allowDecimal: boolean;
  /** 1ケースあたりの入数（>1でケース運用。未設定/1=ばら） */
  caseSize?: number | null;
}
export const PRODUCT_LIST: ProductInfo[] = PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
  unit: p.unit,
  allowDecimal: p.allowDecimal,
  caseSize: p.caseSize ?? null,
}));

export function findProduct(id: string): ProductInfo | undefined {
  return PRODUCT_LIST.find((p) => p.id === id);
}

/** 卸先を表す最小情報（マスタ登録された任意の卸先を受け取れるようにする）。 */
export interface LocationLike {
  id: string;
  name: string;
  kind?: string;
  /** ケース単位で卸す（推奨数をケースの倍数へ切り上げ） */
  orderByCase?: boolean;
  /** この卸先の既定の安全在庫率（0-1）。未設定なら全体既定0.1 */
  safetyRate?: number;
  /** 商品別の安全在庫率オーバーライド（productId -> 0-1） */
  safetyRates?: Record<string, number>;
}

/** 1卸先ぶんの予測（商品サマリーの明細行）。 */
export interface StoreForecast {
  location: LocationLike;
  /** 予測詳細への遷移に使う targetId（`卸先__商品`） */
  targetId: string;
  result: ForecastResult;
  /** 実際に卸す数（ケース運用時はケースの倍数へ切り上げ済み） */
  shipUnits: number;
  /** ケース数（ケース運用時のみ。それ以外は null） */
  cases: number | null;
  /** 1ケースの入数（ケース運用時のみ。それ以外は null） */
  caseSize: number | null;
  /** この明細に適用した安全在庫率(0-1) */
  safetyRate: number;
}

/** (卸先,商品) に適用する安全在庫率を解決する。 */
export function resolveSafetyRate(location: LocationLike, productId: string): number {
  const perPair = location.safetyRates?.[productId];
  if (perPair != null && Number.isFinite(perPair)) return perPair;
  if (location.safetyRate != null && Number.isFinite(location.safetyRate)) return location.safetyRate;
  return 0.1;
}

/** 共有エンジン（下の computeForecast と同一インスタンスを使う）。 */
const summaryEngine = new EnsembleForecastEngine();

/**
 * 卸先×商品の予測を、渡された納品実績履歴（唯一の実績データ源）から計算する。
 * history が空なら参考値（信頼度低め）。安全率・ケース単位を適用して StoreForecast を返す。
 * 予測対象日の条件（在庫・既発注・天候等）は納品実績とは別軸のため、ここでは
 * 曜日と安全率のみを与える（在庫・既発注・外部要因の入力は将来拡張）。
 */
export function computeStoreForecast(
  location: LocationLike,
  product: ProductInfo,
  date: string,
  history: DailyRecord[],
  factors?: DailyFactors,
): StoreForecast {
  const safetyRate = resolveSafetyRate(location, product.id);
  const meta: ForecastTargetMeta = {
    id: `${location.id}__${product.id}`,
    name: product.name,
    unit: product.unit,
    allowDecimal: product.allowDecimal,
    isNew: history.length === 0,
  };
  const conditions: ForecastConditions = {
    date,
    safetyRate,
    currentStock: 0,
    alreadyOrdered: 0,
    // 曜日 + 対象日の外部要因（天候・特売・イベント等）
    factors: { dayOfWeek: dayOfWeek(date), ...(factors ?? {}) },
  };
  const result = summaryEngine.forecast(history, meta, conditions);
  const caseSize = product.caseSize && product.caseSize > 1 ? Math.floor(product.caseSize) : null;
  const byCase = !!location.orderByCase && caseSize !== null;
  const shipUnits = byCase
    ? Math.ceil(result.recommendedQuantity / caseSize!) * caseSize!
    : result.recommendedQuantity;
  const cases = byCase ? shipUnits / caseSize! : null;
  return {
    location,
    targetId: `${location.id}__${product.id}`,
    result,
    shipUnits,
    cases,
    caseSize: byCase ? caseSize : null,
    safetyRate,
  };
}

/** 商品ごとの「店舗別予測 + 合計」。 */
export interface ProductSummary {
  product: ProductInfo;
  date: string;
  stores: StoreForecast[];
  /** 合計予測需要（各店舗の予測需要の合計） */
  totalDemand: number;
  /** 合計安全分 */
  totalSafety: number;
  /** 合計現在庫 */
  totalStock: number;
  /** 合計既発注 */
  totalOrdered: number;
  /** 合計推奨数（＝工場で用意すべき総数 = 各店舗の推奨出荷数の合計） */
  totalRecommended: number;
  /** 合計予測範囲 */
  totalRangeLow: number;
  totalRangeHigh: number;
}

/** 単位が小数を許すかで丸め方を切り替える。 */
function roundBy(value: number, allowDecimal: boolean): number {
  return allowDecimal ? Math.round(value * 100) / 100 : Math.round(value);
}

/**
 * 1商品について、指定の卸先すべての予測を計算し合計を弾き出す。
 * getHistory(locationId, productId) で各卸先×商品の納品実績履歴を供給する
 * （納品実績ストアが唯一のデータ源）。合計推奨数＝各卸先へ卸す数の合計＝製造すべき総数。
 */
export function computeProductSummaryFor(
  product: ProductInfo,
  locations: LocationLike[],
  date: string,
  getHistory: (locationId: string, productId: string) => DailyRecord[],
  factors?: DailyFactors,
): ProductSummary {
  const stores: StoreForecast[] = locations.map((location) =>
    computeStoreForecast(location, product, date, getHistory(location.id, product.id), factors),
  );
  const sumResult = (pick: (r: ForecastResult) => number) =>
    stores.reduce((acc, s) => acc + pick(s.result), 0);
  const sumStore = (pick: (s: StoreForecast) => number) =>
    stores.reduce((acc, s) => acc + pick(s), 0);
  const dec = product.allowDecimal;
  return {
    product,
    date,
    stores,
    totalDemand: roundBy(sumResult((r) => r.adjustedDemand), dec),
    totalSafety: roundBy(sumResult((r) => r.safetyStock), dec),
    totalStock: roundBy(sumResult((r) => r.currentStock), dec),
    totalOrdered: roundBy(sumResult((r) => r.alreadyOrdered), dec),
    // 合計推奨＝実際に卸す数（ケース切り上げ後）の合計
    totalRecommended: roundBy(sumStore((s) => s.shipUnits), dec),
    totalRangeLow: roundBy(sumResult((r) => r.rangeLow), dec),
    totalRangeHigh: roundBy(sumResult((r) => r.rangeHigh), dec),
  };
}

/**
 * 指定した卸先・商品・日付の過去の納品参考値を返す（コピー元に使う）。
 * seed 履歴が無い（新規）場合は null。
 */
export function getDeliveryReferenceValue(
  locationId: string,
  product: ProductInfo,
  date: string,
): number | null {
  const entry = findTarget(`${locationId}__${product.id}`);
  if (!entry) return null;
  const history = buildHistory(entry, 60, date);
  const rec = history.find((r) => r.date === date);
  return rec ? rec.sales : null;
}

/* ------------------------------------------------------------------ */
/* ダッシュボードのグラフ用データ                                       */
/* ------------------------------------------------------------------ */

export interface TrendPoint {
  /** 'MM/DD' 表示用ラベル */
  label: string;
  /** ISO日付 */
  date: string;
  /** 実績合計（未来日は null） */
  actual: number | null;
  /** 予測合計 */
  predicted: number;
}

/**
 * 直近 `days` 日 + 明日 の「実績 vs 予測」推移（全対象の合計）を作る。
 * 予測は実績に軽いノイズを載せた決定論的な近似（画面表示用）。
 */
export function buildTrendSeries(days = 30): TrendPoint[] {
  const today = getToday();
  const points: TrendPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    let actual = 0;
    let predicted = 0;
    for (const entry of TARGETS) {
      const history = buildHistory(entry, 150, date);
      const last = history[history.length - 1];
      const a = last.sales ?? 0;
      actual += a;
      const rand = mulberry32(hashSeed(entry.id + date));
      predicted += Math.round(a * (0.93 + rand() * 0.14));
    }
    points.push({
      date,
      label: date.slice(5).replace('-', '/'),
      actual,
      predicted,
    });
  }

  // 明日（予測のみ）
  const tomorrow = getTomorrow();
  const tomorrowPredicted = computeAllForecasts(tomorrow).reduce(
    (sum, f) => sum + f.result.adjustedDemand,
    0,
  );
  points.push({
    date: tomorrow,
    label: tomorrow.slice(5).replace('-', '/'),
    actual: null,
    predicted: Math.round(tomorrowPredicted),
  });

  return points;
}

/* ------------------------------------------------------------------ */
/* 精度ページ用: 予測実績ペア                                           */
/* ------------------------------------------------------------------ */

/**
 * 直近 `days` 日の「予測 vs 実績」ペアを決定論的に生成する。
 * 実績は buildHistory の販売数、予測はそこへ小さな誤差を載せた近似値。
 */
export function buildAccuracyPairs(
  entry: SampleTargetEntry,
  days: number,
): ForecastActualPair[] {
  const history = buildHistory(entry, days, addDays(getToday(), -1));
  const rand = mulberry32(hashSeed(entry.id + ':acc'));
  const pairs: ForecastActualPair[] = [];
  for (const r of history) {
    if (r.sales === null) continue; // 未入力日は精度算出から除外
    const err = 0.9 + rand() * 0.2; // ±10%程度の誤差
    pairs.push({
      date: r.date,
      actual: r.sales,
      predicted: Math.round(r.sales * err),
      toleranceRate: 0.1,
    });
  }
  return pairs;
}

/** 全対象を合算した直近 `days` 日の予測実績ペア。 */
export function buildAllAccuracyPairs(days: number): ForecastActualPair[] {
  return TARGETS.flatMap((entry) => buildAccuracyPairs(entry, days));
}

/* ------------------------------------------------------------------ */
/* 実績入力グリッド用の初期データ                                        */
/* ------------------------------------------------------------------ */

export interface InputGridSeed {
  /** 対象日（直近 N 日, 新しい順） */
  dates: string[];
  /** エントリごとの日付→実績（null=未入力） */
  values: Record<string, Record<string, number | null>>;
}

/* ------------------------------------------------------------------ */
/* 納品入力（卸先を選び、商品ごとに個数を入力）用                        */
/* ------------------------------------------------------------------ */

/** 納品入力フォームの1行（商品ごと）。 */
export interface DeliveryRow {
  product: ProductInfo;
  /** 参考値（過去実績。コピー元に使う）。null=データなし */
  reference: number | null;
}

/**
 * 指定した卸先・日付について、商品ごとの参考値（過去の納品実績）を返す。
 * 「前日をコピー」「前週同曜日をコピー」の元データとして使う。
 */
export function getDeliveryReference(
  locationId: string,
  date: string,
): DeliveryRow[] {
  return PRODUCT_LIST.map((product) => {
    const entry = findTarget(`${locationId}__${product.id}`);
    if (!entry) return { product, reference: null };
    // date を最終日とする履歴を作り、その日の値を参照値とする
    const history = buildHistory(entry, 60, date);
    const rec = history.find((r) => r.date === date);
    return { product, reference: rec ? rec.sales : null };
  });
}

/** 卸先の情報を ID から取得。 */
export function findLocation(id: string): SampleLocation | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

/** 実績入力グリッドの初期値を生成（直近 `days` 日、末尾数日は未入力）。 */
export function buildInputGridSeed(days = 7): InputGridSeed {
  const today = getToday();
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) dates.push(addDays(today, -i));

  const values: Record<string, Record<string, number | null>> = {};
  for (const entry of TARGETS) {
    const history = buildHistory(entry, days + 2, addDays(today, -1));
    const byDate: Record<string, number | null> = {};
    for (const d of dates) {
      const rec = history.find((r) => r.date === d);
      byDate[d] = rec ? rec.sales : null;
    }
    values[entry.id] = byDate;
  }
  return { dates, values };
}
