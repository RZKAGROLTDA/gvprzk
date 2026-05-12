import { useConsolidatedSalesMetrics } from './useConsolidatedSalesMetrics';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

export interface SalesMetrics {
  contacts: { count: number; value: number };
  prospects: { count: number; value: number };
  sales: { count: number; value: number };
  partialSales: { count: number; value: number };
  lostSales: { count: number; value: number };
}

/**
 * @deprecated Use `useConsolidatedSalesMetrics` diretamente.
 * Mantido como casca fina para compatibilidade — agora delega 100% à RPC `_v2`.
 */
export const useAllSalesData = (filters?: SalesFilters) => {
  const { metrics, isLoading, error, refetch } = useConsolidatedSalesMetrics(filters);
  return {
    metrics: metrics.overview as SalesMetrics,
    isLoading,
    error,
    refetch,
  };
};
