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
      
      // Helper para aplicar filtros
      const applyFilters = (query: any) => {
        // Filtro de período
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
          query = query.gte('created_at', cutoffDate.toISOString());
        }

        // Filtro de consultor - buscar pelo created_by
        if (filters?.consultantId && filters.consultantId !== 'all') {
          query = query.eq('created_by', filters.consultantId);
        }

        // Filtro de filial
        if (filters?.filial && filters.filial !== 'all') {
          query = query.eq('filial', filters.filial);
        }

        // Filtro de atividade
        if (filters?.activity && filters.activity !== 'all') {
          query = query.eq('task_type', filters.activity);
        }

        return query;
      };

      // Buscar counts com filtros
      let contactsQuery = supabase.from('tasks')
        .select('id', { count: 'exact', head: true })
        .or('sales_confirmed.is.null,sales_confirmed.eq.false')
        .or('is_prospect.is.null,is_prospect.eq.false');
      contactsQuery = applyFilters(contactsQuery);
      
      let prospectsQuery = supabase.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('is_prospect', true);
      prospectsQuery = applyFilters(prospectsQuery);
      
      let salesQuery = supabase.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('sales_confirmed', true)
        .or('sales_type.is.null,sales_type.neq.parcial');
      salesQuery = applyFilters(salesQuery);
      
      let partialSalesQuery = supabase.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('sales_confirmed', true)
        .eq('sales_type', 'parcial');
      partialSalesQuery = applyFilters(partialSalesQuery);
      
      let lostSalesQuery = supabase.from('tasks')
        .select('id', { count: 'exact', head: true })
        .or('sales_type.eq.perdido,status.eq.lost');
      lostSalesQuery = applyFilters(lostSalesQuery);

      // Queries para valores
      let contactsValueQuery = supabase.from('tasks')
        .select('sales_value')
        .or('sales_confirmed.is.null,sales_confirmed.eq.false')
        .or('is_prospect.is.null,is_prospect.eq.false');
      contactsValueQuery = applyFilters(contactsValueQuery);
      
      let prospectsValueQuery = supabase.from('tasks')
        .select('sales_value')
        .eq('is_prospect', true);
      prospectsValueQuery = applyFilters(prospectsValueQuery);
      
      let salesValueQuery = supabase.from('tasks')
        .select('sales_value')
        .eq('sales_confirmed', true)
        .or('sales_type.is.null,sales_type.neq.parcial');
      salesValueQuery = applyFilters(salesValueQuery);
      
      let partialSalesValueQuery = supabase.from('tasks')
        .select('partial_sales_value')
        .eq('sales_confirmed', true)
        .eq('sales_type', 'parcial');
      partialSalesValueQuery = applyFilters(partialSalesValueQuery);
      
      let lostSalesValueQuery = supabase.from('tasks')
        .select('sales_value')
        .or('sales_type.eq.perdido,status.eq.lost');
      lostSalesValueQuery = applyFilters(lostSalesValueQuery);

      const [contactsCount, prospectsCount, salesCount, partialSalesCount, lostSalesCount, contactsValue, prospectsValue, salesValue, partialSalesValue, lostSalesValue] = await Promise.all([
        contactsQuery,
        prospectsQuery,
        salesQuery,
        partialSalesQuery,
        lostSalesQuery,
        contactsValueQuery,
        prospectsValueQuery,
        salesValueQuery,
        partialSalesValueQuery,
        lostSalesValueQuery
      ]);

      if (contactsValue.error) throw contactsValue.error;
      if (prospectsValue.error) throw prospectsValue.error;
      if (salesValue.error) throw salesValue.error;
      if (partialSalesValue.error) throw partialSalesValue.error;
      if (lostSalesValue.error) throw lostSalesValue.error;

      // Calcular valores totais
      const totalContactsValue = (contactsValue.data || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      const totalProspectsValue = (prospectsValue.data || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      const totalSalesValue = (salesValue.data || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      const totalPartialSalesValue = (partialSalesValue.data || []).reduce((sum, task) => {
        return sum + (task.partial_sales_value || 0);
      }, 0);

      const totalLostSalesValue = (lostSalesValue.data || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      const result: SalesMetrics = {
        contacts: {
          count: contactsCount.count || 0,
          value: totalContactsValue
        },
        prospects: {
          count: prospectsCount.count || 0,
          value: totalProspectsValue
        },
        sales: {
          count: salesCount.count || 0,
          value: totalSalesValue
        },
        partialSales: {
          count: partialSalesCount.count || 0,
          value: totalPartialSalesValue
        },
        lostSales: {
          count: lostSalesCount.count || 0,
          value: totalLostSalesValue
        }
      };

      console.log('✅ Métricas carregadas (Visão Geral):', result);
      return result;
    },
    staleTime: 30000, // 30 segundos
    gcTime: 300000 // 5 minutos
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
