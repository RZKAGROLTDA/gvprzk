import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useProfile } from '@/hooks/useProfile';

/**
 * Hook that returns consultants filtered by the current user's role:
 * - Admin/Manager: all approved users
 * - Supervisor: only users from the same filial
 * - Others: all approved users (filtered by RLS)
 */
export const useFilteredConsultants = () => {
  const { isSupervisor, isAdmin, isManager } = useUserRole();
  const { profile } = useProfile();

  const { data: allConsultants = [], isLoading } = useQuery({
    queryKey: ['filtered-consultants', isSupervisor, isAdmin, isManager, profile?.filial_id],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('user_id, name, filial_id')
        .eq('approval_status', 'approved')
        .order('name');

      // Supervisor: filter by their filial
      if (isSupervisor && !isAdmin && !isManager && profile?.filial_id) {
        query = query.eq('filial_id', profile.filial_id);
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
