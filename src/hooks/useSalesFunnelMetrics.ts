import { useConsolidatedSalesMetrics } from './useConsolidatedSalesMetrics';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

export interface SalesFunnelMetrics {
  visitas: { count: number; value: number };
  checklists: { count: number; value: number };
  ligacoes: { count: number; value: number };
  totalContatos: number;
  prospeccoesAbertas: { count: number; value: number };
  prospeccoesFechadas: { count: number; value: number };
  prospeccoesPerdidas: { count: number; value: number };
  totalProspeccoes: number;
  vendasTotal: { count: number; value: number };
  vendasParcial: { count: number; value: number };
  totalVendas: number;
  taxaConversao: number;
  // Legacy
  contacts: { count: number; value: number };
  prospects: { count: number; value: number };
  sales: { count: number; value: number };
  partialSales: { count: number; value: number };
  lostSales: { count: number; value: number };
}

/**
 * @deprecated Use `useConsolidatedSalesMetrics` diretamente.
 * Casca fina sobre as RPCs `_v2`.
 */
export const useSalesFunnelMetrics = (filters?: SalesFilters) => {
  const { metrics, isLoading, error, refetch } = useConsolidatedSalesMetrics(filters);
  const o = metrics.overview;
  const f = metrics.funnel;

  const result: SalesFunnelMetrics = {
    ...f,
    contacts:     o.contacts,
    prospects:    o.prospects,
    sales:        o.sales,
    partialSales: o.partialSales,
    lostSales:    o.lostSales,
  };

  return { metrics: result, isLoading, error, refetch };
};
