// Sistema de logging condicional para performance
const isDevelopment = import.meta.env.DEV;
const isLoggingEnabled = isDevelopment && false; // Desabilitado para produção

export const logger = {
  info: (...args: any[]) => {
    if (isLoggingEnabled) {
      console.log('[INFO]', ...args);
    }
  },
  error: (...args: any[]) => {
    // Erros sempre são logados
    console.error('[ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    if (isLoggingEnabled) {
      console.warn('[WARN]', ...args);
    }
  },
  debug: (...args: any[]) => {
    if (isLoggingEnabled) {
      console.debug('[DEBUG]', ...args);
    }
  },
  performance: (label: string, fn: () => any) => {
    if (!isLoggingEnabled) return fn();
    
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`[PERF] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  }
};