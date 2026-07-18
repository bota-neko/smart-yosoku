'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

export interface AuthState {
  /** セッション確認中 */
  loading: boolean;
  /** ログイン中のユーザー（未ログイン/未接続なら null） */
  user: User | null;
  /** Supabase が接続設定済みか（未設定なら「お試しモード」） */
  configured: boolean;
}

/** Supabase の接続設定があるか（NEXT_PUBLIC_* が両方あるか）。 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * ログイン状態を購読するフック。
 * Supabase 未接続（キー未設定）のときは configured=false を返し、アプリは「お試しモード」で動く。
 */
export function useUser(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    configured: false,
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ loading: false, user: null, configured: false });
      return;
    }
    let unsub: (() => void) | undefined;
    let active = true;
    (async () => {
      try {
        const { createClient } = await import('./client');
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (active) setState({ loading: false, user: data.user ?? null, configured: true });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
          setState({ loading: false, user: session?.user ?? null, configured: true });
        });
        unsub = () => listener.subscription.unsubscribe();
      } catch {
        if (active) setState({ loading: false, user: null, configured: false });
      }
    })();
    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  return state;
}

/** ログアウト（Supabase 接続時のみ）。 */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { createClient } = await import('./client');
  await createClient().auth.signOut();
}
