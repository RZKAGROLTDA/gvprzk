import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * M3 — Gestão administrativa das filiais adicionais de um usuário.
 *
 * Leitura: `user_filiais` ativas do usuário alvo (somente gestor autorizado,
 * conforme RLS validada na M1).
 * Escrita: exclusivamente via RPC `set_user_filiais` (M1), que faz a
 * autorização no servidor, remove a filial principal da lista efetiva,
 * ativa/desativa vínculos, preserva histórico e registra auditoria.
 *
 * Nenhum acesso é concedido automaticamente por cargo/região/filial.
 */

export const useUserAdditionalFiliais = (targetUserId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-additional-filiais', targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_filiais')
        .select('filial_id')
        .eq('user_id', targetUserId as string)
        .eq('active', true);
      if (error) throw error;
      return ((data ?? []) as { filial_id: string }[]).map((r) => r.filial_id);
    },
    enabled: !!targetUserId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: async (filialIds: string[]) => {
      if (!targetUserId) throw new Error('Usuário alvo não informado');
      const { data, error } = await supabase.rpc('set_user_filiais', {
        target_user_id: targetUserId,
        filial_ids: filialIds,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.error || 'Não foi possível salvar as filiais adicionais.');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-additional-filiais', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-filial-ids', targetUserId] });
    },
  });

  const save = useCallback(
    async (filialIds: string[]) => saveMutation.mutateAsync(filialIds),
    [saveMutation],
  );

  return {
    additionalFilialIds: query.data ?? [],
    isLoading: query.isLoading,
    isSaving: saveMutation.isPending,
    save,
    error: query.error ? 'Não foi possível carregar as filiais adicionais.' : null,
  };
};
