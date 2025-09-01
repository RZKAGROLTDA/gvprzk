import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Configuração de emergência para reduzir consumo de créditos
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60 * 1000, // 30 minutos - cache muito longo
      gcTime: 60 * 60 * 1000, // 1 hora no cache
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false, // Desabilitar reconexão automática
      retry: false, // Desabilitar retry completamente
      networkMode: 'online',
      enabled: false, // Desabilitar queries automáticas
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