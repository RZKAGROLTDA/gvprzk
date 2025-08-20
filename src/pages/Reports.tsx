import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  RotateCcw
} from 'lucide-react';
import { TaskStats } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';

interface FilialStats {
  id: string;
  nome: string;
  visitas: number;
  checklist: number;
  ligacoes: number;
  prospects: number;
  prospectsValue: number;
  salesValue: number;
  conversionRate: number;
}

interface UserPerformanceItemProps {
  user: any;
  index: number;
  dateFrom?: Date;
  dateTo?: Date;
}

const UserPerformanceItem: React.FC<UserPerformanceItemProps> = ({ user, index, dateFrom, dateTo }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userTasks, setUserTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const loadUserTasks = async () => {
    if (isExpanded || userTasks.length > 0) return;
    
    setLoadingTasks(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('name', user.name)
        .single();

      if (profileError || !profile) {
        console.error('Erro ao buscar perfil:', profileError);
        return;
      }

      let query = supabase
        .from('tasks')
        .select('*')
        .eq('created_by', profile.user_id)
        .order('created_at', { ascending: false });

      if (dateFrom) {
        query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
      }
      if (dateTo) {
        query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
      }

      const { data: tasks, error: tasksError } = await query;

      if (tasksError) {
        console.error('Erro ao buscar tarefas:', tasksError);
        return;
      }

      setUserTasks(tasks || []);
    } catch (error) {
      console.error('Erro ao carregar tarefas do usuário:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      loadUserTasks();
    }
  };

  const visitas = userTasks.filter(task => task.task_type === 'prospection').length;
  const checklists = userTasks.filter(task => task.task_type === 'checklist').length;
  const ligacoes = userTasks.filter(task => task.task_type === 'ligacao').length;
  const totalOportunidades = userTasks.filter(task => task.is_prospect === true).reduce((sum, task) => sum + (task.sales_value || 0), 0);
  const vendasConfirmadas = userTasks
    .filter(task => task.sales_confirmed === true)
    .reduce((sum, task) => sum + (task.sales_value || 0), 0);
  
  const taxaConversao = totalOportunidades > 0 ? 
    (vendasConfirmadas / totalOportunidades) * 100 : 0;

  return (
    <Card 
      className={`transition-all duration-200 hover:shadow-md ${
        index < 3 ? 'ring-1 ring-primary/20 bg-primary/5' : ''
      }`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ${
                index === 0 ? 'bg-yellow-500 text-white' :
                index === 1 ? 'bg-gray-400 text-white' :
                index === 2 ? 'bg-amber-600 text-white' :
                'bg-muted text-muted-foreground'
              }`}>
                {index + 1}
              </div>
              
              <div>
                <h4 className="font-semibold text-base">{user.name}</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {user.role === 'consultant' ? 'Consultor' : 
                     user.role === 'manager' ? 'Gerente' : 
                     user.role === 'admin' ? 'Admin' : user.role}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge 
                variant={taxaConversao > 15 ? "default" : "secondary"}
                className="text-xs"
              >
                {taxaConversao.toFixed(1)}% conversão
              </Badge>
              <div className="text-right">
                <p className="text-sm font-bold text-success">
                  R$ {vendasConfirmadas.toLocaleString('pt-BR')}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-6 w-6 p-0"
                onClick={handleToggleExpand}
                title="Ver todas as tarefas preenchidas do usuário"
              >
                {isExpanded ? '▼' : '▶'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="font-bold text-foreground">{visitas + checklists + ligacoes}</p>
              <p className="text-xs text-muted-foreground">atividades</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Visitas</p>
              <p className="font-bold text-primary">{visitas}</p>
              <p className="text-xs text-muted-foreground">
                R$ {(userTasks.filter(t => t.task_type === 'prospection' && t.is_prospect === true).reduce((sum, t) => sum + (t.sales_value || 0), 0)).toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Checklist</p>
              <p className="font-bold text-success">{checklists}</p>
              <p className="text-xs text-muted-foreground">
                R$ {(userTasks.filter(t => t.task_type === 'checklist' && t.is_prospect === true).reduce((sum, t) => sum + (t.sales_value || 0), 0)).toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Ligações</p>
              <p className="font-bold text-warning">{ligacoes}</p>
              <p className="text-xs text-muted-foreground">
                R$ {(userTasks.filter(t => t.task_type === 'ligacao' && t.is_prospect === true).reduce((sum, t) => sum + (t.sales_value || 0), 0)).toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Prospects</p>
              <p className="font-bold text-accent">{userTasks.filter(task => task.is_prospect === true).length}</p>
              <p className="text-xs text-muted-foreground">
                R$ {totalOportunidades.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
        
        {/* Lista expandida de visitas */}
        {isExpanded && (
          <div className="border-t pt-4 mt-4">
            {loadingTasks ? (
              <div className="text-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Carregando visitas...</p>
              </div>
            ) : userTasks.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">Nenhuma visita encontrada no período</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <h5 className="font-medium text-sm mb-3">
                  Lista de Visitas ({userTasks.length})
                </h5>
                {userTasks.map((task, taskIndex) => (
                  <div 
                    key={task.id} 
                    className="bg-muted/50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex justify-between items-start mb-2">
                     <div className="flex-1">
                        <p className="font-medium">{task.name || task.client || 'Tarefa sem nome'}</p>
                        <p className="text-muted-foreground text-xs">
                          {task.client} • {task.property}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={
                          task.task_type === 'prospection' ? 'default' :
                          task.task_type === 'checklist' ? 'secondary' :
                          'outline'
                        } className="text-xs">
                          {task.task_type === 'prospection' ? 'Visita' :
                           task.task_type === 'checklist' ? 'Checklist' :
                           'Ligação'}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1">Status:</p>
                       <Badge variant={
                         task.sales_confirmed === true ? 'default' :
                         task.is_prospect === true && task.sales_confirmed === null ? 'secondary' :
                         task.sales_confirmed === false ? 'destructive' : 'outline'
                       } className="text-xs">
                         {task.sales_confirmed === true ? 'Venda Confirmada' :
                          task.is_prospect === true && task.sales_confirmed === null ? 'Prospect' :
                          task.sales_confirmed === false ? 'Venda Perdida' : 'Em Análise'}
                       </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Reports: React.FC = () => {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState('all');
  const [filialStats, setFilialStats] = useState<FilialStats[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userStats, setUserStats] = useState<any[]>([]);

  // Calcular estatísticas agregadas dos dados das filiais
  const totalTasks = filialStats.reduce((sum, f) => sum + f.visitas + f.checklist + f.ligacoes, 0);
  const totalVisitas = filialStats.reduce((sum, f) => sum + f.visitas, 0);
  const totalChecklist = filialStats.reduce((sum, f) => sum + f.checklist, 0);
  const totalLigacoes = filialStats.reduce((sum, f) => sum + f.ligacoes, 0);
  const totalProspects = filialStats.reduce((sum, f) => sum + f.prospects, 0);
  const totalProspectsValue = filialStats.reduce((sum, f) => sum + f.prospectsValue, 0);
  const totalSalesValue = filialStats.reduce((sum, f) => sum + f.salesValue, 0);
  const overallConversionRate = totalProspectsValue > 0 ? (totalSalesValue / totalProspectsValue) * 100 : 0;

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

  const loadFilialStats = async (silent = false) => {
    if (!user) return;
    
    if (!silent && filialStats.length === 0) setLoading(true);
    try {
      const { data: filiais, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) throw filiaisError;

      const filialStatsPromises = filiais?.map(async (filial) => {
        const { data: profilesFromFilial, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('filial_id', filial.id);

        if (profilesError) {
          return {
            id: filial.id,
            nome: filial.nome,
            visitas: 0,
            checklist: 0,
            ligacoes: 0,
            prospects: 0,
            prospectsValue: 0,
            salesValue: 0,
            conversionRate: 0
          };
        }

        const userIds = profilesFromFilial?.map(p => p.user_id) || [];
        
        if (userIds.length === 0) {
          return {
            id: filial.id,
            nome: filial.nome,
            visitas: 0,
            checklist: 0,
            ligacoes: 0,
            prospects: 0,
            prospectsValue: 0,
            salesValue: 0,
            conversionRate: 0
          };
        }
        
        let query = supabase
          .from('tasks')
          .select('*')
          .in('created_by', userIds);

        if (dateFrom) {
          query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
        }
        if (dateTo) {
          query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
        }

        const { data: tasks, error: tasksError } = await query;

        if (tasksError) {
          return {
            id: filial.id,
            nome: filial.nome,
            visitas: 0,
            checklist: 0,
            ligacoes: 0,
            prospects: 0,
            prospectsValue: 0,
            salesValue: 0,
            conversionRate: 0
          };
        }

        const visitas = tasks?.filter(task => task.task_type === 'prospection').length || 0;
        const checklist = tasks?.filter(task => task.task_type === 'checklist').length || 0;
        const ligacoes = tasks?.filter(task => task.task_type === 'ligacao').length || 0;
        const prospects = tasks?.filter(task => task.is_prospect === true).length || 0;
        const prospectsValue = tasks?.filter(task => task.is_prospect === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        const salesValue = tasks?.filter(task => task.sales_confirmed === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        
        const conversionRate = prospectsValue > 0 ? (salesValue / prospectsValue) * 100 : 0;

        return {
          id: filial.id,
          nome: filial.nome,
          visitas,
          checklist,
          ligacoes,
          prospects,
          prospectsValue,
          salesValue,
          conversionRate
        };
      }) || [];

      const stats = await Promise.all(filialStatsPromises);
      setFilialStats(stats.sort((a, b) => b.salesValue - a.salesValue));
    } catch (error) {
      console.error('Erro ao carregar estatísticas das filiais:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados das filiais",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUserStats = async (silent = false) => {
    if (!user) return;
    
    if (!silent) setLoading(true);
    try {
      let profilesQuery = supabase
        .from('profiles')
        .select('id, name, role, user_id')
        .order('name');

      if (selectedUser !== 'all') {
        profilesQuery = profilesQuery.eq('id', selectedUser);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;

      if (profilesError) throw profilesError;

      const userStatsPromises = profiles?.map(async (profile) => {
        let tasksQuery = supabase
          .from('tasks')
          .select('*')
          .eq('created_by', profile.user_id);

        if (dateFrom) {
          tasksQuery = tasksQuery.gte('start_date', dateFrom.toISOString().split('T')[0]);
        }
        if (dateTo) {
          tasksQuery = tasksQuery.lte('end_date', dateTo.toISOString().split('T')[0]);
        }

        const { data: tasks, error: tasksError } = await tasksQuery;

        if (tasksError) {
          console.error('Erro ao buscar tarefas:', tasksError);
          return null;
        }

        const visitas = tasks?.filter(task => task.task_type === 'prospection').length || 0;
        const checklists = tasks?.filter(task => task.task_type === 'checklist').length || 0;
        const ligacoes = tasks?.filter(task => task.task_type === 'ligacao').length || 0;
        const totalOportunidades = tasks?.filter(task => task.is_prospect === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        const vendasConfirmadas = tasks?.filter(task => task.sales_confirmed === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;

        return {
          ...profile,
          visitas,
          checklists,
          ligacoes,
          totalActivities: visitas + checklists + ligacoes,
          totalOportunidades,
          vendasConfirmadas,
          taxaConversao: totalOportunidades > 0 ? (vendasConfirmadas / totalOportunidades) * 100 : 0
        };
      }) || [];

      const stats = await Promise.all(userStatsPromises);
      const validStats = stats.filter(stat => stat !== null);
      
      setUserStats(validStats.sort((a, b) => b.vendasConfirmadas - a.vendasConfirmadas));
    } catch (error) {
      console.error('Erro ao carregar estatísticas dos usuários:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados dos vendedores",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollaborators();
  }, []);

  useEffect(() => {
    loadFilialStats();
    loadUserStats();
  }, [user, dateFrom, dateTo, selectedUser]);

  // Calcular totais dos vendedores
  const totalUserActivities = userStats.reduce((sum, user) => sum + user.totalActivities, 0);
  const totalUserSales = userStats.reduce((sum, user) => sum + user.vendasConfirmadas, 0);
  const totalUserOpportunities = userStats.reduce((sum, user) => sum + user.totalOportunidades, 0);
  const averageConversion = totalUserOpportunities > 0 ? (totalUserSales / totalUserOpportunities) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Relatórios de Desempenho</h1>
        <p className="text-muted-foreground">Análise de performance e produtividade</p>
      </div>

      {/* Filtros de Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Filtros de Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">De:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Até:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Vendedor:</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {collaborators.map(collaborator => (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => { loadFilialStats(); loadUserStats(); }} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de Desempenho */}
      <Tabs defaultValue="filial" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="filial" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Desempenho por Filial
          </TabsTrigger>
          <TabsTrigger value="seller" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Desempenho por Vendedor
          </TabsTrigger>
        </TabsList>

        {/* Tab Desempenho por Filial */}
        <TabsContent value="filial" className="space-y-6">
          {/* Estatísticas Resumo - Filiais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Atividades</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTasks}</div>
                <div className="grid grid-cols-3 gap-1 mt-2 text-xs">
                  <div>
                    <span className="text-primary font-medium">{totalVisitas}</span>
                    <p className="text-muted-foreground">Visitas</p>
                  </div>
                  <div>
                    <span className="text-success font-medium">{totalChecklist}</span>
                    <p className="text-muted-foreground">Checklist</p>
                  </div>
                  <div>
                    <span className="text-warning font-medium">{totalLigacoes}</span>
                    <p className="text-muted-foreground">Ligações</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Prospects</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalProspects}</div>
                <p className="text-xs text-muted-foreground">
                  Valor: R$ {totalProspectsValue.toLocaleString('pt-BR')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendas Realizadas</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  R$ {totalSalesValue.toLocaleString('pt-BR')}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallConversionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  Vendas / Prospects
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Filiais */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Performance por Filial
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filialStats.map((filial, index) => (
                  <Card key={filial.id} className={`transition-all duration-200 hover:shadow-md ${
                    index < 3 ? 'ring-1 ring-primary/20 bg-primary/5' : ''
                  }`}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ${
                              index === 0 ? 'bg-yellow-500 text-white' :
                              index === 1 ? 'bg-gray-400 text-white' :
                              index === 2 ? 'bg-amber-600 text-white' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {index + 1}
                            </div>
                            
                            <div>
                              <h4 className="font-semibold text-base">{filial.nome}</h4>
                              <Badge variant="outline" className="text-xs">
                                Filial
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant={filial.conversionRate > 15 ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {filial.conversionRate.toFixed(1)}% conversão
                            </Badge>
                            <div className="text-right">
                              <p className="text-sm font-bold text-success">
                                R$ {filial.salesValue.toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-3">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Total</p>
                            <p className="font-bold text-foreground">{filial.visitas + filial.checklist + filial.ligacoes}</p>
                            <p className="text-xs text-muted-foreground">atividades</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Visitas</p>
                            <p className="font-bold text-primary">{filial.visitas}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Checklist</p>
                            <p className="font-bold text-success">{filial.checklist}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Ligações</p>
                            <p className="font-bold text-warning">{filial.ligacoes}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Prospects</p>
                            <p className="font-bold text-accent">{filial.prospects}</p>
                            <p className="text-xs text-muted-foreground">
                              R$ {filial.prospectsValue.toLocaleString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Desempenho por Vendedor */}
        <TabsContent value="seller" className="space-y-6">
          {/* Estatísticas Resumo - Vendedores */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Atividades</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUserActivities}</div>
                <p className="text-xs text-muted-foreground">
                  {userStats.length} vendedores ativos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Oportunidades</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {totalUserOpportunities.toLocaleString('pt-BR')}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendas Realizadas</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">
                  R$ {totalUserSales.toLocaleString('pt-BR')}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Conversão Média</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{averageConversion.toFixed(1)}%</div>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Vendedores */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Ranking de Vendedores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userStats.map((userData, index) => (
                  <UserPerformanceItem
                    key={userData.id}
                    user={userData}
                    index={index}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;