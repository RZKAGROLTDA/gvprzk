import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveFilialIdForFilter } from '@/lib/filialResolver';

export interface ClientsOverviewV2Filters {
  period?: string;
  filial?: string;
  consultantId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ClientOverviewRow {
  client_key: string;
  client_name: string;
  client_code: string | null;
  filial_id: string | null;
  responsible_user_id: string | null;
  last_activity_date: string | null;
  last_visit_date: string | null;
  last_opportunity_date: string | null;
  total_activities: number;
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
 * Fonte oficial de clientes únicos — `get_clients_overview_v2`.
 * Chave única: COALESCE(NULLIF(client_code,''), LOWER(TRIM(client_name))).
 */
export const useClientsOverviewV2 = (filters?: ClientsOverviewV2Filters) => {
  return useQuery({
    queryKey: ['clients-overview-v2', filters],
    queryFn: async () => {
      const { start, end } = periodToRange(filters?.period);
      const p_filial_id = await resolveFilialIdForFilter(filters?.filial);
      const p_responsible_user_id =
        filters?.consultantId && filters.consultantId !== 'all'
          ? filters.consultantId
          : null;

      const { data, error } = await supabase.rpc('get_clients_overview_v2', {
        p_start_date: start,
        p_end_date: end,
        p_filial_id,
        p_responsible_user_id,
        p_search: filters?.search?.trim() || null,
        p_limit: filters?.limit ?? 100,
        p_offset: filters?.offset ?? 0,
      });
      if (error) throw error;
      const r = (data ?? {}) as { total?: number; rows?: ClientOverviewRow[] };
      return { total: r.total ?? 0, rows: r.rows ?? [] };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
