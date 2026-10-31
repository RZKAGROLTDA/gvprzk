import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Visibility only; the JD import functions still authorize every request. */
export const useJdAdminAccess = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const query = useQuery({
    queryKey: ['jd-admin-access', userId ?? null],
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'admin',
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  return { isAdmin: !!userId && query.data === true };
};