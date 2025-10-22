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
      console.log('🔄 Buscando métricas de vendas (Visão Geral)...');
      
      // Usar a mesma função RPC otimizada
      const { data: counts, error: countsError } = await supabase
        .rpc('get_sales_funnel_counts');

      if (countsError) {
        console.error('❌ Erro ao buscar counts:', countsError);
        throw countsError;
      }

      // Queries para valores
      const [contactsValue, prospectsValue, salesValue, partialSalesValue, lostSalesValue] = await Promise.all([
        // Contatos - valor
        supabase.from('tasks')
          .select('sales_value')
          .or('sales_confirmed.is.null,sales_confirmed.eq.false')
          .or('is_prospect.is.null,is_prospect.eq.false'),
        
        // Prospects - valor
        supabase.from('tasks')
          .select('sales_value')
          .eq('is_prospect', true),
        
        // Vendas - valor
        supabase.from('tasks')
          .select('sales_value')
          .eq('sales_confirmed', true)
          .or('sales_type.is.null,sales_type.neq.parcial'),
        
        // Vendas parciais - valor
        supabase.from('tasks')
          .select('partial_sales_value')
          .eq('sales_confirmed', true)
          .eq('sales_type', 'parcial'),
        
        // Vendas perdidas - valor
        supabase.from('tasks')
          .select('sales_value')
          .or('sales_type.eq.perdido,status.eq.lost')
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
          count: counts?.[0]?.contatos || 0,
          value: totalContactsValue
        },
        prospects: {
          count: counts?.[0]?.prospects || 0,
          value: totalProspectsValue
        },
        sales: {
          count: counts?.[0]?.vendas || 0,
          value: totalSalesValue
        },
        partialSales: {
          count: counts?.[0]?.vendas_parciais || 0,
          value: totalPartialSalesValue
        },
        lostSales: {
          count: counts?.[0]?.vendas_perdidas || 0,
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
