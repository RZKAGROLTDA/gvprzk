import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { parseLocalDate } from '@/lib/utils';

interface UnifiedSalesData {
  id: string;
  taskId: string;
  clientName: string;
  filial: string;
  responsible: string;
  taskType: string;
  status: string;
  salesStatus: 'prospect' | 'ganho' | 'perdido' | 'parcial';
  totalValue: number;
  closedValue: number;
  partialValue: number;
  isProspect: boolean;
  salesConfirmed: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  // Flags para controle de origem dos dados
  hasOpportunity: boolean;
  hasTaskData: boolean;
}

/**
 * Hook unificado para buscar dados de vendas
 * Combina dados de tasks e opportunities de forma inteligente
 */
export const useUnifiedSalesData = () => {
  
  const { data: unifiedData, isLoading, error, refetch } = useQuery({
    queryKey: ['unified-sales-data'],
    queryFn: async () => {
      try {
        // Usar RPC filtrada (sem colunas pesadas) com corte padrão de 90 dias
        const UNIFIED_SALES_LIMIT = 300;
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { data: tasksData, error: tasksError } = await supabase
          .rpc('get_secure_tasks_paginated_filtered', {
            p_limit: UNIFIED_SALES_LIMIT,
            p_offset: 0,
            p_start_date: ninetyDaysAgo,
          });

        if (tasksError) throw tasksError;
        const tasks = (tasksData || []) as Array<Record<string, any>>;

        if (tasks.length === 0) return [];

        const taskIds = tasks.map(t => t.id as string);
        const { data: opportunitiesData, error: oppError } = await supabase
          .from('opportunities')
          .select('task_id, id, status, valor_total_oportunidade, valor_venda_fechada, data_criacao, data_fechamento')
          .in('task_id', taskIds);

        if (oppError) throw oppError;
        type OppRow = { task_id: string; id: string; status: string; valor_total_oportunidade?: number; valor_venda_fechada?: number; data_criacao?: string; data_fechamento?: string };
        const oppByTask = ((opportunitiesData || []) as OppRow[]).reduce<Record<string, OppRow>>((acc, o) => {
          acc[o.task_id] = o;
          return acc;
        }, {});

        const unified: UnifiedSalesData[] = tasks.map(task => {
          const opportunity = oppByTask[task.id as string];

          // Determinar status de venda unificado
          let salesStatus: 'prospect' | 'ganho' | 'perdido' | 'parcial' = 'prospect';
          
          if (opportunity) {
            // Usar status da opportunity como fonte principal
            if (opportunity.status === 'Ganho') salesStatus = 'ganho';
            else if (opportunity.status === 'Perdido') salesStatus = 'perdido';
            else if (opportunity.status === 'Venda Parcial') salesStatus = 'parcial';
            else salesStatus = 'prospect';
          } else if (task.sales_type) {
            // Fallback para sales_type da task
            salesStatus = task.sales_type as 'prospect' | 'ganho' | 'perdido' | 'parcial';
          } else if (task.is_prospect) {
            salesStatus = 'prospect';
          }
          
          // Calcular valores unificados
          const totalValue = opportunity?.valor_total_oportunidade || 
                           getSalesValueAsNumber(task.sales_value) || 0;
          
          const closedValue = opportunity?.valor_venda_fechada || 
                            (salesStatus === 'ganho' ? totalValue : 
                             salesStatus === 'parcial' ? (task.partial_sales_value || 0) : 0);
          
          const partialValue = salesStatus === 'parcial' ? closedValue : 0;

          return {
            id: opportunity?.id || `task-${task.id}`,
            taskId: task.id,
            clientName: task.client,
            filial: task.filial || 'Não informado',
            responsible: task.responsible,
            taskType: task.task_type,
            status: task.status,
            salesStatus,
            totalValue,
            closedValue,
            partialValue,
            isProspect: task.is_prospect || false,
            salesConfirmed: task.sales_confirmed || false,
            startDate: parseLocalDate(task.start_date),
            endDate: parseLocalDate(task.end_date),
            createdAt: parseLocalDate(task.created_at),
            updatedAt: parseLocalDate(task.updated_at),
            hasOpportunity: !!opportunity,
            hasTaskData: !!task.sales_value
          };
        });

        return unified;
        
      } catch (error) {
        console.error('❌ Erro ao carregar dados unificados:', error);
        throw error;
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutos - OTIMIZAÇÃO: slow queries opportunities
    gcTime: 30 * 60 * 1000, // 30 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false // OTIMIZAÇÃO: usar cache existente
  });

  // Métricas calculadas
  const metrics = useMemo(() => {
    if (!unifiedData) return null;

    const prospects = unifiedData.filter(d => d.salesStatus === 'prospect');
    const wins = unifiedData.filter(d => d.salesStatus === 'ganho');
    const losses = unifiedData.filter(d => d.salesStatus === 'perdido');
    const partials = unifiedData.filter(d => d.salesStatus === 'parcial');

    const totalProspectValue = prospects.reduce((sum, d) => sum + d.totalValue, 0);
    const totalWinValue = wins.reduce((sum, d) => sum + d.closedValue, 0);
    const totalPartialValue = partials.reduce((sum, d) => sum + d.partialValue, 0);
    const totalClosedValue = totalWinValue + totalPartialValue;

    const conversionRate = prospects.length > 0 
      ? ((wins.length + partials.length) / (prospects.length + wins.length + partials.length)) * 100
      : 0;

    // Vendas perdidas: usar totalValue (valor da oportunidade) ao invés de 0
    const totalLostValue = losses.reduce((sum, d) => sum + d.totalValue, 0);

    return {
      prospects: { count: prospects.length, value: totalProspectValue },
      wins: { count: wins.length, value: totalWinValue },
      losses: { count: losses.length, value: totalLostValue },
      partials: { count: partials.length, value: totalPartialValue },
      total: { count: unifiedData.length, value: totalClosedValue },
      conversionRate,
      dataConsistency: {
        withOpportunity: unifiedData.filter(d => d.hasOpportunity).length,
        withTaskData: unifiedData.filter(d => d.hasTaskData).length,
        missingOpportunity: unifiedData.filter(d => d.hasTaskData && !d.hasOpportunity).length
      }
    };
  }, [unifiedData]);

  return {
    data: unifiedData || [],
    metrics,
    isLoading,
    error,
    refetch
  };
};