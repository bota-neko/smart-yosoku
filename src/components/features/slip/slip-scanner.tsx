'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, ImageUp, Loader2, ScanLine, AlertTriangle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApiKeyStatus } from '@/lib/use-api-key-status';
import type { Product } from '@/lib/products-store';
import { handlesProduct, type WholesaleDest } from '@/lib/locations-store';
import type { SlipScanResult } from '@/lib/slip-scan';

export interface SlipApply {
  date: string;
  locationId: string;
  /** productId → 納品数 */
  values: Record<string, number>;
}

interface Row {
  key: string;
  productId: string; // '' = 取り込まない
  nameOnSlip: string;
  qty: string;
  fromCases: number | null;
}

const MAX_EDGE = 1600;

/** 画像を長辺 1600px の JPEG に縮小して base64 を返す（通信量と読み取り時間を抑える）。 */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('画像を開けませんでした'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.85;
    let data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > 3.5 * 1024 * 1024 && quality > 0.4) {
      quality -= 0.15;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    return data.slice(data.indexOf(',') + 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 納品書を撮影（スマホ）またはアップロード（PC）して読み取り、
 * 確認・修正してから納品入力フォームへ反映する。保存は利用者が行う。
 */
export function SlipScanner({
  products,
  locations,
  currentDate,
  today,
  onApply,
}: {
  products: Product[];
  locations: WholesaleDest[];
  currentDate: string;
  today: string;
  onApply: (a: SlipApply) => void;
}) {
  const { user, configured, loading: statusLoading, status } = useApiKeyStatus();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<{
    result: SlipScanResult;
    date: string;
    locationId: string;
    rows: Row[];
  } | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setReview(null);
    if (!file.type.startsWith('image/')) {
      setErr('画像ファイル（写真）を選んでください。');
      return;
    }
    setBusy(true);
    try {
      const image = await compressImage(file);
      const res = await fetch('/api/scan-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          mediaType: 'image/jpeg',
          today,
          products: products.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
            ...(p.caseSize && p.caseSize > 1 ? { caseSize: p.caseSize } : {}),
          })),
          locations: locations.map((l) => ({ id: l.id, name: l.name })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error ?? '読み取りに失敗しました。');
        return;
      }
      const result = json as SlipScanResult;
      if (!result.readable || result.items.length === 0) {
        setErr(result.note ?? '納品書の明細を読み取れませんでした。全体が写るように撮り直してください。');
        return;
      }
      setReview({
        result,
        date: result.date ?? currentDate,
        locationId: result.locationId ?? '',
        rows: result.items.map((it, i) => ({
          key: `r${i}`,
          productId: it.productId ?? '',
          nameOnSlip: it.nameOnSlip,
          qty: String(it.qty),
          fromCases: it.fromCases,
        })),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '読み取りに失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (key: string, patch: Partial<Row>) =>
    setReview((r) => (r ? { ...r, rows: r.rows.map((x) => (x.key === key ? { ...x, ...patch } : x)) } : r));

  const reviewLoc = review ? locations.find((l) => l.id === review.locationId) : undefined;

  const apply = () => {
    if (!review || !reviewLoc) return;
    const values: Record<string, number> = {};
    for (const r of review.rows) {
      if (!r.productId || r.qty === '' || !handlesProduct(reviewLoc, r.productId)) continue;
      values[r.productId] = (values[r.productId] ?? 0) + Number(r.qty);
    }
    onApply({ date: review.date, locationId: review.locationId, values });
    setReview(null);
  };

  const loggedIn = configured && !!user;
  const canUse = loggedIn && !!status?.registered;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
            <ScanLine className="h-5 w-5 text-primary" aria-hidden="true" />
            納品書から読み取る（撮影・画像アップロード）
          </p>
          {canUse ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                撮影する
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                <ImageUp className="h-4 w-4" aria-hidden="true" />
                画像を選ぶ
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          ) : statusLoading ? null : loggedIn ? (
            <p className="text-sm text-muted">
              <Link href="/settings" className="text-primary hover:underline">
                設定
              </Link>
              で Claude の APIキーを登録すると使えます
            </p>
          ) : (
            <p className="text-sm text-muted">
              <Link href="/login" className="text-primary hover:underline">
                ログイン
              </Link>
              すると使えます
            </p>
          )}
        </div>

        {busy ? (
          <p className="inline-flex items-center gap-2 text-base" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            読み取り中です（10〜30秒ほどかかります）…
          </p>
        ) : null}

        {err ? (
          <p className="flex items-start gap-2 rounded-md border border-state-warn bg-state-warn/10 p-3 text-base" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-state-warn" aria-hidden="true" />
            {err}
          </p>
        ) : null}

        {review ? (
          <div className="space-y-3 rounded-md border border-primary p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">読み取り結果を確認してください</p>
              <Button size="icon" variant="ghost" onClick={() => setReview(null)} aria-label="読み取り結果を閉じる">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-3">
              <label className="flex items-center gap-2 text-base">
                納品日
                <input
                  type="date"
                  value={review.date}
                  onChange={(e) => e.target.value && setReview({ ...review, date: e.target.value })}
                  className="h-10 rounded-md border border-border bg-surface px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-base">
                卸先
                <select
                  value={review.locationId}
                  onChange={(e) => setReview({ ...review, locationId: e.target.value })}
                  className="h-10 rounded-md border border-border bg-surface px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">選んでください</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {review.result.locationNameOnSlip ? (
              <p className="text-sm text-muted">納品書の宛先：{review.result.locationNameOnSlip}</p>
            ) : null}
            {!review.result.date ? (
              <p className="text-sm text-state-warn">日付が読み取れなかったため、選択中の日付にしています。</p>
            ) : null}

            <ul className="divide-y divide-border rounded-md border border-border">
              {review.rows.map((r) => {
                const notHandled = !!reviewLoc && !!r.productId && !handlesProduct(reviewLoc, r.productId);
                const unit = products.find((p) => p.id === r.productId)?.unit ?? '';
                return (
                  <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-[7rem] flex-1 text-sm text-muted">納品書：{r.nameOnSlip}</span>
                    <select
                      value={r.productId}
                      onChange={(e) => updateRow(r.key, { productId: e.target.value })}
                      aria-label={`${r.nameOnSlip} をどの商品として取り込むか`}
                      className={`h-10 rounded-md border bg-surface px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        r.productId ? 'border-border' : 'border-dashed border-state-warn'
                      }`}
                    >
                      <option value="">取り込まない</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      inputMode="decimal"
                      value={r.qty}
                      onChange={(e) => updateRow(r.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })}
                      aria-label={`${r.nameOnSlip} の数量`}
                      className="h-10 w-20 rounded-md border border-border bg-surface px-2 text-right text-base tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <span className="w-8 text-sm text-muted">{unit}</span>
                    {r.fromCases !== null ? (
                      <span className="text-xs text-muted">（{r.fromCases}ケースを換算）</span>
                    ) : null}
                    {!r.productId ? (
                      <span className="w-full text-xs text-state-warn">登録商品と一致しませんでした。取り込む商品を選んでください。</span>
                    ) : notHandled ? (
                      <span className="w-full text-xs text-state-warn">この卸先の取扱商品ではないため取り込まれません（卸先管理で追加できます）。</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {review.result.note ? <p className="text-sm text-muted">メモ：{review.result.note}</p> : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {!reviewLoc ? <span className="text-sm text-state-warn">卸先を選んでください</span> : null}
              <Button variant="outline" onClick={() => setReview(null)}>
                やめる
              </Button>
              <Button onClick={apply} disabled={!reviewLoc}>
                入力欄に反映する
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">
            納品書の写真から、卸先・日付・商品ごとの数を読み取って入力欄に下書きします。内容を確認してから「この日の納品を保存」を押してください。画像は保存されません。読み取りの利用料は、登録したご自身の APIキーに請求されます。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
