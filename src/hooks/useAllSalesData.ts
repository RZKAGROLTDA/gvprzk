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
      console.log('🔄 Buscando métricas de vendas (Visão Geral) com RLS...', filters);
      
      // Construir filtros uma vez
      const periodFilter = filters?.period && filters.period !== 'all' 
        ? new Date(Date.now() - parseInt(filters.period) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Usar função RPC segura para tasks (respeita RLS)
      const { data: allTasks, error: tasksError } = await supabase
        .rpc('get_secure_tasks_with_customer_protection');
      
      if (tasksError) throw tasksError;

      // Aplicar filtros localmente
      let tasksData = allTasks || [];
      
      if (periodFilter) {
        tasksData = tasksData.filter(task => task.created_at >= periodFilter);
      }
      if (filters?.consultantId && filters.consultantId !== 'all') {
        tasksData = tasksData.filter(task => task.created_by === filters.consultantId);
      }
      if (filters?.filial && filters.filial !== 'all') {
        tasksData = tasksData.filter(task => task.filial === filters.filial);
      }
      if (filters?.activity && filters.activity !== 'all') {
        tasksData = tasksData.filter(task => task.task_type === filters.activity);
      }

      // Buscar opportunities (já tem RLS configurado)
      let opportunitiesQuery = supabase
        .from('opportunities')
        .select('id, task_id, status, valor_total_oportunidade, valor_venda_fechada, filial, created_at')
        .limit(500);

      if (periodFilter) {
        opportunitiesQuery = opportunitiesQuery.gte('created_at', periodFilter);
      }
      if (filters?.filial && filters.filial !== 'all') {
        opportunitiesQuery = opportunitiesQuery.eq('filial', filters.filial);
      }

      const { data: opportunitiesData, error: oppError } = await opportunitiesQuery;
      
      if (oppError) throw oppError;

      // Processar dados localmente (mais eficiente que múltiplas queries)
      const result: SalesMetrics = {
        contacts: { count: 0, value: 0 },
        prospects: { count: 0, value: 0 },
        sales: { count: 0, value: 0 },
        partialSales: { count: 0, value: 0 },
        lostSales: { count: 0, value: 0 }
      };

      // Processar tasks
      const taskIds = new Set<string>();
      tasksData?.forEach(task => {
        taskIds.add(task.id);
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

      // Processar opportunities que NÃO têm task correspondente (ou somar independentemente)
      opportunitiesData?.forEach(opp => {
        // Se a opportunity não tem task_id nas tasks carregadas, contar separadamente
        if (!opp.task_id || !taskIds.has(opp.task_id)) {
          const oppValue = opp.valor_total_oportunidade || 0;
          
          if (opp.status === 'Venda Total') {
            result.sales.count++;
            result.sales.value += (opp.valor_venda_fechada || oppValue);
          } else if (opp.status === 'Venda Parcial') {
            result.partialSales.count++;
            result.partialSales.value += (opp.valor_venda_fechada || 0);
          } else if (opp.status === 'Perdido') {
            result.lostSales.count++;
            result.lostSales.value += oppValue;
          } else if (opp.status === 'Prospect') {
            result.prospects.count++;
            result.prospects.value += oppValue;
          } else {
            // Default: contato
            result.contacts.count++;
            result.contacts.value += oppValue;
          }
        }
      });

      console.log('✅ Métricas carregadas (1 query ao invés de 10):', result);
      return result;
    },
    staleTime: 10 * 60 * 1000, // 10 minutos - OTIMIZAÇÃO: slow queries opportunities
    gcTime: 30 * 60 * 1000, // 30 minutos
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
