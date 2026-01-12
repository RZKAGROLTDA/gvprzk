import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesFilters {
  period?: string;
  consultantId?: string;
  filial?: string;
  activity?: string;
}

export interface ConsolidatedMetrics {
  // Métricas de visão geral (antigo useAllSalesData)
  overview: {
    contacts: { count: number; value: number };
    prospects: { count: number; value: number };
    sales: { count: number; value: number };
    partialSales: { count: number; value: number };
    lostSales: { count: number; value: number };
  };
  
  // Métricas detalhadas do funil (antigo useSalesFunnelMetrics)
  funnel: {
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
  };
}

/**
 * Hook CONSOLIDADO para métricas de vendas
 * Substitui useAllSalesData + useSalesFunnelMetrics
 * USA FUNÇÃO SEGURA para respeitar permissões do usuário
 */
export const useConsolidatedSalesMetrics = (filters?: SalesFilters) => {
  const { data: metrics, isLoading, error, refetch } = useQuery({
    queryKey: ['consolidated-sales-metrics', filters],
    queryFn: async () => {
      // Helper para aplicar filtros de data
      const getDateFilter = () => {
        if (filters?.period && filters.period !== 'all') {
          const daysAgo = parseInt(filters.period);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
          return cutoffDate.toISOString();
        }
        return null;
      };

      const dateFilter = getDateFilter();

      // QUERY 1: Buscar tasks via FUNÇÃO PAGINADA (respeita RLS/permissões)
      // Usar limite de 300 para métricas - performance otimizada
      const { data: tasksRaw, error: tasksError } = await supabase
        .rpc('get_secure_tasks_paginated', { p_limit: 300, p_offset: 0 });
      
      if (tasksError) {
        console.error('❌ Erro ao buscar tasks seguras:', tasksError);
        throw tasksError;
      }

      // Aplicar filtros localmente após buscar dados seguros
      let tasks = (tasksRaw || []).map((t: any) => ({
        id: t.id,
        task_type: t.task_type,
        is_prospect: t.is_prospect,
        sales_type: t.sales_type,
        sales_confirmed: t.sales_confirmed,
        sales_value: t.sales_value,
        partial_sales_value: t.partial_sales_value,
        created_by: t.created_by,
        filial: t.filial,
        created_at: t.created_at,
        status: t.status
      }));

      // Aplicar filtros
      if (dateFilter) {
        tasks = tasks.filter((t: any) => new Date(t.created_at) >= new Date(dateFilter));
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

      // Limitar para performance
      tasks = tasks.slice(0, 1000);

      // QUERY 2: Opportunities (já tem RLS configurado)
      let opportunitiesQuery = supabase
        .from('opportunities')
        .select('id, task_id, status, valor_total_oportunidade, valor_venda_fechada, filial, created_at')
        .limit(500);
      
      if (dateFilter) {
        opportunitiesQuery = opportunitiesQuery.gte('created_at', dateFilter);
      }
      if (filters?.filial && filters.filial !== 'all') {
        opportunitiesQuery = opportunitiesQuery.eq('filial', filters.filial);
      }

      const { data: opportunitiesData, error: opportunitiesError } = await opportunitiesQuery;

      if (opportunitiesError) throw opportunitiesError;

      const opportunities = opportunitiesData || [];

      // =====================
      // PROCESSAMENTO LOCAL
      // =====================

      // Helper para calcular valor
      const calcularValor = (data: any[], field = 'sales_value') => {
        return data.reduce((sum, item) => {
          const value = typeof item[field] === 'number' 
            ? item[field] 
            : (typeof item[field] === 'string' ? parseFloat(item[field]) || 0 : 0);
          return sum + value;
        }, 0);
      };

      // --- MÉTRICAS DO FUNIL ---
      const visitas = tasks.filter(t => t.task_type === 'prospection');
      const checklists = tasks.filter(t => t.task_type === 'checklist');
      const ligacoes = tasks.filter(t => t.task_type === 'ligacao');

      const prospeccoesAbertas = tasks.filter(t => 
        t.is_prospect === true && (t.sales_confirmed === null || t.sales_confirmed === false)
      );
      const prospeccoesFechadas = tasks.filter(t => 
        t.is_prospect === true && t.sales_type === 'ganho'
      );
      const prospeccoesPerdidas = tasks.filter(t => 
        t.is_prospect === true && t.sales_type === 'perdido'
      );

      const vendasTotal = tasks.filter(t => 
        t.sales_confirmed === true && t.sales_type === 'ganho'
      );
      const vendasParcial = tasks.filter(t => 
        t.sales_confirmed === true && t.sales_type === 'parcial'
      );

      // Opportunities por status
      const oppsProspect = opportunities.filter(o => o.status === 'Prospect');
      const oppsGanho = opportunities.filter(o => o.status === 'Venda Total');
      const oppsParcial = opportunities.filter(o => o.status === 'Venda Parcial');
      const oppsPerdido = opportunities.filter(o => o.status === 'Venda Perdida' || o.status === 'Perdido');

      // Valores do funil
      const visitasValue = calcularValor(visitas);
      const checklistsValue = calcularValor(checklists);
      const ligacoesValue = calcularValor(ligacoes);
      
      const prospeccoesAbertasValue = calcularValor(prospeccoesAbertas) +
        oppsProspect.reduce((sum, opp) => sum + (opp.valor_total_oportunidade || 0), 0);
      const prospeccoesDechadasValue = calcularValor(prospeccoesFechadas);
      const prospeccoesPerdidasValue = calcularValor(prospeccoesPerdidas) +
        oppsPerdido.reduce((sum, opp) => sum + (opp.valor_total_oportunidade || 0), 0);
      
      const vendasTotalValue = calcularValor(vendasTotal) +
        oppsGanho.reduce((sum, opp) => sum + (opp.valor_venda_fechada || opp.valor_total_oportunidade || 0), 0);
      const vendasParcialValue = calcularValor(vendasParcial, 'partial_sales_value') +
        oppsParcial.reduce((sum, opp) => sum + (opp.valor_venda_fechada || 0), 0);

      const totalContatos = visitas.length + checklists.length + ligacoes.length;
      const totalProspeccoes = prospeccoesAbertas.length + prospeccoesFechadas.length + 
                              prospeccoesPerdidas.length + oppsProspect.length + oppsPerdido.length;
      const totalVendasFunil = vendasTotal.length + vendasParcial.length + oppsGanho.length + oppsParcial.length;
      const taxaConversao = totalContatos > 0 ? (totalVendasFunil / totalContatos) * 100 : 0;

      // --- MÉTRICAS DE VISÃO GERAL ---
      const taskIds = new Set(tasks.map(t => t.id));
      
      const overview = {
        contacts: { count: 0, value: 0 },
        prospects: { count: 0, value: 0 },
        sales: { count: 0, value: 0 },
        partialSales: { count: 0, value: 0 },
        lostSales: { count: 0, value: 0 }
      };

      // Processar tasks para overview
      tasks.forEach(task => {
        const salesValue = typeof task.sales_value === 'number' 
          ? task.sales_value 
          : parseFloat(task.sales_value || '0');
        
        const isLost = task.sales_type === 'perdido' || task.status === 'lost';
        const isPartial = task.sales_confirmed === true && task.sales_type === 'parcial';
        const isSale = task.sales_confirmed === true && task.sales_type !== 'parcial' && !isLost;
        const isProspect = task.is_prospect === true && !task.sales_confirmed;
        const isContact = !task.sales_confirmed && !task.is_prospect;

        if (isLost) {
          overview.lostSales.count++;
          overview.lostSales.value += salesValue;
        } else if (isPartial) {
          overview.partialSales.count++;
          overview.partialSales.value += (task.partial_sales_value || 0);
        } else if (isSale) {
          overview.sales.count++;
          overview.sales.value += salesValue;
        } else if (isProspect) {
          overview.prospects.count++;
          overview.prospects.value += salesValue;
        } else if (isContact) {
          overview.contacts.count++;
          overview.contacts.value += salesValue;
        }
      });

      // Opportunities sem task correspondente
      opportunities.forEach(opp => {
        if (!opp.task_id || !taskIds.has(opp.task_id)) {
          const oppValue = opp.valor_total_oportunidade || 0;
          
          if (opp.status === 'Venda Total') {
            overview.sales.count++;
            overview.sales.value += (opp.valor_venda_fechada || oppValue);
          } else if (opp.status === 'Venda Parcial') {
            overview.partialSales.count++;
            overview.partialSales.value += (opp.valor_venda_fechada || 0);
          } else if (opp.status === 'Perdido' || opp.status === 'Venda Perdida') {
            overview.lostSales.count++;
            overview.lostSales.value += oppValue;
          } else if (opp.status === 'Prospect') {
            overview.prospects.count++;
            overview.prospects.value += oppValue;
          } else {
            overview.contacts.count++;
            overview.contacts.value += oppValue;
          }
        }
      });

      const result: ConsolidatedMetrics = {
        overview,
        funnel: {
          visitas: { count: visitas.length, value: visitasValue },
          checklists: { count: checklists.length, value: checklistsValue },
          ligacoes: { count: ligacoes.length, value: ligacoesValue },
          totalContatos,
          prospeccoesAbertas: {
            count: prospeccoesAbertas.length + oppsProspect.length,
            value: prospeccoesAbertasValue
          },
          prospeccoesFechadas: {
            count: prospeccoesFechadas.length,
            value: prospeccoesDechadasValue
          },
          prospeccoesPerdidas: {
            count: prospeccoesPerdidas.length + oppsPerdido.length,
            value: prospeccoesPerdidasValue
          },
          totalProspeccoes,
          vendasTotal: {
            count: vendasTotal.length + oppsGanho.length,
            value: vendasTotalValue
          },
          vendasParcial: {
            count: vendasParcial.length + oppsParcial.length,
            value: vendasParcialValue
          },
          totalVendas: totalVendasFunil,
          taxaConversao
        }
      };

      console.log('✅ Métricas consolidadas carregadas (2 queries):', result);
      return result;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  // Retornar valores default se não houver dados
  const defaultMetrics: ConsolidatedMetrics = {
    overview: {
      contacts: { count: 0, value: 0 },
      prospects: { count: 0, value: 0 },
      sales: { count: 0, value: 0 },
      partialSales: { count: 0, value: 0 },
      lostSales: { count: 0, value: 0 }
    },
    funnel: {
      visitas: { count: 0, value: 0 },
      checklists: { count: 0, value: 0 },
      ligacoes: { count: 0, value: 0 },
      totalContatos: 0,
      prospeccoesAbertas: { count: 0, value: 0 },
      prospeccoesFechadas: { count: 0, value: 0 },
      prospeccoesPerdidas: { count: 0, value: 0 },
      totalProspeccoes: 0,
      vendasTotal: { count: 0, value: 0 },
      vendasParcial: { count: 0, value: 0 },
      totalVendas: 0,
      taxaConversao: 0
    }
  };

  return {
    metrics: metrics || defaultMetrics,
    isLoading,
    error,
    refetch
  };
};
