'use client';

/**
 * 天気・祝日の自動取得（キー不要の公開API）。
 *  - 天気/気温: Open-Meteo（api.open-meteo.com / geocoding-api.open-meteo.com）
 *  - 祝日: Nager.Date（date.nager.at）
 * すべてブラウザから直接 fetch（CORS対応）。未設定・失敗時は手動入力にフォールバック。
 */
import type { Weather } from './factors-store';

export interface GeoResult {
  name: string;
  region?: string;
  latitude: number;
  longitude: number;
}

/** タイムアウト付き fetch+JSON。通信が滞っても一定時間で必ず失敗する。 */
async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 地域名 → 緯度経度（Open-Meteo ジオコーディング）。 */
export async function geocodeArea(name: string): Promise<GeoResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    name,
  )}&count=1&language=ja&format=json`;
  const data = (await fetchJson(url)) as { results?: Array<Record<string, unknown>> };
  const r = data?.results?.[0];
  if (!r) return null;
  return {
    name: String(r.name),
    region: r.admin1 ? String(r.admin1) : undefined,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
  };
}

/** WMO weather code → アプリの天候カテゴリ。 */
function codeToWeather(code: number): Weather {
  if (code <= 1) return 'sunny'; // 快晴/晴れ
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy'; // 曇り/霧
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowy'; // 雪
  if (code >= 95) return 'storm'; // 雷雨
  return 'rainy'; // 51-67(霧雨/雨), 80-82(にわか雨)
}

export interface DailyWeather {
  date: string;
  weather: Weather;
  tempHigh: number;
}

/** 指定地点の日次天気（今日から days 日分）。 */
export async function fetchDailyWeather(
  latitude: number,
  longitude: number,
  days = 16,
): Promise<DailyWeather[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&daily=weather_code,temperature_2m_max&timezone=Asia%2FTokyo&forecast_days=${days}`;
  const data = (await fetchJson(url)) as {
    daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[] };
  };
  const time = data?.daily?.time ?? [];
  const codes = data?.daily?.weather_code ?? [];
  const temps = data?.daily?.temperature_2m_max ?? [];
  return time.map((date, i) => ({
    date,
    weather: codeToWeather(codes[i] ?? 0),
    tempHigh: Math.round(temps[i] ?? 0),
  }));
}

/** 指定年の日本の祝日（ISO日付の配列）。失敗時は空配列。 */
export async function fetchJpHolidays(year: number): Promise<string[]> {
  try {
    const data = (await fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/JP`)) as Array<{
      date: string;
    }>;
    return (data ?? []).map((h) => h.date);
  } catch {
    return [];
  }
}
