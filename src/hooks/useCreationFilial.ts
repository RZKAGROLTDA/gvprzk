import { useMemo } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserFiliais } from '@/hooks/useUserFiliais';

/**
 * Filial gravada em novas atividades.
 * - Supervisor: Filial Ativa (já validada no servidor ao selecionar).
 * - Demais cargos: filial principal do cadastro (comportamento atual).
 */
export const useCreationFilial = () => {
  const { profile } = useProfile();
  const { isSupervisor } = useUserRole();
  const { activeFilial } = useUserFiliais();

  return useMemo(() => {
    if (isSupervisor && activeFilial) {
      return { id: activeFilial.id as string | null, nome: activeFilial.nome as string | null };
    }
    return {
      id: (profile?.filial_id ?? null) as string | null,
      nome: ((profile as { filial_nome?: string } | null)?.filial_nome ?? null) as string | null,
    };
  }, [isSupervisor, activeFilial, profile]);
};
