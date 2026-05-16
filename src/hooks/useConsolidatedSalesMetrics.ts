import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveFilialIdForFilter } from '@/lib/filialResolver';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  filialAtendida?: string;
  activity?: string;
}

export interface ConsolidatedMetrics {
  overview: {
    contacts: { count: number; value: number };
    prospects: { count: number; value: number };
    sales: { count: number; value: number };
    partialSales: { count: number; value: number };
    lostSales: { count: number; value: number };
  };
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

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Hook CONSOLIDADO — agora consome `get_activity_metrics_v2`.
 *
 * Fonte oficial:
 * - task_followups → contagens operacionais (activity_date / filial_id / responsible_user_id)
 * - tasks         → valores financeiros e status comercial
 *
 * Sem filtro hardcoded de 90 dias. Sem uso de created_at para análise operacional.
 */
export const useConsolidatedSalesMetrics = (filters?: SalesFilters) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { role, isSupervisor } = useUserRole();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[useConsolidatedSalesMetrics] hook render', {
      userId: user?.id ?? null,
      role,
      isSupervisor,
      profileFilialId: profile?.filial_id ?? null,
      filters,
    });
  }

  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['consolidated-sales-metrics-v2', user?.id ?? null, filters],
    enabled: !!user?.id,
    queryFn: async () => {
      // Janela de datas: somente quando o usuário escolher um período explícito.
      // 'all' / undefined → sem corte (V2 aceita NULL).
      let p_start_date: string | null = null;
      let p_end_date: string | null = null;
      if (filters?.period && filters.period !== 'all') {
        const days = parseInt(filters.period, 10);
        if (!Number.isNaN(days) && days > 0) {
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - days);
          p_start_date = toIsoDate(start);
          p_end_date = toIsoDate(end);
        }
      }

      const p_filial_id = await resolveFilialIdForFilter(filters?.filial);
      const p_responsible_user_id =
        filters?.consultantId && filters.consultantId !== 'all'
          ? filters.consultantId
          : null;

      const rpcParams = {
        p_start_date,
        p_end_date,
        p_filial_id,
        p_responsible_user_id,
      };

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[useConsolidatedSalesMetrics] calling get_activity_metrics_v2', {
          userId: user?.id,
          role,
          isSupervisor,
          profileFilialId: profile?.filial_id,
          rpcParams,
        });
      }

      const { data, error: rpcError } = await supabase.rpc('get_activity_metrics_v2', rpcParams);

      if (rpcError) {
        // eslint-disable-next-line no-console
        console.error('[useConsolidatedSalesMetrics] ❌ Erro RPC get_activity_metrics_v2', {
          rpcError,
          rpcParams,
          userId: user?.id,
        });
        throw rpcError;
      }

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[useConsolidatedSalesMetrics] raw payload', {
          rawDataType: typeof data,
          rawDataIsArray: Array.isArray(data),
          rawDataKeys: data && typeof data === 'object' ? Object.keys(data as any) : null,
          rawData: data,
        });
      }

      // Defensive: alguns drivers podem devolver jsonb embrulhado em array
      let payload: any = data;
      if (Array.isArray(payload)) {
        payload = payload[0] ?? {};
        // eslint-disable-next-line no-console
        console.warn('[useConsolidatedSalesMetrics] ⚠️ rawData veio como array, desembrulhando primeiro item', payload);
      }
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
        // eslint-disable-next-line no-console
        console.warn('[useConsolidatedSalesMetrics] ⚠️ rawData veio como string JSON, parseando');
      }

      const r = (payload ?? {}) as Record<string, unknown>;
      const num = (k: string) => {
        const v = r[k];
        const n = typeof v === 'string' ? Number(v) : (v as number);
        return Number.isFinite(n) ? Number(n) : 0;
      };

      const visitas = num('visitas');
      const ligacoes = num('ligacoes');
      const checklists = num('checklists');

      const vendasGanhasCount = num('sales_total_count');
      const vendasGanhasValue = num('sales_total_value');
      const vendasParciaisCount = num('sales_partial_count');
      const vendasParciaisValue = num('sales_partial_value');
      const vendasPerdidasCount = num('sales_lost_count');
      const vendasPerdidasValue = num('sales_lost_value');
      const prospectsCount = num('prospect_open_count');
      const prospectsValue = num('prospect_open_value');

      const totalContatos = visitas + checklists + ligacoes;
      const totalVendas = vendasGanhasCount + vendasParciaisCount;
      const taxaConversao = totalContatos > 0 ? (totalVendas / totalContatos) * 100 : 0;

      const result: ConsolidatedMetrics = {
        overview: {
          contacts:     { count: totalContatos,        value: 0 },
          prospects:    { count: prospectsCount,       value: prospectsValue },
          sales:        { count: vendasGanhasCount,    value: vendasGanhasValue },
          partialSales: { count: vendasParciaisCount,  value: vendasParciaisValue },
          lostSales:    { count: vendasPerdidasCount,  value: vendasPerdidasValue },
        },
        funnel: {
          visitas:              { count: visitas,    value: 0 },
          checklists:           { count: checklists, value: 0 },
          ligacoes:             { count: ligacoes,   value: 0 },
          totalContatos,
          prospeccoesAbertas:   { count: prospectsCount,                            value: prospectsValue },
          prospeccoesFechadas:  { count: vendasGanhasCount + vendasParciaisCount,   value: vendasGanhasValue + vendasParciaisValue },
          prospeccoesPerdidas:  { count: vendasPerdidasCount,                       value: vendasPerdidasValue },
          totalProspeccoes:     prospectsCount,
          vendasTotal:          { count: vendasGanhasCount,   value: vendasGanhasValue },
          vendasParcial:        { count: vendasParciaisCount, value: vendasParciaisValue },
          totalVendas,
          taxaConversao,
        },
      };

      // eslint-disable-next-line no-console
      console.log('[useConsolidatedSalesMetrics] 🧮 transformedMetrics', {
        parsedNumbers: {
          visitas, ligacoes, checklists,
          vendasGanhasCount, vendasGanhasValue,
          vendasParciaisCount, vendasParciaisValue,
          vendasPerdidasCount, vendasPerdidasValue,
          prospectsCount, prospectsValue,
          totalContatos, totalVendas, taxaConversao,
        },
        overview: result.overview,
        funnel: result.funnel,
      });

      return result;
    },
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: 1,
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
