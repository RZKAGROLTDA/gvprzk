import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração otimizada do QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos padrão
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Não retry em erros de autenticação
        if (error?.message?.includes('JWT') || error?.message?.includes('unauthorized')) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false, // Não retry mutations por padrão
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