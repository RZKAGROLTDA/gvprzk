import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CampaignRule {
  id: string;
  campaign_name: string;
  trigger_min: number;
  trigger_max: number | null;
  gained_april: number;
  gained_may: number;
  gained_june: number;
  commitment_value: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignClient {
  id: string;
  campaign_rule_id: string | null;
  client_code: string;
  client_name: string;
  filial_id: string | null;
  seller_id: string;
  campaign_trigger_value: number;
  gained_april: number;
  gained_may: number;
  gained_june: number;
  commitment_value: number;
  created_at: string;
  updated_at: string;
}

export interface ClientSearchResult {
  client_code: string;
  client_name: string;
  source: string;
}

export const useCampaignRules = () => {
  return useQuery({
    queryKey: ['campaign_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CampaignRule[];
    },
  });
};

export const useCampaignClients = () => {
  return useQuery({
    queryKey: ['campaign_clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_clients')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CampaignClient[];
    },
  });
};

export const useSearchCampaignClients = (query: string) => {
  return useQuery({
    queryKey: ['search_clients_for_campaigns', query],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_clients_for_campaigns', {
        p_query: query || '',
      });
      if (error) throw error;
      return (data || []) as ClientSearchResult[];
    },
    enabled: true,
    staleTime: 30_000,
  });
};

export const useCreateCampaignRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Omit<CampaignRule, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('campaign_rules')
        .insert(rule)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign_rules'] });
      toast.success('Regra de campanha criada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar regra'),
  });
};

export const useUpdateCampaignRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<CampaignRule, 'id' | 'created_at' | 'updated_at'>>;
    }) => {
      const { data, error } = await supabase
        .from('campaign_rules')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign_rules'] });
      toast.success('Regra atualizada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar regra'),
  });
};

export const useDeleteCampaignRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Verifica se há lançamentos vinculados
      const { count, error: countError } = await supabase
        .from('campaign_clients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_rule_id', id);
      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error(
          `Não é possível excluir: ${count} lançamento(s) vinculado(s). Inative a regra.`
        );
      }
      const { error } = await supabase.from('campaign_rules').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign_rules'] });
      toast.success('Regra removida');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover regra'),
  });
};

export const useCampaignRuleUsageCount = (ruleId: string | null | undefined) => {
  return useQuery({
    queryKey: ['campaign_rule_usage', ruleId],
    queryFn: async () => {
      if (!ruleId) return 0;
      const { count, error } = await supabase
        .from('campaign_clients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_rule_id', ruleId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!ruleId,
    staleTime: 30_000,
  });
};

export const useCreateCampaignClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Omit<CampaignClient, 'id' | 'created_at' | 'updated_at' | 'seller_id'> & { seller_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const payload = { ...entry, seller_id: user.id };
      const { data, error } = await supabase
        .from('campaign_clients')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign_clients'] });
      qc.invalidateQueries({ queryKey: ['search_clients_for_campaigns'] });
      toast.success('Lançamento adicionado');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao lançar cliente'),
  });
};

export const useUpdateCampaignClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          CampaignClient,
          | 'campaign_rule_id'
          | 'campaign_trigger_value'
          | 'gained_april'
          | 'gained_may'
          | 'gained_june'
          | 'commitment_value'
          | 'filial_id'
        >
      >;
    }) => {
      const { data, error } = await supabase
        .from('campaign_clients')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign_clients'] });
      toast.success('Lançamento atualizado');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar lançamento'),
  });
};

export const useDeleteCampaignClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaign_clients').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign_clients'] });
      toast.success('Lançamento removido');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover lançamento'),
  });
};

export const useEnsureClientMaster = () => {
  return useMutation({
    mutationFn: async ({ client_code, client_name }: { client_code: string; client_name: string }) => {
      const { data, error } = await supabase
        .from('campaign_clients_master')
        .upsert({ client_code, client_name, source: 'manual' }, { onConflict: 'client_code' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });
};
