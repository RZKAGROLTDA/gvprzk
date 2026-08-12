import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TrainingStatus = 'pendente' | 'realizado' | 'nao_realizado';

export interface TrainingRow {
  id: string;
  name: string;
  training_date: string;
  training_time: string;
  hours: number;
  status: TrainingStatus;
  user_id: string;
  user_name: string;
  filial_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingInput {
  name: string;
  training_date: string;
  training_time: string;
  hours: number;
  user_id: string;
  status?: TrainingStatus;
  training_catalog_id?: string | null;
}


export interface TrainingFilters {
  startDate?: string | null;
  endDate?: string | null;
  userId?: string | null;
  filialId?: string | null;
  status?: TrainingStatus | null;
}

export interface TrainingStats {
  scheduled_count: number;
  done_count: number;
  pending_count: number;
  not_done_count: number;
  scheduled_hours: number;
  done_hours: number;
  pending_hours: number;
  trained_users: number;
  execution_rate: number;
}

const TRAININGS_KEY = 'trainings';
const TRAINING_STATS_KEY = 'trainings-stats';

const TRAINING_COLUMNS =
  'id, name, training_date, training_time, hours, status, user_id, user_name, filial_id, created_by, created_at, updated_at';

export const useTrainings = (filters: TrainingFilters = {}, enabled = true) => {
  const { startDate, endDate, userId, filialId, status } = filters;

  return useQuery({
    queryKey: [TRAININGS_KEY, startDate ?? null, endDate ?? null, userId ?? null, filialId ?? null, status ?? null],
    queryFn: async () => {
      let q = supabase
        .from('trainings')
        .select(TRAINING_COLUMNS)
        .order('training_date', { ascending: false })
        .order('training_time', { ascending: true })
        .limit(500);

      if (startDate) q = q.gte('training_date', startDate);
      if (endDate) q = q.lte('training_date', endDate);
      if (userId) q = q.eq('user_id', userId);
      if (filialId) q = q.eq('filial_id', filialId);
      if (status) q = q.eq('status', status);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TrainingRow[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useTrainingStats = (filters: TrainingFilters = {}, enabled = true) => {
  const { startDate, endDate, userId, filialId, status } = filters;

  return useQuery({
    queryKey: [TRAINING_STATS_KEY, startDate ?? null, endDate ?? null, userId ?? null, filialId ?? null, status ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_trainings_stats', {
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_user_id: userId || null,
        p_filial_id: filialId || null,
        p_status: status || null,
      });
      if (error) throw error;
      return (data ?? null) as unknown as TrainingStats | null;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

/** O trigger do banco resolve user_name, filial_id e created_by. */
export const useCreateTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrainingInput) => {
      const { error } = await supabase.from('trainings').insert({
        name: input.name.trim(),
        training_date: input.training_date,
        training_time: input.training_time,
        hours: input.hours,
        user_id: input.user_id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TRAININGS_KEY] });
      qc.invalidateQueries({ queryKey: [TRAINING_STATS_KEY] });
    },
  });
};

export const useUpdateTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<TrainingInput>) => {
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.name = patch.name.trim();
      if (patch.training_date !== undefined) payload.training_date = patch.training_date;
      if (patch.training_time !== undefined) payload.training_time = patch.training_time;
      if (patch.hours !== undefined) payload.hours = patch.hours;
      if (patch.user_id !== undefined) payload.user_id = patch.user_id;
      if (patch.status !== undefined) payload.status = patch.status;

      const { error } = await supabase.from('trainings').update(payload as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TRAININGS_KEY] });
      qc.invalidateQueries({ queryKey: [TRAINING_STATS_KEY] });
    },
  });
};

export const useDeleteTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trainings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TRAININGS_KEY] });
      qc.invalidateQueries({ queryKey: [TRAINING_STATS_KEY] });
    },
  });
};

export interface TrainingEmployeeOption {
  user_id: string;
  name: string;
  filial_id: string | null;
}

/**
 * Colaboradores selecionáveis (approved + active).
 * `filialId` restringe ao escopo do supervisor.
 */
export const useTrainingEmployees = (filialId?: string | null, enabled = true) => {
  return useQuery({
    queryKey: ['training-employees', filialId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('user_id, name, filial_id')
        .eq('approval_status', 'approved')
        .eq('employment_status', 'active')
        .order('name', { ascending: true })
        .limit(500);
      if (filialId) q = q.eq('filial_id', filialId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TrainingEmployeeOption[];
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

/**
 * Busca nomes de perfis para uma lista de user_ids (criadores de treinamentos).
 */
export const fetchTrainingCreatorNames = async (userIds: string[]): Promise<Record<string, string>> => {
  if (userIds.length === 0) return {};
  const unique = Array.from(new Set(userIds));
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, name')
    .in('user_id', unique)
    .limit(unique.length);
  if (error) throw error;
  const map: Record<string, string> = {};
  (data ?? []).forEach((p) => { map[p.user_id] = p.name; });
  return map;
};
