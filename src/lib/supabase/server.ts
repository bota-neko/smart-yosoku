import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * サーバー用 Supabase クライアント（App Router / Server Components / Server Actions）。
 * Cookie ベースのセッションを引き継ぎ、RLS が適用される。
 */
export function createClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です');
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as never),
          );
        } catch {
          // Server Component からの set は無視（middleware で更新する想定）
        }
      },
    },
  });
}

/**
 * サービスロールクライアント（サーバー専用・RLSバイパス）。
 * シード投入や管理バッチのみで使用。リクエストハンドラでの常用は避ける。
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY が未設定です（サーバー専用）');
  }
  const { createClient: createRawClient } = require('@supabase/supabase-js');
  return createRawClient(url, key, { auth: { persistSession: false } });
}
