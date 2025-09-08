import { useEffect, useState } from 'react';
import { getVersionInfo, hasVersionChanged } from '@/config/version';
import { toast } from '@/components/ui/use-toast';

/**
 * Hook to check for version changes and suggest updates
 */
export const useVersionCheck = () => {
  const [shouldUpdate, setShouldUpdate] = useState(false);
  const [versionInfo, setVersionInfo] = useState(getVersionInfo());

  useEffect(() => {
    // Check if version has changed since last login
    const versionChanged = hasVersionChanged();
    
    if (versionChanged) {
      setShouldUpdate(true);
      
      // Force service worker update if available
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          if (registration.waiting) {
            // Tell the waiting service worker to skip waiting
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          return registration.update();
        }).catch(console.warn);
      }
      
      toast({
        title: "Nova versão disponível",
        description: "Uma nova versão do sistema foi detectada. A página será atualizada automaticamente.",
        duration: 10000,
      });
    }
  }, []);

  const refreshPage = () => {
    window.location.reload();
  };

  const dismissUpdate = () => {
    setShouldUpdate(false);
  };

  return {
    shouldUpdate,
    versionInfo,
    refreshPage,
    dismissUpdate,
  };
};