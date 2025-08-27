
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, TrendingUp, Users, DollarSign, Target, Filter, Eye, Edit, RefreshCw } from 'lucide-react';
import { useTasksOptimized } from '@/hooks/useTasksOptimized';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { mapSalesStatus, resolveFilialName } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { calculateTaskSalesValue } from '@/lib/salesValueCalculator';
import { OpportunityDetailsModal } from '@/components/OpportunityDetailsModal';
import { FormVisualization } from '@/components/FormVisualization';
import { TaskEditModal } from '@/components/TaskEditModal';
import { Task } from '@/types/task';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { toast } from '@/components/ui/use-toast';

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
  const { tasks, loading, refetch } = useTasksOptimized(true);
  const { user } = useAuth();
  const { invalidateAll } = useSecurityCache();
  
  // Cache para consultores e filiais com carregamento lazy
  const [consultants, setConsultants] = useState<any[]>([]);
  const [filiais, setFiliais] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'overview' | 'funnel' | 'coverage' | 'details'>('overview');
  const [selectedFunnelSection, setSelectedFunnelSection] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisualizationModalOpen, setIsVisualizationModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Filtros otimizados
  const [selectedPeriod, setSelectedPeriod] = useState('30'); // Período menor por padrão
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(20); // Menos itens por página

  // Cache simples em memória
  const [isInitialized, setIsInitialized] = useState(false);

  // Carregamento otimizado e lazy dos filtros
  useEffect(() => {
    if (isInitialized) return;
    
    const loadFiltersOptimized = async () => {
      try {
        // Carregamento paralelo apenas quando necessário
        const [profilesResponse, filiaisResponse] = await Promise.all([
          supabase.from('profiles').select('id, name').eq('approval_status', 'approved').limit(50),
          supabase.from('filiais').select('id, nome').order('nome').limit(20)
        ]);
        
        setConsultants(profilesResponse.data || []);
        setFiliais(filiaisResponse.data || []);
        setIsInitialized(true);
      } catch (error) {
        console.error('Erro ao carregar filtros:', error);
        // Continuar mesmo com erro para não bloquear a interface
        setIsInitialized(true);
      }
    };

    loadFiltersOptimized();
  }, [isInitialized]);

  // Filtros otimizados com menor processamento
  const filteredTasks = useMemo(() => {
    if (!tasks.length) return [];

    const now = new Date();
    const daysAgo = parseInt(selectedPeriod);
    const periodStart = subDays(now, daysAgo);

    return tasks.filter(task => {
      // Filtro de período (mais rápido primeiro)
      const taskDate = new Date(task.createdAt);
      if (taskDate < periodStart) return false;

      // Filtros simples sem processamento pesado
      if (selectedConsultant !== 'all' && !task.responsible?.includes(selectedConsultant)) return false;
      if (selectedFilial !== 'all' && task.filial !== selectedFilial) return false;
      if (selectedActivity !== 'all' && task.taskType !== selectedActivity) return false;

      return true;
    });
  }, [tasks, selectedPeriod, selectedConsultant, selectedFilial, selectedActivity]);

  // Dados do funil otimizados
  const funnelData = useMemo(() => {
    const totalVisitas = filteredTasks.filter(task => task.taskType === 'prospection').length;
    const totalLigacoes = filteredTasks.filter(task => task.taskType === 'ligacao').length;
    const totalChecklists = filteredTasks.filter(task => task.taskType === 'checklist').length;
    const prospects = filteredTasks.filter(task => task.isProspect).length;
    const openProspects = filteredTasks.filter(task => task.isProspect && task.status === 'pending').length;
    const closedWon = filteredTasks.filter(task => task.salesConfirmed).length;
    const closedLost = filteredTasks.filter(task => task.isProspect && task.status === 'closed' && !task.salesConfirmed).length;
    const confirmadas = filteredTasks.filter(task => task.salesConfirmed).length;
    const parciais = filteredTasks.filter(task => mapSalesStatus(task) === 'parcial').length;

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
        perdidas: closedLost
      },
      sales: {
        confirmadas,
        parciais,
        total: confirmadas + parciais
      }
    };
  }, [filteredTasks]);

  // Detalhes por cliente otimizados
  const clientDetails = useMemo(() => {
    const clientMap = new Map<string, ClientDetails>();
    
    filteredTasks.forEach(task => {
      const key = `${task.client}-${task.filial}`;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          client: task.client,
          filial: task.filial || 'Não informado',
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
    
    return Array.from(clientMap.values())
      .sort((a, b) => b.salesValue - a.salesValue)
      .slice(0, 50); // Limitar a 50 clientes para performance
  }, [filteredTasks]);

  // Função de refresh otimizada
  const forceRefresh = async () => {
    try {
      await refetch();
      toast({
        title: "✅ Dados Atualizados",
        description: "Dados recarregados com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao recarregar dados:', error);
    }
  };

  const totalSalesValue = filteredTasks.reduce((sum, task) => sum + getSalesValueAsNumber(task.salesValue), 0);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header otimizado */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Análise Gerencial</h1>
          <p className="text-muted-foreground">Análise de performance comercial</p>
          <p className="text-sm text-muted-foreground mt-1">
            Registros filtrados: {filteredTasks.length}
          </p>
        </div>
        
        <Button variant="outline" size="sm" onClick={forceRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Filtros simplificados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Filtros</span>
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
                  <SelectItem value="1">Hoje</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
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
                  <SelectItem value="all">Todos</SelectItem>
                  {consultants.map(consultant => (
                    <SelectItem key={consultant.id} value={consultant.name}>
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
                  <SelectItem value="all">Todas</SelectItem>
                  {filiais.map(filial => (
                    <SelectItem key={filial.id} value={filial.nome}>
                      {filial.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Atividade</label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="prospection">Visitas</SelectItem>
                  <SelectItem value="ligacao">Ligações</SelectItem>
                  <SelectItem value="checklist">Checklists</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Navegação */}
      {activeView === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => setActiveView('funnel')}>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Funil de Vendas</h3>
                <p className="text-2xl font-bold text-primary mt-2">{funnelData.sales.total}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => setActiveView('coverage')}>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Relatórios</h3>
                <p className="text-2xl font-bold text-primary mt-2">{filteredTasks.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => setActiveView('details')}>
            <CardContent className="p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Detalhes por Cliente</h3>
                <p className="text-2xl font-bold text-primary mt-2">{clientDetails.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Botão Voltar */}
      {activeView !== 'overview' && (
        <Button variant="outline" onClick={() => setActiveView('overview')} className="mb-4">
          ← Voltar
        </Button>
      )}

      {/* Conteúdo do Funil simplificado */}
      {activeView === 'funnel' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Funil de Vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <h4 className="font-semibold">Contatos</h4>
                  <p className="text-2xl font-bold text-blue-600">{funnelData.contacts.total}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <h4 className="font-semibold">Prospects</h4>
                  <p className="text-2xl font-bold text-yellow-600">{funnelData.prospects.total}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <h4 className="font-semibold">Vendas</h4>
                  <p className="text-2xl font-bold text-green-600">{funnelData.sales.total}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                      <p className="text-xl font-bold">
                        {funnelData.contacts.total > 0 ? 
                          Math.round(funnelData.sales.total / funnelData.contacts.total * 100) : 0}%
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="text-lg font-bold">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(totalSalesValue)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Clientes</p>
                      <p className="text-xl font-bold">{new Set(filteredTasks.map(t => t.client)).size}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Atividades</p>
                      <p className="text-xl font-bold">{filteredTasks.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Relatórios otimizados */}
      {activeView === 'coverage' && (
        <Card>
          <CardHeader>
            <CardTitle>Relatório de Atividades</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.slice(0, itemsPerPage).map(task => {
                  const status = mapSalesStatus(task);
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.client}</TableCell>
                      <TableCell>{task.responsible}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {task.taskType === 'prospection' ? 'Visita' : 
                           task.taskType === 'ligacao' ? 'Ligação' : 
                           task.taskType === 'checklist' ? 'Checklist' : task.taskType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          status === 'ganho' ? 'default' : 
                          status === 'perdido' ? 'destructive' : 
                          status === 'parcial' ? 'secondary' : 'outline'
                        }>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(task.createdAt, 'dd/MM/yyyy', { locale: ptBR })}
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {filteredTasks.length > itemsPerPage && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Mostrando {itemsPerPage} de {filteredTasks.length} atividades.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detalhes otimizados */}
      {activeView === 'details' && (
        <Card>
          <CardHeader>
            <CardTitle>Top Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Atividades</TableHead>
                  <TableHead>Prospects</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientDetails.slice(0, 20).map((client, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{client.client}</TableCell>
                    <TableCell>{client.responsible}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Badge variant="outline">{client.totalVisits}V</Badge>
                        <Badge variant="outline">{client.totalCalls}L</Badge>
                        <Badge variant="outline">{client.totalChecklists}C</Badge>
                      </div>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Modais */}
      {selectedTask && (
        <>
          <OpportunityDetailsModal 
            task={selectedTask} 
            isOpen={isModalOpen} 
            onClose={() => {
              setIsModalOpen(false);
              setSelectedTask(null);
            }} 
            onTaskUpdated={() => refetch()} 
          />
          
          <FormVisualization
            task={selectedTask}
            isOpen={isVisualizationModalOpen}
            onClose={() => {
              setIsVisualizationModalOpen(false);
              setSelectedTask(null);
            }}
            onTaskUpdated={() => refetch()}
          />
          
          <TaskEditModal
            task={selectedTask}
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedTask(null);
            }}
            onTaskUpdate={() => refetch()}
          />
        </>
      )}
    </div>
  );
};
