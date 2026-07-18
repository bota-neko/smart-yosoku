'use client';

/**
 * 商品（予測対象）のマスタを管理するクライアント側ストア。
 * バックエンド未接続のデモでは localStorage に保存。
 * Supabase 接続時は forecast_targets テーブル（organization_id で RLS 分離）へ。
 * 既定値はサンプルの5商品（seed の履歴と id を一致させてある）。
 */
import { useCallback, useEffect, useState } from 'react';
import { PRODUCT_LIST } from './sample-data';

export interface Product {
  id: string;
  name: string;
  unit: string;
  /** 小数を許容するか（人数=整数, kg=小数など） */
  allowDecimal: boolean;
  price?: number | null;
  cost?: number | null;
  /** 1ケースあたりの入数（>1でケース運用。未設定=ばら） */
  caseSize?: number | null;
  active: boolean;
}

const STORAGE_KEY = 'smart-yosoku:products:v2';

export function defaultProducts(): Product[] {
  return PRODUCT_LIST.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    allowDecimal: p.allowDecimal,
    caseSize: p.caseSize ?? null,
    active: true,
  }));
}

function read(): Product[] {
  if (typeof window === 'undefined') return defaultProducts();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // キーが無い＝未初期化 → 見本（デモ）。明示的に [] が入っていれば「空」を尊重する。
    if (raw == null) return defaultProducts();
    const parsed = JSON.parse(raw) as Product[];
    if (!Array.isArray(parsed)) return defaultProducts();
    return parsed;
  } catch {
    return defaultProducts();
  }
}

function write(list: Product[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('smart-yosoku:products-changed'));
}

function makeId(name: string, existing: Product[]): string {
  const base =
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') ||
    'item';
  let id = base;
  let n = 1;
  const ids = new Set(existing.map((p) => p.id));
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(defaultProducts);

  useEffect(() => {
    setProducts(read());
    const onChange = () => setProducts(read());
    window.addEventListener('smart-yosoku:products-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('smart-yosoku:products-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const add = useCallback(
    (input: {
      name: string; unit: string; allowDecimal?: boolean;
      price?: number | null; cost?: number | null; caseSize?: number | null;
    }) => {
      const current = read();
      const item: Product = {
        id: makeId(input.name, current),
        name: input.name.trim(),
        unit: input.unit.trim() || '個',
        allowDecimal: input.allowDecimal ?? false,
        price: input.price ?? null,
        cost: input.cost ?? null,
        caseSize: input.caseSize ?? null,
        active: true,
      };
      write([...current, item]);
      return item;
    },
    [],
  );

  const update = useCallback((id: string, patch: Partial<Omit<Product, 'id'>>) => {
    write(read().map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((p) => p.id !== id));
  }, []);

  /** 並び替え（dir=-1で上へ, +1で下へ）。この順序が納品入力・予測に反映される。 */
  const move = useCallback((id: string, dir: -1 | 1) => {
    const list = read();
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    write(next);
  }, []);

  const reset = useCallback(() => write(defaultProducts()), []);

  return { products, add, update, remove, move, reset };
}

export function activeProducts(list: Product[]): Product[] {
  return list.filter((p) => p.active);
}

/** 商品マスタを見本の初期状態へ戻す（フック外から呼べる）。 */
export function resetProductsDemo(): void {
  write(defaultProducts());
}
