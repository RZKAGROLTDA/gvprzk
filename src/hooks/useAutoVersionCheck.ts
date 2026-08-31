import { useEffect, useRef } from 'react';
import {
  CURRENT_BUILD_HASH,
  CURRENT_BUILD_TIME,
  CURRENT_VERSION,
  checkForUpdate,
} from '@/lib/appUpdate';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 min
const RETRY_WHEN_BUSY_MS = 20 * 1000;

/**
 * Detecta nova publicação e aplica a atualização automaticamente
 * (1 tentativa por buildHash, sem apagar sessão/rascunhos/fila offline).
 */
export function useAutoVersionCheck() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    console.log('[app-update] watcher started', {
      CURRENT_VERSION,
      CURRENT_BUILD_HASH,
      CURRENT_BUILD_TIME,
    });

    let stopped = false;
    let busyTimer: ReturnType<typeof setTimeout> | undefined;

    let lastRunAt = 0;

    const run = async () => {
      if (stopped) return;
      lastRunAt = Date.now();
      const outcome = await checkForUpdate();
      if (outcome.status === 'deferred' && !stopped) {
        clearTimeout(busyTimer);
        busyTimer = setTimeout(run, RETRY_WHEN_BUSY_MS);
      }
    };

    void run();

    const interval = setInterval(run, POLL_INTERVAL_MS);
    const onOnline = () => void run();
    // Voltar à aba não deve gerar uma verificação a cada foco: só revalida
    // se já passou o intervalo normal de poll.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRunAt < POLL_INTERVAL_MS) return;
      void run();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearTimeout(busyTimer);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
