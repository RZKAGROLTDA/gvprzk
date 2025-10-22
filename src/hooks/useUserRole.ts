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

      // Check if user has admin role
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) {
        console.error('❌ useUserRole: Erro ao buscar roles:', rolesError);
      }

      const isAdmin = roles?.some(r => r.role === 'admin') ?? false;

      console.log('🔒 useUserRole: Roles encontrados:', {
        roles: roles?.map(r => r.role),
        isAdmin
      });

      // Also check profile for manager role (for compatibility)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('❌ useUserRole: Erro ao buscar profile:', profileError);
      }

      const result = {
        isAdmin,
        isManager: profile?.role === 'manager',
        role: profile?.role || 'none'
      };

      console.log('✅ useUserRole: Resultado final:', result);

      return result;
    },
    staleTime: 1000, // Reduzir cache para 1 segundo para testar
    gcTime: 1000,
  });

  return {
    isAdmin: userRole?.isAdmin ?? false,
    isManager: userRole?.isManager ?? false,
    role: userRole?.role || 'none',
    isLoading
  };
};
