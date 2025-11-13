import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  ArrowRight
} from 'lucide-react';
import { TaskStats } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculateTaskSalesValue, calculateProspectValue } from '@/lib/salesValueCalculator';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { DataMigrationButton } from '@/components/DataMigrationButton';

const Reports: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedFilial, setSelectedFilial] = useState('all');
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [filiais, setFiliais] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);

  // Estados para as estatísticas agregadas
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalVisitas, setTotalVisitas] = useState(0);
  const [totalChecklist, setTotalChecklist] = useState(0);
  const [totalLigacoes, setTotalLigacoes] = useState(0);
  const [totalProspects, setTotalProspects] = useState(0);
  const [totalProspectsValue, setTotalProspectsValue] = useState(0);
  const [totalSalesValue, setTotalSalesValue] = useState(0);

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

  const loadFiliais = async () => {
    try {
      const { data: filiaisData, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');

      if (error) throw error;
      setFiliais(filiaisData || []);
    } catch (error) {
      console.error('Erro ao carregar filiais:', error);
    }
  };

  const loadAggregatedStats = useCallback(async () => {
    if (!user) return;
    
    // 🐛 DEBUG: Log do estado atual dos filtros
    console.log('🔍 REPORTS DEBUG: Carregando estatísticas com filtros:', {
      dateFrom: dateFrom?.toISOString().split('T')[0],
      dateTo: dateTo?.toISOString().split('T')[0],
      selectedUser,
      selectedFilial,
      timestamp: new Date().toISOString()
    });
    
    setLoading(true);
    setIsFiltering(true);
    
    try {
      // Buscar tasks
      let tasksQuery = supabase.from('tasks').select(`
        *,
        products (*),
        reminders (*)
      `);

      // Aplicar filtros de data nas tasks
      if (dateFrom) {
        const dateFilter = dateFrom.toISOString().split('T')[0];
        tasksQuery = tasksQuery.gte('start_date', dateFilter);
        console.log('🗓️ REPORTS DEBUG: Aplicando filtro dateFrom:', dateFilter);
      }
      if (dateTo) {
        const dateFilter = dateTo.toISOString().split('T')[0];
        tasksQuery = tasksQuery.lte('end_date', dateFilter);
        console.log('🗓️ REPORTS DEBUG: Aplicando filtro dateTo:', dateFilter);
      }

      // Aplicar filtro de usuário nas tasks
      if (selectedUser !== 'all') {
        tasksQuery = tasksQuery.eq('created_by', selectedUser);
        console.log('👤 REPORTS DEBUG: Aplicando filtro de usuário:', selectedUser);
      }

      // Aplicar filtro de filial nas tasks
      if (selectedFilial !== 'all') {
        console.log('🏢 REPORTS DEBUG: Preparando filtro de filial:', selectedFilial);
        tasksQuery = tasksQuery.eq('filial', selectedFilial);
      }

      // Buscar opportunities
      let opportunitiesQuery = supabase
        .from('opportunities')
        .select('id, task_id, status, valor_total_oportunidade, valor_venda_fechada, filial, created_at, data_criacao');

      // Aplicar filtros de data nas opportunities (usar data_criacao)
      if (dateFrom) {
        const dateFilter = dateFrom.toISOString().split('T')[0];
        opportunitiesQuery = opportunitiesQuery.gte('data_criacao', dateFilter);
      }
      if (dateTo) {
        const dateFilter = dateTo.toISOString().split('T')[0];
        opportunitiesQuery = opportunitiesQuery.lte('data_criacao', dateFilter);
      }

      // Aplicar filtro de filial nas opportunities
      if (selectedFilial !== 'all') {
        opportunitiesQuery = opportunitiesQuery.eq('filial', selectedFilial);
      }

      console.log('🚀 REPORTS DEBUG: Executando queries em paralelo...');
      const [{ data: supabaseTasks, error: tasksError }, { data: opportunitiesData, error: oppError }] = await Promise.all([
        tasksQuery,
        opportunitiesQuery
      ]);

      if (tasksError) {
        console.error('❌ REPORTS DEBUG: Erro na query de tasks:', tasksError);
        throw tasksError;
      }
      if (oppError) {
        console.error('❌ REPORTS DEBUG: Erro na query de opportunities:', oppError);
        throw oppError;
      }

      console.log('✅ REPORTS DEBUG: Queries executadas. Tasks:', supabaseTasks?.length || 0, 'Opportunities:', opportunitiesData?.length || 0);
      
      // Mapear tasks do Supabase para o formato da aplicação
      const tasks = supabaseTasks?.map(mapSupabaseTaskToTask) || [];

      // Calcular estatísticas das tasks
      const visitas = tasks.filter(task => task.taskType === 'prospection').length;
      const checklist = tasks.filter(task => task.taskType === 'checklist').length;
      const ligacoes = tasks.filter(task => task.taskType === 'ligacao').length;
      
      // Contar prospects das tasks
      let prospectsCount = tasks.filter(task => task.isProspect === true && !task.salesConfirmed).length;
      let prospectsValue = tasks
        .filter(task => task.isProspect === true && !task.salesConfirmed)
        .reduce((sum, task) => sum + calculateProspectValue(task), 0);
      
      // Adicionar opportunities do tipo Prospect
      const oppsProspect = opportunitiesData?.filter(o => o.status === 'Prospect') || [];
      prospectsCount += oppsProspect.length;
      prospectsValue += oppsProspect.reduce((sum, opp) => sum + (opp.valor_total_oportunidade || 0), 0);
      
      // Calcular valor de vendas das tasks
      let salesValue = tasks
        .filter(task => task.salesConfirmed === true)
        .reduce((sum, task) => sum + calculateTaskSalesValue(task), 0);
      
      // Adicionar vendas das opportunities
      const oppsVendasTotal = opportunitiesData?.filter(o => o.status === 'Venda Total') || [];
      const oppsVendasParcial = opportunitiesData?.filter(o => o.status === 'Venda Parcial') || [];
      salesValue += oppsVendasTotal.reduce((sum, opp) => sum + (opp.valor_venda_fechada || opp.valor_total_oportunidade || 0), 0);
      salesValue += oppsVendasParcial.reduce((sum, opp) => sum + (opp.valor_venda_fechada || 0), 0);

      console.log('📊 REPORTS DEBUG: Estatísticas calculadas (com opportunities):', {
        totalTasks: visitas + checklist + ligacoes,
        visitas,
        checklist,
        ligacoes,
        prospects: prospectsCount,
        prospectsValue,
        salesValue,
        opportunitiesIncluded: opportunitiesData?.length || 0
      });

      setTotalTasks(visitas + checklist + ligacoes);
      setTotalVisitas(visitas);
      setTotalChecklist(checklist);
      setTotalLigacoes(ligacoes);
      setTotalProspects(prospectsCount);
      setTotalProspectsValue(prospectsValue);
      setTotalSalesValue(salesValue);
      
      console.log('✅ REPORTS DEBUG: Estados atualizados com sucesso');
    } catch (error) {
      console.error('❌ REPORTS DEBUG: Erro ao carregar estatísticas agregadas:', error);
    } finally {
      setLoading(false);
      setIsFiltering(false);
      console.log('🏁 REPORTS DEBUG: Loading finalizado');
    }
  }, [user, dateFrom, dateTo, selectedUser, selectedFilial]);

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setSelectedUser('all');
    setSelectedFilial('all');
    
    toast({
      title: "✨ Filtros limpos",
      description: "Todos os filtros foram resetados com sucesso"
    });
  };

  useEffect(() => {
    console.log('🔄 REPORTS DEBUG: useEffect disparado com dependências:', {
      user: !!user,
      dateFrom: dateFrom?.toISOString().split('T')[0],
      dateTo: dateTo?.toISOString().split('T')[0],
      selectedUser,
      selectedFilial,
      timestamp: new Date().toISOString()
    });
    
    // Add timeout to ensure state is updated before query
    const timeoutId = setTimeout(() => {
      loadAggregatedStats();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [loadAggregatedStats]);

  useEffect(() => {
    if (user) {
      loadCollaborators();
      loadFiliais();
    }
  }, [user]);

  const exportReport = (type: 'filial' | 'cep') => {
    console.log(`Exportando relatório por ${type}...`);
    
    // Dados dos filtros aplicados
    const filtrosAplicados = {
      dataInicial: dateFrom ? format(dateFrom, "dd/MM/yyyy") : 'Não definida',
      dataFinal: dateTo ? format(dateTo, "dd/MM/yyyy") : 'Não definida',
      colaboradorSelecionado: selectedUser !== 'all' ? 
        collaborators.find(c => c.id === selectedUser)?.name || 'Colaborador específico' : 
        'Todos os colaboradores',
      filialSelecionada: selectedFilial !== 'all' ? selectedFilial : 'Todas as filiais'
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                <label className="text-sm font-medium">Filial</label>
                <Select 
                  value={selectedFilial} 
                  onValueChange={(value) => {
                    console.log('🏢 REPORTS DEBUG: Mudança de filial detectada:', {
                      valorAnterior: selectedFilial,
                      novoValor: value,
                      filiaisDisponiveis: filiais.map(f => f.nome),
                      timestamp: new Date().toISOString()
                    });
                    setSelectedFilial(value);
                  }}
                >
                  <SelectTrigger className={selectedFilial !== 'all' ? 'border-primary' : ''}>
                    <SelectValue placeholder="Todas as filiais" />
                    {selectedFilial !== 'all' && isFiltering && (
                      <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as filiais</SelectItem>
                    {filiais.map((filial) => (
                      <SelectItem key={filial.id} value={filial.nome}>
                        {filial.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Colaborador</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os colaboradores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os colaboradores</SelectItem>
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

            {(dateFrom || dateTo || selectedUser !== 'all' || selectedFilial !== 'all') && (
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
                {selectedFilial !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Filial: {selectedFilial}
                  </Badge>
                )}
                {selectedUser !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    {collaborators.find(c => c.id === selectedUser)?.name || 'Colaborador específico'}
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

      {/* Debug Info Card - Remover após resolver o problema */}
      {(selectedFilial !== 'all' || selectedUser !== 'all') && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-yellow-800">🐛 Informações de Debug</p>
              <div className="text-xs text-yellow-700 space-y-1">
                <p>Filial selecionada: <span className="font-mono bg-yellow-100 px-1 rounded">{selectedFilial}</span></p>
                <p>Usuário selecionado: <span className="font-mono bg-yellow-100 px-1 rounded">{selectedUser}</span></p>
                <p>Estado de loading: <span className="font-mono bg-yellow-100 px-1 rounded">{loading ? 'true' : 'false'}</span></p>
                <p>Estado de filtering: <span className="font-mono bg-yellow-100 px-1 rounded">{isFiltering ? 'true' : 'false'}</span></p>
                <p>Total de tasks: <span className="font-mono bg-yellow-100 px-1 rounded">{totalTasks}</span></p>
                <p>Filiais carregadas: <span className="font-mono bg-yellow-100 px-1 rounded">{filiais.length}</span></p>
                <p>Última atualização: <span className="font-mono bg-yellow-100 px-1 rounded">{new Date().toLocaleTimeString()}</span></p>
                {selectedFilial !== 'all' && (
                  <p>Filtro ativo: <span className="font-mono bg-yellow-100 px-1 rounded">filial = "{selectedFilial}"</span></p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumo Geral */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card className={`bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 ${isFiltering ? 'animate-pulse' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Total {isFiltering && <span className="text-blue-500">(Filtrando...)</span>}
                </p>
                <p className="text-2xl font-bold text-primary">
                  {isFiltering ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      ...
                    </div>
                  ) : totalTasks}
                </p>
                {selectedFilial !== 'all' && !isFiltering && (
                  <p className="text-xs text-muted-foreground">
                    Filial: {selectedFilial}
                  </p>
                )}
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
    </div>
  );
};

export default Reports;
