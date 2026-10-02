'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/lib/supabase/use-user';

export interface ApiKeyStatus {
  serverReady: boolean;
  registered: boolean;
  last4: string | null;
  updatedAt: string | null;
}

/** ログイン中ユーザーの Claude API キー登録状況（キー本体は取得しない）。 */
export function useApiKeyStatus() {
  const { user, configured, loading: authLoading } = useUser();
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/api-key', { cache: 'no-store' });
      setStatus(res.ok ? ((await res.json()) as ApiKeyStatus) : null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) void refresh();
  }, [authLoading, refresh]);

  return { user, configured, loading: authLoading || loading, status, refresh };
}
