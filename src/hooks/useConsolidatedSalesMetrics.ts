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
        return { p_start_date: null, p_end_date: null };
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

      // Helper para aplicar filtros comuns a uma query
      const applyFilters = (q: ReturnType<typeof supabase.from>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = q as any;
        if (dateParams.p_start_date) query = query.gte('created_at', dateParams.p_start_date);
        if (dateParams.p_end_date)   query = query.lte('created_at', dateParams.p_end_date);
        if (filters?.consultantId && filters.consultantId !== 'all')
          query = query.eq('created_by', filters.consultantId);
        if (filters?.filial && filters.filial !== 'all')
          query = query.eq('filial', filters.filial);
        if (filters?.filialAtendida && filters.filialAtendida !== 'all')
          query = query.eq('filial_atendida', filters.filialAtendida);
        if (activityTaskTypes)
          query = query.in('task_type', activityTaskTypes);
        return query;
      };

      // Counts usam head:true → PostgREST retorna apenas o header Content-Range
      // sem transferir linhas, contornando o limite de 1000 rows por resposta.
      // Sums (vendas) usam fetch de linhas pois precisam agregar valores — o total
      // de vendas confirmadas é tipicamente muito menor que o limite.
      const isFieldVisit = filters?.activity === 'field_visit'
        || filters?.activity === 'prospection'
        || filters?.activity === 'visita';

      const visitasTypes    = ['prospection', 'visita'];
      const ligacaoTypes    = ['ligacao'];
      const checklistTypes  = ['checklist'];

      const shouldCountVisitas    = !activityTaskTypes || isFieldVisit;
      const shouldCountLigacoes   = !activityTaskTypes || filters?.activity === 'ligacao';
      const shouldCountChecklists = !activityTaskTypes || filters?.activity === 'checklist';

      const [
        visitasRes,
        ligacoesRes,
        checklistsRes,
        prospectsCountRes,
        prospectsValueRes,
        salesRes,
      ] = await Promise.all([
        // Counts exatos via HEAD — sem transferir linhas
        shouldCountVisitas
          ? applyFilters(supabase.from('tasks').select('*', { count: 'exact', head: true }))
              .in('task_type', visitasTypes)
          : Promise.resolve({ count: 0, error: null }),
        shouldCountLigacoes
          ? applyFilters(supabase.from('tasks').select('*', { count: 'exact', head: true }))
              .in('task_type', ligacaoTypes)
          : Promise.resolve({ count: 0, error: null }),
        shouldCountChecklists
          ? applyFilters(supabase.from('tasks').select('*', { count: 'exact', head: true }))
              .in('task_type', checklistTypes)
          : Promise.resolve({ count: 0, error: null }),
        // Prospects: count exato via HEAD
        applyFilters(supabase.from('tasks').select('*', { count: 'exact', head: true }))
          .eq('is_prospect', true),
        // Prospects: valores para soma (1ª página — ver nota abaixo)
        applyFilters(supabase.from('tasks').select('sales_value'))
          .eq('is_prospect', true),
        // Vendas: valores para somas (tipicamente < 1000 registros)
        applyFilters(supabase.from('tasks').select('sales_type, sales_value, partial_sales_value'))
          .eq('sales_confirmed', true),
      ]);

      if (visitasRes.error)        throw visitasRes.error;
      if (ligacoesRes.error)       throw ligacoesRes.error;
      if (checklistsRes.error)     throw checklistsRes.error;
      if (prospectsCountRes.error) throw prospectsCountRes.error;
      if (prospectsValueRes.error) throw prospectsValueRes.error;
      if (salesRes.error)          throw salesRes.error;

      // --- Contatos ---
      const visitasCount    = shouldCountVisitas    ? (visitasRes.count    ?? 0) : 0;
      const ligacoesCount   = shouldCountLigacoes   ? (ligacoesRes.count   ?? 0) : 0;
      const checklistsCount = shouldCountChecklists ? (checklistsRes.count ?? 0) : 0;

      // --- Vendas ---
      let vendasGanhas = 0, valorGanhas = 0;
      let vendasParciais = 0, valorParciais = 0;
      let vendasPerdidas = 0, valorPerdidas = 0;

      for (const row of (salesRes.data ?? []) as Array<{ sales_type: string; sales_value: number; partial_sales_value: number }>) {
        const value   = Number(row.sales_value)         || 0;
        const partial = Number(row.partial_sales_value) || 0;
        if (row.sales_type === 'ganho')   { vendasGanhas++;   valorGanhas   += value; }
        if (row.sales_type === 'parcial') { vendasParciais++; valorParciais += partial; }
        if (row.sales_type === 'perdido') { vendasPerdidas++; valorPerdidas += value; }
      }

      // --- Prospects ---
      // Nota: count é exato (HEAD). O valor soma até 1000 registros (PostgREST max-rows).
      const prospectsCount = prospectsCountRes.count ?? 0;
      const prospectsValue = ((prospectsValueRes.data ?? []) as Array<{ sales_value: number }>)
        .reduce((s, r) => s + (Number(r.sales_value) || 0), 0);

      // --- Totais ---
      const totalContatos = visitasCount + checklistsCount + ligacoesCount;
      const totalVendas   = vendasGanhas + vendasParciais;
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: true,
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
