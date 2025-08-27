import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Download, Search, Filter } from 'lucide-react';
import { useTasksOptimized, useConsultants, useFiliais } from '@/hooks/useTasksOptimized';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { resolveFilialName } from '@/lib/taskStandardization';

interface TaskData {
  date: Date;
  client: string;
  responsible: string;
  taskType: string;
  observation: string;
  filial: string;
}

export const FunnelTasksOptimized: React.FC = () => {
  const { tasks, loading, refetch, forceRefresh } = useTasksOptimized();
  const { data: consultants = [], isLoading: consultantsLoading } = useConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();
  const { invalidateAll } = useSecurityCache();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('365');
  const [selectedConsultant, setSelectedConsultant] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const tasksData = useMemo(() => {
    if (!tasks.length) return [];

    const now = new Date();
    const daysAgo = parseInt(selectedPeriod);
    const periodStart = daysAgo >= 9999 ? new Date(0) : subDays(now, daysAgo);
    const searchLower = searchTerm.toLowerCase();

    // Super otimizado: filtro, mapeamento e ordenação em um loop
    const result: TaskData[] = [];
    
    for (const task of tasks) {
      const taskDate = new Date(task.createdAt);
      
      // Early exits para máxima performance
      if (daysAgo < 9999 && taskDate < periodStart) continue;
      
      if (selectedConsultant !== 'all') {
        const consultant = consultants.find(c => c.id === selectedConsultant);
        if (!consultant || task.responsible !== consultant.name) continue;
      }

      if (selectedFilial !== 'all' && task.filial !== selectedFilial) continue;
      
      if (searchTerm && !task.client.toLowerCase().includes(searchLower)) continue;

      // Mapear diretamente
      result.push({
        date: task.createdAt,
        client: task.client,
        responsible: task.responsible,
        taskType: getTaskTypeLabel(task.taskType),
        observation: task.observations || '-',
        filial: task.filial || ''
      });
    }

    // Ordenação otimizada
    result.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return sortDirection === 'asc' ? diff : -diff;
    });

    return result.slice(0, 100); // Limitar para performance
  }, [tasks, searchTerm, selectedPeriod, selectedConsultant, selectedFilial, sortDirection, consultants]);

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

  const isLoading = loading || consultantsLoading || filiaisLoading;

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
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Busca</span>
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
                    <TableCell>{resolveFilialName(task.filial)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={task.observation}>
                      {task.observation}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {tasksData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma atividade encontrada com os filtros aplicados.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};