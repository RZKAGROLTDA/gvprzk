import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';
import {
  readActiveFilial,
  subscribeActiveFilial,
  writeActiveFilial,
} from '@/lib/activeFilial';

/**
 * M3 — Etapa 1: fonte ÚNICA das filiais autorizadas do usuário no frontend.
 *
 * Origem dos dados: RPC `get_user_filial_ids()` (M1), que já soma a filial
 * principal do cadastro com os vínculos adicionais ativos e valida
 * approval_status/employment_status. Nada é inferido no cliente.
 *
 * Garantias:
 * - Com 1 filial o comportamento é idêntico ao atual (`isMultiFilial = false`).
 * - `activeFilialId` nunca sai da lista autorizada; qualquer valor estranho
 *   volta para a filial principal.
 * - Admin/manager com escopo global mantêm `isGlobal = true` e `activeFilialId`
 *   nulo por padrão (= todas as filiais).
 * - A filial ativa é guardada por usuário na sessão, sem vazar entre contas.
 */

export interface UserFilialOption {
  id: string;
  nome: string;
  isPrimary: boolean;
}

export const useUserFiliais = () => {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { isAdmin, isManager, isLoading: rolesLoading } = useUserRole();

  const userId = user?.id ?? null;
  const primaryFilialId = profile?.filial_id ?? null;
  const isGlobal = isAdmin || isManager;

  const idsQuery = useQuery({
    queryKey: ['user-filial-ids', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_filial_ids', {
        p_user_id: userId as string,
      });
      if (error) throw error;
      return ((data as string[] | null) ?? []).filter(Boolean);
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const allowedIds = useMemo(() => {
    const ids = new Set<string>(idsQuery.data ?? []);
    // Retrocompatibilidade: se a RPC ainda não respondeu, a principal do
    // cadastro já é uma filial válida (comportamento single-filial atual).
    if (primaryFilialId) ids.add(primaryFilialId);
    return Array.from(ids);
  }, [idsQuery.data, primaryFilialId]);

  const namesQuery = useQuery({
    queryKey: ['filiais-nomes', [...allowedIds].sort().join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .in('id', allowedIds);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    enabled: allowedIds.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const filiais = useMemo<UserFilialOption[]>(() => {
    const nameById = new Map((namesQuery.data ?? []).map((f) => [f.id, f.nome]));
    return allowedIds
      .map((id) => ({
        id,
        nome: nameById.get(id) ?? 'Filial',
        isPrimary: id === primaryFilialId,
      }))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });
  }, [allowedIds, namesQuery.data, primaryFilialId]);

  const isMultiFilial = filiais.length > 1;

  // Estado da filial ativa (por usuário, na sessão).
  const [stored, setStored] = useState<string | null>(() => readActiveFilial(userId));

  useEffect(() => {
    setStored(readActiveFilial(userId));
    return subscribeActiveFilial(() => setStored(readActiveFilial(userId)));
  }, [userId]);

  const activeFilialId = useMemo<string | null>(() => {
    if (isGlobal) {
      // Global: só aceita filial ativa se ela existir na lista permitida.
      return stored && allowedIds.includes(stored) ? stored : null;
    }
    if (stored && allowedIds.includes(stored)) return stored;
    return primaryFilialId ?? allowedIds[0] ?? null;
  }, [isGlobal, stored, allowedIds, primaryFilialId]);

  const setActiveFilialId = useCallback(
    (next: string | null) => {
      if (!userId) return;
      // Nunca permitir uma filial fora do escopo autorizado.
      if (next && !allowedIds.includes(next)) return;
      writeActiveFilial(userId, next);
      setStored(next);
    },
    [userId, allowedIds],
  );

  const activeFilial = useMemo(
    () => filiais.find((f) => f.id === activeFilialId) ?? null,
    [filiais, activeFilialId],
  );

  return {
    /** Filiais autorizadas (principal primeiro). */
    filiais,
    filialIds: allowedIds,
    primaryFilialId,
    /** Filial ativa da sessão. `null` = todas as permitidas (global). */
    activeFilialId,
    activeFilial,
    setActiveFilialId,
    isMultiFilial,
    isGlobal,
    isLoading: profileLoading || rolesLoading || idsQuery.isLoading,
    error: idsQuery.error ? 'Não foi possível carregar suas filiais.' : null,
  };
};
