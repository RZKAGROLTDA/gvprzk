import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export type VisitScheduleStatus = 'planejado' | 'realizado' | 'nao_realizado' | 'reagendado';

export interface VisitSchedule {
  id: string;
  planned_date: string;
  client_code: string;
  client_name: string;
  client_property: string | null;
  client_phone: string | null;
  client_email: string | null;
  filial: string;
  filial_id: string | null;
  seller_id: string;
  seller_name: string;
  observation: string | null;
  status: VisitScheduleStatus;
  realized_task_id: string | null;
  realized_at: string | null;
  reschedule_from_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VisitScheduleFilters {
  startDate?: string;
  endDate?: string;
  sellerId?: string;
  filialId?: string;
  status?: VisitScheduleStatus;
  clientSearch?: string;
}

const COLS =
  'id, planned_date, client_code, client_name, client_property, client_phone, client_email, filial, filial_id, seller_id, seller_name, observation, status, realized_task_id, realized_at, reschedule_from_id, created_by, created_at, updated_at';

export const useVisitSchedules = (filters: VisitScheduleFilters = {}) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['visit_schedules', user?.id, filters],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let q = supabase
        .from('visit_schedules' as any)
        .select(COLS)
        .order('planned_date', { ascending: true })
        .limit(2000);

      if (filters.startDate) q = q.gte('planned_date', filters.startDate);
      if (filters.endDate) q = q.lte('planned_date', filters.endDate);
      if (filters.sellerId) q = q.eq('seller_id', filters.sellerId);
      if (filters.filialId) q = q.eq('filial_id', filters.filialId);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.clientSearch && filters.clientSearch.trim()) {
        const s = filters.clientSearch.trim().replace(/[%_]/g, '');
        q = q.or(`client_name.ilike.%${s}%,client_code.ilike.%${s}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VisitSchedule[];
    },
  });
};

export type UpsertVisitSchedule = Omit<
  VisitSchedule,
  'id' | 'created_at' | 'updated_at' | 'realized_task_id' | 'realized_at' | 'reschedule_from_id'
> & {
  id?: string;
};

export const useUpsertVisitSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertVisitSchedule) => {
      const { data, error } = await supabase
        .from('visit_schedules' as any)
        .upsert(payload as any, { onConflict: 'id' })
        .select(COLS)
        .single();
      if (error) throw error;
      return data as unknown as VisitSchedule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit_schedules'] });
      toast({ title: 'Programação salva' });
    },
    onError: (err: any) => {
      const msg = String(err?.message || '');
      if (msg.includes('visit_schedules_unique_per_seller_client_date')) {
        toast({
          title: 'Já existe programação',
          description: 'Este vendedor já possui programação para este cliente nesta data.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
      }
    },
  });
};

export const useUpdateVisitScheduleStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VisitScheduleStatus }) => {
      const { error } = await supabase
        .from('visit_schedules' as any)
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visit_schedules'] }),
  });
};

/**
 * Busca clientes para autocomplete a partir das tasks históricas
 * (mesma fonte de dados usada hoje na criação de visita).
 */
export const useClientSearch = (term: string) => {
  return useQuery({
    queryKey: ['client-search', term],
    enabled: term.trim().length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const s = term.trim().replace(/[%_]/g, '');
      const { data, error } = await supabase
        .from('tasks')
        .select('clientcode, client, property, phone, email, filial')
        .or(`client.ilike.%${s}%,clientcode.ilike.%${s}%`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      // dedupe por clientcode (ou nome se sem código)
      const seen = new Set<string>();
      const out: Array<{
        code: string;
        name: string;
        property?: string;
        phone?: string;
        email?: string;
        filial?: string;
      }> = [];
      for (const row of data ?? []) {
        const code = (row as any).clientcode?.trim() || '';
        const name = (row as any).client?.trim() || '';
        const key = code ? `c:${code}` : `n:${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          code,
          name,
          property: (row as any).property || undefined,
          phone: (row as any).phone || undefined,
          email: (row as any).email || undefined,
          filial: (row as any).filial || undefined,
        });
        if (out.length >= 15) break;
      }
      return out;
    },
  });
};
