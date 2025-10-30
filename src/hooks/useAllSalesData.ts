import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

export interface SalesMetrics {
  contacts: {
    count: number;
    value: number;
  };
  prospects: {
    count: number;
    value: number;
  };
  sales: {
    count: number;
    value: number;
  };
  partialSales: {
    count: number;
    value: number;
  };
  lostSales: {
    count: number;
    value: number;
  };
}

export const useAllSalesData = (filters?: SalesFilters) => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-metrics', filters],
    queryFn: async () => {
      console.log('🔄 Buscando métricas de vendas (Visão Geral)...', filters);
      
      // Construir filtros uma vez
      const periodFilter = filters?.period && filters.period !== 'all' 
        ? new Date(Date.now() - parseInt(filters.period) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // OTIMIZAÇÃO: Query única ao invés de 10 queries separadas
      let query = supabase
        .from('tasks')
        .select('sales_value, partial_sales_value, sales_confirmed, is_prospect, sales_type, status, created_by, task_type, filial, created_at');

      // Aplicar filtros globais
      if (periodFilter) {
        query = query.gte('created_at', periodFilter);
      }
      if (filters?.consultantId && filters.consultantId !== 'all') {
        query = query.eq('created_by', filters.consultantId);
      }
      if (filters?.filial && filters.filial !== 'all') {
        query = query.eq('filial', filters.filial);
      }
      if (filters?.activity && filters.activity !== 'all') {
        query = query.eq('task_type', filters.activity);
      }

      const { data, error: queryError } = await query;
      
      if (queryError) throw queryError;

      // Processar dados localmente (mais eficiente que múltiplas queries)
      const result: SalesMetrics = {
        contacts: { count: 0, value: 0 },
        prospects: { count: 0, value: 0 },
        sales: { count: 0, value: 0 },
        partialSales: { count: 0, value: 0 },
        lostSales: { count: 0, value: 0 }
      };

      data?.forEach(task => {
        const salesValue = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : parseFloat(task.sales_value || '0');
        
        const isLost = task.sales_type === 'perdido' || task.status === 'lost';
        const isPartial = task.sales_confirmed === true && task.sales_type === 'parcial';
        const isSale = task.sales_confirmed === true && task.sales_type !== 'parcial' && !isLost;
        const isProspect = task.is_prospect === true && !task.sales_confirmed;
        const isContact = !task.sales_confirmed && !task.is_prospect;

        if (isLost) {
          result.lostSales.count++;
          result.lostSales.value += salesValue;
        } else if (isPartial) {
          result.partialSales.count++;
          result.partialSales.value += (task.partial_sales_value || 0);
        } else if (isSale) {
          result.sales.count++;
          result.sales.value += salesValue;
        } else if (isProspect) {
          result.prospects.count++;
          result.prospects.value += salesValue;
        } else if (isContact) {
          result.contacts.count++;
          result.contacts.value += salesValue;
        }
      });

      console.log('✅ Métricas carregadas (1 query ao invés de 10):', result);
      return result;
    },
    staleTime: 2 * 60 * 1000, // 2 minutos (aumentado)
    gcTime: 10 * 60 * 1000, // 10 minutos (aumentado)
    refetchOnMount: false, // Não recarregar automaticamente
    refetchOnWindowFocus: false // Não recarregar ao focar janela
  });

  return {
    metrics: metrics || {
      contacts: { count: 0, value: 0 },
      prospects: { count: 0, value: 0 },
      sales: { count: 0, value: 0 },
      partialSales: { count: 0, value: 0 },
      lostSales: { count: 0, value: 0 }
    },
    isLoading,
    error,
    refetch
  };
};
