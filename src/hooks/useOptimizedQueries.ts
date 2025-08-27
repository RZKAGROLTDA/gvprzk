import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Query keys centralizados para cache otimizado
export const OPTIMIZED_QUERY_KEYS = {
  // Dados estáticos - cache longo (30min)
  consultants: ['consultants-static'] as const,
  filiais: ['filiais-static'] as const,
  
  // Dados dinâmicos - cache médio (5min)
  tasks: ['tasks-dynamic'] as const,
  
  // Dados específicos - cache curto (2min)
  taskDetails: (id: string) => ['task-details', id] as const,
} as const;

// Hook otimizado para consultores com cache longo
export const useOptimizedConsultants = () => {
  return useQuery({
    queryKey: OPTIMIZED_QUERY_KEYS.consultants,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, user_id')
        .eq('approval_status', 'approved')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutos
    gcTime: 60 * 60 * 1000, // 1 hora
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Hook otimizado para filiais com cache longo
export const useOptimizedFiliais = () => {
  return useQuery({
    queryKey: OPTIMIZED_QUERY_KEYS.filiais,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutos
    gcTime: 60 * 60 * 1000, // 1 hora
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Hook otimizado para tasks com cache médio e otimizações
export const useOptimizedTasks = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: OPTIMIZED_QUERY_KEYS.tasks,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      try {
        // Query otimizada sem incluir detalhes por padrão
        const { data: tasksData, error } = await supabase
          .rpc('get_secure_task_data')
          .select(`
            id, client, responsible, filial, task_type, created_at, 
            sales_value, is_prospect, sales_confirmed, status,
            observations, start_date, end_date
          `)
          .order('created_at', { ascending: false })
          .limit(500); // Limitar para performance

        if (error) {
          console.warn('RPC error, falling back to direct query:', error);
          
          // Fallback para query direta se RPC falhar
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('tasks')
            .select(`
              id, client, responsible, filial, task_type, created_at,
              sales_value, is_prospect, sales_confirmed, status,
              observations, start_date, end_date
            `)
            .order('created_at', { ascending: false })
            .limit(500);
            
          if (fallbackError) throw fallbackError;
          return fallbackData || [];
        }

        return tasksData || [];
      } catch (error) {
        console.error('Error loading tasks:', error);
        return [];
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
};

// Hook para invalidar cache de forma inteligente
export const useSmartCacheInvalidation = () => {
  const queryClient = useQueryClient();

  const invalidateStatic = () => {
    queryClient.invalidateQueries({ queryKey: OPTIMIZED_QUERY_KEYS.consultants });
    queryClient.invalidateQueries({ queryKey: OPTIMIZED_QUERY_KEYS.filiais });
  };

  const invalidateDynamic = () => {
    queryClient.invalidateQueries({ queryKey: OPTIMIZED_QUERY_KEYS.tasks });
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries();
  };

  const clearCache = () => {
    queryClient.clear();
  };

  return {
    invalidateStatic,
    invalidateDynamic,
    invalidateAll,
    clearCache,
  };
};