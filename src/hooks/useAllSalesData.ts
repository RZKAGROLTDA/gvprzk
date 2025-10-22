import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export const useAllSalesData = () => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-metrics'],
    queryFn: async () => {
      console.log('🔄 Buscando métricas de vendas com agregações...');
      
      // Query 1: Contatos (todas as tasks sem venda confirmada e sem prospect)
      const { count: contactsCount, error: contactsError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .not('sales_confirmed', 'eq', true)
        .not('is_prospect', 'eq', true);

      if (contactsError) throw contactsError;

      // Query 2: Contatos - Valor total
      const { data: contactsValue, error: contactsValueError } = await supabase
        .from('tasks')
        .select('sales_value')
        .not('sales_confirmed', 'eq', true)
        .not('is_prospect', 'eq', true);

      if (contactsValueError) throw contactsValueError;

      const totalContactsValue = (contactsValue || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      // Query 3: Prospects (is_prospect = true)
      const { count: prospectsCount, error: prospectsError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('is_prospect', true);

      if (prospectsError) throw prospectsError;

      // Query 4: Prospects - Valor total
      const { data: prospectsValue, error: prospectsValueError } = await supabase
        .from('tasks')
        .select('sales_value')
        .eq('is_prospect', true);

      if (prospectsValueError) throw prospectsValueError;

      const totalProspectsValue = (prospectsValue || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      // Query 5: Vendas totais (sales_type = 'ganho' ou sales_confirmed = true e sales_type != 'parcial')
      const { count: salesCount, error: salesError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('sales_confirmed', true)
        .neq('sales_type', 'parcial');

      if (salesError) throw salesError;

      // Query 6: Vendas totais - Valor
      const { data: salesValue, error: salesValueError } = await supabase
        .from('tasks')
        .select('sales_value')
        .eq('sales_confirmed', true)
        .neq('sales_type', 'parcial');

      if (salesValueError) throw salesValueError;

      const totalSalesValue = (salesValue || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      // Query 7: Vendas parciais (sales_type = 'parcial' e sales_confirmed = true)
      const { count: partialSalesCount, error: partialSalesError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('sales_confirmed', true)
        .eq('sales_type', 'parcial');

      if (partialSalesError) throw partialSalesError;

      // Query 8: Vendas parciais - Valor (usar partial_sales_value)
      const { data: partialSalesValue, error: partialSalesValueError } = await supabase
        .from('tasks')
        .select('partial_sales_value')
        .eq('sales_confirmed', true)
        .eq('sales_type', 'parcial');

      if (partialSalesValueError) throw partialSalesValueError;

      const totalPartialSalesValue = (partialSalesValue || []).reduce((sum, task) => {
        return sum + (task.partial_sales_value || 0);
      }, 0);

      // Query 9: Vendas perdidas (sales_type = 'perdido' ou sales_status = 'lost')
      const { count: lostSalesCount, error: lostSalesError } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or('sales_type.eq.perdido,sales_status.eq.lost');

      if (lostSalesError) throw lostSalesError;

      // Query 10: Vendas perdidas - Valor
      const { data: lostSalesValue, error: lostSalesValueError } = await supabase
        .from('tasks')
        .select('sales_value')
        .or('sales_type.eq.perdido,sales_status.eq.lost');

      if (lostSalesValueError) throw lostSalesValueError;

      const totalLostSalesValue = (lostSalesValue || []).reduce((sum, task) => {
        const value = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
        return sum + value;
      }, 0);

      const metrics: SalesMetrics = {
        contacts: {
          count: contactsCount || 0,
          value: totalContactsValue
        },
        prospects: {
          count: prospectsCount || 0,
          value: totalProspectsValue
        },
        sales: {
          count: salesCount || 0,
          value: totalSalesValue
        },
        partialSales: {
          count: partialSalesCount || 0,
          value: totalPartialSalesValue
        },
        lostSales: {
          count: lostSalesCount || 0,
          value: totalLostSalesValue
        }
      };

      console.log('✅ Métricas carregadas:', metrics);
      return metrics;
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
