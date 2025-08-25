import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Calendar, TrendingUp, Users, DollarSign, Target, Filter } from 'lucide-react';
import { useTasksOptimized, useConsultants, useFiliais } from '@/hooks/useTasksOptimized';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { mapSalesStatus, resolveFilialName, calculateSalesValue } from '@/lib/taskStandardization';
import { OpportunityDetailsModal } from '@/components/OpportunityDetailsModal';
import { Task } from '@/types/task';

interface SalesFunnelData {
  name: string;
  value: number;
  color: string;
}

interface CoverageData {
  name: string;
  value: number;
  percentage: number;
}

interface ClientDetails {
  client: string;
  filial: string;
  totalVisits: number;
  totalCalls: number;
  totalChecklists: number;
  prospects: number;
  salesValue: number;
  lastActivity: Date;
  responsible: string;
}

export const SalesFunnelOptimized: React.FC = () => {
  const { tasks, loading } = useTasksOptimized();
  const { data: consultants = [], isLoading: consultantsLoading } = useConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();

  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details'>('overview');
  const [selectedFunnelSection, setSelectedFunnelSection] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filtros com debounce implícito via useMemo
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');

  // Filtrar tarefas - memoizado para performance
  const filteredTasks = useMemo(() => {
    if (!tasks.length) return [];

    const now = new Date();
    const daysAgo = parseInt(selectedPeriod);
    const periodStart = subDays(now, daysAgo);

    return tasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      
      // Filtro de período
      if (taskDate < periodStart) return false;

      // Filtro de consultor
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) return false;
      }

      // Filtro de filial
      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return false;

      // Filtro de tipo de atividade
      if (selectedActivity !== 'all' && task.taskType !== selectedActivity) return false;

      return true;
    });
  }, [tasks, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity, consultants]);

  // Dados do funil - altamente otimizado com cache
  const funnelData = useMemo(() => {
    if (!filteredTasks.length) {
      return {
        contacts: { total: 0, visitas: 0, ligacoes: 0, checklists: 0 },
        prospects: { total: 0, abertas: 0, fechadas: 0, perdidas: 0, totalValue: 0, openValue: 0, closedWonValue: 0 },
        sales: { confirmadas: 0, parciais: 0, total: 0 }
      };
    }

    // Calcular métricas em um único loop para melhor performance
    let totalVisitas = 0, totalLigacoes = 0, totalChecklists = 0;
    let prospects = 0, openProspects = 0, closedWon = 0, closedLost = 0;
    let totalProspectValue = 0, openProspectValue = 0, closedWonValue = 0;
    let confirmadas = 0, parciais = 0;

    filteredTasks.forEach(task => {
      // Contatos
      switch (task.taskType) {
        case 'prospection': totalVisitas++; break;
        case 'ligacao': totalLigacoes++; break;
        case 'checklist': totalChecklists++; break;
      }

      // Prospecções
      if (task.isProspect) {
        prospects++;
        totalProspectValue += calculateSalesValue(task);
        
        if (task.status === 'pending') {
          openProspects++;
          openProspectValue += calculateSalesValue(task);
        }
      }

      // Vendas
      if (task.salesConfirmed) {
        closedWon++;
        confirmadas++;
        closedWonValue += calculateSalesValue(task);
      } else if (task.isProspect && task.status === 'closed') {
        closedLost++;
      }

      // Vendas parciais
      const salesStatus = mapSalesStatus(task);
      if (salesStatus === 'parcial') {
        parciais++;
      }
    });

    return {
      contacts: {
        total: totalVisitas + totalLigacoes + totalChecklists,
        visitas: totalVisitas,
        ligacoes: totalLigacoes,
        checklists: totalChecklists
      },
      prospects: {
        total: prospects,
        abertas: openProspects,
        fechadas: closedWon,
        perdidas: closedLost,
        totalValue: totalProspectValue,
        openValue: openProspectValue,
        closedWonValue: closedWonValue
      },
      sales: {
        confirmadas,
        parciais,
        total: confirmadas + parciais
      }
    };
  }, [filteredTasks]);

  // Dados de cobertura - otimizado com Set para unique values
  const coverageData = useMemo(() => {
    if (!filteredTasks.length) {
      return [
        { name: 'Clientes com Visitas', value: 0, percentage: 0 },
        { name: 'Clientes com Propostas', value: 0, percentage: 0 },
        { name: 'Clientes com Vendas', value: 0, percentage: 0 }
      ];
    }

    const uniqueClients = new Set<string>();
    const clientsWithVisits = new Set<string>();
    const clientsWithProposals = new Set<string>();
    const clientsWithSales = new Set<string>();

    filteredTasks.forEach(task => {
      uniqueClients.add(task.client);
      
      if (task.taskType === 'prospection') {
        clientsWithVisits.add(task.client);
      }
      if (task.isProspect) {
        clientsWithProposals.add(task.client);
      }
      if (task.salesConfirmed) {
        clientsWithSales.add(task.client);
      }
    });

    const totalClients = uniqueClients.size || 1;

    return [
      {
        name: 'Clientes com Visitas',
        value: clientsWithVisits.size,
        percentage: Math.round(clientsWithVisits.size / totalClients * 100)
      },
      {
        name: 'Clientes com Propostas',
        value: clientsWithProposals.size,
        percentage: Math.round(clientsWithProposals.size / totalClients * 100)
      },
      {
        name: 'Clientes com Vendas',
        value: clientsWithSales.size,
        percentage: Math.round(clientsWithSales.size / totalClients * 100)
      }
    ];
  }, [filteredTasks]);

  // Detalhes por cliente - otimizado com Map
  const clientDetails = useMemo(() => {
    if (!filteredTasks.length) return [];

    const clientMap = new Map<string, ClientDetails>();
    
    filteredTasks.forEach(task => {
      const key = `${task.client}-${task.filial}`;
      
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          client: task.client,
          filial: resolveFilialName(task.filial),
          totalVisits: 0,
          totalCalls: 0,
          totalChecklists: 0,
          prospects: 0,
          salesValue: 0,
          lastActivity: task.createdAt,
          responsible: task.responsible
        });
      }

      const client = clientMap.get(key)!;
      
      // Incrementar contadores
      switch (task.taskType) {
        case 'prospection': client.totalVisits++; break;
        case 'ligacao': client.totalCalls++; break;
        case 'checklist': client.totalChecklists++; break;
      }
      
      if (task.isProspect) client.prospects++;
      client.salesValue += calculateSalesValue(task);
      
      if (task.createdAt > client.lastActivity) {
        client.lastActivity = task.createdAt;
      }
    });

    return Array.from(clientMap.values())
      .sort((a, b) => b.salesValue - a.salesValue);
  }, [filteredTasks]);

  // Dados detalhados com callback otimizado
  const getDetailedData = useCallback((section: string) => {
    if (!section || !filteredTasks.length) return [];

    const formatTaskData = (task: Task, type?: string, status?: string) => ({
      client: task.client,
      responsible: task.responsible,
      type: type || task.taskType,
      status: status || task.status,
      confirmed: task.salesConfirmed,
      date: format(task.createdAt, 'dd/MM/yyyy', { locale: ptBR }),
      filial: resolveFilialName(task.filial),
      value: calculateSalesValue(task)
    });

    switch (section) {
      case 'contacts-visitas':
        return filteredTasks
          .filter(task => task.taskType === 'prospection')
          .map(task => formatTaskData(task, 'Visita'));
      
      case 'contacts-ligacoes':
        return filteredTasks
          .filter(task => task.taskType === 'ligacao')
          .map(task => formatTaskData(task, 'Ligação'));
          
      case 'contacts-checklists':
        return filteredTasks
          .filter(task => task.taskType === 'checklist')
          .map(task => formatTaskData(task, 'Checklist'));
          
      case 'prospects-abertas':
        return filteredTasks
          .filter(task => task.isProspect && task.status === 'pending')
          .map(task => formatTaskData(task, undefined, 'Aberta'));
          
      case 'prospects-fechadas':
        return filteredTasks
          .filter(task => task.salesConfirmed)
          .map(task => formatTaskData(task, undefined, 'Fechada'));
          
      case 'prospects-perdidas':
        return filteredTasks
          .filter(task => task.isProspect && task.status === 'closed' && !task.salesConfirmed)
          .map(task => formatTaskData(task, undefined, 'Perdida'));
          
      default:
        return [];
    }
  }, [filteredTasks]);

  const isLoading = loading || consultantsLoading || filiaisLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Análise Gerencial</h1>
          <p className="text-muted-foreground">Análise de performance comercial e cobertura de carteira</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {filteredTasks.length} atividades filtradas
          </span>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Filtros de Análise</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Consultor</label>
              <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os consultores</SelectItem>
                  {consultants.map(consultant => (
                    <SelectItem key={consultant.id} value={consultant.id}>
                      {consultant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Filial</label>
              <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {filiais.map(filial => (
                    <SelectItem key={filial.id} value={filial.nome}>
                      {filial.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Atividade</label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as atividades</SelectItem>
                  <SelectItem value="prospection">Visitas</SelectItem>
                  <SelectItem value="ligacao">Ligações</SelectItem>
                  <SelectItem value="checklist">Checklists</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${activeView === 'overview' ? 'ring-2 ring-primary' : ''}`} onClick={() => setActiveView('overview')}>
          <CardHeader className="text-center">
            <Calendar className="h-8 w-8 mx-auto text-primary" />
            <CardTitle className="text-lg">Visão Geral</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${activeView === 'funnel' ? 'ring-2 ring-primary' : ''}`} onClick={() => setActiveView('funnel')}>
          <CardHeader className="text-center">
            <TrendingUp className="h-8 w-8 mx-auto text-primary" />
            <CardTitle className="text-lg">Funil de Vendas</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${activeView === 'coverage' ? 'ring-2 ring-primary' : ''}`} onClick={() => setActiveView('coverage')}>
          <CardHeader className="text-center">
            <Users className="h-8 w-8 mx-auto text-primary" />
            <CardTitle className="text-lg">Cobertura</CardTitle>
          </CardHeader>
        </Card>
        
        <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${activeView === 'details' ? 'ring-2 ring-primary' : ''}`} onClick={() => setActiveView('details')}>
          <CardHeader className="text-center">
            <DollarSign className="h-8 w-8 mx-auto text-primary" />
            <CardTitle className="text-lg">Detalhes</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Content based on active view */}
      {activeView === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total de Contatos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{funnelData.contacts.total}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Visitas: {funnelData.contacts.visitas}</div>
                <div>Ligações: {funnelData.contacts.ligacoes}</div>
                <div>Checklists: {funnelData.contacts.checklists}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prospecções</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{funnelData.prospects.total}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Abertas: {funnelData.prospects.abertas}</div>
                <div>Fechadas: {funnelData.prospects.fechadas}</div>
                <div>Valor: R$ {funnelData.prospects.totalValue.toLocaleString('pt-BR')}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{funnelData.sales.total}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Confirmadas: {funnelData.sales.confirmadas}</div>
                <div>Parciais: {funnelData.sales.parciais}</div>
                <div>Valor: R$ {funnelData.prospects.closedWonValue.toLocaleString('pt-BR')}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal */}
      {selectedTask && (
        <OpportunityDetailsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          task={selectedTask}
          onTaskUpdated={(updatedTask) => {
            // Handle update - seria implementado com mutation
            console.log('Update task:', updatedTask);
          }}
        />
      )}
    </div>
  );
};