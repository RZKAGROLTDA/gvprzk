import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type VacationStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface VacationRow {
  id: string;
  employee_user_id: string | null;
  employee_name: string;
  employee_role: string | null;
  filial_id: string;
  filial_name: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  is_cancelled: boolean;
  observation: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: VacationStatus;
}

export interface VacationInput {
  employee_user_id?: string | null;
  employee_name: string;
  employee_role?: string | null;
  filial_id: string;
  start_date: string;
  end_date: string;
  observation?: string | null;
}

const VACATIONS_KEY = ['team_vacations'];

export const useVacations = (enabled = true) => {
  return useQuery({
    queryKey: VACATIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_vacations_view' as any)
        .select(
          'id, employee_user_id, employee_name, employee_role, filial_id, filial_name, start_date, end_date, total_days, is_cancelled, observation, created_by, created_at, updated_at, status'
        )
        .order('start_date', { ascending: true })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown) as VacationRow[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

const translateOverlap = (msg?: string) =>
  msg?.includes('Já existe um período')
    ? 'Já existe um período de férias cadastrado para este colaborador.'
    : msg || 'Erro ao processar solicitação';

export const useCreateVacation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VacationInput) => {
      const { error } = await supabase.from('team_vacations' as any).insert({
        employee_user_id: input.employee_user_id || null,
        employee_name: input.employee_name.trim(),
        employee_role: input.employee_role?.trim() || null,
        filial_id: input.filial_id,
        start_date: input.start_date,
        end_date: input.end_date,
        observation: input.observation?.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VACATIONS_KEY });
      toast.success('Férias cadastradas com sucesso');
    },
    onError: (err: any) => toast.error(translateOverlap(err?.message)),
  });
};

export const useUpdateVacation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<VacationInput>) => {
      const { error } = await supabase
        .from('team_vacations' as any)
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VACATIONS_KEY });
      toast.success('Registro atualizado');
    },
    onError: (err: any) => toast.error(translateOverlap(err?.message)),
  });
};

export const useCancelVacation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_vacations' as any)
        .update({ is_cancelled: true } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VACATIONS_KEY });
      toast.success('Férias canceladas');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao cancelar'),
  });
};

export const useDeleteVacation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_vacations' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VACATIONS_KEY });
      toast.success('Registro excluído');
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao excluir'),
  });
};

export interface EmployeeOption {
  user_id: string;
  name: string;
  role: string | null;
  filial_id: string | null;
}

export const useEmployeeOptions = (filialId?: string | null) => {
  return useQuery({
    queryKey: ['vacation-employees', filialId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('user_id, name, role, filial_id')
        .eq('approval_status', 'approved')
        .order('name', { ascending: true })
        .limit(500);
      if (filialId) q = q.eq('filial_id', filialId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmployeeOption[];
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export interface FilialOption {
  id: string;
  nome: string;
}

export const useFiliaisList = () => {
  return useQuery({
    queryKey: ['vacation-filiais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FilialOption[];
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
