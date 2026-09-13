/// <reference types="vite/client" />
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_BUILD_ID } from '../lib/app-version.ts';
import {
  activateAppUpdate,
  inspectAppUpdate,
  type UpdateStatus,
} from '../lib/app-updates.ts';

export function useAppUpdate() {
  const [status, setStatus] = useState<UpdateStatus>(
    import.meta.env.PROD ? 'checking' : 'development',
  );
  const [checkedAt, setCheckedAt] = useState<string>();
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const checking = useRef(false);
  const mounted = useRef(true);
  const lastCheck = useRef(0);
  const check = useCallback(async () => {
    if (!import.meta.env.PROD || checking.current) return;
    checking.current = true;
    lastCheck.current = Date.now();
    setStatus('checking');
    try {
      if (!('serviceWorker' in navigator))
        throw new Error('UPDATE_UNSUPPORTED');
      registration.current ??= await navigator.serviceWorker.register(
        new URL(import.meta.env.BASE_URL + 'sw.js', window.location.origin)
          .href,
        { scope: import.meta.env.BASE_URL, updateViaCache: 'none' },
      );
      const next = await inspectAppUpdate(registration.current, APP_BUILD_ID);
      if (mounted.current) {
        setStatus(next);
        setCheckedAt(
          new Date().toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
      }
    } catch {
      if (mounted.current) setStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      checking.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    const resume = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastCheck.current > 60000
      )
        void check();
    };
    const online = () => void check();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', online);
    const timer = window.setInterval(resume, 5 * 60 * 1000);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', online);
      window.clearInterval(timer);
    };
  }, [check]);
  const apply = async () => {
    if (!registration.current) throw new Error('UPDATE_WORKER_MISSING');
    await activateAppUpdate(registration.current);
    window.location.reload();
  };
  return { status, checkedAt, check, apply };
}
