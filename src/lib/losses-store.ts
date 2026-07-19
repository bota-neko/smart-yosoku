'use client';

/**
 * ロス記録ストア（日付×卸先×商品ごとの「廃棄・返品数」と「売り切れ」）。
 * 納品数（deliveries-store）とは別に、任意で記録する。
 *  - 廃棄/返品 → 廃棄ロス金額 = 数量 × 原価
 *  - 売り切れ → 機会損失（推定）の材料
 * デモは localStorage、アカウント時はクラウド同期（cloud-sync の対象キー）。
 */
import { useCallback, useEffect, useState } from 'react';
import { addDays } from '@/domain';
import { TARGETS, buildHistory, getToday } from './sample-data';

/** key = `${date}|${locationId}|${productId}` -> ロス情報 */
export interface LossEntry {
  /** 廃棄・返品数 */
  waste?: number;
  /** 売り切れ（もっと売れたはず） */
  soldOut?: boolean;
}
type LossMap = Record<string, LossEntry>;

const STORAGE_KEY = 'smart-yosoku:losses:v1';

function keyOf(date: string, locationId: string, productId: string): string {
  return `${date}|${locationId}|${productId}`;
}

/** お試し用のダミー廃棄（buildHistory の waste を利用）。 */
function generateSeed(): LossMap {
  const map: LossMap = {};
  const end = addDays(getToday(), -1);
  for (const entry of TARGETS) {
    const [loc, prod] = entry.id.split('__');
    const history = buildHistory(entry, 150, end);
    for (const r of history) {
      const w = r.waste ?? 0;
      if (r.sales != null && w > 0) map[`${r.date}|${loc}|${prod}`] = { waste: w };
    }
  }
  return map;
}

function read(): LossMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null) return JSON.parse(raw) as LossMap;
    // キーが無い＝お試し初期 → ダミー廃棄をシード（アカウント時は cloud-sync が {} を入れる）
    const seeded = generateSeed();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return {};
  }
}

function write(map: LossMap): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('smart-yosoku:losses-changed'));
}

function isEmpty(e: LossEntry): boolean {
  return (e.waste == null || e.waste === 0 ? true : false) && !e.soldOut;
}

/** ある key のロス情報を取り出す（map から）。 */
export function lossFromMap(
  map: LossMap,
  date: string,
  locationId: string,
  productId: string,
): LossEntry {
  return map[keyOf(date, locationId, productId)] ?? {};
}

export function useLosses() {
  const [map, setMap] = useState<LossMap>({});

  useEffect(() => {
    setMap(read());
    const onChange = () => setMap(read());
    window.addEventListener('smart-yosoku:losses-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('smart-yosoku:losses-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const getLoss = useCallback(
    (date: string, locationId: string, productId: string): LossEntry =>
      map[keyOf(date, locationId, productId)] ?? {},
    [map],
  );

  const setLoss = useCallback(
    (date: string, locationId: string, productId: string, patch: LossEntry) => {
      const next = { ...read() };
      const k = keyOf(date, locationId, productId);
      const merged: LossEntry = { ...(next[k] ?? {}), ...patch };
      if (merged.waste != null && (merged.waste === 0 || Number.isNaN(merged.waste))) delete merged.waste;
      if (isEmpty(merged)) delete next[k];
      else next[k] = merged;
      write(next);
    },
    [],
  );

  return { map, getLoss, setLoss };
}

/** ロス記録を初期化（空）。 */
export function resetLossesDemo(): void {
  write({});
}
