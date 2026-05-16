import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ManagementFilters {
  startDate?: string;       // ISO date string (YYYY-MM-DD or full ISO)
  endDate?: string;
  filialId?: string | null; // UUID of the filial
  sellerRole?: string;
  sellerId?: string;        // UUID (responsible_user_id)
  taskTypes?: string[];     // task_followups.activity_type values
  enabled?: boolean;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNullFilter = (v: string | undefined | null): boolean => {
  if (!v) return true;
  const normalized = v.trim().toLowerCase();
  return ['', 'all', 'todos', 'todas'].includes(normalized);
};

const toDateOnly = (v?: string | null): string | null => {
  if (!v) return null;
  // Accept ISO strings or YYYY-MM-DD; return YYYY-MM-DD
  const d = v.length >= 10 ? v.substring(0, 10) : v;
  return d;
};

const MANAGEMENT_DEBUG = import.meta.env.DEV;

const logRpcDebug = (rpcName: string, stage: 'params' | 'response' | 'error', payload: unknown) => {
  if (!MANAGEMENT_DEBUG) return;
  const prefix = `📊 Management RPC [${rpcName}] ${stage}`;
  if (stage === 'error') {
    console.error(prefix, payload);
    return;
  }
  console.log(prefix, payload);
};

const buildParams = (filters: ManagementFilters) => {
  const params = {
    p_start_date: toDateOnly(filters.startDate),
    p_end_date: toDateOnly(filters.endDate),
    p_filial_id: filters.filialId && UUID_RE.test(filters.filialId) ? filters.filialId : null,
    p_seller_role: isNullFilter(filters.sellerRole) ? null : filters.sellerRole!.trim(),
    p_seller_id: filters.sellerId && UUID_RE.test(filters.sellerId) ? filters.sellerId : null,
    p_task_types: filters.taskTypes && filters.taskTypes.length > 0
      && !filters.taskTypes.some(t => isNullFilter(t))
      ? filters.taskTypes.map(t => t.trim())
      : null,
  };
  return params;
};

export const useSellerSummary = (filters: ManagementFilters) => {
  return useQuery({
    queryKey: ['management-seller-summary-v2', filters],
    queryFn: async () => {
      const params = buildParams(filters);
      logRpcDebug('get_management_seller_summary', 'params', params);
      const { data, error } = await supabase.rpc(
        'get_management_seller_summary' as any,
        params as any
      );
      if (error) {
        logRpcDebug('get_management_seller_summary', 'error', error);
        throw error;
      }
      logRpcDebug('get_management_seller_summary', 'response', {
        rows: Array.isArray(data) ? data.length : 0,
        firstRow: Array.isArray(data) && data.length > 0 ? data[0] : null,
      });
      return (data || []) as unknown as SellerSummary[];
    },
    enabled: filters.enabled ?? true,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
};

export const useClientDetails = (filters: ManagementFilters) => {
  return useQuery({
    queryKey: ['management-client-details-v2', filters],
    queryFn: async () => {
      const params = buildParams(filters);
      logRpcDebug('get_management_client_details', 'params', params);
      const { data, error } = await supabase.rpc(
        'get_management_client_details' as any,
        params as any
      );
      if (error) {
        logRpcDebug('get_management_client_details', 'error', error);
        throw error;
      }
      logRpcDebug('get_management_client_details', 'response', {
        rows: Array.isArray(data) ? data.length : 0,
        firstRow: Array.isArray(data) && data.length > 0 ? data[0] : null,
      });
      return (data || []) as unknown as ClientDetail[];
    },
    enabled: filters.enabled ?? true,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
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

export interface ManagementRpcDebugState {
  rpcName: string;
  params: Record<string, unknown> | null;
  rawData: unknown[] | null;
  rowCount: number;
  error: {
    message: string | null;
    details: string | null;
    hint: string | null;
    code: string | null;
    statusCode: number | null;
  } | null;
}

export const buildManagementParams = (filters: ManagementFilters) => buildParams(filters);

const toDebugError = (error: any) => ({
  message: error?.message ?? null,
  details: error?.details ?? null,
  hint: error?.hint ?? null,
  code: error?.code ?? null,
  statusCode: error?.status ?? error?.statusCode ?? null,
});

export const useProductAnalysis = (filters: ManagementFilters & { product?: string }) => {
  return useQuery({
    queryKey: ['management-product-analysis-v2', filters],
    queryFn: async () => {
      const params = {
        p_start_date: toDateOnly(filters.startDate),
        p_end_date: toDateOnly(filters.endDate),
        p_filial_id: filters.filialId && UUID_RE.test(filters.filialId) ? filters.filialId : null,
        p_task_types: filters.taskTypes && filters.taskTypes.length > 0
          && !filters.taskTypes.some(t => isNullFilter(t))
          ? filters.taskTypes.map(t => t.trim())
          : null,
        p_product: filters.product && filters.product.trim() ? filters.product.trim() : null,
      };
      logRpcDebug('get_management_product_analysis', 'params', params);
      const { data, error } = await supabase.rpc(
        'get_management_product_analysis' as any,
        params as any
      );
      if (error) {
        logRpcDebug('get_management_product_analysis', 'error', error);
        throw error;
      }
      logRpcDebug('get_management_product_analysis', 'response', {
        rows: Array.isArray(data) ? data.length : 0,
        firstRow: Array.isArray(data) && data.length > 0 ? data[0] : null,
      });
      return (data || []) as unknown as ProductAnalysis[];
    },
    enabled: filters.enabled ?? true,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
};

export const useManagementRpcDebug = (filters: ManagementFilters & { product?: string }) => {
  const sellerParams = buildParams(filters);
  const clientParams = buildParams(filters);
  const productParams = {
    p_start_date: toDateOnly(filters.startDate),
    p_end_date: toDateOnly(filters.endDate),
    p_filial_id: filters.filialId && UUID_RE.test(filters.filialId) ? filters.filialId : null,
    p_task_types: filters.taskTypes && filters.taskTypes.length > 0
      && !filters.taskTypes.some(t => isNullFilter(t))
      ? filters.taskTypes.map(t => t.trim())
      : null,
    p_product: filters.product && filters.product.trim() ? filters.product.trim() : null,
  };

  return useQuery({
    queryKey: ['management-rpc-debug', filters],
    queryFn: async () => {
      const [seller, clients, products] = await Promise.all([
        supabase.rpc('get_management_seller_summary' as any, sellerParams as any),
        supabase.rpc('get_management_client_details' as any, clientParams as any),
        supabase.rpc('get_management_product_analysis' as any, productParams as any),
      ]);

      return {
        sellerSummary: {
          rpcName: 'get_management_seller_summary',
          params: sellerParams,
          rawData: (seller.data ?? null) as unknown[] | null,
          rowCount: Array.isArray(seller.data) ? seller.data.length : 0,
          error: seller.error ? toDebugError(seller.error) : null,
        } satisfies ManagementRpcDebugState,
        clientDetails: {
          rpcName: 'get_management_client_details',
          params: clientParams,
          rawData: (clients.data ?? null) as unknown[] | null,
          rowCount: Array.isArray(clients.data) ? clients.data.length : 0,
          error: clients.error ? toDebugError(clients.error) : null,
        } satisfies ManagementRpcDebugState,
        productAnalysis: {
          rpcName: 'get_management_product_analysis',
          params: productParams,
          rawData: (products.data ?? null) as unknown[] | null,
          rowCount: Array.isArray(products.data) ? products.data.length : 0,
          error: products.error ? toDebugError(products.error) : null,
        } satisfies ManagementRpcDebugState,
      };
    },
    enabled: filters.enabled ?? true,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
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
