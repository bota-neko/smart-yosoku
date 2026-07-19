'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@/lib/supabase/use-user';

/**
 * クラウド同期。ログイン中は、アプリの各ストア（localStorage）を
 * Supabase の app_state（ユーザー単位・RLSで分離）と同期する。
 *  - ログイン時: クラウドの状態を localStorage へ読み込み（無ければ既定から作成）
 *  - 変更時: すべてのストア変更を検知し、デバウンスしてクラウドへ保存
 *  - ログアウト時: アプリのローカルデータを消去（次のお試しは初期状態から）
 * お試しモード（未ログイン）や Supabase 未接続のときは何もしない。
 */

/** 同期対象の localStorage キー。 */
const STORAGE_KEYS = [
  'smart-yosoku:products:v2',
  'smart-yosoku:locations:v2',
  'smart-yosoku:deliveries:v2',
  'smart-yosoku:factors:v1',
  'smart-yosoku:losses:v1',
  'smart-yosoku:settings:v1',
];

/** 各ストアが発火する変更イベント。 */
const CHANGE_EVENTS = [
  'smart-yosoku:products-changed',
  'smart-yosoku:locations-changed',
  'smart-yosoku:deliveries-changed',
  'smart-yosoku:factors-changed',
  'smart-yosoku:losses-changed',
  'smart-yosoku:settings-changed',
];

/** 現在の localStorage から state オブジェクトを組み立てる。 */
function collectState(): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const k of STORAGE_KEYS) {
    const v = window.localStorage.getItem(k);
    if (v != null) {
      try {
        state[k] = JSON.parse(v);
      } catch {
        /* skip broken value */
      }
    }
  }
  return state;
}

/** クラウドへ保存（upsert）。 */
async function saveToCloud(userId: string): Promise<void> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  await supabase
    .from('app_state')
    .upsert({ user_id: userId, state: collectState(), updated_at: new Date().toISOString() });
}

/** クラウドから読み込み、localStorage へ反映。無ければ null。 */
async function loadFromCloud(userId: string): Promise<Record<string, unknown> | null> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const { data } = await supabase
    .from('app_state')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.state as Record<string, unknown>) ?? null;
}

/** アプリのローカルデータを消去。 */
function clearLocal(): void {
  for (const k of STORAGE_KEYS) window.localStorage.removeItem(k);
}

/** 新規アカウントを「空」で初期化（商品・卸先・実績・要因ゼロ／地域は既定）。 */
function initEmptyLocal(): void {
  window.localStorage.setItem('smart-yosoku:products:v2', '[]');
  window.localStorage.setItem('smart-yosoku:locations:v2', '[]');
  window.localStorage.setItem('smart-yosoku:deliveries:v2', '{}');
  window.localStorage.setItem('smart-yosoku:factors:v1', '{}');
  window.localStorage.setItem('smart-yosoku:losses:v1', '{}');
  window.localStorage.removeItem('smart-yosoku:settings:v1'); // 地域は既定のまま
}

/** すべてのストアへ再読込を通知。 */
function notifyAll(): void {
  for (const e of CHANGE_EVENTS) window.dispatchEvent(new Event(e));
}

export function CloudSync() {
  const { user, configured, loading } = useUser();
  const loadedUser = useRef<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ログイン/ログアウトに応じて読み込み・消去
  useEffect(() => {
    if (!configured || loading) return;
    let active = true;

    if (user) {
      if (loadedUser.current === user.id) return;
      (async () => {
        const cloud = await loadFromCloud(user.id);
        if (!active) return;
        if (cloud && Object.keys(cloud).length > 0) {
          // クラウドの状態を反映
          for (const k of STORAGE_KEYS) {
            if (k in cloud) window.localStorage.setItem(k, JSON.stringify(cloud[k]));
            else window.localStorage.removeItem(k);
          }
          loadedUser.current = user.id;
          notifyAll();
        } else {
          // 初回ログイン: 空のアカウントとして開始（自分の商品・お店を登録してもらう）
          initEmptyLocal();
          loadedUser.current = user.id;
          notifyAll();
          await saveToCloud(user.id);
        }
      })();
    } else if (loadedUser.current) {
      // ログアウト: ローカルを消去してお試し初期状態へ
      clearLocal();
      loadedUser.current = null;
      notifyAll();
    }

    return () => {
      active = false;
    };
  }, [user, configured, loading]);

  // 変更をデバウンスしてクラウドへ保存
  useEffect(() => {
    if (!configured || !user) return;
    const onChange = () => {
      if (loadedUser.current !== user.id) return; // 初期読み込み前は保存しない
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        void saveToCloud(user.id);
      }, 800);
    };
    for (const e of CHANGE_EVENTS) window.addEventListener(e, onChange);
    return () => {
      for (const e of CHANGE_EVENTS) window.removeEventListener(e, onChange);
      clearTimeout(debounce.current);
    };
  }, [user, configured]);

  return null;
}
