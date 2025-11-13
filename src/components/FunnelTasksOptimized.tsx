import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Download, Search, Filter, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { useTasksOptimized, useConsultants, useFiliais } from '@/hooks/useTasksOptimized';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { useOpportunities } from '@/hooks/useOpportunities';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFilialNameRobust } from '@/lib/taskStandardization';
import { toast } from 'react-hot-toast';
import { SessionRefreshButton } from '@/components/SessionRefreshButton';

interface TaskData {
  date: Date;
  client: string;
  responsible: string;
  taskType: string;
  observation: string;
  filial: string;
}

export const FunnelTasksOptimized: React.FC = () => {
  console.log('🔧 FunnelTasksOptimized: Componente carregado');
  const { tasks, loading, refetch, forceRefresh, resetAndRefresh, error } = useTasksOptimized();
  const { data: opportunities = [], isLoading: opportunitiesLoading } = useOpportunities();
  const { data: consultants = [], isLoading: consultantsLoading } = useConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();
  const { invalidateAll } = useSecurityCache();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('365');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  const tasksData = useMemo(() => {
    console.log('🔧 FILTRO DEBUG - selectedFilial:', selectedFilial);
    console.log('🔧 FILTRO DEBUG - tasks.length:', tasks.length);
    console.log('🔧 FILTRO DEBUG - opportunities.length:', opportunities.length);
    
    if (!tasks.length && !opportunities.length) return [];

    const now = new Date();
    const daysAgo = parseInt(selectedPeriod);
    const periodStart = daysAgo >= 9999 ? new Date(0) : subDays(now, daysAgo);
    const searchLower = searchTerm.toLowerCase();

    const result: TaskData[] = [];
    
    // Processar tasks
    for (const task of tasks) {
      if (!task || !task.created_at) continue;
      const taskDate = new Date(task.created_at);
      
      if (daysAgo < 9999 && taskDate < periodStart) continue;
      
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) continue;
      }

      if (selectedFilial !== 'all' && task.filial !== selectedFilial) continue;
      if (searchTerm && !task.client.toLowerCase().includes(searchLower)) continue;

      result.push({
        date: new Date(task.created_at),
        client: task.client,
        responsible: task.responsible,
        taskType: getTaskTypeLabel(task.taskType),
        observation: task.observations || '-',
        filial: task.filial || ''
      });
    }

    // Processar opportunities
    for (const opp of opportunities) {
      const oppDate = new Date(opp.data_criacao);
      
      if (daysAgo < 9999 && oppDate < periodStart) continue;
      if (selectedFilial !== 'all' && opp.filial !== selectedFilial) continue;
      if (searchTerm && !opp.cliente_nome.toLowerCase().includes(searchLower)) continue;

      result.push({
        date: oppDate,
        client: opp.cliente_nome,
        responsible: '-',
        taskType: `Opportunity (${opp.status})`,
        observation: `Valor: R$ ${opp.valor_total_oportunidade.toFixed(2)}`,
        filial: opp.filial || ''
      });
    }

    // Ordenação otimizada
    result.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return sortDirection === 'asc' ? diff : -diff;
    });

    return result.slice(0, 100); // Limitar para performance
  }, [tasks, opportunities, searchTerm, selectedPeriod, selectedConsultant, selectedFilial, sortDirection, consultants]);

  const getTaskTypeLabel = (taskType: string) => {
    switch (taskType) {
      case 'prospection':
        return 'Visita';
      case 'ligacao':
        return 'Ligação';
      case 'checklist':
        return 'Checklist Oficina';
      default:
        return taskType;
    }
  };

  const getTaskTypeBadgeVariant = (taskType: string): "default" | "secondary" | "outline" => {
    switch (taskType) {
      case 'Visita':
        return 'default';
      case 'Ligação':
        return 'secondary';
      case 'Checklist Oficina':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  // Auto-refresh when window gains focus to sync changes
  useEffect(() => {
    const handleFocus = () => {
      if (document.hasFocus()) {
        refetch();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  const isLoading = loading || opportunitiesLoading || consultantsLoading || filiaisLoading;

  // Função para force refresh com feedback visual
  const handleForceRefresh = async () => {
    setIsForceRefreshing(true);
    try {
      await forceRefresh();
      setLastRefreshTime(new Date());
      toast.success("✅ Dados Atualizados - Cache limpo e dados recarregados com sucesso!");
    } catch (error) {
      console.error('Erro no force refresh:', error);
      toast.error("❌ Erro ao atualizar dados. Tente novamente.");
    } finally {
      setIsForceRefreshing(false);
    }
  };

  // Função para reset completo
  const handleResetAndRefresh = async () => {
    setIsForceRefreshing(true);
    try {
      // Reset filtros
      setSearchTerm('');
      setSelectedPeriod('365');
      setSelectedConsultant('all');
      setSelectedFilial('all');
      
      await resetAndRefresh();
      setLastRefreshTime(new Date());
      toast.success("🔄 Reset Completo - Filtros resetados e dados recarregados!");
    } catch (error) {
      console.error('Erro no reset:', error);
      toast.error("❌ Erro ao resetar dados. Tente novamente.");
    } finally {
      setIsForceRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Carregando atividades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filtros e Busca</span>
            </div>
            <div className="flex items-center space-x-2">
              {error && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Erro ao carregar
                </Badge>
              )}
              {lastRefreshTime && (
                <span className="text-xs text-muted-foreground">
                  Última atualização: {format(lastRefreshTime, 'HH:mm:ss')}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleForceRefresh}
                disabled={isForceRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isForceRefreshing ? 'animate-spin' : ''}`} />
                {isForceRefreshing ? 'Atualizando...' : 'Atualizar'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResetAndRefresh}
                disabled={isForceRefreshing}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar Cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome do cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

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
                  <SelectItem value="9999">Todos os registros</SelectItem>
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
              <label className="text-sm font-medium">Exportar</label>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Excel/PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Tarefas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckSquare className="h-5 w-5" />
            <span>Histórico de Atividades</span>
          </CardTitle>
          <CardDescription>
            Registro detalhado de todas as atividades realizadas ({tasksData.length} atividades encontradas)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            >
              Ordenar por data {sortDirection === 'asc' ? '↑' : '↓'}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data da Tarefa</TableHead>
                  <TableHead>Nome do Cliente</TableHead>
                  <TableHead>Consultor Responsável</TableHead>
                  <TableHead>Tipo da Tarefa</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasksData.map((task, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {format(task.date, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>{task.client}</TableCell>
                    <TableCell>{task.responsible}</TableCell>
                    <TableCell>
                      <Badge variant={getTaskTypeBadgeVariant(task.taskType)}>
                        {task.taskType}
                      </Badge>
                    </TableCell>
                    <TableCell>{getFilialNameRobust(task.filial, filiais)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={task.observation}>
                      {task.observation}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {tasksData.length === 0 && !loading && (
            <div className="text-center py-8">
              {error ? (
                <div className="space-y-4">
                  <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
                  <div>
                    <h3 className="text-lg font-medium text-destructive">Erro ao carregar dados</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {error?.message || 'Não foi possível carregar as atividades. Verifique sua conexão.'}
                    </p>
                    {error?.message?.includes('Sessão expirada') && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                          Sua sessão expirou. Renove sua sessão ou faça login novamente.
                        </p>
                        <SessionRefreshButton />
                      </div>
                    )}
                    <div className="mt-4 flex justify-center gap-2">
                      <Button variant="outline" onClick={handleForceRefresh} disabled={isForceRefreshing}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isForceRefreshing ? 'animate-spin' : ''}`} />
                        Tentar Novamente
                      </Button>
                      <Button variant="outline" onClick={handleResetAndRefresh} disabled={isForceRefreshing}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset Completo
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">Nenhuma atividade encontrada</h3>
                  <p className="text-sm">
                    Nenhuma atividade corresponde aos filtros aplicados.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};