import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';
import { createClient } from '@/lib/supabase/server';
import { encryptSecret, getEncryptionSecret, looksLikeAnthropicKey } from '@/lib/server/secret-box';

/**
 * 利用者ごとの Claude API キーの登録状況・登録・削除。
 * キー本体はレスポンスに一切含めない（末尾4文字だけ返す）。
 */
export const runtime = 'nodejs';

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function currentUser() {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { supabase, user: data.user } : null;
  } catch {
    return null;
  }
}

/** 登録状況: { serverReady, registered, last4, updatedAt } */
export async function GET() {
  const ctx = await currentUser();
  if (!ctx) return error(401, 'ログインしてください。');
  const { data } = await ctx.supabase
    .from('user_api_keys')
    .select('key_last4, updated_at')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  return NextResponse.json({
    serverReady: getEncryptionSecret() !== null,
    registered: !!data,
    last4: data?.key_last4 ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

const PutSchema = z.object({ key: z.string().trim().max(300) });

/** 登録・更新。Anthropic に問い合わせて有効なキーか確かめてから暗号化保存する。 */
export async function PUT(req: Request) {
  const ctx = await currentUser();
  if (!ctx) return error(401, 'ログインしてください。');
  const secret = getEncryptionSecret();
  if (!secret) return error(501, 'サーバーの暗号化設定（API_KEY_ENCRYPTION_SECRET）が未設定です。');

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !looksLikeAnthropicKey(parsed.data.key)) {
    return error(400, 'APIキーの形式が正しくありません（sk-ant- で始まるキーを貼り付けてください）。');
  }
  const key = parsed.data.key;

  // 有効性チェック（モデル一覧の取得は無料）
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 });
    await client.models.list({ limit: 1 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return error(400, 'このAPIキーは使えません。Claude Console でキーを確認してください。');
    }
    return error(502, 'APIキーを確認できませんでした。時間をおいてもう一度お試しください。');
  }

  const { error: dbError } = await ctx.supabase.from('user_api_keys').upsert({
    user_id: ctx.user.id,
    encrypted_key: encryptSecret(key, secret),
    key_last4: key.slice(-4),
    updated_at: new Date().toISOString(),
  });
  if (dbError) return error(500, '保存に失敗しました（データベースの設定を確認してください）。');
  return NextResponse.json({ registered: true, last4: key.slice(-4) });
}

/** 削除。 */
export async function DELETE() {
  const ctx = await currentUser();
  if (!ctx) return error(401, 'ログインしてください。');
  const { error: dbError } = await ctx.supabase.from('user_api_keys').delete().eq('user_id', ctx.user.id);
  if (dbError) return error(500, '削除に失敗しました。');
  return NextResponse.json({ registered: false });
}
