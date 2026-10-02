import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, looksLikeAnthropicKey } from '@/lib/server/secret-box';

const SECRET = 'test-secret-0123456789-abcdefghijklmnop';

describe('secret-box', () => {
  it('暗号化→復号で元に戻る（平文は含まれない）', () => {
    const plain = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    const enc = encryptSecret(plain, SECRET);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc, SECRET)).toBe(plain);
  });

  it('同じ平文でも毎回ちがう暗号文になる', () => {
    expect(encryptSecret('x', SECRET)).not.toBe(encryptSecret('x', SECRET));
  });

  it('鍵違い・改ざんは null', () => {
    const enc = encryptSecret('sk-ant-xxx', SECRET);
    expect(decryptSecret(enc, 'another-secret-0123456789-abcdefghij')).toBeNull();
    const parts = enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(decryptSecret(parts.join(':'), SECRET)).toBeNull();
    expect(decryptSecret('garbage', SECRET)).toBeNull();
  });

  it('キー形式チェック', () => {
    expect(looksLikeAnthropicKey('sk-ant-api03-' + 'a'.repeat(40))).toBe(true);
    expect(looksLikeAnthropicKey('sk-proj-abc')).toBe(false);
    expect(looksLikeAnthropicKey('sk-ant-short')).toBe(false);
    expect(looksLikeAnthropicKey('sk-ant-' + 'a'.repeat(30) + ' ')).toBe(false);
  });
});
