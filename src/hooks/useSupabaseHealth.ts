import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getCachedSession } from '@/integrations/supabase/client';

export type SupabaseHealthStatus = 'checking' | 'healthy' | 'unhealthy' | 'unknown';

interface SupabaseHealthState {
  status: SupabaseHealthStatus;
  lastCheck: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

const HEALTH_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutos - reduzido para menos carga
const MAX_RETRIES = 5; // Aumentado para mais tolerância
const RETRY_DELAY_BASE = 3000; // 3 seconds base delay
const HEALTH_CHECK_TIMEOUT = 30000; // 30 segundos timeout (aumentado de 10s)
const MIN_TIME_BETWEEN_CHECKS = 5000; // Mínimo 5s entre checks

export const useSupabaseHealth = () => {
  const [state, setState] = useState<SupabaseHealthState>({
    status: 'checking',
    lastCheck: null,
    errorMessage: null,
    retryCount: 0
  });
  
  const lastCheckTime = useRef<number>(0);
  const isCheckingRef = useRef<boolean>(false);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    // Evitar checks muito frequentes
    const now = Date.now();
    if (now - lastCheckTime.current < MIN_TIME_BETWEEN_CHECKS) {
      return state.status === 'healthy';
    }
    
    // Evitar checks simultâneos
    if (isCheckingRef.current) {
      return state.status === 'healthy';
    }
    
    isCheckingRef.current = true;
    lastCheckTime.current = now;

    try {
      // Primeiro tentar usar sessão em cache (não faz request)
      const cachedSession = await getCachedSession();
      
      // Se temos sessão em cache, considerar saudável
      if (cachedSession) {
        setState({
          status: 'healthy',
          lastCheck: new Date(),
          errorMessage: null,
          retryCount: 0
        });
        isCheckingRef.current = false;
        return true;
      }

      // Health check com timeout aumentado
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const { error } = await supabase
        .from('filiais')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        // Check for specific connection errors
        const isConnectionError = 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('NetworkError') ||
          error.message?.includes('timeout') ||
          error.message?.includes('Connection') ||
          error.message?.includes('aborted') ||
          error.code === '544';

        if (isConnectionError) {
          setState(prev => ({
            status: prev.retryCount >= MAX_RETRIES ? 'unhealthy' : 'checking',
            lastCheck: new Date(),
            errorMessage: 'Verificando conexão...',
            retryCount: prev.retryCount + 1
          }));
          isCheckingRef.current = false;
          return false;
        }

        // Other errors (like RLS) are fine - means Supabase is reachable
        setState({
          status: 'healthy',
          lastCheck: new Date(),
          errorMessage: null,
          retryCount: 0
        });
        isCheckingRef.current = false;
        return true;
      }

      setState({
        status: 'healthy',
        lastCheck: new Date(),
        errorMessage: null,
        retryCount: 0
      });
      isCheckingRef.current = false;
      return true;
    } catch (error: any) {
      // Não marcar como unhealthy imediatamente - dar mais chances
      const currentRetryCount = state.retryCount + 1;
      
      setState(prev => ({
        status: currentRetryCount >= MAX_RETRIES ? 'unhealthy' : 'checking',
        lastCheck: new Date(),
        errorMessage: currentRetryCount >= MAX_RETRIES 
          ? 'Serviço temporariamente indisponível'
          : 'Verificando conexão...',
        retryCount: currentRetryCount
      }));
      isCheckingRef.current = false;
      return false;
    }
  }, [state.status, state.retryCount]);

  const retryWithBackoff = useCallback(async () => {
    let attempts = 0;
    
    // Reset retry count para nova tentativa
    setState(prev => ({ ...prev, retryCount: 0, status: 'checking' }));
    
    while (attempts < MAX_RETRIES) {
      const isHealthy = await checkHealth();
      if (isHealthy) return true;

      attempts++;
      if (attempts < MAX_RETRIES) {
        // Exponential backoff com jitter: 3s, 6s, 12s, 24s, 48s
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempts - 1) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return false;
  }, [checkHealth]);

  // Initial health check com delay para não bloquear renderização
  useEffect(() => {
    const timer = setTimeout(() => {
      checkHealth();
    }, 1000);
    return () => clearTimeout(timer);
  }, [checkHealth]);

  // Periodic health check (only when healthy or unknown)
  useEffect(() => {
    if (state.status === 'unhealthy') return;

    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [state.status, checkHealth]);

  // Retry when checking (with exponential backoff)
  useEffect(() => {
    if (state.status !== 'checking' || state.retryCount === 0 || state.retryCount >= MAX_RETRIES) return;

    const delay = RETRY_DELAY_BASE * Math.pow(2, state.retryCount - 1) + Math.random() * 1000;
    const timeout = setTimeout(checkHealth, delay);
    
    return () => clearTimeout(timeout);
  }, [state.status, state.retryCount, checkHealth]);

  return {
    ...state,
    isHealthy: state.status === 'healthy',
    isChecking: state.status === 'checking',
    isUnhealthy: state.status === 'unhealthy',
    checkHealth,
    retryWithBackoff
  };
};
