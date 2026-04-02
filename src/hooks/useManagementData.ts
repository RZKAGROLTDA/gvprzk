import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ManagementFilters {
  startDate?: string;
  endDate?: string;
  filial?: string;
  sellerRole?: string;
  sellerId?: string;
  taskTypes?: string[];
}

export interface SellerSummary {
  seller_id: string;
  seller_name: string;
  seller_role: string;
  filial: string;
  visitas: number;
  ligacoes: number;
  checklists: number;
  total_atividades: number;
  clientes_atendidos: number;
  oportunidade_gerada: number;
  valor_convertido: number;
  taxa_conversao: number;
  ultima_atividade: string;
}

export interface ClientDetail {
  client_name: string;
  seller_id: string;
  seller_name: string;
  seller_role: string;
  filial: string;
  total_atividades: number;
  visitas: number;
  ligacoes: number;
  checklists: number;
  oportunidade_gerada: number;
  valor_convertido: number;
  status_cliente: string;
  ultima_atividade: string;
}

const isNullFilter = (v: string | undefined | null): boolean => {
  if (!v) return true;
  const normalized = v.trim().toLowerCase();
  return ['', 'all', 'todos', 'todas'].includes(normalized);
};

const buildParams = (filters: ManagementFilters) => {
  const params = {
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_filial: isNullFilter(filters.filial) ? null : filters.filial!.trim(),
    p_seller_role: isNullFilter(filters.sellerRole) ? null : filters.sellerRole!.trim(),
    p_seller_id: isNullFilter(filters.sellerId) ? null : filters.sellerId!.trim(),
    p_task_types: filters.taskTypes && filters.taskTypes.length > 0
      && !filters.taskTypes.some(t => isNullFilter(t))
      ? filters.taskTypes.map(t => t.trim())
      : null,
  };
  console.log('[Management] RPC params:', params);
  return params;
};

export const useSellerSummary = (filters: ManagementFilters) => {
  return useQuery({
    queryKey: ['management-seller-summary', filters],
    queryFn: async () => {
      const params = buildParams(filters);
      
      // DEBUG: Verificar sessão autenticada
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[Management DEBUG] auth session exists:', !!sessionData?.session);
      console.log('[Management DEBUG] auth user id:', sessionData?.session?.user?.id || 'NULL');
      console.log('[Management DEBUG] seller_summary params:', JSON.stringify(params));
      
      const { data, error, status, statusText } = await supabase.rpc(
        'get_management_seller_summary' as any,
        params
      );
      
      console.log('[Management DEBUG] seller_summary response status:', status, statusText);
      console.log('[Management DEBUG] seller_summary error:', error);
      console.log('[Management DEBUG] seller_summary rows returned:', Array.isArray(data) ? data.length : 'not array', data);
      
      if (error) throw error;
      return (data || []) as unknown as SellerSummary[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useClientDetails = (filters: ManagementFilters) => {
  return useQuery({
    queryKey: ['management-client-details', filters],
    queryFn: async () => {
      const params = buildParams(filters);
      console.log('[Management DEBUG] client_details params:', JSON.stringify(params));
      
      const { data, error, status, statusText } = await supabase.rpc(
        'get_management_client_details' as any,
        params
      );
      
      console.log('[Management DEBUG] client_details response status:', status, statusText);
      console.log('[Management DEBUG] client_details error:', error);
      console.log('[Management DEBUG] client_details rows returned:', Array.isArray(data) ? data.length : 'not array');
      
      if (error) throw error;
      return (data || []) as unknown as ClientDetail[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export interface ProductAnalysis {
  produto: string;
  clientes_ofertados: number;
  qtd_atividades: number;
  oportunidade_gerada: number;
  valor_convertido: number;
  taxa_conversao: number;
  ticket_medio: number;
  ultima_oferta: string;
}

export const useProductAnalysis = (filters: ManagementFilters & { product?: string }) => {
  return useQuery({
    queryKey: ['management-product-analysis', filters],
    queryFn: async () => {
      const params = {
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_filial: isNullFilter(filters.filial) ? null : filters.filial!.trim(),
        p_task_types: filters.taskTypes && filters.taskTypes.length > 0
          && !filters.taskTypes.some(t => isNullFilter(t))
          ? filters.taskTypes.map(t => t.trim())
          : null,
        p_product: filters.product && filters.product.trim() ? filters.product.trim() : null,
      };
      
      const { data, error } = await supabase.rpc(
        'get_management_product_analysis' as any,
        params
      );
      
      if (error) throw error;
      return (data || []) as unknown as ProductAnalysis[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useFiliais = () => {
  return useQuery({
    queryKey: ['filiais-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
  return useQuery({
    queryKey: ['filiais-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
