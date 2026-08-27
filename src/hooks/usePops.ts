import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * POPS V1 — camada de leitura/escrita do frontend.
 * Consome SOMENTE as RPCs já validadas no backend:
 *  - pops_goal_summary
 *  - pops_portfolio_clients
 *  - pops_portfolio_client_machines
 *  - pops_complete_machine
 * Nenhuma regra de negócio nova é implementada aqui.
 */

export type PopsProgram = {
  id: string;
  name: string;
  goal_machines: number;
  start_date: string;
  end_date: string;
};

export type PopsGoalSummary = {
  program_id: string;
  scope: 'global' | 'filial' | string;
  filial_id: string | null;
  goal: number;
  total_universe: number;
  serviced: number;
  remaining: number;
  attainment_percent: number | null;
  today: number;
  this_week: number;
  this_month: number;
  pending: number;
};

export type PopsClientRow = {
  client_key: string;
  pops_client_name: string;
  pops_dealer_location: string | null;
  pops_filial_id: string | null;
  filial_nome: string | null;
  total_maquinas: number;
  pendentes: number;
  em_andamento: number;
  servicadas: number;
};

export type PopsMachineRow = {
  pops_machine_id: string;
  status: 'foco' | 'em_andamento' | 'servicada';
  pops_serial: string | null;
  pops_model: string | null;
  pops_product_series: string | null;
  pops_manufacture_year: string | null;
  pops_platform: string | null;
  pops_client_name: string | null;
  pops_client_code: string | null;
  pops_dealer_location: string | null;
  pops_filial_id: string | null;
  filial_nome: string | null;
  link_status: string | null;
  equipment_id: string | null;
  final_service_id: string | null;
  final_service_name: string | null;
  os_number: string | null;
  executed_by: string | null;
  executed_by_name: string | null;
  executed_at: string | null;
};

export type PopsService = { id: string; code: string; name: string; sort_order: number };

const STALE = 5 * 60 * 1000;

/** Programa POPS ativo (o mais recente). */
export const usePopsProgram = () =>
  useQuery({
    queryKey: ['pops', 'program'],
    queryFn: async (): Promise<PopsProgram | null> => {
      const { data, error } = await supabase
        .from('pops_programs')
        .select('id, name, goal_machines, start_date, end_date')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as PopsProgram) ?? null;
    },
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });

/** Serviços POPS ativos (nunca hardcode no frontend). */
export const usePopsServices = () =>
  useQuery({
    queryKey: ['pops', 'services'],
    queryFn: async (): Promise<PopsService[]> => {
      const { data, error } = await supabase
        .from('pops_services')
        .select('id, code, name, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PopsService[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const usePopsGoalSummary = (programId?: string, filialId?: string | null) =>
  useQuery({
    queryKey: ['pops', 'goal', programId ?? null, filialId ?? null],
    queryFn: async (): Promise<PopsGoalSummary> => {
      const { data, error } = await supabase.rpc('pops_goal_summary', {
        p_program_id: programId!,
        p_filial_id: filialId ?? undefined,
      });
      if (error) throw error;
      return data as unknown as PopsGoalSummary;
    },
    enabled: !!programId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });

export const usePopsClients = (
  programId: string | undefined,
  opts: { search?: string; filialId?: string | null; limit: number; offset: number },
) =>
  useQuery({
    queryKey: ['pops', 'clients', programId ?? null, opts.filialId ?? null, opts.search ?? '', opts.limit, opts.offset],
    queryFn: async (): Promise<{ total: number; rows: PopsClientRow[] }> => {
      const { data, error } = await supabase.rpc('pops_portfolio_clients', {
        p_program_id: programId!,
        p_filial_id: opts.filialId ?? undefined,
        p_search: opts.search?.trim() ? opts.search.trim() : undefined,
        p_limit: opts.limit,
        p_offset: opts.offset,
      });
      if (error) throw error;
      const payload = (data ?? {}) as { total?: number; rows?: PopsClientRow[] };
      return { total: payload.total ?? 0, rows: payload.rows ?? [] };
    },
    enabled: !!programId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });

export const usePopsClientMachines = (programId?: string, clientKey?: string | null) =>
  useQuery({
    queryKey: ['pops', 'machines', programId ?? null, clientKey ?? null],
    queryFn: async (): Promise<PopsMachineRow[]> => {
      const { data, error } = await supabase.rpc('pops_portfolio_client_machines', {
        p_program_id: programId!,
        p_client_key: clientKey!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as PopsMachineRow[];
    },
    enabled: !!programId && !!clientKey,
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });

/** Conclusão da máquina. A mensagem de erro do backend é repassada intacta. */
export const useCompletePopsMachine = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { machineId: string; serviceId: string; osNumber: string }) => {
      const { data, error } = await supabase.rpc('pops_complete_machine', {
        p_machine_id: vars.machineId,
        p_service_id: vars.serviceId,
        p_os_number: vars.osNumber,
      });
      if (error) throw new Error(error.message);
      return data as unknown as Record<string, unknown>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pops', 'goal'] });
      queryClient.invalidateQueries({ queryKey: ['pops', 'clients'] });
      queryClient.invalidateQueries({ queryKey: ['pops', 'machines'] });
    },
  });
};

/** Filiais para o filtro de Manager/Admin. */
export const useFiliaisList = (enabled: boolean) =>
  useQuery({
    queryKey: ['pops', 'filiais'],
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    enabled,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

/** Permissões de tela derivadas dos cargos (o backend é a autoridade final). */
export const usePopsPermissions = () => {
  const { isAdmin, isManager, isSupervisor, isRacEquivalent, isLoading } = useUserRole();
  const isGlobal = isAdmin || isManager;
  return {
    isLoading,
    canAccess: isGlobal || isSupervisor || isRacEquivalent,
    canComplete: isGlobal || isRacEquivalent,
    isGlobal,
    isSupervisorOnly: isSupervisor && !isGlobal && !isRacEquivalent,
  };
};
