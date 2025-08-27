import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Calendar, TrendingUp, Users, DollarSign, Target, Filter, Eye, Edit } from 'lucide-react';
import { useTasksOptimized } from '@/hooks/useTasksOptimized';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { mapSalesStatus, getStatusLabel, getStatusColor, resolveFilialName, loadFiliaisCache, calculateSalesValue } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { OpportunityDetailsModal } from '@/components/OpportunityDetailsModal';
import { FormVisualization } from '@/components/FormVisualization';
import { TaskEditModal } from '@/components/TaskEditModal';
import { Task } from '@/types/task';
import { useSecurityCache } from '@/hooks/useSecurityCache';
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
export const SalesFunnel: React.FC = () => {
  const {
    tasks,
    loading,
    refetch
  } = useTasksOptimized(true);
  const {
    user
  } = useAuth();
  const { invalidateAll } = useSecurityCache();
  const [consultants, setConsultants] = useState<any[]>([]);
  const [filiais, setFiliais] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details'>('overview');
  const [selectedFunnelSection, setSelectedFunnelSection] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisualizationModalOpen, setIsVisualizationModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Filtros
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Add state to prevent multiple simultaneous loads
  const [isLoading, setIsLoading] = useState(false);

  // Carregar consultores e filiais com cache otimizado
  useEffect(() => {
    const loadFilters = async () => {
      if (isLoading) return;
      setIsLoading(true);
      try {
        // Carregamento paralelo para melhor performance
        const [profilesResponse, filiaisResponse] = await Promise.all([supabase.from('profiles').select('id, name, filial_id').eq('approval_status', 'approved'), supabase.from('filiais').select('id, nome').order('nome')]);
        setConsultants(profilesResponse.data || []);
        setFiliais(filiaisResponse.data || []);
        console.log('📊 Dados carregados:', {
          consultants: profilesResponse.data?.length || 0,
          filiais: filiaisResponse.data?.length || 0,
          consultantsList: profilesResponse.data?.map(c => ({
            id: c.id,
            name: c.name
          }))
        });

        // Carregar cache de filiais para resolução de UUIDs
        await loadFiliaisCache();
      } catch (error) {
        console.error('Erro ao carregar filtros:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadFilters();
  }, []);

  // Função de normalização de nomes para matching flexível
  const normalizeName = (name: string) => {
    if (!name) return '';
    return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, ' ') // Remove espaços duplos
    .replace(/[^\w\s]/g, ''); // Remove caracteres especiais
  };

  // Função de matching flexível para nomes
  const isNameMatch = (consultantName: string, taskResponsible: string) => {
    if (!consultantName || !taskResponsible) return false;
    const normalizedConsultant = normalizeName(consultantName);
    const normalizedTask = normalizeName(taskResponsible);

    // Exact match após normalização
    if (normalizedConsultant === normalizedTask) return true;

    // Busca parcial - verifica se um nome contém o outro
    if (normalizedConsultant.includes(normalizedTask) || normalizedTask.includes(normalizedConsultant)) return true;

    // Busca por palavras individuais (para casos como "João Silva" vs "João P. Silva")
    const consultantWords = normalizedConsultant.split(' ').filter(w => w.length > 2);
    const taskWords = normalizedTask.split(' ').filter(w => w.length > 2);
    if (consultantWords.length > 0 && taskWords.length > 0) {
      const commonWords = consultantWords.filter(word => taskWords.includes(word));
      return commonWords.length >= Math.min(consultantWords.length, taskWords.length) * 0.6;
    }
    return false;
  };

  // Filtrar tarefas baseado nos filtros selecionados
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      const now = new Date();
      const daysAgo = parseInt(selectedPeriod);
      const periodStart = subDays(now, daysAgo);

      // Filtro de período
      if (taskDate < periodStart) return false;

      // Filtro de consultor com matching aprimorado
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant) {
          console.warn('❌ Consultor não encontrado:', selectedConsultant);
          return false;
        }
        const isMatch = isNameMatch(consultant.name, task.responsible);
        if (!isMatch) return false;
      }

      // Filtro de filial
      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return false;

      // Filtro de tipo de atividade
      if (selectedActivity !== 'all' && task.taskType !== selectedActivity) return false;
      return true;
    });
    
    console.log('📊 SalesFunnel - Filtros aplicados:', {
      totalTasks: tasks.length,
      filteredTasks: filtered.length,
      selectedConsultant,
      selectedFilial,
      selectedActivity,
      selectedPeriod
    });
    
    return filtered;
  }, [tasks, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity, consultants]);

  // Dados do funil de vendas
  const funnelData = useMemo(() => {
    // Primeira barra: Contatos com Clientes por tipo
    const totalVisitas = filteredTasks.filter(task => task.taskType === 'prospection').length;
    const totalLigacoes = filteredTasks.filter(task => task.taskType === 'ligacao').length;
    const totalChecklists = filteredTasks.filter(task => task.taskType === 'checklist').length;
    const totalContacts = totalVisitas + totalLigacoes + totalChecklists;

    // Segunda barra: Prospecções
    const prospects = filteredTasks.filter(task => task.isProspect).length;
    const openProspects = filteredTasks.filter(task => task.isProspect && task.status === 'pending').length;
    const closedWon = filteredTasks.filter(task => task.salesConfirmed).length;
    const closedLost = filteredTasks.filter(task => task.isProspect && task.status === 'closed' && !task.salesConfirmed).length;

    // Valores das prospecções
    const totalProspectValue = filteredTasks.filter(task => task.isProspect).reduce((sum, task) => sum + getSalesValueAsNumber(task.salesValue), 0);
    const openProspectValue = filteredTasks.filter(task => task.isProspect && task.status === 'pending').reduce((sum, task) => sum + getSalesValueAsNumber(task.salesValue), 0);
    const closedWonValue = filteredTasks.filter(task => task.salesConfirmed).reduce((sum, task) => sum + getSalesValueAsNumber(task.salesValue), 0);

    // Terceira barra: Vendas/Faturamento
    const confirmadas = filteredTasks.filter(task => task.salesConfirmed).length;
    const parciais = filteredTasks.filter(task => {
      const salesStatus = mapSalesStatus(task);
      return salesStatus === 'parcial';
    }).length;
    const totalSales = confirmadas + parciais;
    return {
      contacts: {
        total: totalContacts,
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
        total: totalSales
      }
    };
  }, [filteredTasks]);

  // Dados de cobertura de carteira
  const coverageData = useMemo(() => {
    const uniqueClients = new Set(filteredTasks.map(task => task.client));
    const clientsWithVisits = new Set(filteredTasks.filter(task => task.taskType === 'prospection').map(task => task.client));
    const clientsWithProposals = new Set(filteredTasks.filter(task => task.isProspect).map(task => task.client));
    const clientsWithSales = new Set(filteredTasks.filter(task => task.salesConfirmed).map(task => task.client));
    const totalClients = uniqueClients.size || 1; // Evitar divisão por zero

    return [{
      name: 'Clientes com Visitas',
      value: clientsWithVisits.size,
      percentage: Math.round(clientsWithVisits.size / totalClients * 100)
    }, {
      name: 'Clientes com Propostas',
      value: clientsWithProposals.size,
      percentage: Math.round(clientsWithProposals.size / totalClients * 100)
    }, {
      name: 'Clientes com Vendas',
      value: clientsWithSales.size,
      percentage: Math.round(clientsWithSales.size / totalClients * 100)
    }];
  }, [filteredTasks]);

  // Detalhes por cliente
  const clientDetails = useMemo(() => {
    const clientMap = new Map<string, ClientDetails>();
    filteredTasks.forEach(task => {
      const key = `${task.client}-${task.filial}`;
      if (!clientMap.has(key)) {
        // Usar função padronizada para resolver nome da filial
        const filialName = resolveFilialName(task.filial);
        clientMap.set(key, {
          client: task.client,
          filial: filialName,
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
      if (task.taskType === 'prospection') client.totalVisits++;
      if (task.taskType === 'ligacao') client.totalCalls++;
      if (task.taskType === 'checklist') client.totalChecklists++;
      if (task.isProspect) client.prospects++;
      client.salesValue += getSalesValueAsNumber(task.salesValue);
      if (task.createdAt > client.lastActivity) {
        client.lastActivity = task.createdAt;
      }
    });
    return Array.from(clientMap.values()).sort((a, b) => b.salesValue - a.salesValue);
  }, [filteredTasks, filiais]);

  // Dados detalhados para a seção selecionada
  const getDetailedData = useMemo(() => {
    if (!selectedFunnelSection) return [];
    switch (selectedFunnelSection) {
      // Filtros para Contatos específicos
      case 'contacts-visitas':
        return filteredTasks.filter(task => task.taskType === 'prospection').map(task => ({
          client: task.client,
          responsible: task.responsible,
          type: 'Visita',
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'contacts-checklists':
        return filteredTasks.filter(task => task.taskType === 'checklist').map(task => ({
          client: task.client,
          responsible: task.responsible,
          type: 'Checklist',
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'contacts-ligacoes':
        return filteredTasks.filter(task => task.taskType === 'ligacao').map(task => ({
          client: task.client,
          responsible: task.responsible,
          type: 'Ligação',
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));

      // Filtros para Prospecções específicas
      case 'prospects-abertas':
        return filteredTasks.filter(task => task.isProspect && task.status === 'pending').map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: 'Aberta',
          confirmed: task.salesConfirmed,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'prospects-fechadas':
        return filteredTasks.filter(task => task.salesConfirmed).map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: 'Fechada',
          confirmed: true,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'prospects-perdidas':
        return filteredTasks.filter(task => task.isProspect && task.status === 'closed' && !task.salesConfirmed).map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: 'Perdida',
          confirmed: false,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));

      // Filtros gerais
      case 'contacts':
        return filteredTasks.map(task => ({
          client: task.client,
          responsible: task.responsible,
          type: task.taskType,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'prospects':
        return filteredTasks.filter(task => task.isProspect).map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: task.status,
          confirmed: task.salesConfirmed,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'sales-confirmed':
        return filteredTasks.filter(task => task.salesConfirmed).map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: task.status,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'sales-partial':
        return filteredTasks.filter(task => {
          const salesStatus = mapSalesStatus(task);
          return salesStatus === 'parcial';
        }).map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: 'Parcial',
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      case 'sales':
        return filteredTasks.filter(task => task.salesConfirmed).map(task => ({
          client: task.client,
          responsible: task.responsible,
          status: task.status,
          date: format(task.createdAt, 'dd/MM/yyyy', {
            locale: ptBR
          }),
          filial: resolveFilialName(task.filial),
          value: getSalesValueAsNumber(task.salesValue)
        }));
      default:
        return [];
    }
  }, [selectedFunnelSection, filteredTasks, filiais]);
  const totalSalesValue = filteredTasks.reduce((sum, task) => sum + getSalesValueAsNumber(task.salesValue), 0);
  const chartConfig = {
    value: {
      label: "Quantidade",
      color: "hsl(var(--chart-1))"
    }
  };
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  if (loading) {
    return <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Análise Gerencial

        </h1>
          <p className="text-muted-foreground">Análise de performance comercial e cobertura de carteira</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtros aplicados</span>
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              <label className="text-sm font-medium">Vendedor</label>
              <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os consultores</SelectItem>
                  {consultants.map(consultant => <SelectItem key={consultant.id} value={consultant.id}>
                      {consultant.name}
                    </SelectItem>)}
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
                  {filiais.map(filial => <SelectItem key={filial.id} value={filial.nome}>
                      {filial.nome}
                    </SelectItem>)}
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Exibir</label>
              <Select value={itemsPerPage.toString()} onValueChange={value => setItemsPerPage(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 itens</SelectItem>
                  <SelectItem value="20">20 itens</SelectItem>
                  <SelectItem value="50">50 itens</SelectItem>
                  <SelectItem value="100">100 itens</SelectItem>
                  <SelectItem value={filteredTasks.length.toString()}>Todos ({filteredTasks.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Navegação */}
      {activeView === 'overview' && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary/50" onClick={() => setActiveView('funnel')}>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Análise do Funil</h3>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary/50" onClick={() => setActiveView('coverage')}>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Relatórios</h3>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all border-2 hover:border-primary/50" onClick={() => setActiveView('details')}>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Detalhes por Cliente</h3>
              </div>
            </CardContent>
          </Card>
        </div>}

      {/* Botão Voltar quando não estiver na overview */}
      {activeView !== 'overview' && <Button variant="outline" onClick={() => setActiveView('overview')} className="mb-4">
          ← Voltar ao Menu Principal
        </Button>}

      {/* Conteúdo do Funil */}
      {activeView === 'funnel' && <div className="space-y-6">
          {/* Funil Hierárquico Visual */}
          <Card>
            <CardHeader>
              <CardTitle>Funil de Vendas</CardTitle>
              <CardDescription>Fluxo de conversão hierárquico</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              
              {/* Funil Visual em Formato de Pirâmide */}
              <div className="flex flex-col items-center space-y-6">
                
                {/* Nível 1: Contatos (Base do Funil - Mais Largo) */}
                <div className="w-full max-w-5xl">
                  <h4 className="text-center text-sm font-medium text-muted-foreground mb-4">CONTATOS COM CLIENTES</h4>
                  <div className="relative">
                    {/* Linha conectora para baixo */}
                    <div className="absolute left-1/2 top-full w-px h-6 bg-border transform -translate-x-1/2"></div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'contacts-visitas' ? null : 'contacts-visitas')}>
                        <div className="font-bold text-3xl mb-2">{funnelData.contacts.visitas}</div>
                        <div className="text-sm opacity-90 mb-1">Visitas</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-3 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.contacts.visitas / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'contacts-checklists' ? null : 'contacts-checklists')}>
                        <div className="font-bold text-3xl mb-2">{funnelData.contacts.checklists}</div>
                        <div className="text-sm opacity-90 mb-1">Checklists</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-3 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.contacts.checklists / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'contacts-ligacoes' ? null : 'contacts-ligacoes')}>
                        <div className="font-bold text-3xl mb-2">{funnelData.contacts.ligacoes}</div>
                        <div className="text-sm opacity-90 mb-1">Ligações</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-3 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.contacts.ligacoes / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                    </div>
                    <div className="text-center text-sm text-muted-foreground mt-3 font-semibold">
                      Total: {funnelData.contacts.total} contatos
                    </div>
                  </div>
                </div>

                {/* Nível 2: Prospecções (Meio do Funil - Mais Estreito) */}
                <div className="w-full max-w-3xl">
                  <h4 className="text-center text-sm font-medium text-muted-foreground mb-4">PROSPECÇÕES</h4>
                  <div className="relative">
                    {/* Linha conectora para baixo */}
                    <div className="absolute left-1/2 top-full w-px h-6 bg-border transform -translate-x-1/2"></div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'prospects-abertas' ? null : 'prospects-abertas')}>
                        <div className="font-bold text-2xl mb-2">{funnelData.prospects.abertas}</div>
                        <div className="text-sm opacity-90 mb-1">Abertas</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-2 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.prospects.abertas / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'prospects-fechadas' ? null : 'prospects-fechadas')}>
                        <div className="font-bold text-2xl mb-2">{funnelData.prospects.fechadas}</div>
                        <div className="text-sm opacity-90 mb-1">Fechadas</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-2 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.prospects.fechadas / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'prospects-perdidas' ? null : 'prospects-perdidas')}>
                        <div className="font-bold text-2xl mb-2">{funnelData.prospects.perdidas}</div>
                        <div className="text-sm opacity-90 mb-1">Perdidas</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-2 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.prospects.perdidas / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                    </div>
                    <div className="text-center text-sm text-muted-foreground mt-3 font-semibold">
                      Total: {funnelData.prospects.total} prospecções
                    </div>
                  </div>
                </div>

                {/* Nível 3: Vendas (Topo do Funil - Ainda Mais Estreito) */}
                <div className="w-full max-w-lg">
                  <h4 className="text-center text-sm font-medium text-muted-foreground mb-4">VENDAS</h4>
                  <div className="relative">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-4 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'sales-confirmed' ? null : 'sales-confirmed')}>
                        <div className="font-bold text-xl mb-2">{funnelData.sales.confirmadas}</div>
                        <div className="text-sm opacity-90 mb-1">Total</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-2 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.sales.confirmadas / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-4 rounded-xl text-center cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105" onClick={() => setSelectedFunnelSection(selectedFunnelSection === 'sales-partial' ? null : 'sales-partial')}>
                        <div className="font-bold text-xl mb-2">{funnelData.sales.parciais}</div>
                        <div className="text-sm opacity-90 mb-1">Parcial</div>
                        <div className="text-xs opacity-75 bg-white/20 rounded-full px-2 py-1">
                          {funnelData.contacts.total > 0 ? Math.round(funnelData.sales.parciais / funnelData.contacts.total * 100) : 0}%
                        </div>
                      </div>
                    </div>
                    <div className="text-center text-sm text-muted-foreground mt-3 font-semibold">
                      Total: {funnelData.sales.total} vendas
                    </div>
                  </div>
                </div>

                {/* Taxa de Conversão Final */}
                <div className="w-full max-w-xs">
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-xl text-center shadow-lg">
                    <div className="font-bold text-xl mb-2">
                      {funnelData.contacts.total > 0 ? Math.round(funnelData.sales.total / funnelData.contacts.total * 100) : 0}%
                    </div>
                    <div className="text-sm opacity-90">Taxa de Conversão</div>
                  </div>
                </div>

              </div>

              {/* Detalhes das Seções Selecionadas */}
              {selectedFunnelSection && getDetailedData.length > 0 && <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>
                      {selectedFunnelSection.includes('contacts-visitas') && 'Detalhes das Visitas'}
                      {selectedFunnelSection.includes('contacts-checklists') && 'Detalhes dos Checklists'}
                      {selectedFunnelSection.includes('contacts-ligacoes') && 'Detalhes das Ligações'}
                      {selectedFunnelSection.includes('prospects-abertas') && 'Detalhes das Prospecções Abertas'}
                      {selectedFunnelSection.includes('prospects-fechadas') && 'Detalhes das Prospecções Fechadas'}
                      {selectedFunnelSection.includes('prospects-perdidas') && 'Detalhes das Prospecções Perdidas'}
                      {selectedFunnelSection === 'prospects' && 'Detalhes das Prospecções'}
                      {selectedFunnelSection === 'contacts' && 'Detalhes dos Contatos'}
                      {selectedFunnelSection === 'sales' && 'Detalhes das Vendas'}
                    </CardTitle>
                    <CardDescription>
                      Lista específica para: {selectedFunnelSection}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead>Filial</TableHead>
                          {(selectedFunnelSection.includes('contacts-') || selectedFunnelSection === 'contacts') && <TableHead>Tipo</TableHead>}
                          {selectedFunnelSection.includes('prospects-') && <TableHead>Status</TableHead>}
                          {selectedFunnelSection.includes('prospects-') && <TableHead>Confirmada</TableHead>}
                          <TableHead>Data</TableHead>
                          <TableHead>Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getDetailedData.slice(0, 10).map((item, index) => <TableRow key={index}>
                            <TableCell className="font-medium">{item.client}</TableCell>
                            <TableCell>{item.responsible}</TableCell>
                            <TableCell>{item.filial}</TableCell>
                            {(selectedFunnelSection.includes('contacts-') || selectedFunnelSection === 'contacts') && <TableCell>
                                <Badge variant="secondary">{item.type}</Badge>
                              </TableCell>}
                            {selectedFunnelSection.includes('prospects-') && <TableCell>
                                <Badge variant={item.status === 'Fechada' ? 'default' : item.status === 'Aberta' ? 'secondary' : 'outline'}>
                                  {item.status}
                                </Badge>
                              </TableCell>}
                            {selectedFunnelSection.includes('prospects-') && <TableCell>
                                <Badge variant={item.confirmed ? 'default' : 'outline'}>
                                  {item.confirmed ? 'Sim' : 'Não'}
                                </Badge>
                              </TableCell>}
                            <TableCell>{item.date}</TableCell>
                            <TableCell>
                              {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(item.value)}
                            </TableCell>
                          </TableRow>)}
                      </TableBody>
                    </Table>
                    
                    {getDetailedData.length > 10 && <div className="mt-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          Mostrando 10 de {getDetailedData.length} registros.
                        </p>
                      </div>}
                  </CardContent>
                </Card>}


            </CardContent>
          </Card>
          
          {/* Indicadores Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Contatos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{funnelData.contacts.total}</div>
                <p className="text-xs text-muted-foreground">Atividades registradas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {funnelData.contacts.total > 0 ? Math.round(funnelData.sales.total / funnelData.contacts.total * 100) : 0}%
                </div>
                <p className="text-xs text-muted-foreground">De contatos para vendas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              }).format(totalSalesValue)}
                </div>
                <p className="text-xs text-muted-foreground">Em oportunidades</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Únicos</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{new Set(filteredTasks.map(t => t.client)).size}</div>
                <p className="text-xs text-muted-foreground">No período selecionado</p>
              </CardContent>
            </Card>
          </div>

        </div>}

      {/* Conteúdo dos Relatórios */}
      {activeView === 'coverage' && <Card>
          <CardHeader>
            <CardTitle>Relatório de Atividades</CardTitle>
            <CardDescription>Resumo das atividades realizadas com status e oportunidades</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome da Atividade</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead> Oportunidade</TableHead>
                  <TableHead>Venda Realizada</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.slice(0, itemsPerPage).map(task => {
              const getTaskStatus = () => {
                console.log('🔍 SalesFunnel - Calculando status para tarefa:', {
                  id: task.id,
                  client: task.client,
                  salesConfirmed: task.salesConfirmed,
                  salesType: task.salesType,
                  isProspect: task.isProspect,
                  prospectNotes: task.prospectNotes
                });
                
                // Usar a função padronizada de mapeamento de status
                const mappedStatus = mapSalesStatus(task);
                console.log('🔍 SalesFunnel - Status mapeado:', mappedStatus, 'para tarefa:', task.id);
                
                // Priorizar o sales_type direto da task sobre o mapSalesStatus
                if (task.salesType === 'perdido' || (task.salesConfirmed === false && task.isProspect)) {
                  return {
                    label: 'Perdido',
                    variant: 'destructive' as const
                  };
                }
                
                if (task.salesType === 'parcial') {
                  return {
                    label: 'Parcial',
                    variant: 'secondary' as const
                  };
                }
                
                if (task.salesType === 'ganho' || task.salesConfirmed === true) {
                  return {
                    label: 'Ganho',
                    variant: 'default' as const
                  };
                }
                
                // Se é prospect ou não tem sales_type definido
                if (task.isProspect) {
                  return {
                    label: 'Prospect',
                    variant: 'outline' as const
                  };
                }
                
                // Atividade sem prospect
                return {
                  label: 'Atividade',
                  variant: 'secondary' as const
                };
              };
              const status = getTaskStatus();
              return <TableRow key={task.id}>
                      <TableCell className="font-medium">
                        <div className="text-xs text-muted-foreground">
                          {task.taskType === 'prospection' ? 'Visita' : task.taskType === 'ligacao' ? 'Ligação' : task.taskType === 'checklist' ? 'Checklist' : task.taskType}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{task.client}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {task.responsible || 'Não informado'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                      // Buscar a filial do vendedor responsável
                      const vendor = consultants.find(c => c.name === task.responsible);
                      if (vendor && vendor.filial_id) {
                        const filial = filiais.find(f => f.id === vendor.filial_id);
                        return filial?.nome || 'Filial não informada';
                      }
                      // Fallback: usar a filial da task se não encontrar do vendedor
                      return resolveFilialName(task.filial) || 'Filial não informada';
                    })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                    // Usar diretamente o valor do formulário (salesValue)
                    const opportunityValue = getSalesValueAsNumber(task.salesValue);
                    
                    return opportunityValue > 0 ? new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format(opportunityValue) : '-';
                  })()}
                      </TableCell>
                        <TableCell>
                          {(() => {
                            // Usar a função padronizada de cálculo de vendas
                            const finalSalesValue = calculateTaskSalesValue(task);
                            const salesStatus = mapSalesStatus(task);
                            
                            // Se não há venda realizada (prospect ou perdido), não mostrar valor
                            if (salesStatus === 'prospect' || salesStatus === 'perdido') {
                              return '-';
                            }
                            
                            // Para vendas realizadas (ganho ou parcial), mostrar o valor calculado
                            return finalSalesValue > 0 ? new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            }).format(finalSalesValue) : '-';
                          })()}
                        </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className={status.variant === 'default' ? 'bg-green-500 hover:bg-green-600 text-white' : status.variant === 'secondary' ? 'bg-blue-500 hover:bg-blue-600 text-white' : status.variant === 'destructive' ? 'bg-red-500 hover:bg-red-600 text-white' : status.variant === 'outline' ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500' : ''}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(task.createdAt, 'dd/MM/yyyy', {
                    locale: ptBR
                  })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => {
                            setSelectedTask(task);
                            setIsVisualizationModalOpen(true);
                          }}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => {
                      setSelectedTask(task);
                      setIsEditModalOpen(true);
                    }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>;
            })}
              </TableBody>
            </Table>
            
            {filteredTasks.length > itemsPerPage && <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Mostrando {Math.min(itemsPerPage, filteredTasks.length)} de {filteredTasks.length} atividades.
                  {itemsPerPage < filteredTasks.length && " Use o filtro 'Exibir' para ver mais registros."}
                </p>
              </div>}
          </CardContent>
        </Card>}

      {/* Conteúdo dos Detalhes */}
      {activeView === 'details' && <Card>
          <CardHeader>
            <CardTitle>Detalhes por Cliente</CardTitle>
            <CardDescription>Breakdown detalhado das atividades por cliente</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente (Proprietário)</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Visitas</TableHead>
                  <TableHead>Ligações</TableHead>
                  <TableHead>Checklists</TableHead>
                  <TableHead>Prospects</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Última Atividade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientDetails.slice(0, 10).map((client, index) => <TableRow key={index}>
                    <TableCell className="font-medium">{client.client}</TableCell>
                    <TableCell>{client.filial}</TableCell>
                    <TableCell>{client.responsible}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{client.totalVisits}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{client.totalCalls}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{client.totalChecklists}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.prospects > 0 ? "default" : "outline"}>
                        {client.prospects}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                }).format(client.salesValue)}
                    </TableCell>
                    <TableCell>
                      {format(client.lastActivity, 'dd/MM/yyyy', {
                  locale: ptBR
                })}
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

      {/* Modal de Detalhes da Oportunidade */}
      <OpportunityDetailsModal task={selectedTask} isOpen={isModalOpen} onClose={() => {
      setIsModalOpen(false);
      setSelectedTask(null);
    }} onTaskUpdated={updatedTask => {
      console.log('📋 FUNNEL: Task atualizada recebida:', updatedTask);

      // Update selected task with the received data
      console.log('🔄 FUNNEL: Atualizando selectedTask com dados recebidos:', updatedTask);
      setSelectedTask(updatedTask);

      // CRITICAL: Reload tasks to reflect status changes in the table
      console.log('🔄 FUNNEL: Recarregando tarefas para atualizar status na tabela');
      refetch();
    }} />
    
    {selectedTask && (
        <FormVisualization
          task={selectedTask}
          isOpen={isVisualizationModalOpen}
          onClose={() => {
            setIsVisualizationModalOpen(false);
            setSelectedTask(null);
          }}
          onTaskUpdated={async () => {
            // Invalidar cache globalmente para garantir sincronização
            await invalidateAll();
            refetch();
          }}
        />
    )}
    
    {selectedTask && (
        <TaskEditModal
          task={selectedTask}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedTask(null);
          }}
          onTaskUpdate={async () => {
            console.log('🔄 SalesFunnel - Callback onTaskUpdate chamado, forçando atualização');
            // Invalidar cache globalmente para garantir sincronização
            await invalidateAll();
            // Recarregar dados localmente com força
            console.log('🔄 SalesFunnel - Refetchando dados após update');
            await refetch();
            // Forçar re-render do componente
            console.log('🔄 SalesFunnel - Update concluído');
          }}
        />
    )}
    </div>;
};
