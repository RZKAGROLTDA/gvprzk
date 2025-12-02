import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

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
 * Hook OTIMIZADO para métricas do funil de vendas
 * ANTES: 9 queries separadas
 * AGORA: 2 queries (tasks + opportunities) com processamento local
 */
export const useSalesFunnelMetrics = (filters?: SalesFilters) => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-funnel-metrics', filters],
    queryFn: async () => {
      // Helper para aplicar filtros de data
      const getDateFilter = () => {
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
          return cutoffDate.toISOString();
        }
        return null;
      };

      const dateFilter = getDateFilter();

      // QUERY 1: Buscar TODAS as tasks necessárias em UMA única query
      let tasksQuery = supabase
        .from('tasks')
        .select('task_type, is_prospect, sales_type, sales_confirmed, sales_value, partial_sales_value, created_by, filial, created_at');
      
      if (dateFilter) {
        tasksQuery = tasksQuery.gte('created_at', dateFilter);
      }
      if (filters?.consultantId && filters.consultantId !== 'all') {
        tasksQuery = tasksQuery.eq('created_by', filters.consultantId);
      }
      if (filters?.filial && filters.filial !== 'all') {
        tasksQuery = tasksQuery.eq('filial', filters.filial);
      }
      if (filters?.activity && filters.activity !== 'all') {
        tasksQuery = tasksQuery.eq('task_type', filters.activity);
      }

      // QUERY 2: Buscar opportunities em UMA única query
      let opportunitiesQuery = supabase
        .from('opportunities')
        .select('status, valor_total_oportunidade, valor_venda_fechada, filial, created_at');
      
      if (dateFilter) {
        opportunitiesQuery = opportunitiesQuery.gte('created_at', dateFilter);
      }
      if (filters?.filial && filters.filial !== 'all') {
        opportunitiesQuery = opportunitiesQuery.eq('filial', filters.filial);
      }

      // Executar APENAS 2 queries em paralelo
      const [tasksResult, opportunitiesResult] = await Promise.all([
        tasksQuery,
        opportunitiesQuery
      ]);

      if (tasksResult.error) throw tasksResult.error;
      if (opportunitiesResult.error) throw opportunitiesResult.error;

      const tasks = tasksResult.data || [];
      const opportunities = opportunitiesResult.data || [];

      // PROCESSAMENTO LOCAL - sem mais queries

      // Filtrar tasks por tipo
      const visitas = tasks.filter(t => t.task_type === 'prospection');
      const checklists = tasks.filter(t => t.task_type === 'checklist');
      const ligacoes = tasks.filter(t => t.task_type === 'ligacao');

      // Filtrar prospecções
      const prospeccoesAbertas = tasks.filter(t => 
        t.is_prospect === true && (t.sales_confirmed === null || t.sales_confirmed === false)
      );
      const prospeccoesFechadas = tasks.filter(t => 
        t.is_prospect === true && t.sales_type === 'ganho'
      );
      const prospeccoesPerdidas = tasks.filter(t => 
        t.is_prospect === true && t.sales_type === 'perdido'
      );

      // Filtrar vendas
      const vendasTotal = tasks.filter(t => 
        t.sales_confirmed === true && t.sales_type === 'ganho'
      );
      const vendasParcial = tasks.filter(t => 
        t.sales_confirmed === true && t.sales_type === 'parcial'
      );

      // Separar opportunities por status
      const oppsProspect = opportunities.filter(o => o.status === 'Prospect');
      const oppsGanho = opportunities.filter(o => o.status === 'Venda Total');
      const oppsParcial = opportunities.filter(o => o.status === 'Venda Parcial');
      const oppsPerdido = opportunities.filter(o => o.status === 'Venda Perdida' || o.status === 'Perdido');

      // Helper para calcular valor
      const calcularValor = (data: any[], field = 'sales_value') => {
        return data.reduce((sum, item) => {
          const value = typeof item[field] === 'number' 
            ? item[field] 
            : (typeof item[field] === 'string' ? parseFloat(item[field]) || 0 : 0);
          return sum + value;
        }, 0);
      };

      // Calcular valores
      const visitasValue = calcularValor(visitas);
      const checklistsValue = calcularValor(checklists);
      const ligacoesValue = calcularValor(ligacoes);
      
      const prospeccoesAbertasValue = calcularValor(prospeccoesAbertas) +
        oppsProspect.reduce((sum, opp) => sum + (opp.valor_total_oportunidade || 0), 0);
      
      const prospeccoesDechadasValue = calcularValor(prospeccoesFechadas);
      const prospeccoesPerdidasValue = calcularValor(prospeccoesPerdidas) +
        oppsPerdido.reduce((sum, opp) => sum + (opp.valor_total_oportunidade || 0), 0);
      
      const vendasTotalValue = calcularValor(vendasTotal) +
        oppsGanho.reduce((sum, opp) => sum + (opp.valor_venda_fechada || opp.valor_total_oportunidade || 0), 0);
      
      const vendasParcialValue = calcularValor(vendasParcial, 'partial_sales_value') +
        oppsParcial.reduce((sum, opp) => sum + (opp.valor_venda_fechada || 0), 0);

      // Totalizadores
      const totalContatos = visitas.length + checklists.length + ligacoes.length;
      
      const totalProspeccoes = prospeccoesAbertas.length + prospeccoesFechadas.length + 
                              prospeccoesPerdidas.length + oppsProspect.length + oppsPerdido.length;
      
      const totalVendas = vendasTotal.length + vendasParcial.length + oppsGanho.length + oppsParcial.length;

      const taxaConversao = totalContatos > 0 ? (totalVendas / totalContatos) * 100 : 0;

      const result: SalesFunnelMetrics = {
        visitas: { count: visitas.length, value: visitasValue },
        checklists: { count: checklists.length, value: checklistsValue },
        ligacoes: { count: ligacoes.length, value: ligacoesValue },
        totalContatos,
        
        prospeccoesAbertas: {
          count: prospeccoesAbertas.length + oppsProspect.length,
          value: prospeccoesAbertasValue
        },
        prospeccoesFechadas: {
          count: prospeccoesFechadas.length,
          value: prospeccoesDechadasValue
        },
        prospeccoesPerdidas: {
          count: prospeccoesPerdidas.length + oppsPerdido.length,
          value: prospeccoesPerdidasValue
        },
        totalProspeccoes,
        
        vendasTotal: {
          count: vendasTotal.length + oppsGanho.length,
          value: vendasTotalValue
        },
        vendasParcial: {
          count: vendasParcial.length + oppsParcial.length,
          value: vendasParcialValue
        },
        totalVendas,
        taxaConversao,
        
        // Legacy
        contacts: {
          count: totalContatos,
          value: visitasValue + checklistsValue + ligacoesValue
        },
        prospects: {
          count: prospeccoesAbertas.length + oppsProspect.length,
          value: prospeccoesAbertasValue
        },
        sales: {
          count: vendasTotal.length + oppsGanho.length,
          value: vendasTotalValue
        },
        partialSales: {
          count: vendasParcial.length + oppsParcial.length,
          value: vendasParcialValue
        },
        lostSales: {
          count: prospeccoesPerdidas.length + oppsPerdido.length,
          value: prospeccoesPerdidasValue
        }
      };

      console.log('✅ Métricas detalhadas do funil carregadas:', result);
      return result;
    },
    staleTime: 10 * 60 * 1000, // 10 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos no cache
    refetchOnMount: false,
    refetchOnWindowFocus: false
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
