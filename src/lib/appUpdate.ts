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
export const LOCAL_MIN_BUILD_TIME = (import.meta.env.VITE_MIN_BUILD_TIME as string) || '';
export const LOCAL_MIN_BUILD_HASH = (import.meta.env.VITE_MIN_BUILD_HASH as string) || '';

const KEY_ATTEMPTED = 'app-update:attempted-hash';
const KEY_APPLIED = 'app-update:applied-hash';
const KEY_FAILED = 'app-update:failed-hash';

export const APP_UPDATE_FAILED_EVENT = 'app-update-failed';

export interface RemoteVersion {
  version?: string;
  buildHash?: string;
  buildTime?: string;
  minBuildTime?: string;
  minBuildHash?: string;
  minBuildReason?: string;
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

/**
 * Resposta "não-JSON" (dev/preview servem o index.html no lugar do
 * version.json). Não é falha de rede: repetir a chamada devolveria o mesmo
 * HTML, então não faz sentido tentar de novo no mesmo ciclo.
 */
const NOT_A_VERSION_FILE = Symbol('not-a-version-file');
type FetchResult = RemoteVersion | null | typeof NOT_A_VERSION_FILE;

// Deduplicação: chamadas concorrentes (watcher + gate + StrictMode) compartilham
// a MESMA requisição, e o resultado é reusado por uma janela curta.
const MIN_FETCH_INTERVAL_MS = 30 * 1000;
let inFlight: Promise<FetchResult> | null = null;
let lastResult: FetchResult = null;
let lastFetchAt = 0;

const doFetch = async (): Promise<FetchResult> => {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    const body = await res.text();
    if (!type.includes('json') && !body.trimStart().startsWith('{')) {
      return NOT_A_VERSION_FILE; // ambiente sem version.json (dev/preview)
    }
    try {
      return JSON.parse(body) as RemoteVersion;
    } catch {
      return NOT_A_VERSION_FILE;
    }
  } catch {
    return null; // offline ou falha temporária de rede
  }
};

const fetchVersionShared = async (): Promise<FetchResult> => {
  if (inFlight) return inFlight;
  if (Date.now() - lastFetchAt < MIN_FETCH_INTERVAL_MS) return lastResult;
  inFlight = doFetch()
    .then((r) => {
      lastResult = r;
      lastFetchAt = Date.now();
      return r;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

export const fetchRemoteVersion = async (): Promise<RemoteVersion | null> => {
  const r = await fetchVersionShared();
  return r && r !== NOT_A_VERSION_FILE ? r : null;
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
 * Limpa SOMENTE o precache do Workbox (cópia do app-shell: html/js/css do build).
 * Preservados: cache de imagens do Storage, fontes, localStorage e IndexedDB
 * (sessão, rascunhos, fotos e fila offline).
 */
const isSafeAppShellCache = (name: string) => /^workbox-precache-/.test(name) || name === 'app-pages';

const clearAppShellCaches = async () => {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    await Promise.allSettled(names.filter(isSafeAppShellCache).map((n) => caches.delete(n)));
  } catch {
    /* ignore */
  }
};

/** Pede ao service worker para buscar uma versão nova (usado no polling). */
export const checkServiceWorkerUpdate = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(regs.map((r) => r.update()));
  } catch {
    /* ignore */
  }
};

export type PrepareResult = { ok: boolean; reason?: 'offline' | 'unavailable' };

/**
 * Confirma, direto da rede, que a nova versão está completa no servidor:
 * version.json válido + index.html novo + bundle principal referenciado acessível.
 */
const verifyNewVersionAvailable = async (): Promise<PrepareResult> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, reason: 'offline' };
  }
  try {
    const t = Date.now();
    const v = await fetch(`/version.json?t=${t}`, { cache: 'no-store' });
    if (!v.ok) return { ok: false, reason: 'unavailable' };
    JSON.parse(await v.text());
    const html = await fetch(`/?_v=${t}`, { cache: 'no-store' });
    if (!html.ok) return { ok: false, reason: 'unavailable' };
    const body = await html.text();
    const entry = body.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    if (!entry) return { ok: false, reason: 'unavailable' };
    const js = await fetch(entry, { cache: 'no-store' });
    if (!js.ok) return { ok: false, reason: 'unavailable' };
    return { ok: true };
  } catch {
    return { ok: false, reason: navigator.onLine === false ? 'offline' : 'unavailable' };
  }
};

/**
 * Troca para a versão nova: verifica disponibilidade, desliga o SW antigo
 * (o novo é registrado no próximo carregamento), limpa só o app-shell e recarrega.
 * Se algo falhar, NÃO recarrega: o app continua utilizável.
 */
const applyUpdate = async (): Promise<PrepareResult> => {
  const check = await verifyNewVersionAvailable();
  if (!check.ok) return check;
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    } catch {
      /* ignore */
    }
  }
  await clearAppShellCaches();
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.replace(url.toString());
  return { ok: true };
};

/** Recarga automática (1 tentativa por build). */
export const reloadForUpdate = async () => {
  const r = await applyUpdate();
  if (!r.ok) remove(KEY_ATTEMPTED); // permite nova tentativa no próximo ciclo
  return r;
};

/** Atualização manual. Preserva dados operacionais. */
export const forceUpdateNow = async (): Promise<PrepareResult> => {
  remove(KEY_FAILED);
  const r = await applyUpdate();
  if (r.ok) remove(KEY_ATTEMPTED);
  return r;
};

/** Há trabalho não salvo? (usado para pedir confirmação na atualização manual) */
export const hasUnsavedWork = (): boolean => {
  if (criticalTasks > 0) return true;
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('[role="dialog"],[data-unsaved="true"]');
};

export const UPDATE_AVAILABLE_EVENT = 'app-update-available';
let availableRemote: RemoteVersion | null = null;
export const getAvailableUpdate = () => availableRemote;

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

  // Sempre avisa a interface (aviso "Nova versão disponível").
  availableRemote = remote;
  window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail: remote }));

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

/* ==========================================================================
 * Versão mínima obrigatória
 * ========================================================================== */

export const MANDATORY_UPDATE_EVENT = 'app-mandatory-update';

const isValidDate = (value?: string | null): boolean =>
  !!value && !Number.isNaN(Date.parse(value));

/**
 * Busca o version.json com nova tentativa curta (falha temporária de rede
 * não pode gerar bloqueio). Retorna null quando não houve resposta válida.
 */
export const fetchRemoteVersionWithRetry = async (
  attempts = 3,
  delayMs = 1200,
): Promise<RemoteVersion | null> => {
  for (let i = 0; i < attempts; i += 1) {
    const result = await fetchVersionShared();
    if (result && result !== NOT_A_VERSION_FILE) return result;
    // Ambiente sem version.json (dev/preview) → repetir devolveria o mesmo HTML.
    if (result === NOT_A_VERSION_FILE) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
};

export type MinimumCheck =
  | { status: 'ok' }
  | { status: 'misconfigured'; reason: string }
  | { status: 'below-minimum'; minBuildTime: string; minBuildHash?: string };

/**
 * Compara o build carregado com o mínimo obrigatório.
 * Regras de segurança:
 * - minBuildTime ausente/inválido → NÃO bloqueia (apenas registra configuração inválida);
 * - CURRENT_BUILD_TIME ausente/inválido (dev) → NÃO bloqueia;
 * - minBuildHash igual ao build atual → é exatamente o mínimo, NÃO bloqueia.
 */
export const evaluateMinimum = (remote: RemoteVersion | null): MinimumCheck => {
  const minTime = isValidDate(remote?.minBuildTime)
    ? (remote!.minBuildTime as string)
    : isValidDate(LOCAL_MIN_BUILD_TIME)
      ? LOCAL_MIN_BUILD_TIME
      : '';

  if (!minTime) {
    return { status: 'misconfigured', reason: 'minBuildTime ausente ou inválido' };
  }
  if (!isValidDate(CURRENT_BUILD_TIME)) {
    return { status: 'misconfigured', reason: 'buildTime local ausente ou inválido' };
  }

  const minHash = remote?.minBuildHash || LOCAL_MIN_BUILD_HASH;
  if (minHash && minHash === CURRENT_BUILD_HASH) return { status: 'ok' };

  if (Date.parse(CURRENT_BUILD_TIME) < Date.parse(minTime)) {
    return { status: 'below-minimum', minBuildTime: minTime, minBuildHash: minHash || undefined };
  }
  return { status: 'ok' };
};

export type MandatoryOutcome =
  | { status: 'ok' }
  | { status: 'unknown' }
  | { status: 'deferred' }
  | { status: 'updating' }
  | { status: 'blocked' };

/**
 * Verificação do mínimo obrigatório. Só bloqueia/atualiza com resposta válida
 * do version.json confirmando CURRENT_BUILD_TIME < minBuildTime.
 */
export const checkMandatoryUpdate = async (): Promise<MandatoryOutcome> => {
  const remote = await fetchRemoteVersionWithRetry();
  if (!remote) return { status: 'unknown' }; // offline / falha temporária → não bloqueia

  const result = evaluateMinimum(remote);

  if (result.status === 'misconfigured') {
    console.error('[app-update] configuração de versão mínima inválida:', result.reason);
    return { status: 'ok' };
  }
  if (result.status === 'ok') return { status: 'ok' };

  const remoteHash = remote.buildHash || remote.version || 'unknown';
  const attempted = read(KEY_ATTEMPTED);

  // Já tentamos automaticamente para este build remoto e continuamos abaixo do mínimo.
  if (attempted === remoteHash || read(KEY_FAILED) === remoteHash) {
    write(KEY_FAILED, remoteHash);
    console.warn('[app-update] build abaixo do mínimo obrigatório após tentativa automática', {
      current: CURRENT_BUILD_HASH,
      minBuildTime: result.minBuildTime,
    });
    return { status: 'blocked' };
  }

  if (isAppBusy()) return { status: 'deferred' };

  write(KEY_ATTEMPTED, remoteHash);
  console.log('[app-update] build abaixo do mínimo obrigatório, atualizando', {
    current: CURRENT_BUILD_HASH,
    minBuildTime: result.minBuildTime,
  });
  void reloadForUpdate();
  return { status: 'updating' };
};
