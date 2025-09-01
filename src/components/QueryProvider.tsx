import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração otimizada para estabilidade - Emergency Recovery
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos para reduzir carga
      gcTime: 10 * 60 * 1000, // 10 minutos no cache
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false, // Desabilitado para evitar loops
      retry: (failureCount, error) => {
        // Não retry em timeouts ou fetch errors
        if (error?.message?.includes('Failed to fetch') || 
            error?.message?.includes('timeout') ||
            error?.message?.includes('JWT') || 
            error?.message?.includes('unauthorized')) {
          return false;
        }
        return failureCount < 1; // Máximo 1 tentativa
      },
      retryDelay: () => 5000, // 5 segundos entre tentativas
      networkMode: 'online',
      // Timeout mais curto para evitar travamentos
      meta: {
        errorMessage: 'Erro ao carregar dados'
      }
    },
    mutations: {
      retry: false,
      networkMode: 'online'
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};