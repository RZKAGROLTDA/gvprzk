import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  CheckSquare, 
  Download,
  Calendar as CalendarIcon,
  DollarSign,
  Target,
  Activity,
  Building2,
  RefreshCw,
  X,
  RotateCcw,
  ArrowRight,
  Eye
} from 'lucide-react';
import { TaskStats, Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculateTaskSalesValue, calculateProspectValue } from '@/lib/salesValueCalculator';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DataMigrationButton } from '@/components/DataMigrationButton';
import OpportunityReportSidebar from '@/components/OpportunityReportSidebar';

const Reports: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState('all');
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados para as estatísticas agregadas
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalVisitas, setTotalVisitas] = useState(0);
  const [totalChecklist, setTotalChecklist] = useState(0);
  const [totalLigacoes, setTotalLigacoes] = useState(0);
  const [totalProspects, setTotalProspects] = useState(0);
  const [totalProspectsValue, setTotalProspectsValue] = useState(0);
  const [totalSalesValue, setTotalSalesValue] = useState(0);
  
  // Estados para o relatório de oportunidades
  const [opportunities, setOpportunities] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Taxa de conversão geral corrigida: (Vendas Realizadas / Valor Total de Prospects) * 100
  const overallConversionRate = totalProspectsValue > 0 ? (totalSalesValue / totalProspectsValue) * 100 : 0;

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'manager':
        return 'Gerente';
      case 'supervisor':
        return 'Supervisor';
      case 'rac':
        return 'RAC';
      case 'consultant':
        return 'Consultor';
      case 'sales_consultant':
        return 'Consultor de Vendas';
      case 'technical_consultant':
        return 'Consultor Técnico';
      default:
        return role;
    }
  };

  const loadCollaborators = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, role, user_id')
        .order('name');

      if (error) throw error;
      setCollaborators(profiles || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadAggregatedStats = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let query = supabase.from('tasks').select(`
        *,
        task_products (*),
        task_reminders (*)
      `);

      // Aplicar filtros de data se definidos
      if (dateFrom) {
        query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
      }
      if (dateTo) {
        query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
      }

      // Aplicar filtro de usuário se definido
      if (selectedUser !== 'all') {
        query = query.eq('created_by', selectedUser);
      }

      const { data: supabaseTasks, error } = await query;

      if (error) throw error;

      // Mapear tasks do Supabase para o formato da aplicação
      const tasks = supabaseTasks?.map(mapSupabaseTaskToTask) || [];

      // Calcular estatísticas agregadas usando as funções unificadas
      const visitas = tasks.filter(task => task.taskType === 'prospection').length;
      const checklist = tasks.filter(task => task.taskType === 'checklist').length;
      const ligacoes = tasks.filter(task => task.taskType === 'ligacao').length;
      const prospects = tasks.filter(task => task.isProspect === true).length;
      
      // Usar função unificada para calcular valor de prospects
      const prospectsValue = tasks
        .filter(task => task.isProspect === true)
        .reduce((sum, task) => sum + calculateProspectValue(task), 0);
      
      // Usar função unificada para calcular valor de vendas
      const salesValue = tasks
        .filter(task => task.salesConfirmed === true || task.salesType === 'parcial')
        .reduce((sum, task) => sum + calculateTaskSalesValue(task), 0);

      setTotalTasks(visitas + checklist + ligacoes);
      setTotalVisitas(visitas);
      setTotalChecklist(checklist);
      setTotalLigacoes(ligacoes);
      setTotalProspects(prospects);
      setTotalProspectsValue(prospectsValue);
      setTotalSalesValue(salesValue);
      setOpportunities(tasks);
    } catch (error) {
      console.error('Erro ao carregar estatísticas agregadas:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case 'prospection':
        return 'Visita';
      case 'ligacao':
        return 'Ligação';
      case 'checklist':
        return 'Checklist';
      default:
        return type;
    }
  };

  const getStatusLabel = (task: Task) => {
    if (task.salesConfirmed) return 'Venda Realizada';
    if (task.salesType === 'parcial') return 'Venda Parcial';
    if (task.isProspect) return 'Prospect';
    return 'Em Andamento';
  };

  const handleViewOpportunity = (task: Task) => {
    setSelectedTask(task);
    setSidebarOpen(true);
  };

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSelectedUser('all');
    
    toast({
      title: "✨ Filtros limpos",
      description: "Todos os filtros foram resetados com sucesso"
    });
  };

  useEffect(() => {
    if (user) {
      loadAggregatedStats();
      loadCollaborators();
    }
  }, [user, dateFrom, dateTo, selectedUser]);

  const exportReport = (type: 'filial' | 'cep') => {
    console.log(`Exportando relatório por ${type}...`);
    
    // Dados dos filtros aplicados
    const filtrosAplicados = {
      dataInicial: dateFrom ? format(dateFrom, "dd/MM/yyyy") : 'Não definida',
      dataFinal: dateTo ? format(dateTo, "dd/MM/yyyy") : 'Não definida',
      cepSelecionado: selectedUser !== 'all' ? 
        collaborators.find(c => c.id === selectedUser)?.name || 'CEP específico' : 
        'Todos os CEPs'
    };

    if (type === 'filial') {
      // Lógica para exportar relatório por filial
      console.log('Filtros aplicados:', filtrosAplicados);
      
      toast({
        title: "📊 Relatório por Filial",
        description: "Exportação em desenvolvimento - dados das filiais com filtros aplicados"
      });
    } else {
      // Lógica para exportar relatório por CEP
      console.log('Filtros aplicados:', filtrosAplicados);
      
      toast({
        title: "📍 Relatório por CEP", 
        description: "Exportação em desenvolvimento - dados dos CEPs com filtros aplicados"
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Relatórios</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Análises e métricas de desempenho</p>
        </div>
        <div className="w-full sm:w-80">
          <OfflineIndicator />
        </div>
      </div>

      {/* Botões de Exportação */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <Button 
          variant="gradient" 
          onClick={() => exportReport('filial')} 
          className="gap-2 text-sm"
        >
          <Download className="h-4 w-4" />
          Relatório por Filial
        </Button>
        
        <Button 
          variant="outline" 
          onClick={() => exportReport('cep')} 
          className="gap-2 text-sm border-green-600 text-green-600 hover:bg-green-50"
        >
          <Download className="h-4 w-4" />
          Relatório por CEP
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Filtros de Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : <span>Selecionar data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data Final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : <span>Selecionar data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      disabled={(date) => dateFrom ? date < dateFrom : false}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">CEP</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os CEPs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os CEPs</SelectItem>
                    {collaborators.map((collaborator) => (
                      <SelectItem key={collaborator.id} value={collaborator.id}>
                        {collaborator.name} - {getRoleLabel(collaborator.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium opacity-0">Ações</label>
                <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={() => loadAggregatedStats()}
          disabled={loading}
          className="flex-1"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
                   <DataMigrationButton />
                   <AlertDialog>
                     <AlertDialogTrigger asChild>
                       <Button variant="outline" size="icon" className="shrink-0">
                         <RotateCcw className="h-4 w-4" />
                       </Button>
                     </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Limpar filtros</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja limpar todos os filtros aplicados? Os dados serão atualizados para mostrar informações completas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={clearFilters}>
                          Sim, limpar filtros
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>

            {(dateFrom || dateTo || selectedUser !== 'all') && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <p className="text-sm text-muted-foreground">Filtros ativos:</p>
                {dateFrom && (
                  <Badge variant="secondary" className="gap-1">
                    De: {format(dateFrom, "dd/MM/yyyy")}
                  </Badge>
                )}
                {dateTo && (
                  <Badge variant="secondary" className="gap-1">
                    Até: {format(dateTo, "dd/MM/yyyy")}
                  </Badge>
                )}
                {selectedUser !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    {collaborators.find(c => c.id === selectedUser)?.name || 'CEP específico'}
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2">
                  Limpar todos
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo Geral */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-primary">
                  {loading ? '...' : totalTasks}
                </p>
              </div>
              <Activity className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-accent/10 to-accent/5 border-accent/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Visitas</p>
                <p className="text-2xl font-bold text-accent">
                  {loading ? '...' : totalVisitas}
                </p>
                <p className="text-xs text-muted-foreground">
                  R$ {loading ? "..." : (totalProspectsValue * 0.4).toLocaleString("pt-BR")}
                </p>
              </div>
              <Target className="h-8 w-8 text-accent/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-success/10 to-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Checklist</p>
                <p className="text-2xl font-bold text-success">
                  {loading ? '...' : totalChecklist}
                </p>
                <p className="text-xs text-muted-foreground">
                  R$ {loading ? "..." : (totalProspectsValue * 0.3).toLocaleString("pt-BR")}
                </p>
              </div>
              <CheckSquare className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-warning/10 to-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Ligações</p>
                <p className="text-2xl font-bold text-warning">
                  {loading ? '...' : totalLigacoes}
                </p>
                <p className="text-xs text-muted-foreground">
                  R$ {loading ? "..." : (totalProspectsValue * 0.3).toLocaleString("pt-BR")}
                </p>
              </div>
              <Users className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-secondary/30 to-secondary/10 border-secondary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Oportunidades</p>
                <p className="text-lg font-bold text-secondary-foreground">
                  {loading ? '...' : `R$ ${totalProspectsValue.toLocaleString('pt-BR')}`}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-secondary-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-primary/15 to-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Vendas Realizadas</p>
                <p className="text-lg font-bold text-primary">
                  {loading ? '...' : `R$ ${totalSalesValue.toLocaleString('pt-BR')}`}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Relatório de Oportunidades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Relatório de Oportunidades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor Oportunidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <div className="flex items-center justify-center">
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        Carregando oportunidades...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : opportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Nenhuma oportunidade encontrada com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  opportunities.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.client || '—'}</TableCell>
                      <TableCell>{task.responsible || '—'}</TableCell>
                      <TableCell>{task.filial || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getTaskTypeLabel(task.taskType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.salesValue ? 
                          `R$ ${calculateProspectValue(task).toLocaleString('pt-BR')}` : 
                          '—'
                        }
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            task.salesConfirmed ? 'default' : 
                            task.salesType === 'parcial' ? 'secondary' :
                            task.isProspect ? 'outline' : 'destructive'
                          }
                        >
                          {getStatusLabel(task)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(task.startDate), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewOpportunity(task)}
                          className="gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Análises Detalhadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Desempenho por Filial */}
        <Card 
          className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-primary/50"
          onClick={() => navigate('/reports/filial')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Desempenho por Filial</h3>
                  <p className="text-sm text-muted-foreground">
                    Análise detalhada do desempenho de cada filial
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            
            <div className="text-center">
              <Button variant="outline" size="sm" className="w-full">
                Ver Análise Completa
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card Performance dos Vendedores */}
        <Card 
          className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-accent/50"
          onClick={() => navigate('/reports/seller')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <Users className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Performance dos Vendedores</h3>
                  <p className="text-sm text-muted-foreground">
                    Ranking e análise individual dos vendedores
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            
            
            <div className="text-center">
              <Button variant="outline" size="sm" className="w-full">
                Ver Ranking Completo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar de Relatório de Oportunidade */}
      <OpportunityReportSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        task={selectedTask}
      />
    </div>
  );
};

export default Reports;
