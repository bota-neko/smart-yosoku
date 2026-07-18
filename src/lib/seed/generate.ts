/**
 * さつま食品（豆腐店）の現実的なダミー実績を1年以上分、決定論的に生成する。
 * 曜日差・季節差（夏の冷奴/冬の鍋）・年末年始/お盆・雨天/台風・特売・店舗イベント・
 * 欠品・廃棄・異常値・商品ごとの異なる傾向を含む。純粋関数（乱数はseed付きPRNG）。
 */
import { addDays, dayOfWeek, monthOf } from '@/domain/dateutil';

/** 決定論的PRNG（mulberry32） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedLocation { key: string; name: string; type: string; scale: number; }
export interface SeedTarget {
  key: string; name: string; unit: string; base: number; price: number; cost: number;
  /** 夏に強い(+)/冬に強い(-) の季節性方向 */
  seasonBias: number;
}

export const SEED_ORG = { name: 'さつま食品株式会社' };

export const SEED_LOCATIONS: SeedLocation[] = [
  { key: 'factory', name: '本社工場', type: 'factory', scale: 1.0 },
  { key: 'central', name: '中央スーパー', type: 'store', scale: 0.8 },
  { key: 'minami', name: '南町マート', type: 'store', scale: 0.6 },
  { key: 'hokubu', name: '北部ストア', type: 'store', scale: 0.5 },
];

export const SEED_TARGETS: SeedTarget[] = [
  { key: 'momen', name: '木綿豆腐', unit: '丁', base: 120, price: 150, cost: 60, seasonBias: 0.1 },
  { key: 'kinu', name: '絹ごし豆腐', unit: '丁', base: 100, price: 160, cost: 62, seasonBias: 0.35 }, // 夏の冷奴
  { key: 'atsuage', name: '厚揚げ', unit: '枚', base: 80, price: 130, cost: 55, seasonBias: -0.25 }, // 冬の煮物/鍋
  { key: 'aburaage', name: '油揚げ', unit: '枚', base: 70, price: 110, cost: 45, seasonBias: -0.15 },
  { key: 'oboro', name: 'おぼろ豆腐', unit: '丁', base: 40, price: 220, cost: 90, seasonBias: 0.2 },
];

const WEEKDAY_MULT = [0.9, 0.82, 0.95, 1.0, 1.08, 1.35, 1.25]; // 日..土

export interface SeedRecord {
  locationKey: string;
  targetKey: string;
  date: string;
  sold: number;
  produced: number;
  waste: number;
  returns: number;
  stockout: number;
  soldOut: boolean;
  salesAmount: number;
  weather: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'storm';
  tempHigh: number;
  tempLow: number;
  isHoliday: boolean;
  sale: boolean;
  event: boolean;
  note: string | null;
}

/** 年間の季節係数（夏ピーク/冬ピークを seasonBias で切替）*/
function seasonalFactor(date: string, bias: number): number {
  const doy = dayOfWeek(date); // 未使用回避
  void doy;
  const m = monthOf(date);
  // 夏(7-8月)を+, 冬(12-1月)を- とする基本波
  const summer = Math.cos(((m - 8) / 12) * 2 * Math.PI); // 8月付近で最大
  return 1 + bias * summer;
}

function approxTemp(date: string, rnd: () => number): { high: number; low: number } {
  const m = monthOf(date);
  const seasonal = 18 - 13 * Math.cos(((m - 1) / 12) * 2 * Math.PI); // 鹿児島風、1月最低
  const jitter = (rnd() - 0.5) * 6;
  const high = Math.round(seasonal + 6 + jitter);
  const low = Math.round(seasonal - 3 + jitter * 0.5);
  return { high, low };
}

function pickWeather(rnd: () => number, month: number): SeedRecord['weather'] {
  const r = rnd();
  // 6-9月は雨/台風多め、12-2月は雪わずか
  if (month >= 6 && month <= 9) {
    if (r < 0.08) return 'storm';
    if (r < 0.35) return 'rainy';
    if (r < 0.6) return 'cloudy';
    return 'sunny';
  }
  if (month === 12 || month <= 2) {
    if (r < 0.03) return 'snowy';
    if (r < 0.25) return 'rainy';
    if (r < 0.55) return 'cloudy';
    return 'sunny';
  }
  if (r < 0.2) return 'rainy';
  if (r < 0.5) return 'cloudy';
  return 'sunny';
}

const WEATHER_MULT: Record<SeedRecord['weather'], number> = {
  sunny: 1.03, cloudy: 1.0, rainy: 0.9, snowy: 0.85, storm: 0.65,
};

function isNewYear(date: string): boolean {
  const m = monthOf(date);
  const d = Number(date.slice(8, 10));
  return (m === 12 && d >= 29) || (m === 1 && d <= 3);
}
function isObon(date: string): boolean {
  const m = monthOf(date);
  const d = Number(date.slice(8, 10));
  return m === 8 && d >= 13 && d <= 16;
}

/**
 * endDate を最終日として days 日分の全拠点×全対象の実績を生成。
 */
export function generateSeedRecords(endDate: string, days: number, seed = 42): SeedRecord[] {
  const rnd = mulberry32(seed);
  const out: SeedRecord[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const dow = dayOfWeek(date);
    const m = monthOf(date);
    const weather = pickWeather(rnd, m);
    const { high, low } = approxTemp(date, rnd);
    const isHoliday = dow === 0 || isNewYear(date) || isObon(date);
    // 特売は金土や月2回程度
    const sale = dow === 5 || dow === 6 ? rnd() < 0.5 : rnd() < 0.08;
    // 店舗イベント（年数回）
    const event = rnd() < 0.02;

    for (const loc of SEED_LOCATIONS) {
      for (const t of SEED_TARGETS) {
        const season = seasonalFactor(date, t.seasonBias);
        let demand = t.base * loc.scale * WEEKDAY_MULT[dow] * season * WEATHER_MULT[weather];

        if (sale) demand *= 1.18;
        if (event) demand *= 1.12;
        if (isNewYear(date)) demand *= t.key === 'atsuage' ? 1.6 : 1.3; // 年末年始は厚揚げ等増
        if (isObon(date)) demand *= 1.2;
        // 冬の鍋需要（厚揚げ/油揚げ）
        if ((m === 12 || m <= 2) && (t.key === 'atsuage' || t.key === 'aburaage')) demand *= 1.15;
        // 夏の冷奴（絹/おぼろ）
        if ((m >= 7 && m <= 8) && (t.key === 'kinu' || t.key === 'oboro')) demand *= 1.2;

        // ランダム変動
        demand *= 0.9 + rnd() * 0.2;

        // 異常値をまれに注入（入力ミス相当）
        const anomaly = rnd() < 0.004;
        let trueDemand = Math.max(0, Math.round(demand));
        if (anomaly) trueDemand = Math.round(trueDemand * (rnd() < 0.5 ? 6 : 0.1));

        // 製造数（需要よりやや多め、たまに不足で欠品）
        const producedTarget = Math.round(trueDemand * (1.02 + rnd() * 0.12));
        const shortage = rnd() < 0.06; // 6%の日は製造不足→売り切れ
        const produced = shortage ? Math.round(trueDemand * (0.8 + rnd() * 0.1)) : producedTarget;
        const sold = Math.min(trueDemand, produced);
        const soldOut = sold >= produced && trueDemand >= produced;
        const stockout = soldOut ? Math.max(0, trueDemand - produced) : 0;
        const waste = Math.max(0, produced - sold - (rnd() < 0.3 ? 1 : 0));
        const returns = rnd() < 0.05 ? Math.round(rnd() * 3) : 0;

        out.push({
          locationKey: loc.key, targetKey: t.key, date,
          sold, produced, waste, returns, stockout, soldOut,
          salesAmount: sold * t.price,
          weather, tempHigh: high, tempLow: low, isHoliday, sale, event,
          note: anomaly ? '要確認（自動生成の異常値）' : soldOut ? '売り切れ' : null,
        });
      }
    }
  }
  return out;
}
