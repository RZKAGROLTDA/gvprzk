import { useEffect, useRef } from 'react';

/**
 * Polls /version.json for new deploys and auto-reloads when a new build is detected.
 * Preserves Supabase auth token across the reload.
 */
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 min
const VERSION_URL = '/version.json';
const AUTH_KEY = 'sb-wuvbrkbhunifudaewhng-auth-token';

const currentVersion = (import.meta.env.VITE_APP_VERSION as string) || 'dev';
const currentBuildTime = (import.meta.env.VITE_BUILD_TIME as string) || '';
const currentBuildHash = (import.meta.env.VITE_BUILD_HASH as string) || 'dev';

let reloading = false;

async function clearAndReload() {
  if (reloading) return;
  reloading = true;
  try {
    // Preserve auth
    const authToken = localStorage.getItem(AUTH_KEY);

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => null)));
    }

    // Clear caches
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n).catch(() => null)));
    }

    // Restore auth
    if (authToken) localStorage.setItem(AUTH_KEY, authToken);
  } catch (e) {
    console.warn('[auto-version] cleanup error', e);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
  }
}

async function checkVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      version?: string;
      buildHash?: string;
      buildTime?: string;
    };

    const buildMismatch = !!data?.buildHash && data.buildHash !== currentBuildHash;
    const versionMismatch = !!data?.version && data.version !== currentVersion;
    const timeMismatch = !!data?.buildTime && !!currentBuildTime && data.buildTime !== currentBuildTime;

    if (buildMismatch || versionMismatch || timeMismatch) {
      console.log(
        '[auto-version] new build detected. Reloading...',
        {
          currentVersion,
          currentBuildHash,
          currentBuildTime,
          remoteVersion: data?.version ?? null,
          remoteBuildHash: data?.buildHash ?? null,
          remoteBuildTime: data?.buildTime ?? null,
        }
      );
      clearAndReload();
    }
  } catch {
    // offline or version.json missing — ignore
  }
}

export function useAutoVersionCheck() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    console.log('[auto-version] watcher started', {
      currentVersion,
      currentBuildHash,
      currentBuildTime,
    });

    void checkVersion();

    // Initial check shortly after mount
    const initial = setTimeout(checkVersion, 5000);
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkVersion);
    };
  }, []);
}
