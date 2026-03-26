import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  filialAtendida?: string;
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
 * Hook CONSOLIDADO para métricas de vendas.
 * Toda a agregação acontece no banco via RPCs dedicados — nenhuma linha bruta
 * é transferida para o cliente só para ser somada em JS.
 */
export const useConsolidatedSalesMetrics = (filters?: SalesFilters) => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['consolidated-sales-metrics', filters],
    queryFn: async () => {
      // Helper: janela de datas
      // Sem período selecionado → padrão de 90 dias (igual ao useInfiniteSalesData)
      // para manter consistência entre os cards de métricas e a tabela
      const getDateParams = () => {
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - daysAgo);
          return {
            p_start_date: start.toISOString(),
            p_end_date: end.toISOString(),
          };
        }
        // Default: últimos 90 dias
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 90);
        return {
          p_start_date: start.toISOString(),
          p_end_date: end.toISOString(),
        };
      };

      // Helper: mapear filtro de atividade para task_type(s)
      const getActivityTaskTypes = (activity?: string): string[] | null => {
        if (!activity || activity === 'all') return null;
        if (activity === 'field_visit' || activity === 'prospection' || activity === 'visita')
          return ['prospection', 'visita'];
        return [activity];
      };

      const dateParams = getDateParams();
      const activityTaskTypes = getActivityTaskTypes(filters?.activity);

      // OTIMIZAÇÃO Disk IO: 1 RPC em vez de 6+ queries diretas em tasks
      const { data: row, error: rpcError } = await supabase.rpc('get_consolidated_sales_counts', {
        p_start_date: dateParams.p_start_date,
        p_end_date: dateParams.p_end_date,
        p_created_by: filters?.consultantId && filters.consultantId !== 'all' ? filters.consultantId : null,
        p_filial: filters?.filial && filters.filial !== 'all' ? filters.filial : null,
        p_filial_atendida: filters?.filialAtendida && filters.filialAtendida !== 'all' ? filters.filialAtendida : null,
        p_task_types: activityTaskTypes,
      });

      if (rpcError) throw rpcError;

      const r = (row?.[0] ?? {}) as {
        visitas_count?: number;
        ligacoes_count?: number;
        checklists_count?: number;
        prospects_count?: number;
        prospects_value?: number;
        vendas_ganhas_count?: number;
        vendas_ganhas_value?: number;
        vendas_parciais_count?: number;
        vendas_parciais_value?: number;
        vendas_perdidas_count?: number;
        vendas_perdidas_value?: number;
      };

      const visitasCount = Number(r.visitas_count ?? 0);
      const ligacoesCount = Number(r.ligacoes_count ?? 0);
      const checklistsCount = Number(r.checklists_count ?? 0);
      const prospectsCount = Number(r.prospects_count ?? 0);
      const prospectsValue = Number(r.prospects_value ?? 0);
      const vendasGanhas = Number(r.vendas_ganhas_count ?? 0);
      const valorGanhas = Number(r.vendas_ganhas_value ?? 0);
      const vendasParciais = Number(r.vendas_parciais_count ?? 0);
      const valorParciais = Number(r.vendas_parciais_value ?? 0);
      const vendasPerdidas = Number(r.vendas_perdidas_count ?? 0);
      const valorPerdidas = Number(r.vendas_perdidas_value ?? 0);

      const totalContatos = visitasCount + checklistsCount + ligacoesCount;
      const totalVendas = vendasGanhas + vendasParciais;
      const taxaConversao = totalContatos > 0 ? (totalVendas / totalContatos) * 100 : 0;

      const result: ConsolidatedMetrics = {
        overview: {
          contacts:     { count: totalContatos,  value: 0 },
          prospects:    { count: prospectsCount, value: prospectsValue },
          sales:        { count: vendasGanhas,   value: valorGanhas },
          partialSales: { count: vendasParciais, value: valorParciais },
          lostSales:    { count: vendasPerdidas, value: valorPerdidas },
        },
        funnel: {
          visitas:              { count: visitasCount,    value: 0 },
          checklists:           { count: checklistsCount, value: 0 },
          ligacoes:             { count: ligacoesCount,   value: 0 },
          totalContatos,
          prospeccoesAbertas:   { count: prospectsCount,                  value: prospectsValue },
          prospeccoesFechadas:  { count: vendasGanhas + vendasParciais,   value: valorGanhas + valorParciais },
          prospeccoesPerdidas:  { count: vendasPerdidas,                  value: valorPerdidas },
          totalProspeccoes:     prospectsCount,
          vendasTotal:          { count: vendasGanhas,   value: valorGanhas },
          vendasParcial:        { count: vendasParciais, value: valorParciais },
          totalVendas,
          taxaConversao,
        },
      };

      return result;
    },
    staleTime: 10 * 60 * 1000, // 10 min - reduz refetch e Disk IO
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false, // usar cache existente
    refetchOnWindowFocus: false,
  });

  const defaultMetrics: ConsolidatedMetrics = {
    overview: {
      contacts:     { count: 0, value: 0 },
      prospects:    { count: 0, value: 0 },
      sales:        { count: 0, value: 0 },
      partialSales: { count: 0, value: 0 },
      lostSales:    { count: 0, value: 0 },
    },
    funnel: {
      visitas:             { count: 0, value: 0 },
      checklists:          { count: 0, value: 0 },
      ligacoes:            { count: 0, value: 0 },
      totalContatos:       0,
      prospeccoesAbertas:  { count: 0, value: 0 },
      prospeccoesFechadas: { count: 0, value: 0 },
      prospeccoesPerdidas: { count: 0, value: 0 },
      totalProspeccoes:    0,
      vendasTotal:         { count: 0, value: 0 },
      vendasParcial:       { count: 0, value: 0 },
      totalVendas:         0,
      taxaConversao:       0,
    },
  };

  return {
    metrics: metrics || defaultMetrics,
    isLoading,
    error,
    refetch,
  };
};
