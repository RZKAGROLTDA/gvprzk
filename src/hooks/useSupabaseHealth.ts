import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SupabaseHealthStatus = 'checking' | 'healthy' | 'unhealthy' | 'unknown';

interface SupabaseHealthState {
  status: SupabaseHealthStatus;
  lastCheck: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000; // 2 seconds base delay

export const useSupabaseHealth = () => {
  const [state, setState] = useState<SupabaseHealthState>({
    status: 'checking',
    lastCheck: null,
    errorMessage: null,
    retryCount: 0
  });

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      // Simple health check - try to execute a lightweight query
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

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
          error.code === '544';

        if (isConnectionError) {
          setState(prev => ({
            status: 'unhealthy',
            lastCheck: new Date(),
            errorMessage: 'Serviço temporariamente indisponível',
            retryCount: prev.retryCount + 1
          }));
          return false;
        }

        // Other errors (like RLS) are fine - means Supabase is reachable
        setState({
          status: 'healthy',
          lastCheck: new Date(),
          errorMessage: null,
          retryCount: 0
        });
        return true;
      }

      setState({
        status: 'healthy',
        lastCheck: new Date(),
        errorMessage: null,
        retryCount: 0
      });
      return true;
    } catch (error: any) {
      const errorMessage = error.name === 'AbortError' 
        ? 'Tempo limite de conexão excedido'
        : error.message || 'Erro de conexão desconhecido';

      setState(prev => ({
        status: 'unhealthy',
        lastCheck: new Date(),
        errorMessage,
        retryCount: prev.retryCount + 1
      }));
      return false;
    }
  }, []);

  const retryWithBackoff = useCallback(async () => {
    let attempts = 0;
    
    while (attempts < MAX_RETRIES) {
      const isHealthy = await checkHealth();
      if (isHealthy) return true;

      attempts++;
      if (attempts < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return false;
  }, [checkHealth]);

  // Initial health check
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Periodic health check (only when healthy or unknown)
  useEffect(() => {
    if (state.status === 'unhealthy') return;

    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [state.status, checkHealth]);

  // Retry when unhealthy (with exponential backoff)
  useEffect(() => {
    if (state.status !== 'unhealthy' || state.retryCount >= MAX_RETRIES) return;

    const delay = RETRY_DELAY_BASE * Math.pow(2, state.retryCount);
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
