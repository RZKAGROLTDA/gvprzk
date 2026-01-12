import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

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
  date: string;
  salesType?: string;
  hasOpportunity: boolean;
  hasTaskData: boolean;
  prospectValue?: number;
}

const PAGE_SIZE = 50;

/**
 * Hook com scroll infinito para dados de vendas
 * USA FUNÇÃO SEGURA para respeitar permissões do usuário
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
        console.log('👤 Usuário autenticado:', {
          userId: user?.id,
          email: user?.email
        });
        
        const from = pageParam * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // BUSCAR TASKS VIA FUNÇÃO PAGINADA (respeita RLS/permissões)
        // Paginação real no backend para evitar timeout
        const { data: tasksRaw, error: tasksError } = await supabase
          .rpc('get_secure_tasks_paginated', { p_limit: PAGE_SIZE, p_offset: from });

        if (tasksError) {
          console.error('❌ Erro ao buscar tasks seguras:', tasksError);
          throw tasksError;
        }

        // Dados já vêm paginados do backend - mapear diretamente
        let tasks = (tasksRaw || []).map((t: any) => ({
          id: t.id,
          client: t.client,
          filial: t.filial,
          responsible: t.responsible,
          task_type: t.task_type,
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

        // Aplicar filtros locais (filtros já aplicados no backend apenas para período/consultor)
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
          tasks = tasks.filter((t: any) => new Date(t.created_at) >= cutoffDate);
        }

        if (filters?.consultantId && filters.consultantId !== 'all') {
          tasks = tasks.filter((t: any) => t.created_by === filters.consultantId);
        }

        if (filters?.filial && filters.filial !== 'all') {
          tasks = tasks.filter((t: any) => t.filial === filters.filial);
        }

        if (filters?.activity && filters.activity !== 'all') {
          tasks = tasks.filter((t: any) => t.task_type === filters.activity);
        }

        // Dados já paginados no backend - não aplicar slice
        const count = tasks.length;

        // OTIMIZAÇÃO: Buscar APENAS opportunities dos task_ids desta página
        const taskIds = tasks.map((t: any) => t.id);
        
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
        
        console.log('✅ [SALES DATA] Opportunities carregadas (otimizado):', opportunities.length);

        const opportunitiesMap = new Map(
          opportunities.map(opp => [opp.task_id, opp])
        );

        const unified: UnifiedSalesData[] = tasks.map((task: any) => {
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
            date: task.start_date || task.created_at,
            salesType: task.sales_type,
            prospectValue: task.is_prospect ? totalValue : 0,
            hasOpportunity: !!opportunity,
            hasTaskData: !!task.sales_value
          };
        });

        return {
          data: unified,
          nextPage: tasks.length === PAGE_SIZE ? pageParam + 1 : undefined,
          totalCount: count
        };
        
      } catch (error) {
        console.error('❌ Erro ao carregar dados paginados:', error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // 5 minutos - OTIMIZAÇÃO Disk IO
    gcTime: 15 * 60 * 1000, // 15 minutos
    refetchOnWindowFocus: false, // OTIMIZAÇÃO: não recarregar ao focar janela
    refetchOnMount: false // OTIMIZAÇÃO: usar cache existente
  });

  // Combinar todas as páginas
  const allData = useMemo(() => {
    return data?.pages.flatMap(page => page.data) || [];
  }, [data]);

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

    return {
      prospects: { count: prospects.length, value: totalProspectValue },
      wins: { count: wins.length, value: totalWinValue },
      losses: { count: losses.length, value: 0 },
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
    totalCount: data?.pages[0]?.totalCount || 0
  };
};
