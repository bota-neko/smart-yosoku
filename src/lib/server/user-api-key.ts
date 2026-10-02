import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, getEncryptionSecret } from './secret-box';

/**
 * サーバー専用：ログイン中ユーザーの Claude API キーを取り出す（RLS で本人の行のみ）。
 * 戻り値: 'unconfigured' = サーバーの暗号鍵が未設定 / null = 未登録・復号不可 / string = キー
 */
export async function loadUserApiKey(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null | 'unconfigured'> {
  const secret = getEncryptionSecret();
  if (!secret) return 'unconfigured';
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return decryptSecret(data.encrypted_key as string, secret);
}
