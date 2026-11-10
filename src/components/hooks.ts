import { App } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminErrorMessage } from '@/lib/admin';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true);
    fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(adminErrorMessage(e))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

/** Runs a management action, shows success/error, then calls after(). */
export function useAction() {
  const { message } = App.useApp();
  return async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    try { await fn(); message.success(ok); after?.(); return true; }
    catch (e) { message.error(adminErrorMessage(e)); return false; }
  };
}
