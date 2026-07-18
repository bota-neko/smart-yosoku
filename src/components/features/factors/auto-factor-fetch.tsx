'use client';

import { useEffect, useState } from 'react';
import { MapPin, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/lib/settings-store';
import { useFactors, WEATHER_LABELS, type DayFactor } from '@/lib/factors-store';
import { geocodeArea, fetchDailyWeather, fetchJpHolidays } from '@/lib/weather-api';
import { getToday, getTomorrow } from '@/lib/sample-data';

/**
 * 天気・気温・祝日の自動取得。
 * 地域（緯度経度）を設定し、ボタンで今後の天気（Open-Meteo）と祝日（Nager.Date）を取得して
 * 外部要因ストアへ反映する。特売・イベント等の手動設定は保持される。
 */
export function AutoFactorFetch() {
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
    const year = Number(getToday().slice(0, 4));
    // 天気と祝日を独立に取得（片方が失敗しても、もう片方は反映する）
    const [weatherRes, holRes] = await Promise.allSettled([
      fetchDailyWeather(settings.latitude, settings.longitude, 16),
      Promise.all([fetchJpHolidays(year), fetchJpHolidays(year + 1)]),
    ]);
    const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : [];
    const today = getToday();
    const holidayList = holRes.status === 'fulfilled' ? [...holRes.value[0], ...holRes.value[1]] : [];
    const holidaySet = new Set(holidayList.filter((d) => d >= today));

    if (weather.length === 0 && holidaySet.size === 0) {
      setStatus({
        kind: 'err',
        text: '取得できませんでした。通信環境をご確認のうえ再度お試しください（手動入力は引き続き使えます）。',
      });
      setBusy(null);
      return;
    }

    const updates: Array<{ date: string; patch: Partial<DayFactor> }> = [];
    for (const w of weather) {
      updates.push({
        date: w.date,
        patch: {
          weather: w.weather,
          tempHigh: w.tempHigh,
          ...(holidaySet.has(w.date) ? { isHoliday: true } : {}),
        },
      });
    }
    for (const d of holidaySet) {
      if (!weather.some((w) => w.date === d)) updates.push({ date: d, patch: { isHoliday: true } });
    }
    mergeMany(updates);

    // 具体的な結果を返す（明日の天気を添えて「変わった」ことが分かるように）
    const tw = weather.find((w) => w.date === getTomorrow());
    const parts: string[] = [];
    if (weather.length > 0) parts.push(`天気${weather.length}日分`);
    if (holidaySet.size > 0) parts.push(`祝日${holidaySet.size}日`);
    const tomorrowNote = tw ? `／明日は ${WEATHER_LABELS[tw.weather]} ${tw.tempHigh}℃` : '';
    setStatus({
      kind: 'ok',
      text: `${parts.join('・')}を取得し、予測へ反映しました${tomorrowNote}。`,
    });
    setBusy(null);
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-semibold text-muted">天気・祝日の自動取得</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="area" className="flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              地域（天気の取得に使用）
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
          <Button onClick={handleFetch} disabled={busy === 'fetch'}>
            <RefreshCw className={`h-5 w-5 ${busy === 'fetch' ? 'animate-spin' : ''}`} aria-hidden="true" />
            {busy === 'fetch' ? '取得中…' : '天気・祝日を自動取得'}
          </Button>
        </div>

        <p className="text-xs text-muted">
          現在の地域: {settings.region ?? ''}{settings.areaName}。今後16日分の天気・気温と、日本の祝日を取得して各日の外部要因に反映します（特売・イベント等の手入力は保持）。
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
