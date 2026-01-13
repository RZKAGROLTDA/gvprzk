import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

export interface ConsolidatedMetrics {
  // Métricas de visão geral (antigo useAllSalesData)
  overview: {
    contacts: { count: number; value: number };
    prospects: { count: number; value: number };
    sales: { count: number; value: number };
    partialSales: { count: number; value: number };
    lostSales: { count: number; value: number };
  };
  
  // Métricas detalhadas do funil (antigo useSalesFunnelMetrics)
  funnel: {
    visitas: { count: number; value: number };
    checklists: { count: number; value: number };
    ligacoes: { count: number; value: number };
    totalContatos: number;
    prospeccoesAbertas: { count: number; value: number };
    prospeccoesFechadas: { count: number; value: number };
    prospeccoesPerdidas: { count: number; value: number };
    totalProspeccoes: number;
    vendasTotal: { count: number; value: number };
    vendasParcial: { count: number; value: number };
    totalVendas: number;
    taxaConversao: number;
  };
}

/**
 * Hook CONSOLIDADO para métricas de vendas
 * OTIMIZADO: Usa o RPC get_reports_aggregated_stats (mais leve)
 * em vez de get_secure_tasks_paginated (que é usado pelo useInfiniteSalesData)
 */
export const useConsolidatedSalesMetrics = (filters?: SalesFilters) => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['consolidated-sales-metrics', filters],
    queryFn: async () => {
      // Helper para aplicar filtros de data
      const getDateParams = () => {
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - daysAgo);
          return {
            p_start_date: startDate.toISOString().split('T')[0],
            p_end_date: endDate.toISOString().split('T')[0]
          };
        }
        return { p_start_date: null, p_end_date: null };
      };

      const dateParams = getDateParams();

      // QUERY LEVE: Usar RPC agregado para stats básicas
      const { data: statsRaw, error: statsError } = await supabase
        .rpc('get_reports_aggregated_stats', {
          p_start_date: dateParams.p_start_date,
          p_end_date: dateParams.p_end_date,
          p_user_id: filters?.consultantId !== 'all' ? filters?.consultantId : null,
          p_filial: filters?.filial !== 'all' ? filters?.filial : null
        });

      if (statsError) {
        console.error('❌ Erro ao buscar stats agregadas:', statsError);
        throw statsError;
      }

      const stats = statsRaw?.[0] || {
        total_tasks: 0,
        visitas: 0,
        checklist: 0,
        ligacoes: 0,
        prospects: 0,
        prospects_value: 0,
        sales_value: 0
      };

      console.log('✅ Stats agregadas carregadas (RPC leve):', stats);

      // QUERY ADICIONAL: Buscar contagens detalhadas de vendas por tipo
      // Esta query é leve pois usa agregação no banco
      let salesQuery = supabase
        .from('tasks')
        .select('sales_type, sales_confirmed, sales_value, partial_sales_value, created_by, filial, created_at')
        .eq('sales_confirmed', true);

      // Aplicar filtros
      if (dateParams.p_start_date && dateParams.p_end_date) {
        salesQuery = salesQuery.gte('created_at', dateParams.p_start_date)
          .lte('created_at', `${dateParams.p_end_date}T23:59:59`);
      }
      if (filters?.consultantId && filters.consultantId !== 'all') {
        salesQuery = salesQuery.eq('created_by', filters.consultantId);
      }
      if (filters?.filial && filters.filial !== 'all') {
        salesQuery = salesQuery.eq('filial', filters.filial);
      }

      const { data: salesData, error: salesError } = await salesQuery;

      if (salesError) {
        console.error('❌ Erro ao buscar dados de vendas:', salesError);
        // Continuar sem os dados detalhados de vendas
      }

      // Calcular métricas detalhadas de vendas
      let vendasGanhas = 0, valorGanhas = 0;
      let vendasParciais = 0, valorParciais = 0;
      let vendasPerdidas = 0, valorPerdidas = 0;

      if (salesData) {
        for (const task of salesData) {
          const salesType = task.sales_type;
          const salesValue = Number(task.sales_value) || 0;
          const partialValue = Number(task.partial_sales_value) || 0;

          if (salesType === 'ganho') {
            vendasGanhas++;
            valorGanhas += salesValue;
          } else if (salesType === 'parcial') {
            vendasParciais++;
            valorParciais += partialValue; // Usar valor da venda parcial
          } else if (salesType === 'perdido') {
            vendasPerdidas++;
            valorPerdidas += salesValue;
          }
        }
      }

      console.log('✅ Vendas detalhadas:', {
        ganhas: { count: vendasGanhas, value: valorGanhas },
        parciais: { count: vendasParciais, value: valorParciais },
        perdidas: { count: vendasPerdidas, value: valorPerdidas }
      });

      // Calcular métricas baseadas nos dados agregados
      const totalContatos = stats.visitas + stats.checklist + stats.ligacoes;
      const totalVendas = vendasGanhas + vendasParciais; // Vendas = ganhas + parciais
      const taxaConversao = totalContatos > 0 ? (totalVendas / totalContatos) * 100 : 0;

      const result: ConsolidatedMetrics = {
        overview: {
          contacts: { count: totalContatos, value: 0 },
          prospects: { count: stats.prospects, value: Number(stats.prospects_value) || 0 },
          sales: { count: vendasGanhas, value: valorGanhas },
          partialSales: { count: vendasParciais, value: valorParciais },
          lostSales: { count: vendasPerdidas, value: valorPerdidas }
        },
        funnel: {
          visitas: { count: stats.visitas, value: 0 },
          checklists: { count: stats.checklist, value: 0 },
          ligacoes: { count: stats.ligacoes, value: 0 },
          totalContatos,
          prospeccoesAbertas: { count: stats.prospects, value: Number(stats.prospects_value) || 0 },
          prospeccoesFechadas: { count: vendasGanhas + vendasParciais, value: valorGanhas + valorParciais },
          prospeccoesPerdidas: { count: vendasPerdidas, value: valorPerdidas },
          totalProspeccoes: stats.prospects,
          vendasTotal: { count: vendasGanhas, value: valorGanhas },
          vendasParcial: { count: vendasParciais, value: valorParciais },
          totalVendas,
          taxaConversao
        }
      };

      return result;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  // Retornar valores default se não houver dados
  const defaultMetrics: ConsolidatedMetrics = {
    overview: {
      contacts: { count: 0, value: 0 },
      prospects: { count: 0, value: 0 },
      sales: { count: 0, value: 0 },
      partialSales: { count: 0, value: 0 },
      lostSales: { count: 0, value: 0 }
    },
    funnel: {
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
      taxaConversao: 0
    }
  };

  return {
    metrics: metrics || defaultMetrics,
    isLoading,
    error,
    refetch
  };
};
