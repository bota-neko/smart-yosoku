'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useSettings, SAFETY_STEPS, DEFAULT_SAFETY_RATE } from '@/lib/settings-store';
import { useProducts, activeProducts } from '@/lib/products-store';
import { getToday } from '@/lib/sample-data';

/**
 * 多めに作る割合（廃棄の目安）。
 * ぴったりを狙うと、売り切れたときに「ちょうど」だったのか「足りなかった（売り逃し）」のかが
 * 分からない。そこで、わざと少し余る割合を決めておき、売り切れが出なければ少しずつ下げていく。
 */
export function SafetyRateCard() {
  const { settings, setSafetyRate } = useSettings();
  const { products, update } = useProducts();
  const prods = activeProducts(products);
  const globalPct = Math.round((settings.safetyRate ?? DEFAULT_SAFETY_RATE) * 100);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <p className="text-base">
          見込みより<strong>何％多く作るか</strong>を選びます。これがそのまま「廃棄の目安」になります。
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="全体の多めに作る割合">
          {SAFETY_STEPS.map((pct) => (
            <StepButton key={pct} pct={pct} active={globalPct === pct} onClick={() => setSafetyRate(pct / 100, getToday())} />
          ))}
        </div>
        <p className="text-sm text-muted">
          ぴったりを狙うと、売り切れたときに「ちょうどだった」のか「足りなかった（売り逃し）」のか分かりません。はじめは
          20〜30％など多めにして、「ふりかえり」で売り切れがなければ、少しずつ下げていくのがおすすめです。
        </p>

        {prods.length > 0 ? (
          <details className="group rounded-md border border-border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-base text-primary [&::-webkit-details-marker]:hidden">
              商品ごとに変える（任意）
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {prods.map((p) => {
                const own = p.safetyRate != null ? Math.round(p.safetyRate * 100) : null;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="text-base">{p.name}</span>
                    <select
                      value={own == null ? '' : String(own)}
                      onChange={(e) =>
                        update(p.id, {
                          safetyRate: e.target.value === '' ? null : Number(e.target.value) / 100,
                          safetyRateSince: e.target.value === '' ? null : getToday(),
                        })
                      }
                      aria-label={`${p.name} の多めに作る割合`}
                      className="h-10 rounded-md border border-border bg-surface px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <option value="">全体と同じ（{globalPct}％）</option>
                      {SAFETY_STEPS.map((pct) => (
                        <option key={pct} value={pct}>
                          {pct}％
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StepButton({ pct, active, onClick }: { pct: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 min-w-[4rem] rounded-md border px-3 text-base tabular transition-colors ${
        active
          ? 'border-primary bg-primary font-semibold text-primary-fg'
          : 'border-border bg-surface text-foreground hover:bg-muted-bg'
      }`}
    >
      {active ? '✓ ' : ''}
      {pct}％
    </button>
  );
}
