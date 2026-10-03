'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, Check, AlertTriangle, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApiKeyStatus } from '@/lib/use-api-key-status';

/**
 * 納品書の読み取りに使う Claude API キーの登録（費用は本人の Anthropic アカウントに請求）。
 * 保存後はキーを二度と表示せず、末尾4文字と削除ボタンだけを出す。
 */
export function ApiKeyCard() {
  const { user, configured, loading, status, refresh } = useApiKeyStatus();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: json?.error ?? '保存できませんでした。' });
        return;
      }
      setInput('');
      setMsg({ ok: true, text: 'APIキーを確認して保存しました。' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('登録したAPIキーを削除しますか？（納品書の読み取りが使えなくなります）')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/api-key', { method: 'DELETE' });
      if (!res.ok) {
        setMsg({ ok: false, text: '削除できませんでした。' });
        return;
      }
      setMsg({ ok: true, text: 'APIキーを削除しました。' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
          Claude APIキー
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-base text-muted">
          納品書の写真の読み取りには、ご自身の Claude APIキーを使います。読み取りの利用料はご自身の Anthropic
          アカウントに直接請求されます（目安：1枚あたり1円前後・1日20枚で月数百円ほど）。
        </p>

        {!configured || (!loading && !user) ? (
          <p className="text-base">
            <Link href="/login" className="text-primary hover:underline">
              ログイン
            </Link>
            すると登録できます。
          </p>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            確認中…
          </p>
        ) : status && !status.serverReady ? (
          <p className="flex items-start gap-2 rounded-md border border-state-warn bg-state-warn/10 p-3 text-base">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-state-warn" aria-hidden="true" />
            サーバーの暗号化設定が未完了のため、まだ登録できません（管理者が API_KEY_ENCRYPTION_SECRET を設定します）。
          </p>
        ) : (
          <>
            {status?.registered ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                <span className="inline-flex items-center gap-2 text-base">
                  <Check className="h-5 w-5 text-state-good" aria-hidden="true" />
                  登録済み（末尾 …{status.last4}）
                </span>
                <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  削除
                </Button>
              </div>
            ) : (
              <p className="text-base">まだ登録されていません。</p>
            )}

            <div className="space-y-2">
              <label htmlFor="api-key" className="block text-sm font-semibold text-muted">
                {status?.registered ? '新しいキーに変更する' : 'APIキーを貼り付け'}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="sk-ant-..."
                  className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button onClick={save} disabled={busy || input.trim() === ''}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
                  確認して保存
                </Button>
              </div>
              <p className="text-xs text-muted">
                キーは暗号化して保存し、この画面にも二度と表示しません。他の人からは見えません。
              </p>
            </div>
          </>
        )}

        {msg ? (
          <p className={`text-base ${msg.ok ? 'text-state-good' : 'text-state-warn'}`} role="status">
            {msg.text}
          </p>
        ) : null}

        <details className="rounded-md border border-border p-3 text-base">
          <summary className="cursor-pointer font-medium">APIキーの取り方</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Claude Console
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              にアカウントを作ってログイン
            </li>
            <li>「Billing（支払い）」でクレジットを購入（数百円分からで十分です）</li>
            <li>「API Keys」で「Create Key」を押し、表示された sk-ant- で始まるキーをコピー</li>
            <li>この画面に貼り付けて「確認して保存」</li>
          </ol>
          <p className="mt-2 text-sm text-muted">
            ※ 月額の Claude（Pro など）の契約とは別のお支払いです。使いすぎが心配なら Console で月の上限額を設定できます。
          </p>
        </details>
      </CardContent>
    </Card>
  );
}
