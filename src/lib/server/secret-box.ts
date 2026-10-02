import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * サーバー専用：利用者の API キーを AES-256-GCM で暗号化/復号する。
 * 暗号鍵は環境変数 API_KEY_ENCRYPTION_SECRET（クライアントへ出さない）から作る。
 * 形式: "v1:<iv>:<tag>:<ciphertext>"（各 base64）
 */

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function getEncryptionSecret(): string | null {
  const s = process.env.API_KEY_ENCRYPTION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** 復号。改ざん・鍵違いなどで失敗したら null。 */
export function decryptSecret(payload: string, secret: string): string | null {
  try {
    const [v, iv, tag, enc] = payload.split(':');
    if (v !== 'v1' || !iv || !tag || !enc) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Claude API キーの形式チェック（中身の有効性は Anthropic に問い合わせて確認する）。 */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,250}$/.test(key);
}
