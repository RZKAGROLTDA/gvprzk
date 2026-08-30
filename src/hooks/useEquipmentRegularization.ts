import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RegSituation = 'vendida' | 'inativa' | 'sucata';

export interface RegFilters {
  filialId: string | null;
  withoutFilial: boolean;
  client: string | null;
  situation: RegSituation | null;
  chassis: string | null;
}

export interface RegKpis {
  total_pending: number;
  total_clients: number;
  total_regularized: number;
  by_situation: { vendida: number; inativa: number; sucata: number };
}

export interface RegClientGroup {
  client_key: string;
  client_code: string | null;
  client_name: string | null;
  filial_id: string | null;
  filial_nome: string | null;
  total_pending: number;
  last_validation_at: string | null;
  by_situation: { vendida: number; inativa: number; sucata: number };
}

export interface RegMachine {
  equipment_id: string;
  client_code: string | null;
  client_name: string | null;
  filial_id: string | null;
  model: string | null;
  serial_chassis: string | null;
  year: number | null;
  machine_situation: RegSituation;
  last_validation_at: string | null;
  validation_source: string | null;
}

const baseArgs = (f: RegFilters) => ({
  p_filial_id: f.filialId,
  p_without_filial: f.withoutFilial,
  p_client: f.client,
  p_situation: f.situation,
  p_chassis: f.chassis,
});

const CACHE = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;

export const useRegularizationKpis = (filters: RegFilters) =>
  useQuery({
    queryKey: ['reg-kpis', filters],
    queryFn: async (): Promise<RegKpis> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_pending_kpis' as never,
        baseArgs(filters) as never,
      );
      if (error) throw error;
      return data as unknown as RegKpis;
    },
    ...CACHE,
  });

export const useRegularizationClients = (
  filters: RegFilters,
  page: number,
  pageSize: number,
) =>
  useQuery({
    queryKey: ['reg-clients', filters, page, pageSize],
    queryFn: async (): Promise<{ total_groups: number; clients: RegClientGroup[] }> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_pending_clients' as never,
        { ...baseArgs(filters), p_page: page, p_page_size: pageSize } as never,
      );
      if (error) throw error;
      const d = (data ?? {}) as { total_groups?: number; clients?: RegClientGroup[] };
      return { total_groups: Number(d.total_groups ?? 0), clients: d.clients ?? [] };
    },
    ...CACHE,
  });

export const useRegularizationMachines = (
  clientKey: string | null,
  filters: RegFilters,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['reg-machines', clientKey, filters],
    enabled: enabled && !!clientKey,
    queryFn: async (): Promise<RegMachine[]> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_pending_machines' as never,
        { p_client_key: clientKey, ...baseArgs(filters) } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as RegMachine[];
    },
    ...CACHE,
  });

export const useFiliaisList = () =>
  useQuery({
    queryKey: ['reg-filiais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
