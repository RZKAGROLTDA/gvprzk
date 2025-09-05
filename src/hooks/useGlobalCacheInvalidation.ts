import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'react-hot-toast';

export const useGlobalCacheInvalidation = () => {
  const queryClient = useQueryClient();

  // Escutar invalidações globais via realtime
  useEffect(() => {
    const channel = supabase
      .channel('global-cache-invalidation')
      .on('broadcast', { event: 'invalidate_cache' }, (payload) => {
        console.log('🔄 Invalidação global recebida:', payload);
        
        if (payload.payload?.type === 'full') {
          queryClient.invalidateQueries();
          toast.success('📡 Cache atualizado automaticamente');
        } else if (payload.payload?.type === 'tasks') {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['opportunities'] });
          toast.success('📡 Dados de vendas atualizados');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Função para enviar invalidação global
  const broadcastCacheInvalidation = useCallback(async (type: 'full' | 'tasks' = 'full') => {
    try {
      const response = await supabase
        .channel('global-cache-invalidation')
        .send({
          type: 'broadcast',
          event: 'invalidate_cache',
          payload: { 
            type,
            timestamp: new Date().toISOString(),
            source: 'admin'
          }
        });

      console.log('📡 Resposta do broadcast:', response);
      toast.success('📡 Invalidação enviada para todos os usuários');
      return true;
    } catch (error) {
      console.error('❌ Erro inesperado:', error);
      toast.error('Erro inesperado ao invalidar cache');
      return false;
    }
  }, []);

  return {
    broadcastCacheInvalidation
  };
};