'use client';

import { useEffect } from 'react';
import { useFactors } from '@/lib/factors-store';
import { readSettings } from '@/lib/settings-store';
import { fetchFactorUpdates } from '@/lib/factor-sync';
import { getToday } from '@/lib/sample-data';

/** その日に取得済みかの目印（端末ごと。クラウド保存はしない）。 */
const FETCHED_KEY = 'smart-yosoku:weather-fetched-on';

/**
 * 画面を開いたとき、天気・気温・祝日を1日1回だけ裏で自動取得して見込みに反映する。
 * ボタン操作は不要。失敗しても何も表示しない（手動設定はそのまま使える）。
 */
export function AutoWeather() {
  const { mergeMany } = useFactors();

  useEffect(() => {
    // クラウドからの読み込み（ログイン時）を待ってから地域設定を読む
    const timer = window.setTimeout(async () => {
      const s = readSettings();
      const marker = `${getToday()}|${s.latitude},${s.longitude}`;
      try {
        if (window.localStorage.getItem(FETCHED_KEY) === marker) return;
      } catch {
        return;
      }
      const res = await fetchFactorUpdates(s.latitude, s.longitude);
      if (!res) return;
      mergeMany(res.updates);
      // 天気が取れなかった（祝日だけ取れた）ときは、次に画面を開いたとき再取得する
      if (res.weather.length === 0) return;
      try {
        window.localStorage.setItem(FETCHED_KEY, marker);
      } catch {
        // 保存できなくても次回また取得するだけ
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [mergeMany]);

  return null;
}
