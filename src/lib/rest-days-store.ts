'use client';

/**
 * お店ごとの「休み（記録しない日）」ストア。
 * 納品がなかったが「売れなかった」わけではない日を、理由つきで記録する。
 *  - closed: お店が休みだった（臨時休業など）
 *  - skip:   納品に行かなかった（お店は開いていたが、こちらが納品しない日）
 *  - その日・そのお店は納品数を記録しない（見込みの計算では無視される）
 *  - 「まだ記録していない」扱いから外す
 *  - 未来の日に付ければ、その日・そのお店の作る数を 0 にする
 * デモは localStorage、アカウント時はクラウド同期（cloud-sync の対象キー）。
 */
import { useCallback, useEffect, useState } from 'react';

export type RestReason = 'closed' | 'skip';

/** key = `${date}|${locationId}` -> 理由（以前の記録は true = closed） */
export type RestMap = Record<string, true | RestReason>;

export const REST_LABELS: Record<RestReason, string> = {
  closed: 'お店が休み',
  skip: '納品なし',
};

const STORAGE_KEY = 'smart-yosoku:rest-days:v1';
const EVENT = 'smart-yosoku:rest-days-changed';

function read(): RestMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RestMap) : {};
  } catch {
    return {};
  }
}

function write(map: RestMap): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

export function isRestDay(map: RestMap, date: string, locationId: string): boolean {
  return restReason(map, date, locationId) !== null;
}

/** その日・そのお店の休みの理由（休みでなければ null）。 */
export function restReason(map: RestMap, date: string, locationId: string): RestReason | null {
  const v = map[`${date}|${locationId}`];
  if (v === true || v === 'closed') return 'closed';
  if (v === 'skip') return 'skip';
  return null;
}

export function useRestDays() {
  const [map, setMap] = useState<RestMap>({});

  useEffect(() => {
    setMap(read());
    const onChange = () => setMap(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  /** reason を渡すと休みにする。false で取り消す。 */
  const setRest = useCallback((date: string, locationId: string, rest: RestReason | false) => {
    const next = { ...read() };
    if (rest) next[`${date}|${locationId}`] = rest;
    else delete next[`${date}|${locationId}`];
    write(next);
  }, []);

  return { map, setRest };
}

/** 休みの記録を空にする（フック外から呼べる）。 */
export function resetRestDaysDemo(): void {
  write({});
}
