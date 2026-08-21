import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ManagementFilters } from '@/hooks/useManagementData';

/**
 * Oportunidades de Serviços — leitura exclusiva via RPCs:
 *  - get_service_opportunities_summary  → KPIs + agrupamentos (cálculo no banco)
 *  - get_service_opportunities_details  → drill-down paginado (COUNT(*) OVER())
 * Nenhum cálculo/agregação é refeito no frontend.
 */

export interface ServiceOpportunityLocalFilters {
  serviceType?: string | null;
  severity?: 'alta' | 'media' | null;
  machineType?: string | null;
  client?: string | null;
}

export interface ServiceOpportunitiesKpis {
  oportunidades: number;
  clientes: number;
  maquinas: number;
  checklists_com_oportunidade: number;
  checklists_periodo: number;
  taxa_oportunidade: number;
  itens_nao_avaliados: number;
}

export interface ServiceRankingRow {
  service_type: string;
  oportunidades: number;
  alta: number;
  media: number;
  clientes: number;
  maquinas: number;
  checklists: number;
}

export interface FilialRow {
  filial_nome: string;
  oportunidades: number;
  alta: number;
  media: number;
  clientes: number;
  checklists: number;
}

export interface SellerRow {
  seller_id: string | null;
  seller_name: string;
  seller_role: string;
  filial_nome: string;
  oportunidades: number;
  alta: number;
  media: number;
  clientes: number;
  checklists: number;
}

export interface MonthRow {
  mes: string;
  oportunidades: number;
  alta: number;
  media: number;
  checklists: number;
}

export interface ServiceOpportunitiesSummary {
  kpis: ServiceOpportunitiesKpis;
  by_service: ServiceRankingRow[];
  by_filial: FilialRow[];
  by_seller: SellerRow[];
  by_month: MonthRow[];
}

export interface ServiceOpportunityDetailRow {
  task_id: string;
  checklist_date: string;
  filial_nome: string;
  seller_id: string | null;
  seller_name: string;
  seller_role: string;
  client_name: string;
  client_code: string;
  machine_type: string;
  machine_model: string;
  machine_serial: string;
  machine_year: string;
  machine_hours: string;
  service_type: string;
  item_name: string;
  severity: 'alta' | 'media';
  response_status: string;
  observation: string;
  total_count: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNullFilter = (v?: string | null): boolean => {
  if (!v) return true;
  return ['', 'all', 'todos', 'todas'].includes(v.trim().toLowerCase());
};

const toDateOnly = (v?: string | null): string | null => (v ? v.substring(0, 10) : null);

export const buildServiceOpportunityParams = (
  filters: ManagementFilters,
  local: ServiceOpportunityLocalFilters,
) => ({
  p_start_date: toDateOnly(filters.startDate),
  p_end_date: toDateOnly(filters.endDate),
  p_filial_id: filters.filialId && UUID_RE.test(filters.filialId) ? filters.filialId : null,
  p_seller_role: isNullFilter(filters.sellerRole) ? null : filters.sellerRole!.trim(),
  p_seller_id: filters.sellerId && UUID_RE.test(filters.sellerId) ? filters.sellerId : null,
  p_service_type: isNullFilter(local.serviceType) ? null : local.serviceType!.trim(),
  p_severity: isNullFilter(local.severity) ? null : local.severity!.trim(),
  p_machine_type: isNullFilter(local.machineType) ? null : local.machineType!.trim(),
  p_client: local.client && local.client.trim() ? local.client.trim() : null,
});

const EMPTY_SUMMARY: ServiceOpportunitiesSummary = {
  kpis: {
    oportunidades: 0,
    clientes: 0,
    maquinas: 0,
    checklists_com_oportunidade: 0,
    checklists_periodo: 0,
    taxa_oportunidade: 0,
    itens_nao_avaliados: 0,
  },
  by_service: [],
  by_filial: [],
  by_seller: [],
  by_month: [],
};

export const useServiceOpportunitiesSummary = (
  filters: ManagementFilters,
  local: ServiceOpportunityLocalFilters,
) => {
  const params = buildServiceOpportunityParams(filters, local);
  return useQuery({
    queryKey: ['service-opportunities-summary', params],
    queryFn: async (): Promise<ServiceOpportunitiesSummary> => {
      const { data, error } = await supabase.rpc(
        'get_service_opportunities_summary' as any,
        params as any,
      );
      if (error) throw error;
      if (!data) return EMPTY_SUMMARY;
      return data as unknown as ServiceOpportunitiesSummary;
    },
    enabled: filters.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useServiceOpportunitiesDetails = (
  filters: ManagementFilters,
  local: ServiceOpportunityLocalFilters,
  page: number,
  pageSize: number,
  enabled: boolean,
) => {
  const params = {
    ...buildServiceOpportunityParams(filters, local),
    p_limit: pageSize,
    p_offset: page * pageSize,
  };
  return useQuery({
    queryKey: ['service-opportunities-details', params],
    queryFn: async (): Promise<ServiceOpportunityDetailRow[]> => {
      const { data, error } = await supabase.rpc(
        'get_service_opportunities_details' as any,
        params as any,
      );
      if (error) throw error;
      return (data || []) as unknown as ServiceOpportunityDetailRow[];
    },
    enabled: (filters.enabled ?? true) && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

/** Busca todas as linhas filtradas (para exportação), em lotes server-side. */
export const fetchAllServiceOpportunityRows = async (
  filters: ManagementFilters,
  local: ServiceOpportunityLocalFilters,
  maxRows = 20000,
): Promise<ServiceOpportunityDetailRow[]> => {
  const base = buildServiceOpportunityParams(filters, local);
  const batch = 2000;
  const all: ServiceOpportunityDetailRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.rpc('get_service_opportunities_details' as any, {
      ...base,
      p_limit: batch,
      p_offset: offset,
    } as any);
    if (error) throw error;
    const rows = (data || []) as unknown as ServiceOpportunityDetailRow[];
    all.push(...rows);
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    offset += batch;
    if (rows.length < batch || all.length >= total || all.length >= maxRows) break;
  }
  return all;
};
