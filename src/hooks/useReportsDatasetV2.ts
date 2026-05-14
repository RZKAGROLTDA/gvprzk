import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveFilialIdForFilter } from '@/lib/filialResolver';

export interface ReportsDatasetV2Filters {
  period?: string;
  filial?: string;
  consultantId?: string;
  limit?: number;
  offset?: number;
}

export interface ReportRowV2 {
  followup_id: string;
  task_id: string | null;
  activity_type: string;
  activity_date: string;
  followup_status: string;
  client_name: string;
  client_code: string | null;
  client_key: string;
  filial_id: string | null;
  responsible_user_id: string | null;
  followup_created_at: string;
  task_created_at: string | null;
  task_filial: string | null;
  task_filial_atendida: string | null;
  sales_type: string | null;
  sales_value: number | null;
  partial_sales_value: number | null;
  sales_confirmed: boolean | null;
  is_prospect: boolean | null;
  opp_status: string | null;
  valor_total_oportunidade: number | null;
  valor_venda_fechada: number | null;
  sale_date: string | null;
  opp_created_at: string | null;
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
 * Dataset oficial de Reports — `get_reports_dataset_v2`.
 * Uma linha por followup, com colunas explícitas:
 *   activity_date | task_created_at | sale_date | task_filial | task_filial_atendida.
 */
export const useReportsDatasetV2 = (filters?: ReportsDatasetV2Filters) => {
  return useQuery({
    queryKey: ['reports-dataset-v2', filters],
    queryFn: async () => {
      const { start, end } = periodToRange(filters?.period);
      const p_filial_id = await resolveFilialIdForFilter(filters?.filial);
      const p_responsible_user_id =
        filters?.consultantId && filters.consultantId !== 'all'
          ? filters.consultantId
          : null;

      const { data, error } = await supabase.rpc('get_reports_dataset_v2', {
        p_start_date: start,
        p_end_date: end,
        p_filial_id,
        p_responsible_user_id,
        p_limit: filters?.limit ?? 200,
        p_offset: filters?.offset ?? 0,
      });
      if (error) throw error;
      const r = (data ?? {}) as { total?: number; rows?: ReportRowV2[] };
      return { total: r.total ?? 0, rows: r.rows ?? [] };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
