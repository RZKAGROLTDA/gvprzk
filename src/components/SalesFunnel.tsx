import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye, RefreshCw, ChevronDown, ChevronUp, Edit, BarChart3, Users, TrendingUp, MapPin } from 'lucide-react';
import { Task } from '@/types/task';
import { useTasksOptimized } from '@/hooks/useTasksOptimized';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OpportunityDetailsModal } from '@/components/OpportunityDetailsModal';
import { OpportunityReport } from '@/components/OpportunityReport';
import { TaskEditModal } from '@/components/TaskEditModal';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { formatSalesValue } from '@/lib/securityUtils';

interface SalesFunnelData {
  contacts: { count: number; value: number };
  prospects: { count: number; value: number };
  sales: { count: number; value: number };
  partialSales: { count: number; value: number };
  lostSales: { count: number; value: number };
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
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [selectedFilial, setSelectedFilial] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details'>('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisualizationModalOpen, setIsVisualizationModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const queryClient = useQueryClient();

  // Fetch consultants
  const { data: consultants = [] } = useQuery({
    queryKey: ['consultants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'consultant');

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch filiais
  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, name, city');

      if (error) throw error;
      return data || [];
    },
  });

  const getFilialName = useCallback((filialId: string): string => {
    const filial = filiais.find(f => f.id === filialId);
    return filial ? `${filial.name} - ${filial.city}` : filialId;
  }, [filiais]);

  // Use optimized task hook
  const { tasks = [], loading, refetch } = useTasksOptimized();

  const forceRefresh = useCallback(async () => {
    console.log('🔄 FUNNEL: Forçando atualização de dados...');
    
    // Invalidar todas as queries relacionadas
    const invalidateAll = async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks-optimized'] });
      await queryClient.invalidateQueries({ queryKey: ['consultants'] });
      await queryClient.invalidateQueries({ queryKey: ['filiais'] });
      console.log('♻️ FUNNEL: Todas as queries invalidadas');
    };

    await invalidateAll();
    await refetch();
  }, [queryClient, refetch]);

  // Utility functions for name matching
  const normalizeName = useCallback((name: string): string => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }, []);

  const isNameMatch = useCallback((taskName: string, consultantName: string): boolean => {
    return normalizeName(taskName) === normalizeName(consultantName);
  }, [normalizeName]);

  // Filter tasks based on selected criteria
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Period filter
      if (selectedPeriod !== 'all') {
        const taskDate = new Date(task.createdAt);
        const now = new Date();
        const daysAgo = parseInt(selectedPeriod);
        const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        if (taskDate < cutoffDate) return false;
      }

      // Consultant filter
      if (selectedConsultant !== 'all') {
        const selectedConsultantData = consultants.find(c => c.id === selectedConsultant);
        if (selectedConsultantData && !isNameMatch(task.responsible, selectedConsultantData.name)) {
          return false;
        }
      }

      // Filial filter
      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return false;

      // Activity filter
      if (selectedActivity !== 'all') {
        if (selectedActivity === 'prospection' && task.taskType !== 'prospection') return false;
        if (selectedActivity === 'ligacao' && task.taskType !== 'ligacao') return false;
        if (selectedActivity === 'checklist' && task.taskType !== 'checklist') return false;
      }

      return true;
    });
  }, [tasks, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity, consultants, isNameMatch]);

  // Calculate funnel data
  const funnelData = useMemo((): SalesFunnelData => {
    const contacts = filteredTasks.filter(task => task.taskType === 'ligacao');
    const prospects = filteredTasks.filter(task => task.isProspect);
    const sales = filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'ganho');
    const partialSales = filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'parcial');
    const lostSales = filteredTasks.filter(task => task.salesConfirmed && task.salesType === 'perdido');

    return {
      contacts: {
        count: contacts.length,
        value: contacts.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      prospects: {
        count: prospects.length,
        value: prospects.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      sales: {
        count: sales.length,
        value: sales.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      partialSales: {
        count: partialSales.length,
        value: partialSales.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      },
      lostSales: {
        count: lostSales.length,
        value: lostSales.reduce((sum, task) => sum + calculateTaskSalesValue(task), 0)
      }
    };
  }, [filteredTasks]);

  // Calculate coverage data
  const coverageData = useMemo((): CoverageData[] => {
    const consultantStats = new Map<string, { filial: string; totalClients: Set<string>; visitedClients: Set<string> }>();

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
        coverage: totalClients > 0 ? (visitedClients / totalClients) * 100 : 0
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

    return Array.from(clientStats.entries())
      .map(([key, stats]) => ({
        client: key.split('-')[0],
        filial: getFilialName(stats.filial),
        consultant: stats.consultant,
        totalActivities: stats.activities.length,
        lastActivity: stats.lastActivity,
        salesValue: stats.salesValue,
        status: stats.status
      }))
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, 10); // Limit to top 10
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
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Carregando todos os dados...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com botão de refresh */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Análise Gerencial</h1>
          <p className="text-muted-foreground">Análise de performance comercial e cobertura de carteira</p>
          <p className="text-sm text-muted-foreground mt-1">
            Total de registros carregados: {tasks.length} | Filtrados: {filteredTasks.length} | Filiais: {filiais.length}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={forceRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recarregar Dados
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <label className="text-sm font-medium mb-2 block">Consultor</label>
          <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o consultor" />
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

        <div>
          <label className="text-sm font-medium mb-2 block">Filial</label>
          <Select value={selectedFilial} onValueChange={setSelectedFilial}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
              {filiais.map(filial => (
                <SelectItem key={filial.id} value={filial.id}>
                  {filial.name} - {filial.city}
                </SelectItem>
              ))}
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
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-colors ${activeView === 'overview' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
          onClick={() => setActiveView('overview')}
        >
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span className="font-medium">Visão Geral</span>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${activeView === 'funnel' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
          onClick={() => setActiveView('funnel')}
        >
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium">Funil de Vendas</span>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${activeView === 'coverage' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
          onClick={() => setActiveView('coverage')}
        >
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="font-medium">Cobertura</span>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${activeView === 'details' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
          onClick={() => setActiveView('details')}
        >
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-medium">Detalhes dos Clientes</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overview */}
      {activeView === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
        </div>
      )}

      {/* Funnel View */}
      {activeView === 'funnel' && (
        <div className="space-y-4">
          {/* Funnel sections */}
          {[
            { key: 'contacts', title: 'Contatos', data: funnelData.contacts, color: 'bg-blue-500' },
            { key: 'prospects', title: 'Prospects', data: funnelData.prospects, color: 'bg-green-500' },
            { key: 'sales', title: 'Vendas', data: funnelData.sales, color: 'bg-yellow-500' },
            { key: 'partialSales', title: 'Vendas Parciais', data: funnelData.partialSales, color: 'bg-orange-500' },
            { key: 'lostSales', title: 'Vendas Perdidas', data: funnelData.lostSales, color: 'bg-red-500' }
          ].map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`w-4 h-4 rounded ${section.color}`}></div>
                    <CardTitle>{section.title}</CardTitle>
                    <Badge variant="secondary">{section.data.count}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSection(section.key)}
                  >
                    {expandedSections[section.key] ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Valor total: {formatSalesValue(section.data.value)}
                </p>
              </CardHeader>
              
              {expandedSections[section.key] && (
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Consultor</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getDetailedData(section.key).slice(0, 10).map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">{task.client}</TableCell>
                          <TableCell>{task.responsible}</TableCell>
                          <TableCell>{getFilialName(task.filial || '')}</TableCell>
                          <TableCell>{formatSalesValue(calculateTaskSalesValue(task))}</TableCell>
                          <TableCell>{new Date(task.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsModalOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsEditModalOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {getDetailedData(section.key).length > 10 && (
                    <div className="mt-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        Mostrando 10 de {getDetailedData(section.key).length} registros.
                      </p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Coverage View */}
      {activeView === 'coverage' && (
        <Card>
          <CardHeader>
            <CardTitle>Cobertura de Carteira por Consultor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consultor</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Total de Clientes</TableHead>
                  <TableHead>Clientes Visitados</TableHead>
                  <TableHead>Cobertura (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverageData.map((coverage, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{coverage.consultant}</TableCell>
                    <TableCell>{coverage.filial}</TableCell>
                    <TableCell>{coverage.totalClients}</TableCell>
                    <TableCell>{coverage.visitedClients}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span>{coverage.coverage.toFixed(1)}%</span>
                        <div className="w-24 h-2 bg-gray-200 rounded-full">
                          <div 
                            className="h-2 bg-primary rounded-full" 
                            style={{ width: `${Math.min(coverage.coverage, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Details View */}
      {activeView === 'details' && (
        <Card>
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
                {clientDetails.map((client, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{client.client}</TableCell>
                    <TableCell>{client.filial}</TableCell>
                    <TableCell>{client.consultant}</TableCell>
                    <TableCell>{client.totalActivities}</TableCell>
                    <TableCell>{client.lastActivity.toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{formatSalesValue(client.salesValue)}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          client.status === 'Venda Total' ? 'default' :
                          client.status === 'Venda Parcial' ? 'secondary' :
                          client.status === 'Prospect' ? 'outline' : 'destructive'
                        }
                      >
                        {client.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {clientDetails.length > 10 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Mostrando 10 de {clientDetails.length} clientes. Use os filtros para refinar a busca.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {selectedTask && (
        <OpportunityDetailsModal 
          task={selectedTask} 
          isOpen={isModalOpen} 
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }} 
          onTaskUpdated={updatedTask => {
            console.log('📋 FUNNEL: Task atualizada recebida:', updatedTask);
            setSelectedTask(updatedTask);
            refetch();
          }} 
        />
      )}
      
      {selectedTask && (
        <OpportunityReport
          task={selectedTask}
          isOpen={isVisualizationModalOpen}
          onClose={() => {
            setIsVisualizationModalOpen(false);
            setSelectedTask(null);
          }}
        />
      )}
      
      <TaskEditModal
        taskId={selectedTask?.id || null}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedTask(null);
        }}
        onTaskUpdate={async () => {
          console.log('🔄 SalesFunnel - Callback onTaskUpdate chamado, forçando atualização');
          await queryClient.invalidateQueries({ queryKey: ['tasks-optimized'] });
          await refetch();
        }}
      />
    </div>
  );
};