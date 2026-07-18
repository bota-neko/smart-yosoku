'use client';

/**
 * 納品実績ストア（唯一の実績データ源）。
 *
 * 「納品入力で打った数字」＝「過去の納品実績」＝「予測が学習する元データ」を
 * ここに一元化する。バックエンド未接続のデモでは localStorage に保存。
 * Supabase 接続時は daily_records テーブル（organization_id で RLS 分離）へ。
 *
 * 初回はダミー履歴（各卸先×商品の約150日分）をこのストアへ投入するので、
 * 予測は最初から動く。以降、納品入力での編集はこのストアを更新し、予測へ即反映される。
 */
import { useCallback, useEffect, useState } from 'react';
import type { DailyRecord, DailyFactors } from '@/domain';
import { addDays } from '@/domain';
import { TARGETS, buildHistory, getToday } from './sample-data';

/** key = `${date}|${locationId}|${productId}` -> 納品数(個)。キーが無い=未入力(null)。 */
type DeliveryMap = Record<string, number>;

const STORAGE_KEY = 'smart-yosoku:deliveries:v2';
const SEED_HISTORY_DAYS = 150;

function keyOf(date: string, locationId: string, productId: string): string {
  return `${date}|${locationId}|${productId}`;
}

/** 初期ダミー履歴を生成（各 seed 卸先×商品の直近 SEED_HISTORY_DAYS 日）。 */
function generateSeed(): DeliveryMap {
  const map: DeliveryMap = {};
  const end = addDays(getToday(), -1); // 昨日まで実績あり
  for (const entry of TARGETS) {
    const [locationId, productId] = entry.id.split('__');
    const history = buildHistory(entry, SEED_HISTORY_DAYS, end);
    for (const r of history) {
      if (r.sales != null) map[keyOf(r.date, locationId, productId)] = r.sales;
    }
  }
  return map;
}

function read(): DeliveryMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DeliveryMap;
    const seeded = generateSeed();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return {};
  }
}

function write(map: DeliveryMap): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('smart-yosoku:deliveries-changed'));
}

/**
 * マップから (卸先,商品) の実績履歴を DailyRecord[]（日付昇順）で取り出す。
 * factorsByDate を渡すと、各日に外部要因（特売・天候等）を紐づけ、予測エンジンが効果を学習できる。
 */
export function historyFromMap(
  map: DeliveryMap,
  locationId: string,
  productId: string,
  factorsByDate?: Record<string, DailyFactors>,
): DailyRecord[] {
  const suffix = `|${locationId}|${productId}`;
  const recs: DailyRecord[] = [];
  for (const k of Object.keys(map)) {
    if (k.endsWith(suffix)) {
      const date = k.slice(0, k.indexOf('|'));
      recs.push({ date, sales: map[k], factors: factorsByDate?.[date] });
    }
  }
  recs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return recs;
}

/** 納品実績ストアを購読・操作する React フック。 */
export function useDeliveries() {
  const [map, setMap] = useState<DeliveryMap>({});

  useEffect(() => {
    setMap(read());
    const onChange = () => setMap(read());
    window.addEventListener('smart-yosoku:deliveries-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('smart-yosoku:deliveries-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  /** 1件の値を取得（null=未入力）。 */
  const getValue = useCallback(
    (date: string, locationId: string, productId: string): number | null => {
      const v = map[keyOf(date, locationId, productId)];
      return v == null ? null : v;
    },
    [map],
  );

  /** ある日付・卸先の複数商品の値をまとめて保存（value=null は削除=未入力）。 */
  const saveValues = useCallback(
    (
      date: string,
      locationId: string,
      entries: Array<{ productId: string; value: number | null }>,
    ) => {
      const next = { ...read() };
      for (const e of entries) {
        const k = keyOf(date, locationId, e.productId);
        if (e.value == null) delete next[k];
        else next[k] = e.value;
      }
      write(next);
    },
    [],
  );

  /** (卸先,商品) の履歴を DailyRecord[] で返す。 */
  const historyFor = useCallback(
    (locationId: string, productId: string) => historyFromMap(map, locationId, productId),
    [map],
  );

  /** ダミー初期状態へ戻す（実績の全リセット）。 */
  const resetToSample = useCallback(() => write(generateSeed()), []);

  return { map, getValue, saveValues, historyFor, resetToSample };
}

/** 納品実績を見本の初期状態へ戻す（フック外から呼べる）。 */
export function resetDeliveriesDemo(): void {
  write(generateSeed());
}
