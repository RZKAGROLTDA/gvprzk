import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração ULTRA otimizada do QueryClient para prevenir sobrecarga no Supabase
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos - dados permanecem "frescos"
      gcTime: 30 * 60 * 1000, // 30 minutos no garbage collector
      refetchOnWindowFocus: false, // Não recarregar ao focar janela
      refetchOnMount: false, // Não recarregar automaticamente no mount
      refetchOnReconnect: false, // CRÍTICO: Não recarregar tudo ao reconectar
      retry: (failureCount, error) => {
        // Não retry em erros de autenticação
        if (error?.message?.includes('JWT') || error?.message?.includes('unauthorized')) {
          return false;
        }
        // Backoff exponencial para evitar sobrecarga
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff: 1s, 2s, 4s, 8s...
      networkMode: 'online',
      meta: {
        errorMessage: 'Erro ao carregar dados'
      }
    },
    mutations: {
      retry: 1, // 1 retry para mutations
      retryDelay: 1000,
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