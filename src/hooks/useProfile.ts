import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  filial_id: string | null;
  filial_nome?: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível carregar os dados do usuário.';

/**
 * Perfil mínimo necessário para liberar o acesso.
 * Compartilhado por React Query (uma única consulta para todas as instâncias do hook).
 */
export const useProfile = () => {
  let userId: string | null = null;
  let contextAvailable = true;

  try {
    userId = useAuth().user?.id ?? null;
  } catch (error) {
    console.warn('useProfile: AuthProvider context not available:', error);
    contextAvailable = false;
  }

  const queryClient = useQueryClient();
  const enabled = contextAvailable && !!userId;

  // 1) Caminho crítico: apenas profiles. Sem AbortController/timeout.
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, email, role, filial_id, approval_status')
        .eq('user_id', userId as string)
        .maybeSingle();

      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const filialId = profileQuery.data?.filial_id ?? null;

  // 2) Dado secundário: nome da filial. Falha/lentidão aqui NUNCA invalida o profile.
  const filialQuery = useQuery({
    queryKey: ['profile-filial-nome', filialId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .eq('id', filialId as string)
        .maybeSingle();

      if (error) throw error;
      return data?.nome ?? null;
    },
    enabled: !!filialId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const profile = useMemo<Profile | null>(() => {
    if (!profileQuery.data) return null;
    return { ...profileQuery.data, filial_nome: filialQuery.data ?? null };
  }, [profileQuery.data, filialQuery.data]);

  const loadProfile = async () => {
    if (!enabled) return;
    await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
  };

  return {
    profile,
    // O gate depende apenas do profile mínimo.
    loading: enabled ? profileQuery.isLoading : false,
    error: profileQuery.error ? getErrorMessage(profileQuery.error) : null,
    filialLoading: filialQuery.isLoading,
    isAdmin: profile?.role === 'manager',
    loadProfile,
  };
};
