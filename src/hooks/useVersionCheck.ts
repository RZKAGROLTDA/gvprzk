import { useEffect, useState } from 'react';
import { getVersionInfo } from '@/config/version';
import {
  APP_UPDATE_FAILED_EVENT,
  UPDATE_AVAILABLE_EVENT,
  forceUpdateNow,
  getAvailableUpdate,
  hasUpdateFailure,
} from '@/lib/appUpdate';

/** Estado do aviso de atualização: nova versão disponível e/ou falha automática. */
export const useVersionCheck = () => {
  const [updateFailed, setUpdateFailed] = useState(hasUpdateFailure());
  const [updateAvailable, setUpdateAvailable] = useState(!!getAvailableUpdate());
  const [versionInfo] = useState(getVersionInfo());

  useEffect(() => {
    const handleFailure = () => setUpdateFailed(true);
    const handleAvailable = () => setUpdateAvailable(true);
    window.addEventListener(APP_UPDATE_FAILED_EVENT, handleFailure);
    window.addEventListener(UPDATE_AVAILABLE_EVENT, handleAvailable);
    return () => {
      window.removeEventListener(APP_UPDATE_FAILED_EVENT, handleFailure);
      window.removeEventListener(UPDATE_AVAILABLE_EVENT, handleAvailable);
    };
  }, []);

  return {
    updateFailed,
    updateAvailable,
    shouldUpdate: updateFailed || updateAvailable,
    versionInfo,
    refreshPage: forceUpdateNow,
  };
};
