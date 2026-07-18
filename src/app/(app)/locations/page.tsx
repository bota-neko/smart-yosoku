'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Store,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  RotateCcw,
  Info,
  Package,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocations, handlesProduct, type WholesaleDest } from '@/lib/locations-store';
import { useProducts, activeProducts } from '@/lib/products-store';
import { resetAllDemoData } from '@/lib/demo-data';

/**
 * 卸先管理（お店＝納品先の登録・編集・削除）。
 *
 * ここで登録した卸先が、納品入力のタブ・製造計画（合計予測）・予測に連動する。
 * デモではブラウザ内（localStorage）に保存。Supabase 接続時は locations テーブルへ。
 */
export default function LocationsPage() {
  const { locations, add, update, remove } = useLocations();
  const { products } = useProducts();
  const prods = activeProducts(products);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState('');
  const [openProductsId, setOpenProductsId] = useState<string | null>(null);

  /** 卸先の取扱商品をトグル（productIds未設定=全扱いを、明示リストへ切替）。 */
  const toggleProduct = (loc: WholesaleDest, productId: string) => {
    const current = loc.productIds ?? prods.map((p) => p.id);
    const set = new Set(current);
    if (set.has(productId)) set.delete(productId);
    else set.add(productId);
    update(loc.id, { productIds: Array.from(set) });
  };
  /** 全商品を扱う状態へ戻す。 */
  const setAllProducts = (loc: WholesaleDest) =>
    update(loc.id, { productIds: undefined });

  /** 取扱商品の件数表示（未設定=全商品）。 */
  const handledCount = (loc: WholesaleDest) =>
    loc.productIds ? loc.productIds.length : prods.length;

  /** 卸先の既定安全率(%)を設定（空なら未設定=全体既定へ）。 */
  const setLocSafety = (loc: WholesaleDest, pct: string) => {
    update(loc.id, { safetyRate: pct === '' ? undefined : Number(pct) / 100 });
  };
  /** (卸先×商品)の安全率(%)を設定（空なら卸先既定へ戻す）。 */
  const setPairSafety = (loc: WholesaleDest, productId: string, pct: string) => {
    const rates = { ...(loc.safetyRates ?? {}) };
    if (pct === '') delete rates[productId];
    else rates[productId] = Number(pct) / 100;
    update(loc.id, { safetyRates: Object.keys(rates).length ? rates : undefined });
  };
  /** 表示用: 卸先の既定安全率% */
  const locSafetyPct = (loc: WholesaleDest) =>
    loc.safetyRate != null ? String(Math.round(loc.safetyRate * 100)) : '';
  /** 表示用: (卸先×商品)の安全率%（未設定は空） */
  const pairSafetyPct = (loc: WholesaleDest, productId: string) => {
    const v = loc.safetyRates?.[productId];
    return v != null ? String(Math.round(v * 100)) : '';
  };

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    add({ name: trimmed, kind: kind.trim() || undefined });
    setName('');
    setKind('');
  };

  const startEdit = (l: WholesaleDest) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditKind(l.kind ?? '');
  };
  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    update(editingId, { name: trimmed, kind: editKind.trim() || undefined });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">卸先管理</h1>
        <p className="text-muted">
          商品を卸すお店（納品先）を登録します。ここで登録した卸先が、納品入力・予測・製造計画に反映されます。
        </p>
      </header>

      {/* 新規追加フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
            卸先を追加
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-1">
            <label htmlFor="loc-name" className="text-sm font-semibold text-muted">
              卸先名（お店の名前）<span className="text-state-bad">必須</span>
            </label>
            <input
              id="loc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="例）東口スーパー"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="w-40 space-y-1">
            <label htmlFor="loc-kind" className="text-sm font-semibold text-muted">
              種別（任意）
            </label>
            <input
              id="loc-kind"
              type="text"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="例）スーパー"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <Button onClick={handleAdd} disabled={!name.trim()}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            追加する
          </Button>
        </CardContent>
      </Card>

      {/* 一覧 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Store className="h-5 w-5 text-primary" aria-hidden="true" />
            登録済みの卸先（{locations.length}件）
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm('商品・卸先・納品実績をすべて見本の初期状態に戻します。よろしいですか？')) {
                resetAllDemoData();
              }
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            サンプルに戻す（全データ）
          </Button>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {locations.length === 0 ? (
            <p className="p-8 text-center text-muted">
              卸先がまだありません。上のフォームから追加してください。
            </p>
          ) : (
            locations.map((l) => (
              <div key={l.id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {editingId === l.id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="卸先名"
                        className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <input
                        value={editKind}
                        onChange={(e) => setEditKind(e.target.value)}
                        aria-label="種別"
                        placeholder="種別"
                        className="h-10 w-32 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <Button size="sm" onClick={saveEdit}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" aria-hidden="true" />
                        取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-2 text-lg font-medium">
                        <Store className="h-5 w-5 text-muted" aria-hidden="true" />
                        {l.name}
                      </span>
                      {l.kind ? <Badge variant="neutral">{l.kind}</Badge> : null}
                      {l.active ? (
                        <Badge variant="good">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          有効
                        </Badge>
                      ) : (
                        <Badge variant="ref">無効</Badge>
                      )}
                      <button
                        onClick={() => setOpenProductsId(openProductsId === l.id ? null : l.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm text-primary hover:bg-muted-bg"
                        aria-expanded={openProductsId === l.id}
                      >
                        <Package className="h-4 w-4" aria-hidden="true" />
                        取扱商品 {handledCount(l)}/{prods.length}
                      </button>
                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => update(l.id, { active: !l.active })}
                        >
                          {l.active ? '無効にする' : '有効にする'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => startEdit(l)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          編集
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm(`「${l.name}」を削除しますか？`)) remove(l.id);
                          }}
                          aria-label={`${l.name} を削除`}
                        >
                          <Trash2 className="h-4 w-4 text-state-bad" aria-hidden="true" />
                          削除
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {/* 取扱商品エディタ */}
                {openProductsId === l.id ? (
                  <div className="border-t border-border bg-muted-bg/40 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-muted">
                        {l.name} が扱う商品を選ぶ（チェックを外すと納品入力・予測から除外）
                      </p>
                      <button
                        onClick={() => setAllProducts(l)}
                        className="text-sm text-primary hover:underline"
                      >
                        全商品を扱う
                      </button>
                    </div>

                    {/* 卸先の発注設定（ケース単位・既定安全率） */}
                    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface px-3 py-2">
                      <label className="flex items-center gap-2 text-base">
                        <input
                          type="checkbox"
                          checked={!!l.orderByCase}
                          onChange={() => update(l.id, { orderByCase: !l.orderByCase })}
                          className="h-5 w-5"
                        />
                        ケース単位で卸す（推奨数をケースの倍数へ切り上げ）
                      </label>
                      <label className="flex items-center gap-1.5 text-base">
                        この卸先の安全率
                        <input
                          inputMode="numeric"
                          value={locSafetyPct(l)}
                          onChange={(e) => setLocSafety(l, e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="10"
                          aria-label={`${l.name} の既定安全率（％）`}
                          className="h-9 w-16 rounded-md border border-border bg-surface px-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                        <span className="text-muted">％（未入力=既定10％）</span>
                      </label>
                    </div>

                    {prods.length === 0 ? (
                      <p className="text-sm text-muted">
                        商品が登録されていません。
                        <Link href="/products" className="text-primary hover:underline">商品管理</Link>
                        から追加してください。
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {prods.map((p) => {
                          const on = handlesProduct(l, p.id);
                          return (
                            <div key={p.id} className="flex flex-wrap items-center gap-3">
                              <label
                                className={`inline-flex min-h-10 min-w-[10rem] flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 text-base ${
                                  on
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : 'border-dashed border-border bg-surface text-muted'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleProduct(l, p.id)}
                                  className="h-4 w-4"
                                />
                                {p.name}
                                {p.caseSize && p.caseSize > 1 ? (
                                  <span className="text-xs text-muted">（1ケース{p.caseSize}{p.unit}）</span>
                                ) : null}
                              </label>
                              {on ? (
                                <label className="flex items-center gap-1 text-sm text-muted">
                                  安全率
                                  <input
                                    inputMode="numeric"
                                    value={pairSafetyPct(l, p.id)}
                                    onChange={(e) => setPairSafety(l, p.id, e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder={locSafetyPct(l) || '10'}
                                    aria-label={`${l.name} の ${p.name} の安全率（％）`}
                                    className="h-9 w-14 rounded-md border border-border bg-surface px-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                  />
                                  ％
                                </label>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          新しく追加した卸先は過去の納品実績が無いため、予測は当面「参考値」（信頼度低め）になります。
          納品入力でデータが貯まるほど予測精度が上がります。デモではこの登録内容はこのブラウザに保存されます。
        </span>
      </p>
    </div>
  );
}
