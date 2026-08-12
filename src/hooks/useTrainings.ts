import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TrainingRow {
  id: string;
  name: string;
  training_date: string;
  training_time: string;
  hours: number;
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
}

export interface TrainingFilters {
  startDate?: string | null;
  endDate?: string | null;
  userId?: string | null;
  filialId?: string | null;
}

const TRAININGS_KEY = 'trainings';

const TRAINING_COLUMNS =
  'id, name, training_date, training_time, hours, user_id, user_name, filial_id, created_by, created_at, updated_at';

export const useTrainings = (filters: TrainingFilters = {}, enabled = true) => {
  const { startDate, endDate, userId, filialId } = filters;

  return useQuery({
    queryKey: [TRAININGS_KEY, startDate ?? null, endDate ?? null, userId ?? null, filialId ?? null],
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [TRAININGS_KEY] }),
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

      const { error } = await supabase.from('trainings').update(payload as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TRAININGS_KEY] }),
  });
};

export const useDeleteTraining = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trainings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TRAININGS_KEY] }),
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
