import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveFilialIdForFilter } from '@/lib/filialResolver';

export interface FunnelV2Filters {
  period?: string;            // '7' | '30' | '90' | '365' | 'all'
  filial?: string;            // name | uuid | 'all'
  consultantId?: string;      // uuid | 'all'
}

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

const periodToRange = (period?: string): { start: string | null; end: string | null } => {
  if (!period || period === 'all') return { start: null, end: null };
  const days = parseInt(period, 10);
  if (Number.isNaN(days) || days <= 0) return { start: null, end: null };
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: toIsoDate(start), end: toIsoDate(end) };
};

/**
 * Fonte oficial do Funil — `get_funnel_metrics_v2`.
 * Operacional: task_followups | Comercial/Financeiro: tasks + opportunities.
 * Contrato único (p_start_date, p_end_date, p_filial_id, p_responsible_user_id).
 */
export const useFunnelMetricsV2 = (filters?: FunnelV2Filters) => {
  return useQuery({
    queryKey: ['funnel-metrics-v2', filters],
    queryFn: async () => {
      const { start, end } = periodToRange(filters?.period);
      const p_filial_id = await resolveFilialIdForFilter(filters?.filial);
      const p_responsible_user_id =
        filters?.consultantId && filters.consultantId !== 'all'
          ? filters.consultantId
          : null;

      const { data, error } = await supabase.rpc('get_funnel_metrics_v2', {
        p_start_date: start,
        p_end_date: end,
        p_filial_id,
        p_responsible_user_id,
      });
      if (error) throw error;
      return (data ?? {}) as Record<string, any>;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
