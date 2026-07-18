'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Copy,
  CopyCheck,
  Check,
  Circle,
  Save,
  Store,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getToday } from '@/lib/sample-data';
import { useLocations, activeLocations, handlesProduct, type WholesaleDest } from '@/lib/locations-store';
import { useProducts, activeProducts, type Product } from '@/lib/products-store';
import { useDeliveries } from '@/lib/deliveries-store';
import { useFactors, WEATHER_LABELS, type Weather, type DayFactor } from '@/lib/factors-store';
import { AutoFactorFetch } from '@/components/features/factors/auto-factor-fetch';
import { addDays, dowLabel } from '@/domain';

/**
 * 納品入力（卸先ごとに、何を何個納品したかを入力する）。
 *
 * 流れ:
 *   1. 日付を選ぶ（前日/翌日・今日ボタン）
 *   2. 卸先（お店）を選ぶ（上部のタブ）
 *   3. 商品ごとに納品した個数を入力する（大きな入力欄）
 *
 * - 「前日をコピー」「前週同曜日をコピー」で、その卸先の過去実績を一括入力
 * - 0 と空欄を区別（空欄=未入力=null, 0=納品ゼロ）
 * - 卸先ごとに入力状況（未入力/入力済み）を表示
 * - スマホ対応（1列の縦並び）
 *
 * 保存はローカル state のみ（Supabase 連携は別担当）。
 */
export default function DeliveryInputPage() {
  const { locations: allLocs } = useLocations();
  const { products } = useProducts();
  const { map, saveValues } = useDeliveries();
  const { getFactors, saveFactors } = useFactors();
  const locs = activeLocations(allLocs);
  const prods = activeProducts(products);
  const [date, setDate] = useState<string>(getToday());
  const [locationId, setLocationId] = useState<string>('');
  // 編集バッファ。キー `${locationId}|${productId}` → 入力文字列（'' は未入力）。
  // 選択中の日付について、納品実績ストアの内容を初期表示し、保存でストアへ書き戻す。
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 選択中の卸先が無効/未選択なら先頭へ寄せる
  useEffect(() => {
    if (locs.length > 0 && !locs.some((l) => l.id === locationId)) {
      setLocationId(locs[0].id);
    }
  }, [locs, locationId]);

  const key = (loc: string, prod: string) => `${loc}|${prod}`;

  /** その卸先が扱う商品だけを返す。 */
  const productsFor = useCallback(
    (loc: WholesaleDest): Product[] => prods.filter((p) => handlesProduct(loc, p.id)),
    [prods],
  );

  // 日付・ストア内容が変わったら、その日付の実績を編集バッファへ読み込む
  useEffect(() => {
    const buffer: Record<string, string> = {};
    for (const loc of locs) {
      for (const p of productsFor(loc)) {
        const v = map[`${date}|${loc.id}|${p.id}`];
        buffer[key(loc.id, p.id)] = v == null ? '' : String(v);
      }
    }
    setValues(buffer);
    setSavedAt(null);
    // locs/prods は毎レンダー生成のため依存は date と map に限定（内容変化で再読込）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, map]);

  const location = locs.find((l) => l.id === locationId);

  /** 現在の卸先の取扱商品。 */
  const currentProducts = useMemo(
    () => (location ? productsFor(location) : []),
    [location, productsFor],
  );

  /** 商品ごとの「前回（前日）実績」。ストアから取得。 */
  const references = useMemo(
    () =>
      currentProducts.map((p) => {
        const v = map[`${addDays(date, -1)}|${locationId}|${p.id}`];
        return { product: p, reference: v == null ? null : v };
      }),
    [currentProducts, locationId, date, map],
  );

  const setValue = (productId: string, raw: string, allowDecimal: boolean) => {
    const cleaned = allowDecimal
      ? raw.replace(/[^0-9.]/g, '')
      : raw.replace(/[^0-9]/g, '');
    setValues((prev) => ({ ...prev, [key(locationId, productId)]: cleaned }));
    setSavedAt(null);
  };

  /** 指定日の当該卸先の実績を、現在フォームへ一括コピー（保存するまでストア未反映）。 */
  const copyFrom = useCallback(
    (sourceDate: string) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const p of currentProducts) {
          const v = map[`${sourceDate}|${locationId}|${p.id}`];
          next[key(locationId, p.id)] = v == null ? '' : String(v);
        }
        return next;
      });
      setSavedAt(null);
    },
    [locationId, currentProducts, map],
  );

  /** 卸先ごとの入力状況（入力済み商品数）。 */
  const locationStatus = (loc: WholesaleDest) => {
    const list = productsFor(loc);
    let filled = 0;
    for (const p of list) {
      if ((values[key(loc.id, p.id)] ?? '') !== '') filled += 1;
    }
    return { filled, total: list.length };
  };

  const currentStatus = location ? locationStatus(location) : { filled: 0, total: 0 };
  const dateLabel = `${date}（${dowLabel(date)}）`;

  // その日の外部要因（天候・特売・イベント等）。予測に反映される。
  const factor = getFactors(date);
  const updateFactor = (patch: Partial<DayFactor>) =>
    saveFactors(date, { ...getFactors(date), ...patch });

  /** 現在の日付・卸先の入力を納品実績ストアへ保存（'' は未入力=削除）。予測へ即反映。 */
  const handleSave = () => {
    if (!location) return;
    const entries = currentProducts.map((p) => {
      const raw = values[key(locationId, p.id)] ?? '';
      return { productId: p.id, value: raw === '' ? null : Number(raw) };
    });
    saveValues(date, locationId, entries);
    setSavedAt(
      new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    );
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">納品入力</h1>
        <p className="text-muted">
          日付と卸先（お店）を選び、商品ごとに納品した個数を入力します。ここで入力した数字が「過去の納品実績」となり、予測の学習に使われます。空欄は「未入力」、0 は「納品ゼロ」として区別されます。
        </p>
      </header>

      {/* 1. 日付選択 */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            日付
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDate(addDays(date, -1))}
            aria-label="前日へ"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            前日
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
              setSavedAt(null);
            }}
            aria-label="納品日"
            className="h-11 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDate(addDays(date, 1))}
            aria-label="翌日へ"
          >
            翌日
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDate(getToday())}>
            今日
          </Button>
          <span className="ml-auto text-base font-medium">{dateLabel}</span>
        </CardContent>
      </Card>

      {/* 1.5 その日の状況（外部要因）— 予測に反映 */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold text-muted">
            その日の状況（特売・イベント・天気など・予測に反映されます）
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* 天気 */}
            <label className="flex items-center gap-2 text-base">
              天気
              <select
                value={factor.weather ?? ''}
                onChange={(e) =>
                  updateFactor({ weather: (e.target.value || null) as Weather | null })
                }
                aria-label="天気"
                className="h-10 rounded-md border border-border bg-surface px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">未設定</option>
                {(Object.keys(WEATHER_LABELS) as Weather[]).map((w) => (
                  <option key={w} value={w}>
                    {WEATHER_LABELS[w]}
                  </option>
                ))}
              </select>
            </label>
            {/* 最高気温 */}
            <label className="flex items-center gap-1.5 text-base">
              最高気温
              <input
                inputMode="numeric"
                value={factor.tempHigh ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9-]/g, '');
                  updateFactor({ tempHigh: v === '' ? null : Number(v) });
                }}
                aria-label="最高気温（℃）"
                placeholder="—"
                className="h-10 w-16 rounded-md border border-border bg-surface px-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              ℃
            </label>
            {/* トグル群 */}
            <FactorToggle label="特売" active={!!factor.sale} onToggle={() => updateFactor({ sale: !factor.sale })} />
            <FactorToggle label="キャンペーン" active={!!factor.campaign} onToggle={() => updateFactor({ campaign: !factor.campaign })} />
            <FactorToggle label="イベント" active={!!factor.event} onToggle={() => updateFactor({ event: !factor.event })} />
            <FactorToggle label="祝日" active={!!factor.isHoliday} onToggle={() => updateFactor({ isHoliday: !factor.isHoliday })} />
            <FactorToggle label="店休日" active={!!factor.closed} onToggle={() => updateFactor({ closed: !factor.closed })} />
          </div>
          <p className="text-xs text-muted">
            明日など未来の日付に「特売」「雨」などを設定すると、その日の予測（製造計画）に補正がかかります。
          </p>
        </CardContent>
      </Card>

      {/* 1.6 天気・祝日の自動取得 */}
      <AutoFactorFetch />

      {/* 2. 卸先選択（タブ） */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted">卸先（お店）を選ぶ</p>
          <Link
            href="/locations"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            卸先を追加・管理
          </Link>
        </div>
        {locs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <Store className="h-8 w-8 text-muted" aria-hidden="true" />
              <p className="text-muted">卸先がまだ登録されていません。</p>
              <Link href="/locations">
                <Button>
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  卸先を登録する
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
        <div
          role="tablist"
          aria-label="卸先の選択"
          className="flex flex-wrap gap-2"
        >
          {locs.map((loc) => {
            const st = locationStatus(loc);
            const done = st.total > 0 && st.filled === st.total;
            const active = loc.id === locationId;
            return (
              <button
                key={loc.id}
                role="tab"
                aria-selected={active}
                onClick={() => setLocationId(loc.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-base transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-border bg-surface text-foreground hover:bg-muted-bg'
                }`}
              >
                <Store className="h-4 w-4" aria-hidden="true" />
                <span>{loc.name}</span>
                {done ? (
                  <Check
                    className={`h-4 w-4 ${active ? 'text-primary-fg' : 'text-state-good'}`}
                    aria-label="入力済み"
                  />
                ) : (
                  <span
                    className={`rounded-full px-1.5 text-xs ${
                      active ? 'bg-primary-fg/20' : 'bg-muted-bg text-muted'
                    }`}
                    aria-label={`未入力 ${st.total - st.filled} 件`}
                  >
                    {st.filled}/{st.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* 3. 商品ごとの納品数入力 */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" aria-hidden="true" />
            {location?.name}
            {location?.kind ? (
              <span className="text-base font-normal text-muted">（{location.kind}）</span>
            ) : null}
            <span className="text-base font-normal text-muted">への納品</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copyFrom(addDays(date, -1))}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              前日をコピー
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyFrom(addDays(date, -7))}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              前週同曜日をコピー
            </Button>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {currentProducts.length === 0 ? (
            <p className="p-6 text-center text-muted">
              この卸先が扱う商品がありません。「卸先管理」の取扱商品、または「商品管理」で設定してください。
            </p>
          ) : null}
          {currentProducts.map((product, i) => {
            const k = key(locationId, product.id);
            const val = values[k] ?? '';
            const empty = val === '';
            const ref = references.find((r) => r.product.id === product.id)?.reference ?? null;
            return (
              <div
                key={product.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <label htmlFor={`prod-${product.id}`} className="min-w-[8rem] flex-1 text-lg font-medium">
                  {product.name}
                </label>
                {ref !== null ? (
                  <span className="text-sm text-muted">
                    前回 {ref}
                    {product.unit}
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  <input
                    id={`prod-${product.id}`}
                    type="text"
                    inputMode={product.allowDecimal ? 'decimal' : 'numeric'}
                    value={val}
                    onChange={(e) => setValue(product.id, e.target.value, product.allowDecimal)}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const next = currentProducts[i + 1];
                        if (next) document.getElementById(`prod-${next.id}`)?.focus();
                      }
                    }}
                    placeholder="未入力"
                    aria-label={`${location?.name} へ納品した ${product.name} の数（${product.unit}）`}
                    className={`h-12 w-28 rounded-md border px-3 text-right text-xl tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      empty
                        ? 'border-dashed border-border bg-muted-bg/40 text-muted placeholder:text-muted'
                        : 'border-border bg-surface text-foreground'
                    }`}
                  />
                  <span className="w-10 text-base text-muted">{product.unit}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 保存バー */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-base">
          {currentStatus.total === 0 ? null : currentStatus.filled === currentStatus.total ? (
            <Badge variant="good">
              <Check className="h-4 w-4" aria-hidden="true" />
              {location?.name} は入力済み
            </Badge>
          ) : (
            <Badge variant="warn">
              <Circle className="h-3 w-3" aria-hidden="true" />
              {location?.name} は未入力 {currentStatus.total - currentStatus.filled} 件
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {savedAt ? (
            <span className="inline-flex items-center gap-1 text-sm text-state-good">
              <CopyCheck className="h-4 w-4" aria-hidden="true" />
              {savedAt} に保存しました（予測へ反映）
            </span>
          ) : null}
          <Button onClick={handleSave}>
            <Save className="h-5 w-5" aria-hidden="true" />
            この日の納品を保存
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted">
        Enter キーで次の商品へ移動できます。卸先を切り替えても入力内容は保持されます。
      </p>
    </div>
  );
}

/** 外部要因のオン/オフ切替チップ（色だけに頼らずチェック＋枠線で状態表示）。 */
function FactorToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-base transition-colors ${
        active
          ? 'border-primary bg-primary/10 font-medium text-foreground'
          : 'border-dashed border-border bg-surface text-muted hover:bg-muted-bg'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-4 w-4 place-items-center rounded-sm border text-[10px] ${
          active ? 'border-primary bg-primary text-primary-fg' : 'border-border'
        }`}
      >
        {active ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}
