import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { parseLocalDate } from '@/lib/utils';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  filialAtendida?: string;
  activity?: string;
}

interface UnifiedSalesData {
  id: string;
  taskId: string;
  clientName: string;
  filial: string;
  filialAtendida: string | null;
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
  date: string;
  salesType?: string;
  hasOpportunity: boolean;
  hasTaskData: boolean;
  prospectValue?: number;
}

const PAGE_SIZE = 50;

/**
 * Mapeia task_type para os tipos aceitos pelo filtro
 * Normaliza legado (visita -> prospection)
 */
function normalizeTaskType(taskType: string): string {
  if (taskType === 'visita') return 'prospection';
  return taskType;
}

/**
 * Hook com scroll infinito para dados de vendas
 * USA RPC COM FILTROS NO BACKEND para performance + paginação real
 * RLS continua valendo (função INVOKER)
 */
export const useInfiniteSalesData = (filters?: SalesFilters) => {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['infinite-sales-data', filters],
    queryFn: async ({ pageParam = 0 }) => {
      try {
        // Verificar estado de autenticação
        const { data: { user } } = await supabase.auth.getUser();
        console.log('👤 [useInfiniteSalesData] Usuário:', user?.id?.substring(0, 8));
        
        const offset = pageParam * PAGE_SIZE;

        // Calcular datas de corte para filtro de período
        let startDate: string | null = null;
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
          startDate = cutoffDate.toISOString();
        }

        // Mapear activity para array de task_types
        let taskTypes: string[] | null = null;
        if (filters?.activity && filters.activity !== 'all') {
          // UI usa "field_visit" para Visita, mas no banco existem registros como "prospection" (e legados "visita")
          if (filters.activity === 'field_visit') {
            taskTypes = ['prospection', 'visita'];
          } else {
            taskTypes = [filters.activity];
          }
        }

        // CHAMAR RPC COM FILTROS NO BACKEND (incluindo p_filial_atendida)
        const { data: tasksRaw, error: tasksError } = await supabase.rpc(
          'get_secure_tasks_paginated_filtered',
          {
            p_limit: PAGE_SIZE,
            p_offset: offset,
            p_start_date: startDate,
            p_end_date: null,
            p_created_by: filters?.consultantId && filters.consultantId !== 'all' 
              ? filters.consultantId 
              : null,
            p_filial: filters?.filial && filters.filial !== 'all' 
              ? filters.filial 
              : null,
            p_filial_atendida: filters?.filialAtendida && filters.filialAtendida !== 'all'
              ? filters.filialAtendida
              : null,
            p_task_types: taskTypes
          }
        );

        if (tasksError) {
          console.error('❌ Erro ao buscar tasks filtradas:', tasksError);
          throw tasksError;
        }

        // Total vem do window function (todas as linhas que passaram pelos filtros)
        const totalCount = tasksRaw?.[0]?.total_count ?? 0;
        const tasksRawCount = tasksRaw?.length || 0;

        console.log(`📊 [useInfiniteSalesData] Página ${pageParam}: ${tasksRawCount} tasks, total filtrado: ${totalCount}`);

        // Mapear tasks (filialAtendida já filtrada no backend)
        const filteredTasks = (tasksRaw || []).map((t: any) => ({
          id: t.id,
          client: t.client,
          filial: t.filial,
          filial_atendida: t.filial_atendida,
          responsible: t.responsible,
          task_type: normalizeTaskType(t.task_type),
          status: t.status,
          is_prospect: t.is_prospect,
          sales_confirmed: t.sales_confirmed,
          sales_type: t.sales_type,
          sales_value: t.sales_value,
          partial_sales_value: t.partial_sales_value,
          start_date: t.start_date,
          end_date: t.end_date,
          created_at: t.created_at,
          updated_at: t.updated_at,
          created_by: t.created_by
        }));

        // OTIMIZAÇÃO: Buscar APENAS opportunities dos task_ids desta página
        const taskIds = filteredTasks.map((t: any) => t.id);
        
        let opportunities: any[] = [];
        if (taskIds.length > 0) {
          const { data: oppData, error: oppError } = await supabase
            .from('opportunities')
            .select('task_id, status, valor_total_oportunidade, valor_venda_fechada, cliente_nome, filial')
            .in('task_id', taskIds);
          
          if (oppError) {
            console.error('❌ [SALES DATA] ERRO ao buscar opportunities:', oppError);
            throw oppError;
          }
          opportunities = oppData || [];
        }
        
        console.log('✅ [SALES DATA] Opportunities carregadas:', opportunities.length);

        const opportunitiesMap = new Map(
          opportunities.map(opp => [opp.task_id, opp])
        );

        const unified: UnifiedSalesData[] = filteredTasks.map((task: any) => {
          const opportunity = opportunitiesMap.get(task.id);
          
          let salesStatus: 'prospect' | 'ganho' | 'perdido' | 'parcial' = 'prospect';
          
          if (opportunity) {
            if (opportunity.status === 'Venda Total') salesStatus = 'ganho';
            else if (opportunity.status === 'Venda Perdida') salesStatus = 'perdido';
            else if (opportunity.status === 'Venda Parcial') salesStatus = 'parcial';
            else salesStatus = 'prospect';
          } else if (task.sales_type) {
            salesStatus = task.sales_type as 'prospect' | 'ganho' | 'perdido' | 'parcial';
          } else if (task.is_prospect) {
            salesStatus = 'prospect';
          }
          
          const totalValue = opportunity?.valor_total_oportunidade || 
                           getSalesValueAsNumber(task.sales_value) || 0;
          
          const closedValue = opportunity?.valor_venda_fechada || 
                            (salesStatus === 'ganho' ? totalValue : 
                             salesStatus === 'parcial' ? (task.partial_sales_value || 0) : 0);
          
          const partialValue = salesStatus === 'parcial' ? closedValue : 0;

          return {
            id: opportunity ? `opp-${task.id}` : `task-${task.id}`,
            taskId: task.id,
            clientName: task.client,
            filial: task.filial || 'Não informado',
            filialAtendida: task.filial_atendida || null,
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
            date: task.start_date || task.created_at,
            salesType: task.sales_type,
            prospectValue: task.is_prospect ? totalValue : 0,
            hasOpportunity: !!opportunity,
            hasTaskData: !!task.sales_value
          };
        });

        return {
          data: unified,
          // Há próxima página se retornamos PAGE_SIZE registros E ainda não carregamos tudo
          nextPage: tasksRawCount === PAGE_SIZE && (offset + tasksRawCount) < Number(totalCount)
            ? pageParam + 1 
            : undefined,
          totalCount: Number(totalCount)
        };
        
      } catch (error) {
        console.error('❌ Erro ao carregar dados paginados:', error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 15 * 60 * 1000, // 15 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  // Combinar todas as páginas
  const allData = useMemo(() => {
    return data?.pages.flatMap(page => page.data) || [];
  }, [data]);

  // totalCount vem do backend (count real com filtros aplicados)
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Métricas calculadas
  const metrics = useMemo(() => {
    if (!allData.length) return null;

    const prospects = allData.filter(d => d.salesStatus === 'prospect');
    const wins = allData.filter(d => d.salesStatus === 'ganho');
    const losses = allData.filter(d => d.salesStatus === 'perdido');
    const partials = allData.filter(d => d.salesStatus === 'parcial');

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
      total: { count: allData.length, value: totalClosedValue },
      conversionRate,
      dataConsistency: {
        withOpportunity: allData.filter(d => d.hasOpportunity).length,
        withTaskData: allData.filter(d => d.hasTaskData).length,
        missingOpportunity: allData.filter(d => d.hasTaskData && !d.hasOpportunity).length
      }
    };
  }, [allData]);

  return {
    data: allData,
    metrics,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    totalCount
  };
};
