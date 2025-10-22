import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface UnifiedSalesData {
  id: string;
  taskId?: string;
  opportunityId?: string;
  clientName: string;
  salesStatus: string;
  totalValue: number;
  closedValue: number;
  prospectValue: number;
  filial: string;
  responsible: string;
  date: string;
  taskType?: string;
  salesType?: string;
  isProspect?: boolean;
  salesConfirmed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  partialValue?: number;
}

export const useAllSalesData = () => {
  const { data: allData = [], isLoading, error, refetch } = useQuery({
    queryKey: ['all-sales-data'],
    queryFn: async () => {
      console.log('🔄 Buscando TODOS os dados de vendas...');
      
      // Buscar TODAS as tasks de uma vez
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id,
          client_name,
          sales_status,
          sales_value,
          partial_sales_value,
          filial,
          responsible,
          start_date,
          task_type,
          sales_type,
          is_prospect,
          sales_confirmed,
          products
        `)
        .order('start_date', { ascending: false });

      if (tasksError) throw tasksError;

      // Buscar TODAS as opportunities de uma vez
      const { data: opportunities, error: oppsError } = await supabase
        .from('opportunities')
        .select('*')
        .order('created_at', { ascending: false });

      if (oppsError) throw oppsError;

      // Criar mapa de opportunities por task_id
      const opportunitiesMap = new Map();
      (opportunities || []).forEach(opp => {
        if (opp.task_id) {
          opportunitiesMap.set(opp.task_id, opp);
        }
      });

      // Transformar e unificar os dados
      const unifiedData: UnifiedSalesData[] = [];

      // Processar tasks
      (tasks || []).forEach(task => {
        const salesValue = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : (typeof task.sales_value === 'string' ? parseFloat(task.sales_value) || 0 : 0);

        const partialValue = task.partial_sales_value || 0;
        const finalValue = task.sales_type === 'parcial' && task.sales_confirmed ? partialValue : salesValue;

        unifiedData.push({
          id: `task-${task.id}`,
          taskId: task.id,
          clientName: task.client_name || 'Cliente não informado',
          salesStatus: task.sales_status || 'active',
          totalValue: salesValue,
          closedValue: task.sales_confirmed ? finalValue : 0,
          prospectValue: task.is_prospect ? salesValue : 0,
          filial: task.filial || '',
          responsible: task.responsible || '',
          date: task.start_date || new Date().toISOString(),
          taskType: task.task_type,
          salesType: task.sales_type,
          isProspect: task.is_prospect,
          salesConfirmed: task.sales_confirmed,
          createdAt: task.start_date || new Date().toISOString(),
          updatedAt: task.start_date || new Date().toISOString(),
          startDate: task.start_date || new Date().toISOString(),
          endDate: task.start_date || new Date().toISOString(),
          status: task.sales_status || 'active',
          partialValue: partialValue
        });
      });

      // Adicionar opportunities que não estão vinculadas a tasks
      (opportunities || []).forEach(opp => {
        if (!opp.task_id) {
          unifiedData.push({
            id: `opp-${opp.id}`,
            opportunityId: opp.id,
            clientName: opp.client_name || 'Cliente não informado',
            salesStatus: opp.status || 'active',
            totalValue: opp.value || 0,
            closedValue: opp.status === 'won' ? (opp.value || 0) : 0,
            prospectValue: opp.status === 'prospect' ? (opp.value || 0) : 0,
            filial: opp.filial || '',
            responsible: opp.responsible || '',
            date: opp.created_at || new Date().toISOString()
          });
        }
      });

      console.log(`✅ Total de registros carregados: ${unifiedData.length}`);
      return unifiedData;
    },
    staleTime: 30000, // 30 segundos
    gcTime: 300000 // 5 minutos
  });

  // Calcular métricas
  const metrics = useMemo(() => {
    const prospects = allData.filter(d => d.isProspect || d.salesStatus === 'prospect');
    const wins = allData.filter(d => d.salesConfirmed || d.salesStatus === 'won');
    const losses = allData.filter(d => d.salesStatus === 'lost');

    const prospectValue = prospects.reduce((sum, d) => sum + (d.prospectValue || d.totalValue), 0);
    const wonValue = wins.reduce((sum, d) => sum + d.closedValue, 0);
    const lostValue = losses.reduce((sum, d) => sum + d.totalValue, 0);

    return {
      totalRecords: allData.length,
      prospects: {
        count: prospects.length,
        value: prospectValue
      },
      wins: {
        count: wins.length,
        value: wonValue
      },
      losses: {
        count: losses.length,
        value: lostValue
      },
      conversionRate: prospects.length > 0 
        ? ((wins.length / prospects.length) * 100).toFixed(1)
        : '0.0'
    };
  }, [allData]);

  return {
    data: allData,
    metrics,
    isLoading,
    error,
    refetch,
    totalCount: allData.length
  };
};
