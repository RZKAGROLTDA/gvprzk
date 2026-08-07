import { useEffect, useState } from 'react';
import { getVersionInfo } from '@/config/version';
import { APP_UPDATE_FAILED_EVENT, forceUpdateNow, hasUpdateFailure } from '@/lib/appUpdate';

/**
 * Expõe apenas o estado de FALHA da atualização automática.
 * No fluxo normal a atualização é aplicada sozinha, sem card obrigatório.
 */
export const useVersionCheck = () => {
  const [updateFailed, setUpdateFailed] = useState(hasUpdateFailure());
  const [versionInfo] = useState(getVersionInfo());

  useEffect(() => {
    const handleFailure = () => setUpdateFailed(true);
    window.addEventListener(APP_UPDATE_FAILED_EVENT, handleFailure);
    return () => window.removeEventListener(APP_UPDATE_FAILED_EVENT, handleFailure);
  }, []);

  return {
    updateFailed,
    shouldUpdate: updateFailed,
    versionInfo,
    refreshPage: forceUpdateNow,
  };
};
