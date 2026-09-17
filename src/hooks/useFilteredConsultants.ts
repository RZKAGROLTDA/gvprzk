import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useProfile } from '@/hooks/useProfile';
import { useUserFiliais } from '@/hooks/useUserFiliais';

/**
 * Consultores filtrados conforme o acesso do usuário:
 * - Admin/Manager: todos os usuários aprovados
 * - Supervisor: usuários da filial em foco (Filial Ativa do cabeçalho — M3)
 * - Demais: todos os aprovados (limitados pelo RLS)
 *
 * `filialId` permite que a tela alinhe a lista ao seu próprio filtro de filial.
 * `null` explícito = sem filtro de filial.
 */
export const useFilteredConsultants = (filialId?: string | null) => {
  const { isSupervisor, isAdmin, isManager } = useUserRole();
  const { profile } = useProfile();
  const { activeFilialId } = useUserFiliais();

  // Padrão: a lista acompanha a Filial Ativa do cabeçalho.
  // Global com "Todas as filiais" => activeFilialId nulo => sem filtro.
  const scopeFilialId = filialId !== undefined ? filialId : activeFilialId;

  const { data: allConsultants = [], isLoading } = useQuery({
    queryKey: ['filtered-consultants', isSupervisor, isAdmin, isManager, scopeFilialId],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('user_id, name, filial_id')
        .eq('approval_status', 'approved')
        .order('name');

      if (scopeFilialId) {
        query = query.eq('filial_id', scopeFilialId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(p => ({
        id: p.user_id,
        name: p.name,
        filial_id: p.filial_id,
      }));
    },
    enabled: !!(profile || isAdmin || isManager),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { consultants: allConsultants, isLoading };
};
