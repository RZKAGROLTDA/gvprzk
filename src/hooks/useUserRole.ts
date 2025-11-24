import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useUserRole = () => {
  const { data: userRole, isLoading } = useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🔒 useUserRole: Nenhum usuário autenticado');
        return null;
      }

      console.log('🔒 useUserRole: Verificando papéis para usuário:', user.id);

      // SECURITY FIX: Only use user_roles table as single source of truth
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) {
        console.error('❌ useUserRole: Erro ao buscar roles:', rolesError);
        return {
          isAdmin: false,
          isSupervisor: false,
          isManager: false,
          role: 'none'
        };
      }

      const isAdmin = roles?.some(r => r.role === 'admin') ?? false;
      const isSupervisor = roles?.some(r => r.role === 'supervisor') ?? false;
      const isManager = isAdmin; // Admin has manager privileges

      // Determine primary role for display
      let primaryRole = 'none';
      if (roles && roles.length > 0) {
        // Priority: admin > supervisor > rac > consultant
        if (roles.some(r => r.role === 'admin')) primaryRole = 'admin';
        else if (roles.some(r => r.role === 'supervisor')) primaryRole = 'supervisor';
        else if (roles.some(r => r.role === 'rac')) primaryRole = 'rac';
        else primaryRole = 'consultant';
      }

      const result = {
        isAdmin,
        isSupervisor,
        isManager,
        role: primaryRole
      };

      console.log('✅ useUserRole: Resultado final:', result);

      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
  });

  return {
    isAdmin: userRole?.isAdmin ?? false,
    isSupervisor: userRole?.isSupervisor ?? false,
    isManager: userRole?.isManager ?? false,
    role: userRole?.role || 'none',
    isLoading
  };
};
