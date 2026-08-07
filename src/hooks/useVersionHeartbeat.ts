import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceId, getPlatform, getUserAgent } from '@/lib/deviceInfo';
import {
  CURRENT_APP_VERSION_HEARTBEAT_SAFE as _unused,
} from '@/lib/appUpdate.heartbeat';
import { CURRENT_BUILD_HASH, CURRENT_BUILD_TIME, CURRENT_VERSION } from '@/lib/appUpdate';

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 min

/**
 * Registra (upsert) o build em uso por usuário + dispositivo.
 * Somente monitoramento: nunca bloqueia acesso e nunca dispara atualização.
 */
export function useVersionHeartbeat(userId?: string | null, ready = true) {
  const lastSent = useRef(0);

  useEffect(() => {
    if (!userId || !ready) return;

    let stopped = false;
    const deviceId = getDeviceId();

    const send = async (force = false) => {
      if (stopped) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const now = Date.now();
      if (!force && now - lastSent.current < HEARTBEAT_INTERVAL_MS) return;
      lastSent.current = now;

      try {
        const { error } = await supabase
          .from('user_app_versions')
          .upsert(
            {
              user_id: userId,
              device_id: deviceId,
              platform: getPlatform(),
              user_agent: getUserAgent(),
              build_hash: CURRENT_BUILD_HASH,
              build_time: CURRENT_BUILD_TIME || null,
              app_version: CURRENT_VERSION,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,device_id' }
          );
        if (error) {
          console.warn('[version-heartbeat] falha ao registrar versão', error.message);
        }
      } catch (error) {
        console.warn('[version-heartbeat] erro inesperado', error);
      }
    };

    // Boot / login / novo build após atualização automática: envio imediato.
    void send(true);

    const interval = setInterval(() => void send(), HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void send();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, ready]);
}
