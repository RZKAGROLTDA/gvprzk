/**
 * Mecanismo de atualização automática de versão.
 *
 * Regras:
 * - Detecta nova versão via /version.json (no-store), comparando buildHash/buildTime/version.
 * - Máximo de 1 tentativa automática de reload por buildHash.
 * - Após o reload, revalida: se o bundle carregado bate com o version.json, marca como aplicada.
 *   Se continuar diferente, registra a falha e expõe apenas a opção manual.
 * - Nunca limpa localStorage/IndexedDB operacional (sessão, rascunhos, fila offline preservados).
 */

export const CURRENT_VERSION = (import.meta.env.VITE_APP_VERSION as string) || 'dev';
export const CURRENT_BUILD_TIME = (import.meta.env.VITE_BUILD_TIME as string) || '';
export const CURRENT_BUILD_HASH = (import.meta.env.VITE_BUILD_HASH as string) || 'dev';

const KEY_ATTEMPTED = 'app-update:attempted-hash';
const KEY_APPLIED = 'app-update:applied-hash';
const KEY_FAILED = 'app-update:failed-hash';

export const APP_UPDATE_FAILED_EVENT = 'app-update-failed';

export interface RemoteVersion {
  version?: string;
  buildHash?: string;
  buildTime?: string;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

const remove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

/** Contador de operações críticas (salvamento de tarefa, upload, etc). */
let criticalTasks = 0;

export const beginCriticalTask = () => {
  criticalTasks += 1;
};

export const endCriticalTask = () => {
  criticalTasks = Math.max(0, criticalTasks - 1);
};

/**
 * O app está ocupado? Nesse caso o reload automático é postergado
 * (formulário em edição, modal aberto, salvamento em andamento, offline).
 */
export const isAppBusy = (): boolean => {
  if (criticalTasks > 0) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return true;
  // Modal/dialog aberto ou formulário com edição pendente
  if (document.querySelector('[role="dialog"],[data-unsaved="true"]')) return true;
  const active = document.activeElement as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return true;
  return false;
};

export const fetchRemoteVersion = async (): Promise<RemoteVersion | null> => {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    return (await res.json()) as RemoteVersion;
  } catch {
    return null; // offline ou version.json ausente
  }
};

export const isDifferentVersion = (remote: RemoteVersion | null): boolean => {
  if (!remote) return false;
  const hashMismatch = !!remote.buildHash && remote.buildHash !== CURRENT_BUILD_HASH;
  const versionMismatch = !!remote.version && remote.version !== CURRENT_VERSION;
  const timeMismatch =
    !!remote.buildTime && !!CURRENT_BUILD_TIME && remote.buildTime !== CURRENT_BUILD_TIME;
  return hashMismatch || versionMismatch || timeMismatch;
};

/**
 * Limpa apenas os caches de app-shell do Workbox (precache/runtime),
 * preservando caches de imagens/fontes e qualquer dado operacional.
 */
const clearAppShellCaches = async () => {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    const shell = names.filter((n) => /precache|workbox|runtime|assets/i.test(n));
    await Promise.allSettled(shell.map((n) => caches.delete(n)));
  } catch {
    /* ignore */
  }
};

const activateWaitingServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs.map(async (reg) => {
        await reg.update().catch(() => undefined);
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }),
    );
  } catch {
    /* ignore */
  }
};

/**
 * Recarrega o app buscando o novo bundle. Não remove nada de localStorage/IndexedDB.
 */
export const reloadForUpdate = async () => {
  await activateWaitingServiceWorker();
  await clearAppShellCaches();
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.replace(url.toString());
};

/** Atualização manual (contingência). Também preserva dados operacionais. */
export const forceUpdateNow = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    } catch {
      /* ignore */
    }
  }
  await clearAppShellCaches();
  remove(KEY_ATTEMPTED);
  remove(KEY_FAILED);
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.replace(url.toString());
};

export type CheckOutcome =
  | { status: 'up-to-date' }
  | { status: 'deferred'; remote: RemoteVersion }
  | { status: 'reloading'; remote: RemoteVersion }
  | { status: 'failed'; remote: RemoteVersion }
  | { status: 'unknown' };

/**
 * Verificação principal. Também executa a validação pós-reload:
 * se havia tentativa registrada e o bundle atual já corresponde ao remoto,
 * a versão é marcada como aplicada e o fluxo é encerrado.
 */
export const checkForUpdate = async (): Promise<CheckOutcome> => {
  const remote = await fetchRemoteVersion();
  if (!remote) return { status: 'unknown' };

  const attempted = read(KEY_ATTEMPTED);

  if (!isDifferentVersion(remote)) {
    // Validação pós-reload: versão aplicada com sucesso.
    if (attempted) {
      remove(KEY_ATTEMPTED);
      remove(KEY_FAILED);
      write(KEY_APPLIED, CURRENT_BUILD_HASH);
      console.log('[app-update] nova versão aplicada com sucesso', CURRENT_BUILD_HASH);
    }
    return { status: 'up-to-date' };
  }

  const remoteHash = remote.buildHash || remote.version || 'unknown';

  // Já tentamos automaticamente para este buildHash e continua divergente → falha.
  if (attempted === remoteHash) {
    if (read(KEY_FAILED) !== remoteHash) {
      write(KEY_FAILED, remoteHash);
      console.warn('[app-update] reload automático não aplicou a nova versão', {
        current: CURRENT_BUILD_HASH,
        remote: remoteHash,
      });
    }
    window.dispatchEvent(new CustomEvent(APP_UPDATE_FAILED_EVENT, { detail: remote }));
    return { status: 'failed', remote };
  }

  if (isAppBusy()) {
    return { status: 'deferred', remote };
  }

  write(KEY_ATTEMPTED, remoteHash);
  console.log('[app-update] nova versão detectada, recarregando', {
    current: CURRENT_BUILD_HASH,
    remote: remoteHash,
  });
  void reloadForUpdate();
  return { status: 'reloading', remote };
};

export const hasUpdateFailure = (): boolean => !!read(KEY_FAILED);
