import { useEffect, useRef } from 'react';

/**
 * Polls /version.json and emits a notification when a new build is detected.
 */
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 min
const VERSION_URL = '/version.json';
const currentVersion = (import.meta.env.VITE_APP_VERSION as string) || 'dev';
const currentBuildTime = (import.meta.env.VITE_BUILD_TIME as string) || '';
const currentBuildHash = (import.meta.env.VITE_BUILD_HASH as string) || 'dev';

let updateAnnounced = false;

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
      if (!updateAnnounced) {
        updateAnnounced = true;
        window.dispatchEvent(new CustomEvent('app-version-update', { detail: data }));
      }
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

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);
}
