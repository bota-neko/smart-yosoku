'use client';

import { useEffect, useState } from 'react';
import { MapPin, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/lib/settings-store';
import { useFactors, WEATHER_LABELS } from '@/lib/factors-store';
import { geocodeArea } from '@/lib/weather-api';
import { fetchFactorUpdates } from '@/lib/factor-sync';
import { getTomorrow } from '@/lib/sample-data';

/**
 * 地域の設定（天気の自動取得に使う）。
 * 天気・気温・祝日はふだん裏で1日1回自動取得される。ここでは地域を変えたときなどに
 * 「今すぐ取得」もできる。特売・イベント等の手動設定は保持される。
 */
export function AreaSetting() {
  const { settings, setArea } = useSettings();
  const { mergeMany } = useFactors();
  const [areaInput, setAreaInput] = useState(settings.areaName);
  const [busy, setBusy] = useState<'geo' | 'fetch' | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => setAreaInput(settings.areaName), [settings.areaName]);

  const handleGeocode = async () => {
    const name = areaInput.trim();
    if (!name) return;
    setBusy('geo');
    setStatus(null);
    try {
      const geo = await geocodeArea(name);
      if (!geo) {
        setStatus({ kind: 'err', text: `「${name}」が見つかりませんでした。市区町村名でお試しください。` });
      } else {
        setArea({ areaName: geo.name, region: geo.region, latitude: geo.latitude, longitude: geo.longitude });
        setStatus({ kind: 'ok', text: `地域を「${geo.region ?? ''}${geo.name}」に設定しました。` });
      }
    } catch {
      setStatus({ kind: 'err', text: '地域の検索に失敗しました。通信環境をご確認ください。' });
    }
    setBusy(null);
  };

  const handleFetch = async () => {
    setBusy('fetch');
    setStatus(null);
    const res = await fetchFactorUpdates(settings.latitude, settings.longitude);
    if (!res) {
      setStatus({ kind: 'err', text: '取得できませんでした。通信環境をご確認ください。' });
      setBusy(null);
      return;
    }
    mergeMany(res.updates);
    const tw = res.weather.find((w) => w.date === getTomorrow());
    setStatus({
      kind: 'ok',
      text: `天気${res.weather.length}日分・祝日${res.holidayCount}日を取得しました${tw ? `（明日は ${WEATHER_LABELS[tw.weather]} ${tw.tempHigh}℃）` : ''}。`,
    });
    setBusy(null);
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-5">

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="area" className="flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              市区町村名
            </label>
            <div className="flex items-center gap-2">
              <input
                id="area"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
                placeholder="例）鹿児島市"
                className="h-10 w-44 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button size="sm" variant="outline" onClick={handleGeocode} disabled={busy === 'geo'}>
                {busy === 'geo' ? '検索中…' : '地域を設定'}
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleFetch} disabled={busy === 'fetch'}>
            <RefreshCw className={`h-4 w-4 ${busy === 'fetch' ? 'animate-spin' : ''}`} aria-hidden="true" />
            {busy === 'fetch' ? '取得中…' : '今すぐ取得'}
          </Button>
        </div>

        <p className="text-xs text-muted">
          いまの地域：{settings.region ?? ''}{settings.areaName}。天気・気温・祝日は毎日自動で取得して、作る数の見込みに反映しています。
        </p>

        {status ? (
          <p
            className={`inline-flex items-center gap-1.5 text-sm ${
              status.kind === 'ok' ? 'text-state-good' : 'text-state-bad'
            }`}
          >
            {status.kind === 'ok' ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
            {status.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
