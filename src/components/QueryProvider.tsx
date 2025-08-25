import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração super otimizada do QueryClient para performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutos - cache mais longo
      gcTime: 15 * 60 * 1000, // 15 minutos no cache
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Não refetch automático no mount
      refetchOnReconnect: 'always',
      retry: (failureCount, error) => {
        // Não retry em erros de autenticação
        if (error?.message?.includes('JWT') || error?.message?.includes('unauthorized')) {
          return false;
        }
        return failureCount < 1; // Reduzido para 1 tentativa
      },
      networkMode: 'online',
      // Cache específico por tipo de query
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