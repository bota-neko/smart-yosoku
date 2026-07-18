'use client';

/**
 * 外部要因ストア（日付ごとの天候・気温・特売・イベント等）。
 * 需要に影響する条件を日付単位で記録し、予測へ反映する：
 *  - 過去日に付けた要因 → エンジンが効果量を学習
 *  - 対象日（明日など）の予定要因 → エンジンが補正を適用し理由文を生成
 * デモでは localStorage 保存。Supabase 接続時は external_factors / events テーブルへ。
 */
import { useCallback, useEffect, useState } from 'react';
import type { DailyFactors } from '@/domain';

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'storm';

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: '晴れ',
  cloudy: '曇り',
  rainy: '雨',
  snowy: '雪',
  storm: '荒天',
};

/** 1日ぶんの外部要因（日付単位・全卸先共通）。 */
export interface DayFactor {
  weather?: Weather | null;
  tempHigh?: number | null;
  sale?: boolean;
  campaign?: boolean;
  event?: boolean;
  isHoliday?: boolean;
  closed?: boolean;
}

type FactorMap = Record<string, DayFactor>;
const STORAGE_KEY = 'smart-yosoku:factors:v1';

function read(): FactorMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FactorMap) : {};
  } catch {
    return {};
  }
}

function write(map: FactorMap): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('smart-yosoku:factors-changed'));
}

/** 中身が空（未設定）の要因かどうか。 */
function isEmptyFactor(f: DayFactor): boolean {
  return (
    !f.weather &&
    (f.tempHigh == null) &&
    !f.sale &&
    !f.campaign &&
    !f.event &&
    !f.isHoliday &&
    !f.closed
  );
}

/** 保存用 DayFactor → 予測エンジンの DailyFactors へ変換。 */
export function toDailyFactors(f: DayFactor | undefined): DailyFactors | undefined {
  if (!f) return undefined;
  const out: DailyFactors = {};
  if (f.weather) out.weather = f.weather;
  if (f.tempHigh != null) out.tempHigh = f.tempHigh;
  if (f.sale) out.sale = true;
  if (f.campaign) out.campaign = true;
  if (f.event) out.event = true;
  if (f.isHoliday) out.isHoliday = true;
  if (f.closed) out.closed = true;
  return Object.keys(out).length ? out : undefined;
}

/** 保存マップ全体 → 日付→DailyFactors のマップへ変換（履歴への紐付け・対象日補正に使う）。 */
export function toDailyFactorsMap(map: FactorMap): Record<string, DailyFactors> {
  const out: Record<string, DailyFactors> = {};
  for (const [date, f] of Object.entries(map)) {
    const d = toDailyFactors(f);
    if (d) out[date] = d;
  }
  return out;
}

/** 外部要因ストアを購読・操作する React フック。 */
export function useFactors() {
  const [map, setMap] = useState<FactorMap>({});

  useEffect(() => {
    setMap(read());
    const onChange = () => setMap(read());
    window.addEventListener('smart-yosoku:factors-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('smart-yosoku:factors-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const getFactors = useCallback((date: string): DayFactor => map[date] ?? {}, [map]);

  const saveFactors = useCallback((date: string, factor: DayFactor) => {
    const next = { ...read() };
    if (isEmptyFactor(factor)) delete next[date];
    else next[date] = factor;
    write(next);
  }, []);

  /**
   * 複数日の要因を一括マージ（自動取得用）。
   * 各日について既存値へ patch を上書きマージし、手動設定した項目（特売等）は
   * patch に含めなければ保持される。
   */
  const mergeMany = useCallback((updates: Array<{ date: string; patch: Partial<DayFactor> }>) => {
    const next = { ...read() };
    for (const u of updates) {
      const merged: DayFactor = { ...(next[u.date] ?? {}), ...u.patch };
      if (isEmptyFactor(merged)) delete next[u.date];
      else next[u.date] = merged;
    }
    write(next);
  }, []);

  return { map, getFactors, saveFactors, mergeMany };
}

/** 外部要因を初期状態（空）へ戻す。 */
export function resetFactorsDemo(): void {
  write({});
}
