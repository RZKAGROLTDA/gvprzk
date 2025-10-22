import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye, RefreshCw, ChevronDown, ChevronUp, Edit, BarChart3, Users, TrendingUp, MapPin, Database, Trash2, Loader2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Task } from '@/types/task';

import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OpportunityDetailsModal } from '@/components/OpportunityDetailsModal';
import { TaskFormVisualization } from '@/components/TaskFormVisualization';
import { OpportunityReport } from '@/components/OpportunityReport';
import { TaskEditModal } from '@/components/TaskEditModal';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { formatSalesValue, getSalesValueAsNumber } from '@/lib/securityUtils';
import { getFilialNameRobust, loadFiliaisCache } from '@/lib/taskStandardization';
import { useInfiniteSalesData } from '@/hooks/useInfiniteSalesData';
import { DataMigrationPanel } from '@/components/DataMigrationPanel';
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

export const SalesFunnel: React.FC = () => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [selectedFilial, setSelectedFilial] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [itemsPerPage, setItemsPerPage] = useState<string>('all');
  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details' | 'migration'>('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisualizationModalOpen, setIsVisualizationModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTaskVisualizationOpen, setIsTaskVisualizationOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: isLoadingRole } = useUserRole();

  console.log('🔧 SalesFunnel: Estado do admin:', { isAdmin, isLoadingRole });

  // Fetch all users
  const {
    data: consultants = []
  } = useQuery({
    queryKey: ['consultants'],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from('profiles').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    }
  });

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
    }
  });
  

  // Initialize filial cache on component mount
  useEffect(() => {
    const initializeCache = async () => {
      console.log('🚀 SalesFunnel: Initializing filial cache...');
      await loadFiliaisCache();
      console.log('✅ SalesFunnel: Filial cache initialized');
    };
    initializeCache();
  }, []);

  // Removed useTasksOptimized() - using useInfiniteSalesData instead

  // Usar hook com scroll infinito
  const { 
    data: salesData, 
    metrics, 
    isLoading: isLoadingData, 
    error: salesError, 
    refetch: refetchSales,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    totalCount
  } = useInfiniteSalesData();

  // Observer para scroll infinito
  const observerTarget = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Fetch opportunities data to get valor_total_oportunidade and valor_venda_fechada
  const {
    data: opportunitiesData = []
  } = useQuery({
    queryKey: ['opportunities-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('task_id, valor_total_oportunidade, valor_venda_fechada, status');
      if (error) throw error;
      return data || [];
    }
  });

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
    await refetchSales();
  }, [queryClient, refetchSales]);

  // Utility functions for name matching
  const normalizeName = useCallback((name: string): string => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }, []);
  const isNameMatch = useCallback((taskName: string, consultantName: string): boolean => {
    return normalizeName(taskName) === normalizeName(consultantName);
  }, [normalizeName]);

  // Filter sales data based on selected criteria
  const filteredSalesData = useMemo(() => {
    return salesData.filter(sale => {
      // Period filter
      if (selectedPeriod !== 'all') {
        const saleDate = new Date(sale.createdAt);
        const now = new Date();
        const daysAgo = parseInt(selectedPeriod);
        const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        if (saleDate < cutoffDate) return false;
      }

      // Consultant filter
      if (selectedConsultant !== 'all') {
        const selectedConsultantData = consultants.find(c => c.id === selectedConsultant);
        if (selectedConsultantData && !isNameMatch(sale.responsible, selectedConsultantData.name)) {
          return false;
        }
      }

      // Filial filter
      if (selectedFilial !== 'all' && sale.filial !== selectedFilial) return false;

      // Activity filter
      if (selectedActivity !== 'all') {
        if (selectedActivity === 'prospection' && sale.taskType !== 'prospection') return false;
        if (selectedActivity === 'ligacao' && sale.taskType !== 'ligacao') return false;
        if (selectedActivity === 'checklist' && sale.taskType !== 'checklist') return false;
      }
      return true;
    });
  }, [salesData, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity, consultants, isNameMatch]);

  // Converter salesData para formato de tasks para compatibilidade
  const filteredTasks = useMemo(() => {
    return filteredSalesData.map(sale => ({
      id: sale.taskId,
      name: sale.clientName,
      client: sale.clientName,
      responsible: sale.responsible,
      filial: sale.filial,
      taskType: (sale.taskType as "checklist" | "ligacao" | "prospection") || 'prospection',
      status: sale.status,
      isProspect: sale.isProspect,
      salesConfirmed: sale.salesConfirmed,
      salesType: sale.salesStatus,
      salesValue: sale.totalValue,
      partialSalesValue: sale.partialValue,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      startDate: sale.startDate,
      endDate: sale.endDate,
      start_date: sale.startDate.toISOString().split('T')[0],
      end_date: sale.endDate.toISOString().split('T')[0],
      // Campos adicionais para compatibilidade
      property: '',
      observations: '',
      priority: 'medium',
      startTime: '08:00',
      endTime: '18:00',
      start_time: '08:00',
      end_time: '18:00',
      createdBy: '',
      created_by: '',
      photos: [],
      documents: [],
      reminders: [],
      checklist: null,
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
    } as Task));
  }, [filteredSalesData]);

  // Calculate hierarchical funnel data
  const funnelData = useMemo(() => {
    // PROSPECÇÕES (primeira seção)
    const prospeccoesAbertas = filteredTasks.filter(task => task.isProspect && !task.salesConfirmed);
    const prospeccoesFechadas = filteredTasks.filter(task => task.isProspect && task.salesType === 'ganho');
    const prospeccoesPerdidas = filteredTasks.filter(task => task.isProspect && task.salesType === 'perdido');

    // CONTATOS COM CLIENTES (segunda seção)
    const visitas = filteredTasks.filter(task => task.taskType === 'prospection');
    const checklists = filteredTasks.filter(task => task.taskType === 'checklist');
    const ligacoes = filteredTasks.filter(task => task.taskType === 'ligacao');

    // VENDAS (terceira seção)
    const vendasTotal = filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'ganho');
    const vendasParcial = filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'parcial');
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
  }, [filteredTasks]);

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

  // Calculate client details
  const clientDetails = useMemo((): ClientDetails[] => {
    const clientStats = new Map<string, {
      filial: string;
      consultant: string;
      activities: Task[];
      lastActivity: Date;
      salesValue: number;
      status: string;
    }>();
    filteredTasks.forEach(task => {
      const key = `${task.client}-${task.filial || 'Sem Filial'}`;
      if (!clientStats.has(key)) {
        clientStats.set(key, {
          filial: task.filial || 'Sem Filial',
          consultant: task.responsible,
          activities: [],
          lastActivity: new Date(task.createdAt),
          salesValue: 0,
          status: 'Sem venda'
        });
      }
      const stats = clientStats.get(key)!;
      stats.activities.push(task);
      const taskDate = new Date(task.createdAt);
      if (taskDate > stats.lastActivity) {
        stats.lastActivity = taskDate;
      }
      if (task.salesConfirmed) {
        stats.salesValue += calculateTaskSalesValue(task);
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
    })).sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()); // Show all clients, will be filtered by itemsPerPage in render
  }, [filteredTasks, getFilialName]);

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
    await refetchSales();
  }, [queryClient, refetchSales]);

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
      await queryClient.invalidateQueries({ queryKey: ['tasks-optimized'] });
      await refetchSales();
    } catch (error: any) {
      console.error('Erro ao excluir tarefa:', error);
      toast.error(error.message || 'Erro ao excluir tarefa');
      setTaskToDelete(null);
    }
  };

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
            Total de registros carregados: {totalCount} | Filtrados: {filteredTasks.length} | Filiais: {filiais.length}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={forceRefresh} disabled={isLoadingData}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingData ? 'animate-spin' : ''}`} />
            Recarregar Dados
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
          <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
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
          <label className="text-sm font-medium mb-2 block">Filial</label>
          <Select value={selectedFilial} onValueChange={setSelectedFilial}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
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
              <SelectItem value="prospection">Prospecção</SelectItem>
              <SelectItem value="ligacao">Ligação</SelectItem>
              <SelectItem value="checklist">Checklist</SelectItem>
            </SelectContent>
          </Select>
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
      {activeView === 'overview' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Contatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{funnelData.contacts.count}</div>
              <p className="text-xs text-muted-foreground">
                {formatSalesValue(funnelData.contacts.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Prospects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{funnelData.prospects.count}</div>
              <p className="text-xs text-muted-foreground">
                {formatSalesValue(funnelData.prospects.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{funnelData.sales.count}</div>
              <p className="text-xs text-muted-foreground">
                {formatSalesValue(funnelData.sales.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Vendas Parciais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{funnelData.partialSales.count}</div>
              <p className="text-xs text-muted-foreground">
                {formatSalesValue(funnelData.partialSales.value)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Vendas Perdidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{funnelData.lostSales.count}</div>
              <p className="text-xs text-muted-foreground">
                {formatSalesValue(funnelData.lostSales.value)}
              </p>
            </CardContent>
          </Card>
        </div>}

      {/* Hierarchical Funnel View */}
      {activeView === 'funnel' && <div className="space-y-8">
          {/* CONTATOS COM CLIENTES (primeira seção) */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center text-primary">
              CONTATOS COM CLIENTES ({funnelData.totalContatos})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('visitas')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.visitas.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Visitas</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.visitas.value)}</div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('checklists')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.checklists.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Checklists</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.checklists.value)}</div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('ligacoes')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.ligacoes.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Ligações</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.ligacoes.value)}</div>
                </CardContent>
              </Card>
            </div>
            
            {/* Lista expandida de Visitas */}
            {expandedSections.visitas && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Visitas ({funnelData.visitas.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('visitas')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.taskType === 'prospection').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <Badge variant={task.status === 'completed' ? 'default' : 'secondary'}>
                              {task.status === 'completed' ? 'Concluída' : 'Pendente'}
                            </Badge>
                          </TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}

            {/* Lista expandida de Checklists */}
            {expandedSections.checklists && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Checklists ({funnelData.checklists.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('checklists')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.taskType === 'checklist').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <Badge variant={task.status === 'completed' ? 'default' : 'secondary'}>
                              {task.status === 'completed' ? 'Concluído' : 'Pendente'}
                            </Badge>
                          </TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}

            {/* Lista expandida de Ligações */}
            {expandedSections.ligacoes && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Ligações ({funnelData.ligacoes.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('ligacoes')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.taskType === 'ligacao').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <Badge variant={task.status === 'completed' ? 'default' : 'secondary'}>
                              {task.status === 'completed' ? 'Realizada' : 'Pendente'}
                            </Badge>
                          </TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}
          </div>

          {/* PROSPECÇÃO (segunda seção) */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center text-primary">
              PROSPECÇÃO ({funnelData.totalProspeccoes})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('prospeccoesAbertas')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.prospeccoesAbertas.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Abertas</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.prospeccoesAbertas.value)}</div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('prospeccoesFechadas')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.prospeccoesFechadas.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Fechadas</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.prospeccoesFechadas.value)}</div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('prospeccoesPerdidas')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.prospeccoesPerdidas.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Perdidas</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.prospeccoesPerdidas.value)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Lista expandida de Prospecções Abertas */}
            {expandedSections.prospeccoesAbertas && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Prospecções Abertas ({funnelData.prospeccoesAbertas.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('prospeccoesAbertas')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.isProspect && !task.salesConfirmed).map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}

            {/* Lista expandida de Prospecções Fechadas */}
            {expandedSections.prospeccoesFechadas && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Prospecções Fechadas ({funnelData.prospeccoesFechadas.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('prospeccoesFechadas')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.isProspect && task.salesType === 'ganho').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}

            {/* Lista expandida de Prospecções Perdidas */}
            {expandedSections.prospeccoesPerdidas && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Prospecções Perdidas ({funnelData.prospeccoesPerdidas.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('prospeccoesPerdidas')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.isProspect && task.salesType === 'perdido').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}
          </div>

          {/* VENDAS (terceira seção) */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center text-primary">
              VENDAS ({funnelData.totalVendas})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('vendasTotal')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.vendasTotal.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Total</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.vendasTotal.value)}</div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => toggleSection('vendasParcial')}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-900 mb-2">{funnelData.vendasParcial.count}</div>
                  <div className="text-blue-700 font-medium mb-1">Parcial</div>
                  <div className="text-sm text-blue-600">{formatSalesValue(funnelData.vendasParcial.value)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Lista expandida de Vendas Total */}
            {expandedSections.vendasTotal && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Vendas Totais ({funnelData.vendasTotal.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('vendasTotal')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'ganho').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}

            {/* Lista expandida de Vendas Parciais */}
            {expandedSections.vendasParcial && <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Vendas Parciais ({funnelData.vendasParcial.count})</span>
                    <Button variant="ghost" size="sm" onClick={() => toggleSection('vendasParcial')}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'parcial').map(task => <TableRow key={task.id}>
                          <TableCell>{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial)}</TableCell>
                          <TableCell>{new Date(task.startDate).toLocaleDateString('pt-BR')}</TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>}
          </div>

          {/* TAXA DE CONVERSÃO */}
          <div className="flex justify-center">
            <Card className="bg-gradient-to-r from-purple-600 to-purple-700 text-white min-w-[250px]">
              <CardContent className="p-6 text-center">
                <div className="text-4xl font-bold mb-2">{funnelData.taxaConversao.toFixed(1)}%</div>
                <div className="text-purple-100 font-medium">Taxa de Conversão</div>
                <div className="text-sm text-purple-200 mt-1">
                  {funnelData.totalVendas} vendas de {funnelData.totalContatos} contatos
                </div>
              </CardContent>
            </Card>
          </div>
        </div>}

      {/* Relatório View */}
      {activeView === 'coverage' && <Card>
          <CardHeader>
            <CardTitle>Relatório de Oportunidades</CardTitle>
            <p className="text-sm text-muted-foreground">
              Visualizar relatórios detalhados de oportunidades de venda
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor Oportunidade</TableHead>
                  <TableHead>Valor Venda Fechada</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Criação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsPerPage === 'all' ? filteredTasks : filteredTasks.slice(0, parseInt(itemsPerPage))).map((task) => {
                  // Get opportunity values for this task or fallback to task values
                  const oppValues = opportunityValues.get(task.id) || { 
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
                  
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.client}</TableCell>
                      <TableCell>{task.responsible}</TableCell>
                      <TableCell>{getFilialName(task.filial)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {task.taskType === 'prospection' ? 'Visita' : 
                           task.taskType === 'ligacao' ? 'Ligação' : 
                           task.taskType === 'checklist' ? 'Checklist' : task.taskType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatSalesValue(oppValues.valor_total_oportunidade)}
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatSalesValue(oppValues.valor_venda_fechada)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.salesConfirmed ? 'default' : 'secondary'}>
                          {oppValues.status || (task.salesConfirmed ? 'Fechada' : 'Em andamento')}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(task.createdAt).toLocaleDateString('pt-BR')}</TableCell>
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
            
            {filteredTasks.length > 50 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Mostrando 50 de {filteredTasks.length} oportunidades. Use os filtros para refinar a busca.
                </p>
              </div>
            )}
          </CardContent>
        </Card>}

      {/* Details View */}
      {activeView === 'details' && <Card>
          <CardHeader>
            <CardTitle>Detalhes dos Clientes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Top 10 clientes com mais atividades recentes
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Atividades</TableHead>
                  <TableHead>Última Atividade</TableHead>
                  <TableHead>Valor de Vendas</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsPerPage === 'all' ? clientDetails : clientDetails.slice(0, parseInt(itemsPerPage))).map((client, index) => <TableRow key={index}>
                    <TableCell className="font-medium">{client.client}</TableCell>
                    <TableCell>{client.filial}</TableCell>
                    <TableCell>{client.consultant}</TableCell>
                    <TableCell>{client.totalActivities}</TableCell>
                    <TableCell>{client.lastActivity.toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{formatSalesValue(client.salesValue)}</TableCell>
                    <TableCell>
                      <Badge variant={client.status === 'Venda Total' ? 'default' : client.status === 'Venda Parcial' ? 'secondary' : client.status === 'Prospect' ? 'outline' : 'destructive'}>
                        {client.status}
                      </Badge>
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
            
            {clientDetails.length > 10 && <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Mostrando 10 de {clientDetails.length} clientes. Use os filtros para refinar a busca.
                </p>
              </div>}
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
      <div ref={observerTarget} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando mais tarefas...</span>
          </div>
        )}
        {!hasNextPage && salesData.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Todas as {totalCount} tarefas foram carregadas
          </p>
        )}
      </div>
    </div>;
};
