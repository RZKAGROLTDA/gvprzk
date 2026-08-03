import { useEffect, useState } from 'react';
import { getVersionInfo } from '@/config/version';

/**
 * Hook to check for version changes and suggest updates
 */
export const useVersionCheck = () => {
  const [shouldUpdate, setShouldUpdate] = useState(false);
  const [versionInfo, setVersionInfo] = useState(getVersionInfo());

  useEffect(() => {
    const handleUpdate = () => {
      setShouldUpdate(true);
    };
    window.addEventListener('app-version-update', handleUpdate);
    return () => window.removeEventListener('app-version-update', handleUpdate);
  }, []);

  const refreshPage = async () => {
    const authKey = 'sb-wuvbrkbhunifudaewhng-auth-token';
    const authToken = localStorage.getItem(authKey);
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName).catch(() => false)));
    }
    if (authToken) localStorage.setItem(authKey, authToken);
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
  };

  return {
    shouldUpdate,
    versionInfo,
    refreshPage,
  };
};