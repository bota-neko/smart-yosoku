'use client';

import { useState } from 'react';
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  RotateCcw,
  Info,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProducts, type Product } from '@/lib/products-store';
import { resetAllDemoData } from '@/lib/demo-data';

/**
 * 商品管理（予測対象＝豆腐などの商品を登録・編集・削除）。
 * ここで登録した商品が、卸先の取扱商品・納品入力・予測・製造計画に反映される。
 * デモでは localStorage 保存。Supabase 接続時は forecast_targets へ。
 */
export default function ProductsPage() {
  const { products, add, update, remove, move } = useProducts();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('個');
  const [allowDecimal, setAllowDecimal] = useState(false);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [caseSize, setCaseSize] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; unit: string; price: string; cost: string; caseSize: string; allowDecimal: boolean }>({
    name: '', unit: '', price: '', cost: '', caseSize: '', allowDecimal: false,
  });

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    add({
      name: trimmed,
      unit: unit.trim() || '個',
      allowDecimal,
      price: price ? Number(price) : null,
      cost: cost ? Number(cost) : null,
      caseSize: caseSize ? Number(caseSize) : null,
    });
    setName('');
    setUnit('個');
    setAllowDecimal(false);
    setPrice('');
    setCost('');
    setCaseSize('');
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEdit({
      name: p.name,
      unit: p.unit,
      price: p.price != null ? String(p.price) : '',
      cost: p.cost != null ? String(p.cost) : '',
      caseSize: p.caseSize != null ? String(p.caseSize) : '',
      allowDecimal: p.allowDecimal,
    });
  };
  const saveEdit = () => {
    if (!editingId || !edit.name.trim()) return;
    update(editingId, {
      name: edit.name.trim(),
      unit: edit.unit.trim() || '個',
      price: edit.price ? Number(edit.price) : null,
      cost: edit.cost ? Number(edit.cost) : null,
      caseSize: edit.caseSize ? Number(edit.caseSize) : null,
      allowDecimal: edit.allowDecimal,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">商品管理</h1>
        <p className="text-muted">
          予測する商品を登録します。ここで登録した商品が、卸先の取扱商品・納品入力・予測・製造計画に反映されます。
        </p>
      </header>

      {/* 追加フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
            商品を追加
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label htmlFor="p-name" className="text-sm font-semibold text-muted">
              商品名 <span className="text-state-bad">必須</span>
            </label>
            <input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="例）ざる豆腐"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="w-24 space-y-1">
            <label htmlFor="p-unit" className="text-sm font-semibold text-muted">単位</label>
            <input
              id="p-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="丁 / 個 / kg"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="w-28 space-y-1">
            <label htmlFor="p-price" className="text-sm font-semibold text-muted">単価（任意）</label>
            <input
              id="p-price"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="円"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="w-24 space-y-1">
            <label htmlFor="p-cost" className="text-sm font-semibold text-muted">原価（任意）</label>
            <input
              id="p-cost"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="円"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="w-32 space-y-1">
            <label htmlFor="p-case" className="text-sm font-semibold text-muted">ケース入数（任意）</label>
            <input
              id="p-case"
              inputMode="numeric"
              value={caseSize}
              onChange={(e) => setCaseSize(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1ケース◯個"
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <label className="flex h-11 items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={allowDecimal}
              onChange={(e) => setAllowDecimal(e.target.checked)}
              className="h-5 w-5"
            />
            小数を使う（kg等）
          </label>
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
            <Package className="h-5 w-5 text-primary" aria-hidden="true" />
            登録済みの商品（{products.length}件）
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
          {products.length === 0 ? (
            <p className="p-8 text-center text-muted">
              商品がまだありません。上のフォームから追加してください。
            </p>
          ) : (
            products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {editingId === p.id ? (
                  <>
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      aria-label="商品名"
                      className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <input
                      value={edit.unit}
                      onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                      aria-label="単位"
                      className="h-10 w-20 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <input
                      value={edit.price}
                      onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/[^0-9.]/g, '') })}
                      aria-label="単価"
                      placeholder="単価"
                      className="h-10 w-20 rounded-md border border-border bg-surface px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <input
                      value={edit.cost}
                      onChange={(e) => setEdit({ ...edit, cost: e.target.value.replace(/[^0-9.]/g, '') })}
                      aria-label="原価"
                      placeholder="原価"
                      className="h-10 w-20 rounded-md border border-border bg-surface px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <input
                      value={edit.caseSize}
                      onChange={(e) => setEdit({ ...edit, caseSize: e.target.value.replace(/[^0-9]/g, '') })}
                      aria-label="ケース入数"
                      placeholder="ケース入数"
                      className="h-10 w-28 rounded-md border border-border bg-surface px-3 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={edit.allowDecimal}
                        onChange={(e) => setEdit({ ...edit, allowDecimal: e.target.checked })}
                        className="h-4 w-4"
                      />
                      小数
                    </label>
                    <Button size="sm" onClick={saveEdit}>
                      <Check className="h-4 w-4" aria-hidden="true" />保存
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" aria-hidden="true" />取消
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-2 text-lg font-medium">
                      <Package className="h-5 w-5 text-muted" aria-hidden="true" />
                      {p.name}
                    </span>
                    <Badge variant="neutral">単位: {p.unit}</Badge>
                    {p.price != null ? <Badge variant="neutral">単価 {p.price}円</Badge> : null}
                    {p.cost != null ? <Badge variant="neutral">原価 {p.cost}円</Badge> : null}
                    {p.caseSize && p.caseSize > 1 ? (
                      <Badge variant="neutral">1ケース {p.caseSize}{p.unit}</Badge>
                    ) : null}
                    {p.allowDecimal ? <Badge variant="neutral">小数可</Badge> : null}
                    {p.active ? (
                      <Badge variant="good"><Check className="h-3.5 w-3.5" aria-hidden="true" />有効</Badge>
                    ) : (
                      <Badge variant="ref">無効</Badge>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          onClick={() => move(p.id, -1)}
                          aria-label={`${p.name} を上へ`}
                          className="rounded border border-border px-1 text-muted hover:bg-muted-bg"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => move(p.id, 1)}
                          aria-label={`${p.name} を下へ`}
                          className="rounded border border-border px-1 text-muted hover:bg-muted-bg"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => update(p.id, { active: !p.active })}>
                        {p.active ? '無効にする' : '有効にする'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />編集
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { if (confirm(`「${p.name}」を削除しますか？`)) remove(p.id); }}
                        aria-label={`${p.name} を削除`}
                      >
                        <Trash2 className="h-4 w-4 text-state-bad" aria-hidden="true" />削除
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          新しく追加した商品は過去の実績が無いため、予測は当面「参考値」になります。
          どの卸先がどの商品を扱うかは「卸先管理」の各卸先で設定できます。
        </span>
      </p>
    </div>
  );
}
