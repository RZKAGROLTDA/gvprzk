import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

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
        // Buscar todas as tasks com joins para opportunities
        const { data: tasksWithOpportunities, error: tasksError } = await supabase
          .from('tasks')
          .select(`
            id,
            name,
            responsible,
            client,
            property,
            filial,
            task_type,
            status,
            sales_value,
            partial_sales_value,
            sales_type,
            sales_confirmed,
            is_prospect,
            start_date,
            end_date,
            created_at,
            updated_at,
            created_by,
            opportunities (
              id,
              status,
              valor_total_oportunidade,
              valor_venda_fechada,
              data_criacao,
              data_fechamento
            )
          `)
          .order('created_at', { ascending: false });

        if (tasksError) throw tasksError;

        const unified: UnifiedSalesData[] = (tasksWithOpportunities || []).map(task => {
          const opportunity = task.opportunities?.[0]; // Assume uma oportunidade por task
          
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
            startDate: new Date(task.start_date),
            endDate: new Date(task.end_date),
            createdAt: new Date(task.created_at),
            updatedAt: new Date(task.updated_at),
            hasOpportunity: !!opportunity,
            hasTaskData: !!task.sales_value
          };
        });

        console.log(`📊 Dados unificados carregados: ${unified.length} registros`);
        return unified;
        
      } catch (error) {
        console.error('❌ Erro ao carregar dados unificados:', error);
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutos
    refetchOnWindowFocus: false
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

    return {
      prospects: { count: prospects.length, value: totalProspectValue },
      wins: { count: wins.length, value: totalWinValue },
      losses: { count: losses.length, value: 0 },
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