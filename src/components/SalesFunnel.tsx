import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye, RefreshCw, ChevronDown, ChevronUp, Edit, BarChart3, Users, TrendingUp, MapPin, Database, Trash2, Loader2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { toast } from 'sonner';
import { Task } from '@/types/task';

import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { OpportunityDetailsModal } from '@/components/OpportunityDetailsModal';
import { TaskFormVisualization } from '@/components/TaskFormVisualization';
import { OpportunityReport } from '@/components/OpportunityReport';
import { TaskEditModal } from '@/components/TaskEditModal';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { formatSalesValue, getSalesValueAsNumber } from '@/lib/securityUtils';
import { getFilialNameRobust, loadFiliaisCache } from '@/lib/taskStandardization';
import { useInfiniteSalesData } from '@/hooks/useInfiniteSalesData';
import { ClientFilter, matchesClient, type SelectedClient } from '@/components/ClientFilter';
import { useConsolidatedSalesMetrics, fetchConsolidatedMetrics } from '@/hooks/useConsolidatedSalesMetrics';
import { CRM_DIVISIONAIS, divisionalOfFilial, type CrmDivisional } from '@/lib/crmDivisional';
import { recordsForStage, sumConsolidatedMetrics, type ActivityKind, type FunnelStage } from '@/lib/salesFunnelView';
import { SalesFunnelChart, ActivityBreakdown, FunnelRecords, STAGE_LABEL, type FunnelRow } from '@/components/funnel/SalesFunnelChart';
import { DataMigrationPanel } from '@/components/DataMigrationPanel';
import { parseLocalDate, formatDateDisplay } from '@/lib/utils';
import { classifyChecklistTasks, jdLabel, jdVariant } from '@/lib/jdChassis';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SalesFunnelData {
  contacts: {
    count: number;
    value: number;
  };
  prospects: {
    count: number;
    value: number;
  };
  sales: {
    count: number;
    value: number;
  };
  partialSales: {
    count: number;
    value: number;
  };
  lostSales: {
    count: number;
    value: number;
  };
}
interface CoverageData {
  consultant: string;
  filial: string;
  totalClients: number;
  visitedClients: number;
  coverage: number;
}
interface ClientDetails {
  client: string;
  filial: string;
  consultant: string;
  totalActivities: number;
  lastActivity: Date;
  salesValue: number;
  status: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function sortRows<T>(rows: T[], get: (r: T) => string | number, dir: 'asc' | 'desc'): T[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * m;
    return String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base' }) * m;
  });
}

const SortHead: React.FC<{ label: string; k: string; sort: SortState; onSort: (s: SortState) => void; align?: 'right' }> = ({ label, k, sort, onSort, align }) => {
  const active = sort?.key === k;
  const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={`whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}
        onClick={() => onSort(!active ? { key: k, dir: 'desc' } : sort!.dir === 'desc' ? { key: k, dir: 'asc' } : null)}>
        {label}<Icon className="h-3.5 w-3.5 opacity-70" />
      </button>
    </TableHead>
  );
};

const STATUS_TONE: Record<string, string> = {
  'Venda Total': 'bg-metric-visits-soft text-metric-visits',
  'Venda Parcial': 'bg-metric-calls-soft text-metric-calls',
  'Venda Perdida': 'bg-metric-lost-soft text-metric-lost',
  'Prospect': 'bg-metric-clients-soft text-metric-clients',
};

export const SalesFunnel: React.FC = () => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('7');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [selectedFilial, setSelectedFilial] = useState<string>('all');
  const [selectedFilialAtendida, setSelectedFilialAtendida] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [selectedDivisional, setSelectedDivisional] = useState<'all' | CrmDivisional>('all');
  const [funnelStage, setFunnelStage] = useState<FunnelStage>('contacts');
  const [funnelActivity, setFunnelActivity] = useState<ActivityKind | null>(null);
  const [funnelLimit, setFunnelLimit] = useState(50);
  const [jdFilter, setJdFilter] = useState<string>('all');
  const [reportSort, setReportSort] = useState<SortState>(null);
  const [detailsSort, setDetailsSort] = useState<SortState>(null);
  const [itemsPerPage, setItemsPerPage] = useState<string>('50');
  const [displayPage, setDisplayPage] = useState<number>(1);
  // Deep-link opcional (?view=details) usado pelo Meu Dia — sem alterar o padrão atual.
  const initialView = ((): 'overview' | 'funnel' | 'coverage' | 'details' | 'migration' => {
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'funnel' || requested === 'coverage' || requested === 'details'
      ? requested
      : 'overview';
  })();
  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details' | 'migration'>(initialView);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisualizationModalOpen, setIsVisualizationModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTaskVisualizationOpen, setIsTaskVisualizationOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, isSupervisor, isLoading: isLoadingRole } = useUserRole();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('🔧 SalesFunnel: Estado do admin:', { isAdmin, isSupervisor, isLoadingRole });
  }

  // Track whether the consultant filter was explicitly chosen in THIS session.
  // For supervisors, we never want a stale/persisted consultant id to silently
  // scope the dashboard to an empty subset.
  const consultantExplicitRef = useRef(false);

  const handleConsultantChange = useCallback((value: string) => {
    consultantExplicitRef.current = value !== 'all';
    setSelectedConsultant(value);
  }, []);

  // Defensive sweep: when the user is a supervisor, clear any persisted
  // consultant filter that could be cached from a previous session/profile.
  useEffect(() => {
    if (!isSupervisor) return;
    try {
      Object.keys(localStorage).forEach((k) => {
        if (/consultant|selectedConsultant|analise.?gerencial|sales.?funnel/i.test(k)) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    if (!consultantExplicitRef.current && selectedConsultant !== 'all') {
      setSelectedConsultant('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupervisor]);

  const handleClearFilters = useCallback(() => {
    consultantExplicitRef.current = false;
    setSelectedPeriod('7');
    setSelectedConsultant('all');
    setSelectedFilial('all');
    setSelectedDivisional('all');
    setSelectedFilialAtendida('all');
    setSelectedActivity('all');
    setSelectedClient(null);
    queryClient.invalidateQueries({ queryKey: ['consolidated-sales-metrics-v2'] });
    queryClient.invalidateQueries({ queryKey: ['client-details'] });
    queryClient.invalidateQueries({ queryKey: ['infinite-sales-data'] });
    toast.success('Filtros limpos');
  }, [queryClient]);

  // Fetch users filtrados por filial para supervisores
  const { consultants } = useFilteredConsultants();

  // Fetch filiais
  const {
    data: filiais = []
  } = useQuery({
    queryKey: ['filiais'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('filiais').select('id, nome');
      if (error) throw error;
      return data || [];
    },
    staleTime: 15 * 60 * 1000, // 15 min - dados estáticos
    gcTime: 60 * 60 * 1000, // 1 hora
  });
  

  // Initialize filial cache on component mount
  useEffect(() => {
    loadFiliaisCache().catch(() => {});
  }, []);

  // Removed useTasksOptimized() - using useInfiniteSalesData instead

  // Criar objeto de filtros para passar aos hooks.
  // Proteção: se o usuário é supervisor e NÃO escolheu explicitamente um
  // consultor nesta sessão, jamais enviar consultantId — evita que um id
  // residual zere os cards da Análise Gerencial.
  const effectiveConsultant =
    isSupervisor && !consultantExplicitRef.current ? 'all' : selectedConsultant;

  const filters = useMemo(() => ({
    period: selectedPeriod,
    consultantId: effectiveConsultant,
    filial: selectedFilial,
    filialAtendida: selectedFilialAtendida,
    activity: selectedActivity,
    client: selectedClient,
  }), [selectedPeriod, effectiveConsultant, selectedFilial, selectedFilialAtendida, selectedActivity, selectedClient]);

  // Hook CONSOLIDADO para métricas (substitui useAllSalesData + useSalesFunnelMetrics)
  const {
    metrics: consolidatedMetricsRaw,
    isLoading: isLoadingMetricsRaw,
    error: metricsError,
    refetch: refetchMetrics
  } = useConsolidatedSalesMetrics(filters);
  let consolidatedMetrics = consolidatedMetricsRaw;

  // Divisional: agrupa apenas filiais que o usuário já enxerga; quando nenhuma
  // filial específica é escolhida, soma as métricas oficiais de cada filial.
  const divisionalFiliais = useMemo(
    () => selectedDivisional === 'all' ? [] : filiais.filter(f => divisionalOfFilial(f.nome) === selectedDivisional),
    [filiais, selectedDivisional],
  );
  const useDivisionalSum = selectedDivisional !== 'all' && selectedFilial === 'all';
  const divisionalQueries = useQueries({
    queries: (useDivisionalSum ? divisionalFiliais : []).map(f => ({
      queryKey: ['consolidated-sales-metrics-v2', 'divisional', f.nome, filters],
      queryFn: () => fetchConsolidatedMetrics({ ...filters, filial: f.nome }),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });
  const divisionalMetrics = useMemo(() => {
    if (!useDivisionalSum) return null;
    if (divisionalQueries.some(q => !q.data)) return undefined;
    return sumConsolidatedMetrics(divisionalQueries.map(q => q.data!)) ?? sumConsolidatedMetrics([consolidatedMetrics]);
  }, [useDivisionalSum, divisionalQueries, consolidatedMetrics]);
  if (divisionalMetrics) consolidatedMetrics = divisionalMetrics;
  const isLoadingDivisional = useDivisionalSum && divisionalMetrics === undefined;

  // Extrair métricas para compatibilidade
  const overviewMetrics = consolidatedMetrics.overview;
  const funnelMetrics = consolidatedMetrics.funnel;
  const isLoadingMetrics = isLoadingMetricsRaw || isLoadingDivisional;
  const isLoadingOverview = isLoadingMetrics;
  const isLoadingFunnel = isLoadingMetrics;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[SalesFunnel] metrics', {
      isLoadingMetrics,
      metricsError,
      overviewMetrics,
      funnelMetrics,
    });
  }


  // Usar hook com scroll infinito (usado na aba Relatório)
  const { 
    data: infiniteSalesData, 
    metrics, 
    isLoading: isLoadingInfiniteData, 
    error: salesError, 
    refetch: refetchSales,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    totalCount: infiniteDataCount
  } = useInfiniteSalesData(filters);

  // Query com infinite scroll para a aba Detalhes dos Clientes
  // USA FUNÇÃO SEGURA para respeitar permissões do usuário
  const {
    data: clientDetailsPages,
    isLoading: isLoadingClientDetails,
    refetch: refetchClientDetails,
    fetchNextPage: fetchNextClientDetailsPage,
    hasNextPage: hasNextClientDetailsPage,
    isFetchingNextPage: isFetchingNextClientDetailsPage,
  } = useInfiniteQuery({
    queryKey: ['client-details', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const PAGE_SIZE = 50;
      const offset = pageParam * PAGE_SIZE;

      // Calcular datas de corte para filtro de período (igual ao Relatório)
      let startDate: string | null = null;
      if (filters?.period && filters.period !== 'all') {
        const daysAgo = parseInt(filters.period);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        startDate = cutoffDate.toISOString();
      }

      // Mapear activity para array de task_types (igual ao Relatório)
      let taskTypes: string[] | null = null;
      if (filters?.activity && filters.activity !== 'all') {
        if (filters.activity === 'field_visit') {
          taskTypes = ['prospection', 'visita'];
        } else {
          taskTypes = [filters.activity];
        }
      }

      // BUSCAR VIA FUNÇÃO PAGINADA E FILTRADA (inclui p_filial_atendida)
      const { data: tasksRaw, error } = await supabase.rpc(
        'get_secure_tasks_paginated_filtered',
        {
          p_limit: PAGE_SIZE,
          p_offset: offset,
          p_start_date: startDate,
          p_end_date: null,
          p_created_by:
            filters?.consultantId && filters.consultantId !== 'all'
              ? filters.consultantId
              : null,
          p_filial: filters?.filial && filters.filial !== 'all' ? filters.filial : null,
          p_filial_atendida:
            filters?.filialAtendida && filters.filialAtendida !== 'all'
              ? filters.filialAtendida
              : null,
          p_task_types: taskTypes,
        }
      );

      if (error) {
        console.error('❌ Erro ao buscar tasks filtradas (details):', error);
        throw error;
      }

      const tasksRawCount = tasksRaw?.length || 0;
      const totalCount = Number(tasksRaw?.[0]?.total_count ?? 0);

      const formattedTasks = (tasksRaw || []).map((task: any) => ({
        id: task.id,
        client: task.client,
        responsible: task.responsible,
        filial: task.filial || 'Sem Filial',
        taskType: task.task_type,
        isProspect: task.is_prospect || false,
        salesConfirmed: task.sales_confirmed || false,
        salesType: task.sales_type as 'ganho' | 'perdido' | 'parcial' | undefined,
        salesValue: getSalesValueAsNumber(task.sales_value) || 0,
        partialSalesValue: task.partial_sales_value || 0,
        createdAt: new Date(task.created_at),
        created_by: task.created_by,
      }));

      return {
        data: formattedTasks,
        totalCount,
        nextPage:
          tasksRawCount === PAGE_SIZE && offset + tasksRawCount < totalCount
            ? pageParam + 1
            : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: activeView === 'details',
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });


  // Flatten client details data
  const clientDetailsData = useMemo(() => {
    const rows = clientDetailsPages?.pages.flatMap(page => page.data) || [];
    const byClient = selectedClient ? rows.filter((t: any) => matchesClient(selectedClient, t.clientcode ?? null, t.client)) : rows;
    // Divisional: a consulta paginada não recebe divisional; aplica o mesmo filtro das demais abas (filial do registro).
    if (selectedDivisional === 'all') return byClient;
    return byClient.filter((t: any) => divisionalOfFilial(getFilialNameRobust(t.filial, filiais)) === selectedDivisional);
  }, [clientDetailsPages, selectedClient, selectedDivisional, filiais]);

  // Com Cliente selecionado, carrega as páginas restantes para que o filtro fique completo.
  useEffect(() => {
    if (activeView === 'details' && selectedDivisional !== 'all' && hasNextClientDetailsPage && !isFetchingNextClientDetailsPage) fetchNextClientDetailsPage();
    if (!selectedClient) return;
    if (activeView === 'details' && hasNextClientDetailsPage && !isFetchingNextClientDetailsPage) fetchNextClientDetailsPage();
    if (activeView === 'coverage' && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [selectedClient, selectedDivisional, activeView, hasNextClientDetailsPage, isFetchingNextClientDetailsPage, fetchNextClientDetailsPage, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Total count for client details
  const clientDetailsTotalCount = (selectedClient || selectedDivisional !== 'all') ? clientDetailsData.length : (clientDetailsPages?.pages[0]?.totalCount || 0);

  // Decidir qual fonte de dados usar baseado na view ativa
  const isLoadingData = activeView === 'overview' 
    ? isLoadingOverview 
    : activeView === 'funnel'
      ? isLoadingFunnel
      : activeView === 'details'
        ? isLoadingClientDetails
        : isLoadingInfiniteData;
  const currentDataSource = useMemo(() => {
    const rows = infiniteSalesData || [];
    return selectedClient ? rows.filter((sale: any) => matchesClient(selectedClient, sale.clientCode ?? sale.clientcode ?? null, sale.clientName ?? sale.client)) : rows;
  }, [infiniteSalesData, selectedClient]);

  // Resetar página de display quando filtros ou itemsPerPage mudam
  React.useEffect(() => {
    setDisplayPage(1);
  }, [filters, itemsPerPage]);

  // Observer para scroll infinito - aba 'coverage' (Relatório)
  const observerTarget = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (activeView !== 'coverage') return;

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0].isIntersecting) return;
        const shownCount = itemsPerPage === 'all'
          ? Infinity
          : parseInt(itemsPerPage) * displayPage;
        const hasMoreLoaded = shownCount < infiniteSalesData.length;
        if (hasMoreLoaded) {
          // Avança display sem nova query
          setDisplayPage(p => p + 1);
        } else if (hasNextPage && !isFetchingNextPage) {
          // Busca próxima página no backend e avança display
          fetchNextPage();
          setDisplayPage(p => p + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);
    return () => { if (currentTarget) observer.unobserve(currentTarget); };
  }, [activeView, hasNextPage, isFetchingNextPage, fetchNextPage, displayPage, itemsPerPage, infiniteSalesData.length]);

  // Observer para scroll infinito - aba 'details' (Detalhes dos Clientes)
  const clientDetailsObserverTarget = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Somente aplicar infinite scroll na aba 'details'
    if (activeView !== 'details') return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextClientDetailsPage && !isFetchingNextClientDetailsPage) {
          console.log('🔄 Carregando próxima página de clientes...');
          fetchNextClientDetailsPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = clientDetailsObserverTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [activeView, hasNextClientDetailsPage, isFetchingNextClientDetailsPage, fetchNextClientDetailsPage]);

  // Fetch opportunities data to get valor_total_oportunidade and valor_venda_fechada
  // OTIMIZAÇÃO Disk IO: só carregar na aba Relatório e sem COUNT exact
  const {
    data: opportunitiesQueryResult
  } = useQuery({
    queryKey: ['opportunities-data', selectedFilial, selectedFilialAtendida, selectedPeriod],
    queryFn: async () => {
      console.log('🔄 Carregando opportunities com filtros...');
      
      // OTIMIZAÇÃO Disk IO: Selecionar campos necessários + JOIN com task para pegar responsible + filial_atendida
      // !inner para permitir filtro no relacionamento
      let query = supabase
        .from('opportunities')
        .select('id, task_id, cliente_nome, filial, status, valor_total_oportunidade, valor_venda_fechada, data_criacao, created_at, updated_at, tasks!fk_opportunities_task!inner(responsible, task_type, filial_atendida)');

      // Aplicar filtro de filial
      if (selectedFilial !== 'all') {
        query = query.eq('filial', selectedFilial);
      }

      // Aplicar filtro de filial atendida (via task relacionada)
      if (selectedFilialAtendida !== 'all') {
        query = query.eq('tasks.filial_atendida', selectedFilialAtendida);
      }

      // Aplicar filtro de período
      if (selectedPeriod !== 'all') {
        const daysAgo = parseInt(selectedPeriod);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        query = query.gte('data_criacao', cutoffDate.toISOString());
      }

      const { data, error } = await query.order('data_criacao', { ascending: false }).limit(500);
      
      if (error) {
        console.error('❌ Erro ao carregar opportunities:', error);
        throw error;
      }
      console.log('✅ Opportunities carregadas:', {
        total: data?.length || 0,
        amostras: data?.slice(0, 3).map(o => ({
          cliente: o.cliente_nome,
          filial: o.filial,
          status: o.status
        }))
      });
      return { data: data || [] };
    },
    enabled: activeView === 'coverage' || activeView === 'funnel',
    staleTime: 10 * 60 * 1000, // 10 minutos - OTIMIZAÇÃO: slow queries
    gcTime: 30 * 60 * 1000, // 30 minutos no cache
    refetchOnMount: false, // OTIMIZAÇÃO: usar cache
    refetchOnWindowFocus: false, // OTIMIZAÇÃO: não recarregar ao focar janela
  });

  const opportunitiesData = opportunitiesQueryResult?.data || [];

  // Create a map for quick lookup of opportunity values
  const opportunityValues = useMemo(() => {
    const map = new Map();
    opportunitiesData.forEach(opp => {
      map.set(opp.task_id, {
        valor_total_oportunidade: opp.valor_total_oportunidade || 0,
        valor_venda_fechada: opp.valor_venda_fechada || 0,
        status: opp.status
      });
    });
    return map;
  }, [opportunitiesData]);
  const forceRefresh = useCallback(async () => {
    console.log('🔄 FUNNEL: Forçando atualização de dados...');

    // Invalidar todas as queries relacionadas
    const invalidateAll = async () => {
      await queryClient.invalidateQueries({
        queryKey: ['tasks-optimized']
      });
      await queryClient.invalidateQueries({
        queryKey: ['infinite-sales-data']
      });
      await queryClient.invalidateQueries({
        queryKey: ['consolidated-sales-metrics']
      });
      await queryClient.invalidateQueries({
        queryKey: ['client-details']
      });
      await queryClient.invalidateQueries({
        queryKey: ['consultants']
      });
      await queryClient.invalidateQueries({
        queryKey: ['filiais']
      });
      await queryClient.invalidateQueries({
        queryKey: ['opportunities-data']
      });
      console.log('♻️ FUNNEL: Todas as queries invalidadas');
    };
    await invalidateAll();
    await refetchMetrics();
    await refetchSales();
    if (activeView === 'details') {
      await refetchClientDetails();
    }
  }, [queryClient, refetchMetrics, refetchSales, refetchClientDetails, activeView]);

  // Utility functions for name matching
  const normalizeName = useCallback((name: string): string => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }, []);
  const isNameMatch = useCallback((taskName: string, consultantName: string): boolean => {
    return normalizeName(taskName) === normalizeName(consultantName);
  }, [normalizeName]);

  // Os filtros já são aplicados nos hooks, então usamos os dados diretamente
  const filteredSalesData = currentDataSource;

  // Converter salesData para formato de tasks para compatibilidade, incluindo opportunities standalone
  const filteredTasks = useMemo(() => {
    const tasksFromSales = filteredSalesData.map(sale => {
      const startDateStr = typeof sale.startDate === 'string' ? sale.startDate : sale.date;
      const endDateStr = typeof sale.endDate === 'string' ? sale.endDate : sale.date;
      const createdAtStr = typeof sale.createdAt === 'string' ? sale.createdAt : sale.date;
      const updatedAtStr = typeof sale.updatedAt === 'string' ? sale.updatedAt : sale.date;

      // Normalizar legado: algumas tasks antigas podem ter task_type = "visita"
      const normalizedSaleTaskType = (sale.taskType === 'visita' ? 'prospection' : sale.taskType) as string;

      return {
        id: sale.taskId,
        name: sale.clientName,
        client: sale.clientName,
        responsible: sale.responsible,
        filial: sale.filial,
        taskType: (normalizedSaleTaskType as "checklist" | "ligacao" | "prospection") || 'prospection',
        status: sale.status || 'active',
        isProspect: sale.isProspect,
        salesConfirmed: sale.salesConfirmed,
        salesType: sale.salesStatus,
        salesValue: sale.totalValue,
        partialSalesValue: sale.partialValue || 0,
        createdAt: parseLocalDate(createdAtStr),
        updatedAt: parseLocalDate(updatedAtStr),
        startDate: parseLocalDate(startDateStr),
        endDate: parseLocalDate(endDateStr),
        start_date: startDateStr.split('T')[0],
        end_date: endDateStr.split('T')[0],
        property: '',
        observations: '',
        priority: 'medium' as 'low' | 'medium' | 'high',
        startTime: '08:00',
        endTime: '18:00',
        start_time: '08:00',
        end_time: '18:00',
        createdBy: '',
        created_by: '',
        photos: [],
        documents: [],
        reminders: [],
        checklist: [],
        prospectNotes: '',
        clientcode: '',
        email: '',
        phone: '',
        familyProduct: '',
        propertyHectares: 0,
        equipmentQuantity: 0,
        equipmentList: [],
        initialKm: 0,
        finalKm: 0,
        checkInLocation: null
      } as Task;
    });

    // Adicionar opportunities standalone (sem task correspondente)
    const taskIds = new Set(tasksFromSales.map(t => t.id));

    // Atividade selecionada deve filtrar opportunities standalone também (senão "vaza" visita quando seleciona ligação)
    const activityMap: Record<string, string[]> = {
      field_visit: ['prospection'],
      ligacao: ['ligacao'],
      checklist: ['checklist'],
    };
    const allowedActivityTypes = selectedActivity !== 'all'
      ? (activityMap[selectedActivity] || [selectedActivity])
      : null;

    const standaloneOpportunities = (opportunitiesData || [])
      .filter(opp => {
        // Filtrar opportunities que não têm task correspondente ou cuja task não está nos dados carregados
        const isStandalone = !opp.task_id || !taskIds.has(opp.task_id);
        if (!isStandalone) return false;
        if (selectedClient && !matchesClient(selectedClient, null, (opp as any).cliente_nome)) return false;

        if (!allowedActivityTypes) return true;

        const oppTaskTypeRaw = ((opp as any).tasks?.task_type as string | undefined);
        const oppTaskType = oppTaskTypeRaw === 'visita' ? 'prospection' : oppTaskTypeRaw;
        return oppTaskType ? allowedActivityTypes.includes(oppTaskType) : false;
      })
      .map(opp => {
        const createdAtStr = opp.data_criacao || opp.created_at;
        const createdAt = parseLocalDate(createdAtStr);

        // CRITICAL FIX: Use task_id when available, not opportunity id
        // The modal expects a task ID, not an opportunity ID
        // Get responsible + task_type from joined task data
        const taskData = (opp as any).tasks;
        const responsible = taskData?.responsible || '-';
        const oppTaskTypeRaw = (taskData?.task_type as string | undefined);
        const oppTaskType = oppTaskTypeRaw === 'visita' ? 'prospection' : oppTaskTypeRaw;

        return {
          id: opp.task_id || opp.id, // Use task_id if available
          opportunityId: opp.id, // Keep opportunity ID for reference
          name: opp.cliente_nome,
          client: opp.cliente_nome,
          responsible: responsible,
          filial: opp.filial || '',
          taskType: (oppTaskType as "checklist" | "ligacao" | "prospection") || 'prospection',
          status: 'pending' as 'closed' | 'completed' | 'in_progress' | 'pending',
          isProspect: opp.status === 'Prospect',
          salesConfirmed: opp.status === 'Venda Total' || opp.status === 'Venda Parcial',
          salesType: opp.status === 'Venda Total' ? 'ganho' : opp.status === 'Venda Parcial' ? 'parcial' : opp.status === 'Venda Perdida' ? 'perdido' : null,
          salesValue: opp.valor_total_oportunidade || 0,
          partialSalesValue: opp.status === 'Venda Parcial' ? opp.valor_venda_fechada || 0 : 0,
          createdAt: createdAt,
          updatedAt: parseLocalDate(opp.updated_at || createdAtStr),
          startDate: createdAt,
          endDate: createdAt,
          start_date: createdAtStr.split('T')[0],
          end_date: createdAtStr.split('T')[0],
          property: '',
          observations: `Opportunity - ${opp.status}`,
          priority: 'medium' as 'low' | 'medium' | 'high',
          startTime: '08:00',
          endTime: '18:00',
          start_time: '08:00',
          end_time: '18:00',
          createdBy: '',
          created_by: '',
          photos: [],
          documents: [],
          reminders: [],
          checklist: [],
          prospectNotes: '',
          clientcode: '',
          email: '',
          phone: '',
          familyProduct: '',
          propertyHectares: 0,
          equipmentQuantity: 0,
          equipmentList: [],
          initialKm: 0,
          finalKm: 0,
          checkInLocation: null
        } as Task;
      });

    const all = [...tasksFromSales, ...standaloneOpportunities];
    if (selectedDivisional === 'all') return all;
    return all.filter(t => divisionalOfFilial(getFilialNameRobust(t.filial, filiais)) === selectedDivisional);
  }, [filteredSalesData, opportunitiesData, selectedActivity, selectedClient, selectedDivisional, filiais]);

  // Auditoria JD: classificação no servidor (respeita o acesso do usuário)
  const checklistIds = useMemo(
    () => [...new Set(filteredTasks.filter(t => t.taskType === 'checklist').map(t => t.id).filter(Boolean))].sort(),
    [filteredTasks],
  );
  const { data: jdMap, isLoading: isLoadingJd } = useQuery({
    queryKey: ['jd-classify-report', checklistIds],
    queryFn: () => classifyChecklistTasks(checklistIds),
    enabled: activeView === 'coverage' && checklistIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const reportTasks = useMemo(() => {
    if (jdFilter === 'all') return filteredTasks;
    return filteredTasks.filter(t => t.taskType === 'checklist' && jdMap?.get(t.id) === jdFilter);
  }, [filteredTasks, jdFilter, jdMap]);

  const sortedReportTasks = useMemo(() => {
    if (!reportSort) return reportTasks;
    const get = (t: Task): string | number => {
      const opp = opportunityValues.get(t.id) as any;
      switch (reportSort.key) {
        case 'client': return t.client || '';
        case 'responsible': return t.responsible || '';
        case 'filial': return getFilialNameRobust(t.filial, filiais) || '';
        case 'opp': return getSalesValueAsNumber(opp?.valor_total_oportunidade) || getSalesValueAsNumber(t.salesValue) || 0;
        case 'sold': return getSalesValueAsNumber(opp?.valor_venda_fechada) || (t.salesType === 'parcial' ? (t.partialSalesValue || 0) : t.salesConfirmed && t.salesType === 'ganho' ? getSalesValueAsNumber(t.salesValue) || 0 : 0);
        default: return new Date(t.createdAt as any).getTime() || 0;
      }
    };
    return sortRows(reportTasks, get, reportSort.dir);
  }, [reportTasks, reportSort, opportunityValues, filiais]);

  // totalCount agora vem direto do backend (count real com filtros aplicados)
  // infiniteDataCount já contém o total correto da query paginada com filtros
  const totalCount = useMemo(() => {
    // Adicionar opportunities standalone que não estão vinculadas a tasks
    const allOppsCount = opportunitiesData?.length || 0;
    const oppsWithTask = opportunitiesData?.filter(opp => opp.task_id).length || 0;
    const standaloneOppsCount = Math.max(0, allOppsCount - oppsWithTask);
    return infiniteDataCount + standaloneOppsCount;
  }, [infiniteDataCount, opportunitiesData]);

  // Calculate hierarchical funnel data
  const funnelData = useMemo(() => {
    // FILTRAR POR ATIVIDADE PRIMEIRO (básico mas crítico)
    let tasksToAnalyze = filteredTasks;
    
    if (selectedActivity && selectedActivity !== 'all') {
      const activityMap: Record<string, string[]> = {
        field_visit: ['prospection'],
        ligacao: ['ligacao'],
        checklist: ['checklist'],
      };
      const allowedTypes = activityMap[selectedActivity] || [selectedActivity];
      tasksToAnalyze = filteredTasks.filter(t => allowedTypes.includes(t.taskType));
    }

    // PROSPECÇÕES (primeira seção)
    const prospeccoesAbertas = tasksToAnalyze.filter(task => task.isProspect && !task.salesConfirmed);
    const prospeccoesFechadas = tasksToAnalyze.filter(task => task.isProspect && task.salesType === 'ganho');
    const prospeccoesPerdidas = tasksToAnalyze.filter(task => task.isProspect && task.salesType === 'perdido');

    // CONTATOS COM CLIENTES (segunda seção)
    const visitas = tasksToAnalyze.filter(task => task.taskType === 'prospection');
    const checklists = tasksToAnalyze.filter(task => task.taskType === 'checklist');
    const ligacoes = tasksToAnalyze.filter(task => task.taskType === 'ligacao');

    // VENDAS (terceira seção)
    const vendasTotal = tasksToAnalyze.filter(task => task.salesConfirmed && task.salesType === 'ganho');
    const vendasParcial = tasksToAnalyze.filter(task => task.salesConfirmed && task.salesType === 'parcial');
    const totalProspeccoes = prospeccoesAbertas.length + prospeccoesFechadas.length + prospeccoesPerdidas.length;
    const totalContatos = visitas.length + checklists.length + ligacoes.length;
    const totalVendas = vendasTotal.length + vendasParcial.length;
    const taxaConversao = totalContatos > 0 ? totalVendas / totalContatos * 100 : 0;
    return {
      // Prospecções (primeira seção)
      prospeccoesAbertas: {
        count: prospeccoesAbertas.length,
        value: prospeccoesAbertas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      prospeccoesFechadas: {
        count: prospeccoesFechadas.length,
        value: prospeccoesFechadas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      prospeccoesPerdidas: {
        count: prospeccoesPerdidas.length,
        value: prospeccoesPerdidas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      totalProspeccoes,
      // Contatos com clientes (segunda seção)
      visitas: {
        count: visitas.length,
        value: visitas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      checklists: {
        count: checklists.length,
        value: checklists.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      ligacoes: {
        count: ligacoes.length,
        value: ligacoes.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      totalContatos,
      // Vendas (terceira seção)
      vendasTotal: {
        count: vendasTotal.length,
        value: vendasTotal.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      vendasParcial: {
        count: vendasParcial.length,
        value: vendasParcial.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      totalVendas,
      // Taxa de conversão
      taxaConversao,
      // Legacy data for compatibility
      contacts: {
        count: totalContatos,
        value: visitas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0) +
               checklists.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0) +
               ligacoes.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      prospects: {
        count: prospeccoesAbertas.length,
        value: prospeccoesAbertas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      sales: {
        count: vendasTotal.length,
        value: vendasTotal.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      partialSales: {
        count: vendasParcial.length,
        value: vendasParcial.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      lostSales: {
        count: prospeccoesPerdidas.length,
        value: prospeccoesPerdidas.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      }
    };
  }, [filteredTasks, selectedActivity]);

  // Memoized function to get filial name to prevent excessive recalculations
  const getFilialName = useCallback((filialValue: string | null | undefined) => {
    return getFilialNameRobust(filialValue, filiais);
  }, [filiais]);

  // Calculate coverage data
  const coverageData = useMemo((): CoverageData[] => {
    const consultantStats = new Map<string, {
      filial: string;
      totalClients: Set<string>;
      visitedClients: Set<string>;
    }>();
    filteredTasks.forEach(task => {
      const key = `${task.responsible}-${task.filial || 'Sem Filial'}`;
      if (!consultantStats.has(key)) {
        consultantStats.set(key, {
          filial: task.filial || 'Sem Filial',
          totalClients: new Set(),
          visitedClients: new Set()
        });
      }
      const stats = consultantStats.get(key)!;
      stats.totalClients.add(task.client);
      if (task.status === 'completed') {
        stats.visitedClients.add(task.client);
      }
    });
    return Array.from(consultantStats.entries()).map(([key, stats]) => {
      const consultant = key.split('-')[0];
      const totalClients = stats.totalClients.size;
      const visitedClients = stats.visitedClients.size;
      return {
        consultant,
        filial: getFilialName(stats.filial),
        totalClients,
        visitedClients,
        coverage: totalClients > 0 ? visitedClients / totalClients * 100 : 0
      };
    });
  }, [filteredTasks, getFilialName]);

  // Calculate client details - usa dados independentes quando na aba details
  const clientDetails = useMemo((): ClientDetails[] => {
    // Usar dados da query independente quando na aba details
    const dataSource = activeView === 'details' ? (clientDetailsData || []) : filteredTasks;
    
    const clientStats = new Map<string, {
      filial: string;
      consultant: string;
      activities: any[];
      lastActivity: Date;
      salesValue: number;
      status: string;
    }>();
    
    dataSource.forEach(task => {
      const key = `${task.client}-${task.filial || 'Sem Filial'}`;
      if (!clientStats.has(key)) {
        clientStats.set(key, {
          filial: task.filial || 'Sem Filial',
          consultant: task.responsible,
          activities: [],
          lastActivity: parseLocalDate(task.createdAt),
          salesValue: 0,
          status: 'Sem venda'
        });
      }
      const stats = clientStats.get(key)!;
      stats.activities.push(task);
      const taskDate = parseLocalDate(task.createdAt);
      if (taskDate > stats.lastActivity) {
        stats.lastActivity = taskDate;
      }
      if (task.salesConfirmed) {
        stats.salesValue += typeof task.salesValue === 'number' ? task.salesValue : calculateTaskSalesValue(task);
        if (task.salesType === 'ganho') {
          stats.status = 'Venda Total';
        } else if (task.salesType === 'parcial') {
          stats.status = 'Venda Parcial';
        } else if (task.salesType === 'perdido') {
          stats.status = 'Venda Perdida';
        }
      } else if (task.isProspect) {
        stats.status = 'Prospect';
      }
    });
    return Array.from(clientStats.entries()).map(([key, stats]) => ({
      client: key.split('-')[0],
      filial: getFilialName(stats.filial),
      consultant: stats.consultant,
      totalActivities: stats.activities.length,
      lastActivity: stats.lastActivity,
      salesValue: stats.salesValue,
      status: stats.status
    })).sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }, [activeView, clientDetailsData, filteredTasks, getFilialName]);

  const sortedClientDetails = useMemo(() => {
    if (!detailsSort) return clientDetails;
    const get = (c: ClientDetails) => detailsSort.key === 'activities' ? c.totalActivities : detailsSort.key === 'value' ? c.salesValue : c.lastActivity.getTime();
    return sortRows(clientDetails, get, detailsSort.dir);
  }, [clientDetails, detailsSort]);

  // Get detailed data for tables
  const getDetailedData = useCallback((section: string) => {
    switch (section) {
      case 'contacts':
        return filteredTasks.filter(task => task.taskType === 'ligacao');
      case 'prospects':
        return filteredTasks.filter(task => task.isProspect);
      case 'sales':
        return filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'ganho');
      case 'partialSales':
        return filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'parcial');
      case 'lostSales':
        return filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'perdido');
      default:
        return [];
    }
  }, [filteredTasks]);
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  // Handler para abrir o modal de edição
  const handleEditTask = useCallback((task: Task) => {
    console.log('🔧 SalesFunnel: Abrindo modal de edição para task:', {
      taskId: task.id, 
      client: task.client,
      hasId: !!task.id,
      modalOpen: isEditModalOpen
    });
    setSelectedTask(task);
    setIsEditModalOpen(true);
    console.log('🔧 SalesFunnel: Estado após abrir modal:', {
      selectedTask: !!task,
      isEditModalOpen: true
    });
  }, [isEditModalOpen]);

  // Handler para fechar o modal de edição
  const handleCloseEditModal = useCallback(() => {
    console.log('🔧 SalesFunnel: Fechando modal de edição');
    setIsEditModalOpen(false);
    setSelectedTask(null);
  }, []);

  // Handler para atualização de task
  const handleTaskUpdate = useCallback(async () => {
    console.log('🔄 SalesFunnel: Callback onTaskUpdate chamado, forçando atualização');
    await queryClient.invalidateQueries({
      queryKey: ['tasks-optimized']
    });
    await queryClient.invalidateQueries({
      queryKey: ['infinite-sales-data']
    });
    await queryClient.invalidateQueries({
      queryKey: ['sales-metrics']
    });
    await refetchMetrics();
    await refetchSales();
  }, [queryClient, refetchMetrics, refetchSales]);

  // Handler para excluir tarefa (apenas ADMIN)
  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskToDelete.id);

      if (error) throw error;

      toast.success('Tarefa excluída com sucesso');
      setTaskToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['sales-data'] });
      await queryClient.invalidateQueries({ queryKey: ['infinite-sales-data'] });
      await queryClient.invalidateQueries({ queryKey: ['consolidated-sales-metrics'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks-optimized'] });
      await refetchMetrics();
      await refetchSales();
    } catch (error: any) {
      console.error('Erro ao excluir tarefa:', error);
      toast.error(error.message || 'Erro ao excluir tarefa');
      setTaskToDelete(null);
    }
  };

  const funnelStageRecords = recordsForStage(filteredTasks, funnelStage, funnelStage === 'contacts' ? funnelActivity : null);
  const funnelRows: FunnelRow[] = funnelStageRecords.slice(0, funnelLimit).map((task, i) => {
    const opp = opportunityValues.get(task.id);
    const sold = opp?.valor_venda_fechada
      ?? (task.salesType === 'parcial' ? task.partialSalesValue || 0 : task.salesConfirmed && task.salesType === 'ganho' ? calculateTaskSalesValue(task) : 0);
    const status = opp?.status || (task.salesType === 'ganho' ? 'Venda Total' : task.salesType === 'parcial' ? 'Venda Parcial'
      : task.salesType === 'perdido' ? 'Venda Perdida' : task.isProspect ? 'Prospect' : 'Sem oportunidade');
    return {
      key: `${task.id}-${(task as any).opportunityId ?? ''}-${i}`,
      client: task.client,
      seller: task.responsible || '-',
      filial: getFilialName(task.filial),
      type: task.taskType === 'prospection' ? 'Visita' : task.taskType === 'ligacao' ? 'Ligação' : task.taskType === 'checklist' ? 'Checklist' : task.taskType,
      opportunityValue: opp?.valor_total_oportunidade ?? calculateTaskSalesValue(task),
      soldValue: sold,
      status,
      date: formatDateDisplay(task.createdAt),
      onView: () => { setSelectedTask(task); setIsTaskVisualizationOpen(true); },
    };
  });
  const funnelHasMore = funnelStageRecords.length > funnelLimit || !!hasNextPage;
  const selectFunnelStage = (s: FunnelStage) => { setFunnelStage(s); setFunnelLimit(50); if (s !== 'contacts') setFunnelActivity(null); };
  const renderFunnelView = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Funil de vendas</CardTitle></CardHeader>
        <CardContent>
          <SalesFunnelChart funnel={funnelMetrics} selected={funnelStage} onSelect={selectFunnelStage} />
          <p className="mt-3 text-xs text-muted-foreground">Clique em uma etapa para ver os registros correspondentes.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {STAGE_LABEL[funnelStage]}
            {funnelStage === 'contacts' && funnelActivity && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {funnelActivity === 'prospection' ? 'Visitas' : funnelActivity === 'ligacao' ? 'Ligações' : 'Checklists'}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {funnelStage === 'contacts' && (
            <ActivityBreakdown funnel={funnelMetrics} selected={funnelActivity} onSelect={(k) => { setFunnelActivity(k); setFunnelLimit(50); }} />
          )}
          <FunnelRecords
            rows={funnelRows}
            totalAvailable={totalCount}
            hasMore={funnelHasMore}
            loadingMore={isFetchingNextPage}
            onLoadMore={() => {
              if (funnelStageRecords.length > funnelLimit) setFunnelLimit(l => l + 50);
              else { fetchNextPage(); setFunnelLimit(l => l + 50); }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );

  if (isLoadingData) {
    return <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Carregando dados de vendas...</span>
      </div>;
  }

  return <div className="space-y-6">
      {/* Header com botão de refresh */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Análise Gerencial</h1>
          <p className="text-muted-foreground">Análise de performance comercial e cobertura de carteira</p>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} registros | {filiais.length} filiais
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar
          </Button>
          <Button variant="outline" size="sm" onClick={forceRefresh} disabled={isLoadingData}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingData ? 'animate-spin' : ''}`} />
            Recarregar Dados
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Período</label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os períodos</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Usuário</label>
          <Select value={selectedConsultant} onValueChange={handleConsultantChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o usuário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os usuários</SelectItem>
              {consultants.map(consultant => <SelectItem key={consultant.id} value={consultant.id}>
                  {consultant.name}
                </SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Divisional</label>
          <Select value={selectedDivisional} onValueChange={(v) => {
            const d = v as 'all' | CrmDivisional;
            setSelectedDivisional(d);
            if (d !== 'all' && selectedFilial !== 'all' && divisionalOfFilial(selectedFilial) !== d) setSelectedFilial('all');
          }}>
            <SelectTrigger className={selectedDivisional !== 'all' ? 'border-primary' : ''}>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as divisionais</SelectItem>
              {CRM_DIVISIONAIS.filter(d => filiais.some(f => divisionalOfFilial(f.nome) === d)).map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Filial</label>
          <Select value={selectedFilial} onValueChange={setSelectedFilial}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
              {(selectedDivisional === 'all' ? filiais : divisionalFiliais).map(filial => <SelectItem key={filial.id} value={filial.nome}>
                  {filial.nome}
                </SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Filial Atendida</label>
          <Select value={selectedFilialAtendida} onValueChange={setSelectedFilialAtendida}>
            <SelectTrigger className={selectedFilialAtendida !== 'all' ? 'border-primary' : ''}>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {filiais.map(filial => <SelectItem key={filial.id} value={filial.nome}>
                  {filial.nome}
                </SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Atividade</label>
          <Select value={selectedActivity} onValueChange={setSelectedActivity}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a atividade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as atividades</SelectItem>
              <SelectItem value="field_visit">Visita</SelectItem>
              <SelectItem value="ligacao">Ligação</SelectItem>
              <SelectItem value="checklist">Checklist</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Cliente</label>
          <ClientFilter value={selectedClient} onChange={setSelectedClient} filialId={selectedFilial} />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Exibir</label>
          <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
            <SelectTrigger>
              <SelectValue placeholder="Itens por página" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="20">20 itens</SelectItem>
              <SelectItem value="50">50 itens</SelectItem>
              <SelectItem value="100">100 itens</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`cursor-pointer transition-colors ${activeView === 'overview' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`} onClick={() => setActiveView('overview')}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="font-medium">Visão Geral</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition-colors ${activeView === 'funnel' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`} onClick={() => setActiveView('funnel')}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium">Funil de Vendas</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition-colors ${activeView === 'coverage' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`} onClick={() => setActiveView('coverage')}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="font-medium">Relatório</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer transition-colors ${activeView === 'details' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`} onClick={() => setActiveView('details')}>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-medium">Detalhes dos Clientes</span>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Overview */}
      {activeView === 'overview' && <div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-metric-activities" />Contatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-metric-activities">{overviewMetrics.contacts.count.toLocaleString('pt-BR')}</div>
              <p className="text-sm font-semibold tabular-nums text-foreground/85">
                {formatSalesValue(overviewMetrics.contacts.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-metric-clients" />Prospects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-metric-clients">{overviewMetrics.prospects.count.toLocaleString('pt-BR')}</div>
              <p className="text-sm font-semibold tabular-nums text-foreground/85">
                {formatSalesValue(overviewMetrics.prospects.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-metric-visits" />Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-metric-visits">{overviewMetrics.sales.count.toLocaleString('pt-BR')}</div>
              <p className="text-sm font-semibold tabular-nums text-foreground/85">
                {formatSalesValue(overviewMetrics.sales.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-metric-calls" />Vendas Parciais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-metric-calls">{overviewMetrics.partialSales.count.toLocaleString('pt-BR')}</div>
              <p className="text-sm font-semibold tabular-nums text-foreground/85">
                {formatSalesValue(overviewMetrics.partialSales.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-metric-lost" />Vendas Perdidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-metric-lost">{overviewMetrics.lostSales.count.toLocaleString('pt-BR')}</div>
              <p className="text-sm font-semibold tabular-nums text-foreground/85">
                {formatSalesValue(overviewMetrics.lostSales.value)}
              </p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
            {[
              { label: 'Em prospecção', value: overviewMetrics.prospects.value, tone: 'text-metric-clients' },
              { label: 'Vendido (total)', value: overviewMetrics.sales.value, tone: 'text-metric-visits' },
              { label: 'Vendido (parcial)', value: overviewMetrics.partialSales.value, tone: 'text-metric-calls' },
              { label: 'Perdido', value: overviewMetrics.lostSales.value, tone: 'text-metric-lost' },
            ].map(i => (
              <div key={i.label} className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{i.label}</p>
                <p className={`truncate text-lg font-bold tabular-nums ${i.tone}`}>{formatSalesValue(i.value)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        </div>}

      {/* Hierarchical Funnel View */}
      {activeView === 'funnel' && renderFunnelView()}

      {/* Relatório View */}
      {activeView === 'coverage' && <Card>
          <CardHeader>
            <CardTitle>Relatório de Oportunidades</CardTitle>
            <p className="text-sm text-muted-foreground">
              Visualizar relatórios detalhados de oportunidades de venda
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 max-w-xs">
              <label className="text-sm font-medium mb-2 block">Situação JD</label>
              <Select value={jdFilter} onValueChange={(v) => { setJdFilter(v); setDisplayPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ok">OK — Primeiro registro</SelectItem>
                  <SelectItem value="duplicado">Duplicado</SelectItem>
                  <SelectItem value="sem_chassi">Sem chassi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Cliente" k="client" sort={reportSort} onSort={setReportSort} />
                  <SortHead label="Vendedor" k="responsible" sort={reportSort} onSort={setReportSort} />
                  <SortHead label="Filial" k="filial" sort={reportSort} onSort={setReportSort} />
                  <TableHead className="whitespace-nowrap">Tipo</TableHead>
                  <SortHead label="Valor Oportunidade" k="opp" sort={reportSort} onSort={setReportSort} align="right" />
                  <SortHead label="Valor Venda Fechada" k="sold" sort={reportSort} onSort={setReportSort} align="right" />
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <SortHead label="Data Criação" k="date" sort={reportSort} onSort={setReportSort} />
                  <TableHead className="whitespace-nowrap">Situação JD</TableHead>
                  <TableHead className="whitespace-nowrap">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsPerPage === 'all' ? sortedReportTasks : sortedReportTasks.slice(0, parseInt(itemsPerPage) * displayPage)).map((task) => {
                  // Get opportunity values for this task.
                  // FIX: se a opportunity estiver com valor_total_oportunidade = 0 (ex.: Venda Perdida),
                  // usar o valor vindo dos dados da task/listagem (mesmo valor que aparece no modal).
                  const fallbackOppValues = {
                    valor_total_oportunidade: getSalesValueAsNumber(task.salesValue) || 0,
                    valor_venda_fechada: task.salesType === 'parcial'
                      ? (task.partialSalesValue || 0)
                      : task.salesConfirmed && task.salesType === 'ganho'
                        ? getSalesValueAsNumber(task.salesValue) || 0
                        : 0,
                    status: task.salesConfirmed
                      ? (task.salesType === 'ganho' ? 'Ganho' : task.salesType === 'parcial' ? 'Parcial' : 'Perdido')
                      : 'Prospect'
                  };

                  const oppFromMap = opportunityValues.get(task.id);
                  const oppValues = oppFromMap
                    ? {
                        ...oppFromMap,
                        valor_total_oportunidade:
                          getSalesValueAsNumber((oppFromMap as any).valor_total_oportunidade) ||
                          fallbackOppValues.valor_total_oportunidade,
                      }
                    : fallbackOppValues;
                  
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium min-w-[180px]">{task.client}</TableCell>
                      <TableCell className="whitespace-nowrap">{task.responsible}</TableCell>
                      <TableCell className="whitespace-nowrap">{getFilialName(task.filial)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {task.taskType === 'prospection' ? 'Visita' : 
                           task.taskType === 'ligacao' ? 'Ligação' : 
                           task.taskType === 'checklist' ? 'Checklist' : task.taskType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap text-right tabular-nums">
                        {formatSalesValue(oppValues.valor_total_oportunidade)}
                      </TableCell>
                      <TableCell className="font-semibold whitespace-nowrap text-right tabular-nums text-metric-visits">
                        {formatSalesValue(oppValues.valor_venda_fechada)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.salesConfirmed ? 'default' : 'secondary'}>
                          {oppValues.status || (task.salesConfirmed ? 'Fechada' : 'Em andamento')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateDisplay(task.createdAt)}</TableCell>
                      <TableCell>
                        {task.taskType === 'checklist' ? (() => {
                          const st = jdMap?.get(task.id);
                          if (!st) return <span className="text-xs text-muted-foreground">{isLoadingJd ? '...' : '—'}</span>;
                          return <Badge variant={jdVariant(st)} className="whitespace-nowrap">{jdLabel(st)}</Badge>;
                        })() : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTask(task);
                              setIsTaskVisualizationOpen(true);
                            }}
                            className="flex items-center space-x-1"
                          >
                            <Eye className="h-4 w-4" />
                            <span>Ver</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditTask(task)}
                            className="flex items-center space-x-1"
                          >
                            <Edit className="h-4 w-4" />
                            <span>Editar</span>
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setTaskToDelete({ id: task.id, name: task.client })}
                              className="flex items-center space-x-1"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Excluir</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            
            <div className="mt-4 text-center space-y-2">
              {(() => {
                const shown = itemsPerPage === 'all'
                  ? reportTasks.length
                  : Math.min(parseInt(itemsPerPage) * displayPage, reportTasks.length);
                const hasMoreLoaded = shown < reportTasks.length;
                const hasMoreBackend = hasNextPage;
                return (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Mostrando {shown} de {reportTasks.length} oportunidades{hasMoreBackend && selectedDivisional === 'all' ? ` (${totalCount} disponíveis)` : hasMoreBackend ? ' carregadas da divisional' : ''}.
                      {(hasMoreLoaded || hasMoreBackend) && ' Use os filtros para refinar a busca.'}
                    </p>
                    {(hasMoreLoaded || hasMoreBackend) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isFetchingNextPage}
                        onClick={() => {
                          if (hasMoreLoaded) {
                            setDisplayPage(p => p + 1);
                          } else if (hasMoreBackend) {
                            fetchNextPage();
                            setDisplayPage(p => p + 1);
                          }
                        }}
                      >
                        {isFetchingNextPage ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Carregando mais...
                          </>
                        ) : (
                          'Carregar mais oportunidades'
                        )}
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
            
            {/* Observer para scroll infinito */}
            <div ref={observerTarget} className="h-4" />
          </CardContent>
        </Card>}

      {/* Details View */}
      {activeView === 'details' && <Card>
          <CardHeader>
            <CardTitle>Detalhes dos Clientes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Visualizar atividades e vendas por cliente
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Consultor</TableHead>
                  <SortHead label="Atividades" k="activities" sort={detailsSort} onSort={setDetailsSort} align="right" />
                  <SortHead label="Última Atividade" k="last" sort={detailsSort} onSort={setDetailsSort} />
                  <SortHead label="Valor de Vendas" k="value" sort={detailsSort} onSort={setDetailsSort} align="right" />
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsPerPage === 'all' ? sortedClientDetails : sortedClientDetails.slice(0, parseInt(itemsPerPage))).map((client, index) => <TableRow key={index} className="[&>td]:py-2">
                    <TableCell className="font-medium leading-tight">{client.client}</TableCell>
                    <TableCell className="whitespace-nowrap">{client.filial}</TableCell>
                    <TableCell className="whitespace-nowrap">{client.consultant}</TableCell>
                    <TableCell className="text-right tabular-nums">{client.totalActivities}</TableCell>
                    <TableCell className="whitespace-nowrap">{client.lastActivity.toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className={`whitespace-nowrap text-right tabular-nums font-semibold ${client.salesValue > 0 ? 'text-metric-visits' : 'text-muted-foreground'}`}>{formatSalesValue(client.salesValue)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[client.status] ?? 'bg-muted text-muted-foreground'}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {client.status}
                      </span>
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
            </div>
            
            <div className="mt-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Mostrando {clientDetails.length} {clientDetails.length === 1 ? 'registro' : 'registros'} de {clientDetailsTotalCount} registros totais
                {hasNextClientDetailsPage && ' (carregando mais dados...)'}
              </p>
              {hasNextClientDetailsPage && itemsPerPage === 'all' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextClientDetailsPage()}
                  disabled={isFetchingNextClientDetailsPage}
                >
                  {isFetchingNextClientDetailsPage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Carregando mais...
                    </>
                  ) : (
                    'Carregar mais dados'
                  )}
                </Button>
              )}
            </div>
            
            {/* Observer para scroll infinito */}
            <div ref={clientDetailsObserverTarget} className="h-4" />
          </CardContent>
        </Card>}


      {/* Modals */}
      {selectedTask && <OpportunityDetailsModal task={selectedTask} isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setSelectedTask(null);
    }} onTaskUpdated={updatedTask => {
      console.log('📋 FUNNEL: Task atualizada recebida:', updatedTask);
      setSelectedTask(updatedTask);
      refetchSales();
    }} />}
      
      {selectedTask && <OpportunityReport task={selectedTask} isOpen={isVisualizationModalOpen} onClose={() => {
      setIsVisualizationModalOpen(false);
      setSelectedTask(null);
    }} />}
      
      <TaskEditModal 
        taskId={selectedTask?.id || null} 
        isOpen={isEditModalOpen} 
        onClose={handleCloseEditModal}
        onTaskUpdate={handleTaskUpdate}
      />

      {/* Task Form Visualization Modal */}
      <TaskFormVisualization
        task={selectedTask}
        isOpen={isTaskVisualizationOpen}
        onClose={() => {
          setIsTaskVisualizationOpen(false);
          setSelectedTask(null);
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa "{taskToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Observador para scroll infinito */}
      <div ref={observerTarget} className="h-4" />
    </div>;
};
