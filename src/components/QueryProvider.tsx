import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração ultra otimizada com cache inteligente diferenciado
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache diferenciado por tipo de dados
      staleTime: 2 * 60 * 1000, // 2 minutos base - cache médio
      gcTime: 10 * 60 * 1000, // 10 minutos no garbage collection
      refetchOnWindowFocus: false, // Desabilitar auto-refetch no focus
      refetchOnMount: false, // Não refetch automático no mount
      refetchOnReconnect: 'always',
      retry: (failureCount, error) => {
        // Não retry em erros de autenticação ou 406
        if (error?.message?.includes('JWT') || 
            error?.message?.includes('unauthorized') ||
            error?.message?.includes('406') ||
            error?.message?.includes('PGRST116')) {
          return false;
        }
        return failureCount < 1; // Apenas 1 tentativa para performance
      },
      networkMode: 'online',
      // Desabilitar polling automático para evitar requests desnecessários
      refetchInterval: false,
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