import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Hook para gerenciar cache com invalidação de segurança
 * Garante que dados sensíveis sejam atualizados corretamente
 */
export const useSecurityCache = () => {
  const queryClient = useQueryClient();

  // Invalidação completa para mudanças críticas
  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries();
    console.log('🔄 Cache invalidado completamente para sincronização de segurança');
  }, [queryClient]);

  // Invalidação específica para tasks
  const invalidateTasks = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['taskDetails'] });
    console.log('🔄 Cache de tasks invalidado');
  }, [queryClient]);

  // Invalidação para dados de vendas
  const invalidateSales = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['sales'] });
    console.log('🔄 Cache de vendas invalidado');
  }, [queryClient]);

  return {
    invalidateAll,
    invalidateTasks,
    invalidateSales
  };
};