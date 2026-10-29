import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { collectConditionPages, CONDITION_PAGE_SIZE, type ConditionType } from '@/lib/specialConditions';

export type SpecialConditionStatus = 'pendente' | 'aprovado' | 'rejeitado';

export interface SpecialCondition {
  id: string;
  client_code: string;
  client_name: string;
  filial_id: string | null;
  filial_name: string | null;
  seller_id: string;
  seller_name: string | null;
  sale_value: number;
  discount_percent: number;
  condition_type: ConditionType | null;
  margin_percent: number | null;
  total_discount_value: number | null;
  invoice_number: string | null;
  payment_condition: string | null;
  sale_date: string | null;
  nf_date: string | null;
  payment_date: string | null;
  payment_condition_days: number | null;
  installments: string | null;
  payment_type: string | null;
  status: SpecialConditionStatus;
  approved_by: string | null;
  approved_at: string | null;
  observation: string | null;
  attachments: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type SpecialConditionInput = Omit<
  SpecialCondition,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'seller_id'
  | 'seller_name'
  | 'approved_by'
  | 'approved_at'
  | 'total_discount_value'
  | 'status'
> & { status?: SpecialConditionStatus };

export const useSpecialConditions = (start = '', end = '') => {
  return useQuery({
    queryKey: ['special_conditions', start, end],
    queryFn: async () => {
      if (start && end && start > end) throw new Error('O início do período deve ser anterior ao fim');
      const rows = await collectConditionPages<SpecialCondition>(async after => {
        let query = supabase.from('special_conditions').select(
          'id, client_code, client_name, filial_id, filial_name, seller_id, seller_name, sale_value, discount_percent, condition_type, margin_percent, total_discount_value, invoice_number, payment_condition, sale_date, nf_date, payment_date, payment_condition_days, installments, payment_type, status, approved_by, approved_at, observation, attachments, created_by, created_at, updated_at'
        ).order('id', { ascending: true }).limit(CONDITION_PAGE_SIZE);
        if (start) query = query.gte('sale_date', start);
        if (end) query = query.lte('sale_date', end);
        if (after) query = query.gt('id', after);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as SpecialCondition[];
      });
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useCreateSpecialCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: SpecialConditionInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const payload = { ...entry, seller_id: user.id, status: entry.status || 'pendente' };
      const { data, error } = await supabase
        .from('special_conditions')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special_conditions'] });
      toast.success('Condição especial criada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar'),
  });
};

export const useUpdateSpecialCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SpecialCondition> }) => {
      const { data, error } = await supabase
        .from('special_conditions')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special_conditions'] });
      toast.success('Atualizado');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar'),
  });
};

export const useDeleteSpecialCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('special_conditions').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special_conditions'] });
      toast.success('Removido');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover'),
  });
};

export const useApproveSpecialCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const { data, error } = await supabase
        .from('special_conditions')
        .update({
          status: approve ? 'aprovado' : 'rejeitado',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['special_conditions'] });
      toast.success(vars.approve ? 'Condição aprovada' : 'Condição rejeitada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao alterar status'),
  });
};
