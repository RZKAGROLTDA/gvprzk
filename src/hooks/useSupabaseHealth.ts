import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getCachedSession } from '@/integrations/supabase/client';

export type SupabaseHealthStatus = 'checking' | 'healthy' | 'unhealthy' | 'unknown';

interface SupabaseHealthState {
  status: SupabaseHealthStatus;
  lastCheck: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

// OTIMIZAÇÃO: Cache global para evitar checks repetidos entre componentes
let globalHealthCache: { status: SupabaseHealthStatus; timestamp: number } | null = null;
const GLOBAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutos de cache global

const HEALTH_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutos entre checks automáticos
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 5000; // 5 segundos base delay
const HEALTH_CHECK_TIMEOUT = 15000; // 15 segundos timeout
const MIN_TIME_BETWEEN_CHECKS = 30000; // Mínimo 30s entre checks

export const useSupabaseHealth = () => {
  const [state, setState] = useState<SupabaseHealthState>(() => {
    // OTIMIZAÇÃO: Iniciar com cache global se disponível
    if (globalHealthCache && Date.now() - globalHealthCache.timestamp < GLOBAL_CACHE_TTL) {
      return {
        status: globalHealthCache.status,
        lastCheck: new Date(globalHealthCache.timestamp),
        errorMessage: null,
        retryCount: 0
      };
    }
    return {
      status: 'healthy', // OTIMIZAÇÃO: Assumir healthy por padrão para não bloquear
      lastCheck: null,
      errorMessage: null,
      retryCount: 0
    };
  });
  
  const lastCheckTime = useRef<number>(globalHealthCache?.timestamp || 0);
  const isCheckingRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    // OTIMIZAÇÃO: Usar cache global primeiro
    const now = Date.now();
    if (globalHealthCache && now - globalHealthCache.timestamp < GLOBAL_CACHE_TTL) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          status: globalHealthCache!.status,
          lastCheck: new Date(globalHealthCache!.timestamp)
        }));
      }
      return globalHealthCache.status === 'healthy';
    }

    // Evitar checks muito frequentes
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
      // OTIMIZAÇÃO: Primeiro verificar sessão em cache (sem request)
      const cachedSession = await getCachedSession();
      
      if (cachedSession) {
        // Se temos sessão válida, considerar saudável sem fazer request
        globalHealthCache = { status: 'healthy', timestamp: now };
        if (mountedRef.current) {
          setState({
            status: 'healthy',
            lastCheck: new Date(),
            errorMessage: null,
            retryCount: 0
          });
        }
        isCheckingRef.current = false;
        return true;
      }

      // OTIMIZAÇÃO: Health check apenas se não temos sessão
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const { error } = await supabase
        .from('filiais')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        const isConnectionError = 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('NetworkError') ||
          error.message?.includes('timeout') ||
          error.message?.includes('aborted');

        if (isConnectionError) {
          if (mountedRef.current) {
            setState(prev => ({
              status: prev.retryCount >= MAX_RETRIES ? 'unhealthy' : 'checking',
              lastCheck: new Date(),
              errorMessage: 'Verificando conexão...',
              retryCount: prev.retryCount + 1
            }));
          }
          isCheckingRef.current = false;
          return false;
        }

        // Outros erros (RLS, etc) = Supabase está acessível
        globalHealthCache = { status: 'healthy', timestamp: now };
        if (mountedRef.current) {
          setState({
            status: 'healthy',
            lastCheck: new Date(),
            errorMessage: null,
            retryCount: 0
          });
        }
        isCheckingRef.current = false;
        return true;
      }

      globalHealthCache = { status: 'healthy', timestamp: now };
      if (mountedRef.current) {
        setState({
          status: 'healthy',
          lastCheck: new Date(),
          errorMessage: null,
          retryCount: 0
        });
      }
      isCheckingRef.current = false;
      return true;
    } catch (error: any) {
      const currentRetryCount = state.retryCount + 1;
      
      if (mountedRef.current) {
        setState(prev => ({
          status: currentRetryCount >= MAX_RETRIES ? 'unhealthy' : 'checking',
          lastCheck: new Date(),
          errorMessage: currentRetryCount >= MAX_RETRIES 
            ? 'Serviço temporariamente indisponível'
            : 'Verificando conexão...',
          retryCount: currentRetryCount
        }));
      }
      isCheckingRef.current = false;
      return false;
    }
  }, [state.status, state.retryCount]);

  const retryWithBackoff = useCallback(async () => {
    // Limpar cache global para forçar novo check
    globalHealthCache = null;
    
    if (mountedRef.current) {
      setState(prev => ({ ...prev, retryCount: 0, status: 'checking' }));
    }
    
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      const isHealthy = await checkHealth();
      if (isHealthy) return true;

      attempts++;
      if (attempts < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return false;
  }, [checkHealth]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // OTIMIZAÇÃO: Health check inicial apenas se não temos cache válido
  useEffect(() => {
    if (!globalHealthCache || Date.now() - globalHealthCache.timestamp >= GLOBAL_CACHE_TTL) {
      const timer = setTimeout(checkHealth, 2000); // Delay maior para não competir com auth
      return () => clearTimeout(timer);
    }
  }, []);

  // OTIMIZAÇÃO: Check periódico apenas quando healthy e com intervalo maior
  useEffect(() => {
    if (state.status !== 'healthy') return;

    const interval = setInterval(() => {
      // Só fazer check se cache expirou
      if (!globalHealthCache || Date.now() - globalHealthCache.timestamp >= GLOBAL_CACHE_TTL) {
        checkHealth();
      }
    }, HEALTH_CHECK_INTERVAL);
    
    return () => clearInterval(interval);
  }, [state.status, checkHealth]);

  return {
    ...state,
    isHealthy: state.status === 'healthy',
    isChecking: state.status === 'checking',
    isUnhealthy: state.status === 'unhealthy',
    checkHealth,
    retryWithBackoff
  };
};
