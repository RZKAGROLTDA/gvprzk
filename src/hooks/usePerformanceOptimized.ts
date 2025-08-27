import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Hook para otimização de performance com debouncing e throttling
export const usePerformanceOptimized = () => {
  const queryClient = useQueryClient();
  const debounceRef = useRef<NodeJS.Timeout>();
  const throttleRef = useRef<NodeJS.Timeout>();

  // Debounce para filtros e buscas (500ms)
  const debounce = useCallback((fn: () => void, delay = 500) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(fn, delay);
  }, []);

  // Throttle para scrolling e eventos frequentes (100ms)
  const throttle = useCallback((fn: () => void, delay = 100) => {
    if (throttleRef.current) return;
    
    throttleRef.current = setTimeout(() => {
      fn();
      throttleRef.current = undefined;
    }, delay);
  }, []);

  // Invalidação inteligente de cache
  const smartInvalidate = useCallback((keys: string[]) => {
    keys.forEach(key => {
      queryClient.invalidateQueries({ 
        queryKey: [key],
        exact: false // Invalidar chaves que começam com o padrão
      });
    });
  }, [queryClient]);

  // Precarregamento inteligente baseado na navegação
  const preloadOnHover = useCallback((queryKey: any[], queryFn: () => Promise<any>) => {
    return () => {
      queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime: 60 * 1000, // 1 minuto de cache para preload
      });
    };
  }, [queryClient]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, []);

  return {
    debounce,
    throttle,
    smartInvalidate,
    preloadOnHover,
  };
};

// Hook para métricas de performance
export const usePerformanceMonitor = () => {
  const measureRef = useRef<{[key: string]: number}>({});

  const startMeasure = useCallback((label: string) => {
    measureRef.current[label] = performance.now();
  }, []);

  const endMeasure = useCallback((label: string) => {
    const startTime = measureRef.current[label];
    if (startTime) {
      const duration = performance.now() - startTime;
      console.log(`⚡ Performance [${label}]: ${duration.toFixed(2)}ms`);
      delete measureRef.current[label];
      return duration;
    }
    return 0;
  }, []);

  const measureAsync = useCallback(async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    startMeasure(label);
    try {
      const result = await fn();
      endMeasure(label);
      return result;
    } catch (error) {
      endMeasure(label);
      throw error;
    }
  }, [startMeasure, endMeasure]);

  return {
    startMeasure,
    endMeasure,
    measureAsync,
  };
};