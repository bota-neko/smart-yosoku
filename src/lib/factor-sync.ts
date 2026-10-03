import type { DayFactor } from '@/lib/factors-store';
import { fetchDailyWeather, fetchJpHolidays } from '@/lib/weather-api';
import { getToday } from '@/lib/sample-data';
import type { Weather } from '@/lib/factors-store';

export interface FactorFetchResult {
  updates: Array<{ date: string; patch: Partial<DayFactor> }>;
  weather: Array<{ date: string; weather: Weather; tempHigh: number }>;
  holidayCount: number;
}

/**
 * 今後16日の天気・気温と日本の祝日を取得し、外部要因ストアへ反映する差分を作る。
 * 天気と祝日は独立に取得（片方が失敗しても、もう片方は反映する）。両方失敗なら null。
 */
export async function fetchFactorUpdates(latitude: number, longitude: number): Promise<FactorFetchResult | null> {
  const today = getToday();
  const year = Number(today.slice(0, 4));
  const [weatherRes, holRes] = await Promise.allSettled([
    fetchDailyWeather(latitude, longitude, 16),
    Promise.all([fetchJpHolidays(year), fetchJpHolidays(year + 1)]),
  ]);
  const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : [];
  const holidayList = holRes.status === 'fulfilled' ? [...holRes.value[0], ...holRes.value[1]] : [];
  const holidaySet = new Set(holidayList.filter((d) => d >= today));
  if (weather.length === 0 && holidaySet.size === 0) return null;

  const updates: FactorFetchResult['updates'] = [];
  for (const w of weather) {
    updates.push({
      date: w.date,
      patch: { weather: w.weather, tempHigh: w.tempHigh, ...(holidaySet.has(w.date) ? { isHoliday: true } : {}) },
    });
  }
  for (const d of holidaySet) {
    if (!weather.some((w) => w.date === d)) updates.push({ date: d, patch: { isHoliday: true } });
  }
  return { updates, weather, holidayCount: holidaySet.size };
}
