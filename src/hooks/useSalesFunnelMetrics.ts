import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesFunnelMetrics {
  // Contatos com clientes
  visitas: { count: number; value: number };
  checklists: { count: number; value: number };
  ligacoes: { count: number; value: number };
  totalContatos: number;
  
  // Prospecções
  prospeccoesAbertas: { count: number; value: number };
  prospeccoesFechadas: { count: number; value: number };
  prospeccoesPerdidas: { count: number; value: number };
  totalProspeccoes: number;
  
  // Vendas
  vendasTotal: { count: number; value: number };
  vendasParcial: { count: number; value: number };
  totalVendas: number;
  
  // Taxa de conversão
  taxaConversao: number;
  
  // Legacy para compatibilidade
  contacts: { count: number; value: number };
  prospects: { count: number; value: number };
  sales: { count: number; value: number };
  partialSales: { count: number; value: number };
  lostSales: { count: number; value: number };
}

/**
 * Hook para buscar métricas do funil de vendas de forma independente
 * Usa queries otimizadas com COUNT e SUM em uma única consulta
 */
export const useSalesFunnelMetrics = () => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-funnel-metrics'],
    queryFn: async () => {
      console.log('🔄 Buscando métricas detalhadas do funil de vendas...');
      
      // Queries para contatos com clientes (visitas, checklists, ligações)
      const [visitasData, checklistsData, ligacoesData] = await Promise.all([
        // Visitas
        supabase.from('tasks')
          .select('sales_value')
          .eq('task_type', 'prospection'),
        
        // Checklists
        supabase.from('tasks')
          .select('sales_value')
          .eq('task_type', 'checklist'),
        
        // Ligações
        supabase.from('tasks')
          .select('sales_value')
          .eq('task_type', 'ligacao')
      ]);

      if (visitasData.error) throw visitasData.error;
      if (checklistsData.error) throw checklistsData.error;
      if (ligacoesData.error) throw ligacoesData.error;

      // Queries para prospecções
      const [prospeccoesAbertasData, prospeccoesDechadasData, prospeccoesPerdidasData] = await Promise.all([
        // Prospecções abertas
        supabase.from('tasks')
          .select('sales_value')
          .eq('is_prospect', true)
          .or('sales_confirmed.is.null,sales_confirmed.eq.false'),
        
        // Prospecções fechadas (ganhas)
        supabase.from('tasks')
          .select('sales_value')
          .eq('is_prospect', true)
          .eq('sales_type', 'ganho'),
        
        // Prospecções perdidas
        supabase.from('tasks')
          .select('sales_value')
          .eq('is_prospect', true)
          .eq('sales_type', 'perdido')
      ]);

      if (prospeccoesAbertasData.error) throw prospeccoesAbertasData.error;
      if (prospeccoesDechadasData.error) throw prospeccoesDechadasData.error;
      if (prospeccoesPerdidasData.error) throw prospeccoesPerdidasData.error;

      // Queries para vendas
      const [vendasTotalData, vendasParcialData] = await Promise.all([
        // Vendas totais
        supabase.from('tasks')
          .select('sales_value')
          .eq('sales_confirmed', true)
          .eq('sales_type', 'ganho'),
        
        // Vendas parciais
        supabase.from('tasks')
          .select('partial_sales_value')
          .eq('sales_confirmed', true)
          .eq('sales_type', 'parcial')
      ]);

      if (vendasTotalData.error) throw vendasTotalData.error;
      if (vendasParcialData.error) throw vendasParcialData.error;

      // Calcular valores
      const calcularValor = (data: any[]) => {
        return data.reduce((sum, task) => {
          const value = typeof task.sales_value === 'number' 
            ? task.sales_value 
            : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);
          return sum + value;
        }, 0);
      };

      const visitasValue = calcularValor(visitasData.data || []);
      const checklistsValue = calcularValor(checklistsData.data || []);
      const ligacoesValue = calcularValor(ligacoesData.data || []);
      
      const prospeccoesAbertasValue = calcularValor(prospeccoesAbertasData.data || []);
      const prospeccoesDechadasValue = calcularValor(prospeccoesDechadasData.data || []);
      const prospeccoesPerdidasValue = calcularValor(prospeccoesPerdidasData.data || []);
      
      const vendasTotalValue = calcularValor(vendasTotalData.data || []);
      const vendasParcialValue = (vendasParcialData.data || []).reduce((sum, task) => 
        sum + (task.partial_sales_value || 0), 0);

      // Totalizadores
      const totalContatos = (visitasData.data?.length || 0) + 
                           (checklistsData.data?.length || 0) + 
                           (ligacoesData.data?.length || 0);
      
      const totalProspeccoes = (prospeccoesAbertasData.data?.length || 0) + 
                              (prospeccoesDechadasData.data?.length || 0) + 
                              (prospeccoesPerdidasData.data?.length || 0);
      
      const totalVendas = (vendasTotalData.data?.length || 0) + 
                         (vendasParcialData.data?.length || 0);

      const taxaConversao = totalContatos > 0 ? (totalVendas / totalContatos) * 100 : 0;

      const result: SalesFunnelMetrics = {
        // Contatos com clientes
        visitas: {
          count: visitasData.data?.length || 0,
          value: visitasValue
        },
        checklists: {
          count: checklistsData.data?.length || 0,
          value: checklistsValue
        },
        ligacoes: {
          count: ligacoesData.data?.length || 0,
          value: ligacoesValue
        },
        totalContatos,
        
        // Prospecções
        prospeccoesAbertas: {
          count: prospeccoesAbertasData.data?.length || 0,
          value: prospeccoesAbertasValue
        },
        prospeccoesFechadas: {
          count: prospeccoesDechadasData.data?.length || 0,
          value: prospeccoesDechadasValue
        },
        prospeccoesPerdidas: {
          count: prospeccoesPerdidasData.data?.length || 0,
          value: prospeccoesPerdidasValue
        },
        totalProspeccoes,
        
        // Vendas
        vendasTotal: {
          count: vendasTotalData.data?.length || 0,
          value: vendasTotalValue
        },
        vendasParcial: {
          count: vendasParcialData.data?.length || 0,
          value: vendasParcialValue
        },
        totalVendas,
        
        // Taxa de conversão
        taxaConversao,
        
        // Legacy para compatibilidade
        contacts: {
          count: totalContatos,
          value: visitasValue + checklistsValue + ligacoesValue
        },
        prospects: {
          count: prospeccoesAbertasData.data?.length || 0,
          value: prospeccoesAbertasValue
        },
        sales: {
          count: vendasTotalData.data?.length || 0,
          value: vendasTotalValue
        },
        partialSales: {
          count: vendasParcialData.data?.length || 0,
          value: vendasParcialValue
        },
        lostSales: {
          count: prospeccoesPerdidasData.data?.length || 0,
          value: prospeccoesPerdidasValue
        }
      };

      console.log('✅ Métricas detalhadas do funil carregadas:', result);
      return result;
    },
    staleTime: 30000,
    gcTime: 300000
  });

  return {
    metrics: metrics || {
      visitas: { count: 0, value: 0 },
      checklists: { count: 0, value: 0 },
      ligacoes: { count: 0, value: 0 },
      totalContatos: 0,
      prospeccoesAbertas: { count: 0, value: 0 },
      prospeccoesFechadas: { count: 0, value: 0 },
      prospeccoesPerdidas: { count: 0, value: 0 },
      totalProspeccoes: 0,
      vendasTotal: { count: 0, value: 0 },
      vendasParcial: { count: 0, value: 0 },
      totalVendas: 0,
      taxaConversao: 0,
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
