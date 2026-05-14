import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveFilialIdForFilter } from '@/lib/filialResolver';

export interface TasksMetricsV2Filters {
  period?: string;
  filial?: string;
  consultantId?: string;
}

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
const periodToRange = (period?: string) => {
  if (!period || period === 'all') return { start: null, end: null };
  const days = parseInt(period, 10);
  if (Number.isNaN(days) || days <= 0) return { start: null, end: null };
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: toIsoDate(start), end: toIsoDate(end) };
};

/**
 * Fonte oficial de métricas de tarefas operacionais — `get_tasks_metrics_v2`.
 * Sempre baseado em activity_date (NUNCA created_at).
 */
export const useTasksMetricsV2 = (filters?: TasksMetricsV2Filters) => {
  return useQuery({
    queryKey: ['tasks-metrics-v2', filters],
    queryFn: async () => {
      const { start, end } = periodToRange(filters?.period);
      const p_filial_id = await resolveFilialIdForFilter(filters?.filial);
      const p_responsible_user_id =
        filters?.consultantId && filters.consultantId !== 'all'
          ? filters.consultantId
          : null;

      const { data, error } = await supabase.rpc('get_tasks_metrics_v2', {
        p_start_date: start,
        p_end_date: end,
        p_filial_id,
        p_responsible_user_id,
      });
      if (error) throw error;
      const r = (data ?? {}) as {
        total?: number;
        unique_tasks?: number;
        by_type?: Record<string, number>;
        by_status?: Record<string, number>;
      };
      return {
        total: r.total ?? 0,
        unique_tasks: r.unique_tasks ?? 0,
        by_type: r.by_type ?? {},
        by_status: r.by_status ?? {},
      };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
