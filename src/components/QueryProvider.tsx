import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração estabilizada para performance e segurança
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos - cache razoável
      gcTime: 10 * 60 * 1000, // 10 minutos no cache
      refetchOnWindowFocus: false,
      refetchOnMount: true, // Reabilitar mount fetch
      refetchOnReconnect: false,
      retry: 1, // Apenas 1 retry
      networkMode: 'online',
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