'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Copy,
  CopyCheck,
  Check,
  Save,
  Store,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Moon,
  CircleSlash,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getToday } from '@/lib/sample-data';
import { useLocations, activeLocations, handlesProduct, type WholesaleDest } from '@/lib/locations-store';
import { useProducts, activeProducts, type Product } from '@/lib/products-store';
import { useDeliveries } from '@/lib/deliveries-store';
import { useFactors, type DayFactor } from '@/lib/factors-store';
import { useLosses } from '@/lib/losses-store';
import { useRestDays, isRestDay } from '@/lib/rest-days-store';
import { SlipScanner, type SlipApply } from '@/components/features/slip/slip-scanner';
import { addDays, dowLabel } from '@/domain';

/**
 * きょうの納品。
 *
 * 流れ:
 *   1. 「納品書を撮る」→ 読み取り結果を確認 → 入力欄に下書き → 保存
 *   2. 手で入れるときは、お店を選んで商品ごとの数を入力 → 保存
 *
 * - お店ごとに「記録済み / まだ」を一覧で表示
 * - 廃棄・売り切れ（ロス）と、特売・イベントなどは、ふだんは閉じておく
 * - 天気・気温・祝日は自動取得（入力不要）
 * - 0 と空欄を区別（空欄=未入力、0=納品ゼロ）
 */
export default function DeliveryInputPage() {
  const { locations: allLocs } = useLocations();
  const { products } = useProducts();
  const { map, saveValues } = useDeliveries();
  const { getFactors, saveFactors } = useFactors();
  const { getLoss, setLoss } = useLosses();
  const { map: restMap, setRest } = useRestDays();
  const locs = activeLocations(allLocs);
  const prods = activeProducts(products);
  const [date, setDate] = useState<string>(getToday());
  const [locationId, setLocationId] = useState<string>('');
  // 編集バッファ。キー `${locationId}|${productId}` → 入力文字列（'' は未入力）。
  // 選択中の日付について、納品実績ストアの内容を初期表示し、保存でストアへ書き戻す。
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // 納品書の読み取り結果（日付切替による再読込のあとで入力欄へ重ねる）
  const [pendingScan, setPendingScan] = useState<SlipApply | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // お店を選んだら入力欄までスクロール（スマホで一覧の下に隠れないように）
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (locationId) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [locationId]);

  // ロス（廃棄・売切）の入力欄を出すか
  const [showLoss, setShowLoss] = useState(false);

  // 選択中のお店が削除・休止されたら選択を外す
  useEffect(() => {
    if (locationId && !locs.some((l) => l.id === locationId)) setLocationId('');
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

  // 納品書の読み取り結果を、対象日の入力欄へ下書きとして反映（保存は利用者が行う）
  useEffect(() => {
    if (!pendingScan || pendingScan.date !== date) return;
    const scan = pendingScan;
    setValues((prev) => {
      const next = { ...prev };
      for (const [productId, qty] of Object.entries(scan.values)) {
        next[key(scan.locationId, productId)] = String(qty);
      }
      return next;
    });
    setLocationId(scan.locationId);
    setPendingScan(null);
    setSavedAt(null);
    const name = locs.find((l) => l.id === scan.locationId)?.name ?? '';
    setScanNotice(
      `納品書から ${name} の ${Object.keys(scan.values).length} 品目を入力しました。内容を確認して「この日の納品を保存」を押してください。`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScan, date]);

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

  /** 現在の日付・卸先の入力を納品実績ストアへ保存（'' は未入力=削除）。予測へ即反映。 */
  const handleSave = () => {
    if (!location) return;
    const entries = currentProducts.map((p) => {
      const raw = values[key(locationId, p.id)] ?? '';
      return { productId: p.id, value: raw === '' ? null : Number(raw) };
    });
    saveValues(date, locationId, entries);
    if (entries.some((e) => e.value !== null)) setRest(date, locationId, false);
    setScanNotice(null);
    setSavedAt(`${nowLabel()} に保存しました`);
  };

  /** 納品なし：全商品を 0 で記録して保存（「売れなかった日」として見込みに使われる）。 */
  const handleNoDelivery = () => {
    if (!location) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const p of currentProducts) next[key(locationId, p.id)] = '0';
      return next;
    });
    saveValues(date, locationId, currentProducts.map((p) => ({ productId: p.id, value: 0 })));
    setRest(date, locationId, false);
    setScanNotice(null);
    setSavedAt(`${nowLabel()} に「納品なし（0）」で保存しました`);
  };

  /** 休み：記録を消して「休み」にする（見込みの計算では無視、未来の日なら作る数を0に）。 */
  const handleRest = () => {
    if (!location) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const p of currentProducts) next[key(locationId, p.id)] = '';
      return next;
    });
    saveValues(date, locationId, currentProducts.map((p) => ({ productId: p.id, value: null })));
    setRest(date, locationId, true);
    setScanNotice(null);
    setSavedAt(null);
  };

  const isToday = date === getToday();
  /** 自店の店休日（その日の全お店が休み扱い） */
  const shopClosed = !!getFactors(date).closed;
  const isRest = (l: WholesaleDest) => shopClosed || isRestDay(restMap, date, l.id);
  const recordedCount = locs.filter((l) => {
    if (isRest(l)) return true;
    const st = locationStatus(l);
    return st.total > 0 && st.filled === st.total;
  }).length;
  const currentRest = location ? isRest(location) : false;
  const [, mm, dd] = date.split('-').map(Number);
  const nextDate = addDays(date, 1);
  const hasLossToday = currentProducts.some((p) => {
    const l = getLoss(date, locationId, p.id);
    return l.waste != null || l.soldOut;
  });
  const lossOpen = showLoss || hasLossToday;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{isToday ? 'きょうの納品' : `${mm}月${dd}日の納品`}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="前の日へ">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            前の日
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
              setSavedAt(null);
            }}
            aria-label="納品日"
            className="h-10 rounded-md border border-border bg-surface px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="次の日へ">
            次の日
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {!isToday ? (
            <Button size="sm" variant="outline" onClick={() => setDate(getToday())}>
              きょうに戻る
            </Button>
          ) : null}
          {locs.length > 0 ? (
            <span className="ml-auto text-base text-muted">
              記録済み {recordedCount} / {locs.length} 店
            </span>
          ) : null}
        </div>
      </header>

      {/* 1. 納品書を撮る（いちばん簡単な記録方法） */}
      <SlipScanner
        products={prods}
        locations={locs}
        currentDate={date}
        today={getToday()}
        onApply={(a) => {
          setPendingScan(a);
          setDate(a.date);
        }}
      />
      {scanNotice ? (
        <p className="flex items-start gap-2 rounded-md border border-primary bg-primary/10 p-3 text-base" role="status">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {scanNotice}
        </p>
      ) : null}

      {/* 2. お店を選んで手で入力 */}
      <section className="space-y-2" aria-label="お店を選んで手で入力">
        <p className="text-sm font-semibold text-muted">または、お店を選んで手で入力</p>
        {locs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <Store className="h-8 w-8 text-muted" aria-hidden="true" />
              <p className="text-muted">お店がまだ登録されていません。</p>
              <Link href="/locations">
                <Button>
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  お店を登録する
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {locs.map((loc) => {
              const st = locationStatus(loc);
              const done = st.total > 0 && st.filled === st.total;
              const active = loc.id === locationId;
              return (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => setLocationId(active ? '' : loc.id)}
                    aria-expanded={active}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-lg transition-colors ${
                      active ? 'bg-primary/10' : 'hover:bg-muted-bg'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Store className="h-5 w-5 text-muted" aria-hidden="true" />
                      {loc.name}
                    </span>
                    {isRest(loc) ? (
                      <span className="inline-flex items-center gap-1 text-base text-muted">
                        <Moon className="h-5 w-5" aria-hidden="true" />
                        {shopClosed ? '店休日' : '休み'}
                      </span>
                    ) : done ? (
                      <span className="inline-flex items-center gap-1 text-base text-state-good">
                        <Check className="h-5 w-5" aria-hidden="true" />
                        記録済み
                      </span>
                    ) : (
                      <span className="text-base text-state-warn">
                        {st.filled > 0 ? `${st.filled} / ${st.total}` : 'まだ'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. 選んだお店の入力欄 */}
      {location ? (
        <div ref={formRef} className="scroll-mt-20">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" aria-hidden="true" />
                {location.name}
                <span className="text-base font-normal text-muted">への納品</span>
              </CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setLocationId('')} aria-label="入力欄を閉じる">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            <div className={`flex flex-wrap items-center gap-2 ${currentRest ? 'hidden' : ''}`}>
              <Button size="sm" variant="outline" onClick={() => copyFrom(addDays(date, -1))}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                前の日と同じ
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyFrom(addDays(date, -7))}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                先週と同じ
              </Button>
            </div>
          </CardHeader>
          {currentRest ? (
            <CardContent className="space-y-3">
              <p className="flex items-start gap-2 text-base">
                <Moon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                {shopClosed
                  ? 'この日は店休日にしています。見込みの計算には使いません（「特売・イベント・店休日など」で外せます）。'
                  : 'この日は「休み」にしています。記録はせず、見込みの計算にも使いません。'}
              </p>
              {!shopClosed ? (
                <Button variant="outline" onClick={() => setRest(date, locationId, false)}>
                  休みを取り消して入力する
                </Button>
              ) : null}
            </CardContent>
          ) : (
          <CardContent className="divide-y divide-border p-0">
            {currentProducts.length === 0 ? (
              <p className="p-6 text-center text-muted">
                このお店が扱う商品がありません。「設定」→「お店」で取扱商品を選んでください。
              </p>
            ) : null}
            {currentProducts.map((product, i) => {
              const k = key(locationId, product.id);
              const val = values[k] ?? '';
              const empty = val === '';
              const ref = references.find((r) => r.product.id === product.id)?.reference ?? null;
              const loss = getLoss(date, locationId, product.id);
              return (
                <div key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <label htmlFor={`prod-${product.id}`} className="min-w-[8rem] flex-1 text-lg font-medium">
                    {product.name}
                    {ref !== null ? (
                      <span className="block text-sm font-normal text-muted">
                        前の日 {ref}
                        {product.unit}
                      </span>
                    ) : null}
                  </label>
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
                      aria-label={`${location.name} へ納品した ${product.name} の数（${product.unit}）`}
                      className={`h-12 w-28 rounded-md border px-3 text-right text-xl tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        empty
                          ? 'border-dashed border-border bg-muted-bg/40 text-muted placeholder:text-muted'
                          : 'border-border bg-surface text-foreground'
                      }`}
                    />
                    <span className="w-12 text-base text-muted">{product.unit}</span>
                  </div>

                  {lossOpen ? (
                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                      <label className="flex items-center gap-1 text-sm text-muted">
                        廃棄
                        <input
                          type="text"
                          inputMode="numeric"
                          value={loss.waste ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            setLoss(date, locationId, product.id, { waste: v === '' ? undefined : Number(v) });
                          }}
                          aria-label={`${product.name} の廃棄・返品数`}
                          placeholder="—"
                          className="h-10 w-16 rounded-md border border-border bg-surface px-2 text-right text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setLoss(date, locationId, product.id, { soldOut: !loss.soldOut })}
                        aria-pressed={!!loss.soldOut}
                        className={`min-h-10 rounded-md border px-3 text-sm ${
                          loss.soldOut
                            ? 'border-state-warn bg-state-warn/10 text-state-warn'
                            : 'border-dashed border-border text-muted hover:bg-muted-bg'
                        }`}
                      >
                        {loss.soldOut ? '✓ ' : ''}売り切れ
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {currentProducts.length > 0 && !lossOpen ? (
              <div className="px-4 py-2">
                <button
                  type="button"
                  onClick={() => setShowLoss(true)}
                  className="inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  廃棄・売り切れも記録する（ふりかえり用・任意）
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3">
              {savedAt ? (
                <span className="inline-flex items-center gap-1 text-sm text-state-good" role="status">
                  <CopyCheck className="h-4 w-4" aria-hidden="true" />
                  {savedAt}
                </span>
              ) : null}
              <Button onClick={handleSave} disabled={currentProducts.length === 0}>
                <Save className="h-5 w-5" aria-hidden="true" />
                保存する
              </Button>
            </div>
            {currentProducts.length > 0 ? (
              <div className="space-y-2 bg-muted-bg/40 px-4 py-3">
                <p className="text-sm text-muted">このお店に納品がなかった日は</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleNoDelivery}>
                    <CircleSlash className="h-4 w-4" aria-hidden="true" />
                    注文がなかった（全部0）
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRest}>
                    <Moon className="h-4 w-4" aria-hidden="true" />
                    お店が休みだった（記録しない）
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  「全部0」は売れなかった日として見込みに使います。臨時休業などは「休み」にすると、見込みの計算から外します。
                </p>
              </div>
            ) : null}
          </CardContent>
          )}
        </Card>
        </div>
      ) : null}

      {/* 4. 特売・イベントなど（ふだんは閉じておく） */}
      <details className="group rounded-lg border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-base text-muted [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" aria-hidden="true" />
          特売・イベント・店休日など
        </summary>
        <div className="space-y-4 border-t border-border px-4 py-4">
          {[date, nextDate].map((d) => {
            const f = getFactors(d);
            const [, m2, d2] = d.split('-').map(Number);
            const patch = (p: Partial<DayFactor>) => saveFactors(d, { ...getFactors(d), ...p });
            return (
              <div key={d} className="space-y-2">
                <p className="text-base font-medium">
                  {m2}月{d2}日（{dowLabel(d)}）{d === nextDate ? 'の予定' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <FactorToggle label="特売" active={!!f.sale} onToggle={() => patch({ sale: !f.sale })} />
                  <FactorToggle label="キャンペーン" active={!!f.campaign} onToggle={() => patch({ campaign: !f.campaign })} />
                  <FactorToggle label="イベント" active={!!f.event} onToggle={() => patch({ event: !f.event })} />
                  <FactorToggle label="祝日" active={!!f.isHoliday} onToggle={() => patch({ isHoliday: !f.isHoliday })} />
                  <FactorToggle label="店休日" active={!!f.closed} onToggle={() => patch({ closed: !f.closed })} />
                </div>
              </div>
            );
          })}
          <p className="text-sm text-muted">
            印をつけた日は、作る数の見込みに反映されます。天気・気温・祝日は自動で取得しています。
          </p>
        </div>
      </details>
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

/** 保存時刻の表示用（例: 14:05）。 */
function nowLabel(): string {
  return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
