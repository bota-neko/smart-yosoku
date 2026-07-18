import { createBrowserClient } from '@supabase/ssr';

/** ブラウザ用 Supabase クライアント（anon key・RLS適用下で動作） */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です');
  }
  return createBrowserClient(url, anon);
}
