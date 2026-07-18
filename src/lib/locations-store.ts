'use client';

/**
 * 卸先（お店）のマスタを管理するクライアント側ストア。
 *
 * バックエンド未接続のデモでは localStorage に保存し、画面間で共有・永続化する。
 * Supabase 接続時は、この CRUD を `locations` テーブル（organization_id で RLS 分離）
 * への操作へ差し替える。既定値はサンプルの4卸先（seed の履歴と id を一致させてある）。
 */
import { useCallback, useEffect, useState } from 'react';
import { LOCATIONS as SEED_LOCATIONS } from './sample-data';

export interface WholesaleDest {
  id: string;
  name: string;
  /** 種別（スーパー / 飲食店 など・任意） */
  kind?: string;
  /** 有効・無効（無効は入力/予測の対象外） */
  active: boolean;
  /**
   * この卸先が取り扱う商品IDの一覧。
   * undefined = 全商品を扱う（既定）。空配列 = 取扱なし。指定時はその商品のみ。
   */
  productIds?: string[];
  /** ケース単位で卸す（推奨数をケースの倍数へ切り上げ） */
  orderByCase?: boolean;
  /** この卸先の既定の安全在庫率(0-1)。未設定なら全体既定0.1 */
  safetyRate?: number;
  /** 商品別の安全在庫率オーバーライド（productId -> 0-1） */
  safetyRates?: Record<string, number>;
}

/** 卸先 loc が商品 productId を取り扱うか（productIds未設定なら全商品扱い）。 */
export function handlesProduct(loc: WholesaleDest, productId: string): boolean {
  if (!loc.productIds) return true;
  return loc.productIds.includes(productId);
}

const STORAGE_KEY = 'smart-yosoku:locations:v2';

/** 既定の卸先（サンプル。seed 履歴と id を一致させる）。 */
export function defaultLocations(): WholesaleDest[] {
  return SEED_LOCATIONS.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    active: true,
    orderByCase: l.orderByCase,
  }));
}

function read(): WholesaleDest[] {
  if (typeof window === 'undefined') return defaultLocations();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // キーが無い＝未初期化 → 見本（デモ）。明示的に [] が入っていれば「空」を尊重する。
    if (raw == null) return defaultLocations();
    const parsed = JSON.parse(raw) as WholesaleDest[];
    if (!Array.isArray(parsed)) return defaultLocations();
    return parsed;
  } catch {
    return defaultLocations();
  }
}

function write(list: WholesaleDest[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  // 同一タブ内の他コンポーネントへ通知
  window.dispatchEvent(new Event('smart-yosoku:locations-changed'));
}

/** 日本語名などから安全な id を生成（重複時はサフィックス付与）。 */
function makeId(name: string, existing: WholesaleDest[]): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'dest';
  let id = base;
  let n = 1;
  const ids = new Set(existing.map((l) => l.id));
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}

/** 卸先マスタを購読・操作する React フック。 */
export function useLocations() {
  const [locations, setLocations] = useState<WholesaleDest[]>(defaultLocations);

  useEffect(() => {
    setLocations(read());
    const onChange = () => setLocations(read());
    window.addEventListener('smart-yosoku:locations-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('smart-yosoku:locations-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const add = useCallback((input: { name: string; kind?: string }) => {
    const current = read();
    const item: WholesaleDest = {
      id: makeId(input.name, current),
      name: input.name.trim(),
      kind: input.kind?.trim() || undefined,
      active: true,
    };
    write([...current, item]);
    return item;
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<WholesaleDest, 'id'>>) => {
    write(read().map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((l) => l.id !== id));
  }, []);

  const reset = useCallback(() => write(defaultLocations()), []);

  return { locations, add, update, remove, reset };
}

/** 有効な卸先のみ返すヘルパー（フック外で使う集計用）。 */
export function activeLocations(list: WholesaleDest[]): WholesaleDest[] {
  return list.filter((l) => l.active);
}

/** 卸先マスタを見本の初期状態へ戻す（フック外から呼べる）。 */
export function resetLocationsDemo(): void {
  write(defaultLocations());
}
