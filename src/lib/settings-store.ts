'use client';

/**
 * 組織設定ストア（現在は天気取得のための「地域」を保持）。
 * 天気予報は地点（緯度経度）が必要なため、自店の地域を保存する。
 * デモでは localStorage 保存。Supabase 接続時は organization_settings へ。
 */
import { useCallback, useEffect, useState } from 'react';

export interface OrgSettings {
  /** 地域名（表示用。例: 鹿児島市） */
  areaName: string;
  /** 都道府県など（表示用・任意） */
  region?: string;
  latitude: number;
  longitude: number;
}

/** 既定は鹿児島市（サンプルのさつま食品に合わせる）。 */
export const DEFAULT_SETTINGS: OrgSettings = {
  areaName: '鹿児島市',
  region: '鹿児島県',
  latitude: 31.56667,
  longitude: 130.55,
};

const STORAGE_KEY = 'smart-yosoku:settings:v1';

function read(): OrgSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as OrgSettings) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function write(s: OrgSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('smart-yosoku:settings-changed'));
}

export function useSettings() {
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(read());
    const onChange = () => setSettings(read());
    window.addEventListener('smart-yosoku:settings-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('smart-yosoku:settings-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const setArea = useCallback((s: OrgSettings) => write(s), []);

  return { settings, setArea };
}

/** 地域設定を既定へ戻す。 */
export function resetSettingsDemo(): void {
  write(DEFAULT_SETTINGS);
}
