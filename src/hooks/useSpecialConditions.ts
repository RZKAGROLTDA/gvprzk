import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  total_discount_value: number | null;
  invoice_number: string | null;
  payment_condition: string | null;
  sale_date: string | null;
  nf_date: string | null;
  payment_date: string | null;
  payment_condition_days: number | null;
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

export const useSpecialConditions = () => {
  return useQuery({
    queryKey: ['special_conditions'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('special_conditions') as any)
        .select(
          'id, client_code, client_name, filial_id, filial_name, seller_id, seller_name, sale_value, discount_percent, total_discount_value, invoice_number, payment_condition, sale_date, nf_date, payment_date, payment_condition_days, status, approved_by, approved_at, observation, attachments, created_by, created_at, updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as SpecialCondition[];
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
