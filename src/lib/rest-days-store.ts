'use client';

/**
 * お店ごとの「休み（記録しない日）」ストア。
 * 臨時休業・自店の休みなど、納品がなかったが「売れなかった」わけではない日を記録する。
 *  - その日・そのお店は納品数を記録しない（見込みの計算では無視される）
 *  - 「まだ記録していない」扱いから外す
 *  - 未来の日に付ければ、その日・そのお店の作る数を 0 にする
 * デモは localStorage、アカウント時はクラウド同期（cloud-sync の対象キー）。
 */
import { useCallback, useEffect, useState } from 'react';

/** key = `${date}|${locationId}` -> true */
export type RestMap = Record<string, true>;

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
  return map[`${date}|${locationId}`] === true;
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

  const setRest = useCallback((date: string, locationId: string, rest: boolean) => {
    const next = { ...read() };
    if (rest) next[`${date}|${locationId}`] = true;
    else delete next[`${date}|${locationId}`];
    write(next);
  }, []);

  return { map, setRest };
}

/** 休みの記録を空にする（フック外から呼べる）。 */
export function resetRestDaysDemo(): void {
  write({});
}
