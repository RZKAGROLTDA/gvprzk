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
      toast({
        title: "Nova versão disponível",
        description: "Uma nova versão do sistema foi detectada. Considere atualizar a página para obter as últimas funcionalidades.",
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