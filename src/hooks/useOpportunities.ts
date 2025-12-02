import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Opportunity {
  id: string;
  task_id: string;
  cliente_nome: string;
  filial: string;
  status: string;
  valor_total_oportunidade: number;
  valor_venda_fechada: number;
  data_criacao: string;
  data_fechamento: string | null;
  created_at: string;
  updated_at: string;
}

export const useOpportunities = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      if (!user) return [];

      console.log('🔍 [OPPORTUNITIES] Buscando opportunities...');
      
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('data_criacao', { ascending: false });

      if (error) {
        console.error('❌ [OPPORTUNITIES] Erro ao buscar:', error);
        throw error;
      }

      console.log('✅ [OPPORTUNITIES] Carregadas:', data?.length || 0);
      return (data || []) as Opportunity[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutos - OTIMIZAÇÃO: slow queries opportunities
    gcTime: 30 * 60 * 1000, // 30 minutos
    refetchOnWindowFocus: false, // OTIMIZAÇÃO: reduzir queries
    refetchOnMount: false, // OTIMIZAÇÃO: usar cache existente
    enabled: !!user,
  });
};
