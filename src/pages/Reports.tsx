import React, { useState, useEffect } from 'react';
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
      // Buscar o user_id do perfil
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

      // Aplicar filtros de data se definidos
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

  // Calcular estatísticas detalhadas
  const visitas = userTasks.filter(task => task.task_type === 'prospection').length;
  const checklists = userTasks.filter(task => task.task_type === 'checklist').length;
  const ligacoes = userTasks.filter(task => task.task_type === 'ligacao').length;
  const totalOportunidades = userTasks.reduce((sum, task) => sum + (task.sales_value || 0), 0);
  const vendasConfirmadas = userTasks
    .filter(task => task.sales_confirmed === true)
    .reduce((sum, task) => sum + (task.sales_value || 0), 0);
  
  // Taxa de conversão correta: (Vendas Realizadas / Valor Total de Prospects) * 100
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
                R$ {(userTasks.filter(t => t.task_type === 'prospection').reduce((sum, t) => sum + (t.sales_value || 0), 0)).toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Checklist</p>
              <p className="font-bold text-success">{checklists}</p>
              <p className="text-xs text-muted-foreground">
                R$ {(userTasks.filter(t => t.task_type === 'checklist').reduce((sum, t) => sum + (t.sales_value || 0), 0)).toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Ligações</p>
              <p className="font-bold text-warning">{ligacoes}</p>
              <p className="text-xs text-muted-foreground">
                R$ {(userTasks.filter(t => t.task_type === 'ligacao').reduce((sum, t) => sum + (t.sales_value || 0), 0)).toLocaleString('pt-BR')}
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
                        task.sales_confirmed === false ? 'destructive' :
                        task.is_prospect ? 'secondary' : 'outline'
                      } className="text-xs">
                        {task.sales_confirmed === true ? 'Venda Confirmada' :
                         task.sales_confirmed === false ? 'Venda Perdida' :
                         task.is_prospect ? 'Prospect' : 'Em Análise'}
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
  // Taxa de conversão geral corrigida: (Vendas Realizadas / Valor Total de Prospects) * 100
  const overallConversionRate = totalProspectsValue > 0 ? (totalSalesValue / totalProspectsValue) * 100 : 0;

  // Calcular oportunidades por tipo de tarefa
  const [taskTypeOpportunities, setTaskTypeOpportunities] = useState({
    prospection: { count: 0, value: 0 },
    checklist: { count: 0, value: 0 },
    ligacao: { count: 0, value: 0 }
  });

  const stats: TaskStats = {
    totalVisits: totalVisitas,
    completedVisits: totalVisitas, // Assumindo que visitas registradas são completadas
    prospects: totalProspects,
    salesValue: totalSalesValue,
    conversionRate: overallConversionRate
  };

  const detailedStats: any[] = [];

  const loadCollaborators = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, role, user_id')
        .order('name');

      if (error) throw error;
      console.log('DEBUG: Colaboradores carregados:', profiles);
      setCollaborators(profiles || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadFilialStats = async (silent = false) => {
    if (!user) {
      console.log('DEBUG: Usuário não está logado, não carregando stats');
      return;
    }
    
    console.log('DEBUG: Carregando estatísticas das filiais para usuário:', user);
    
    // Apenas mostrar loading na primeira carga
    if (!silent && filialStats.length === 0) setLoading(true);
    try {
      // Testar acesso à tabela de tasks primeiro
      const { data: testTasks, error: testError } = await supabase
        .from('tasks')
        .select('id, name, client, task_type, created_by, sales_value')
        .limit(5);

      console.log('DEBUG: Teste de acesso às tasks:', { testTasks, testError });

      // Buscar todas as filiais
      const { data: filiais, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) {
        console.error('Erro ao buscar filiais:', filiaisError);
        throw filiaisError;
      }

      console.log('DEBUG: Filiais encontradas:', filiais);

      // Buscar estatísticas por filial
      const filialStatsPromises = filiais?.map(async (filial) => {
        // Buscar usuários da filial primeiro
        const { data: profilesFromFilial, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('filial_id', filial.id);

        if (profilesError) {
          console.error('Erro ao buscar perfis:', profilesError);
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
        
        console.log('DEBUG: IDs dos usuários da filial', filial.nome, ':', userIds);
        
        if (userIds.length === 0) {
          console.log('DEBUG: Nenhum usuário encontrado para filial:', filial.nome);
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
        
        // Buscar tarefas dos usuários desta filial
        let query = supabase
          .from('tasks')
          .select('*')
          .in('created_by', userIds);

        // Aplicar filtros de data se definidos
        if (dateFrom) {
          query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
        }
        if (dateTo) {
          query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
        }

        const { data: tasks, error: tasksError } = await query;

        console.log('DEBUG: Tasks encontradas para filial', filial.nome, ':', { tasks, tasksError });

        if (tasksError) {
          console.error('Erro ao buscar tarefas:', tasksError);
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
        const totalTasks = tasks?.length || 0;
        const prospects = tasks?.filter(task => task.is_prospect === true).length || 0;
        const prospectsValue = tasks?.reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        const salesValue = tasks?.filter(task => task.sales_confirmed === true).reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        
        // Taxa de conversão corrigida para filial: (Vendas Realizadas / Valor Total de Prospects) * 100
        const conversionRate = prospectsValue > 0 ? (salesValue / prospectsValue) * 100 : 0;

        return {
          id: filial.id,
          nome: filial.nome,
          visitas,
          checklist,
          ligacoes,
          prospects,
          prospectsValue: Number(prospectsValue),
          salesValue: Number(salesValue),
          conversionRate: Math.round(conversionRate * 10) / 10
        };
      }) || [];

      const results = await Promise.all(filialStatsPromises);
      setFilialStats(results);
    } catch (error) {
      console.error('Erro ao carregar estatísticas por filial:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserStats = async () => {
    if (!user) {
      console.log('DEBUG: Usuário não está logado, não carregando stats de usuários');
      return;
    }
    
    console.log('DEBUG: Carregando estatísticas dos usuários');
    
    try {
      // Buscar perfis de todos os usuários ativos com mais detalhes
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, name, role, id')
        .in('role', ['consultant', 'manager', 'admin'])
        .eq('approval_status', 'approved')
        .order('name');

      if (profilesError) {
        console.error('Erro ao buscar perfis:', profilesError);
        throw profilesError;
      }

      console.log('DEBUG: Perfis encontrados para stats:', profiles);

      if (!profiles || profiles.length === 0) {
        console.log('DEBUG: Nenhum perfil encontrado');
        setUserStats([]);
        return;
      }

      // Buscar estatísticas por usuário
      const userStatsPromises = profiles.map(async (profile) => {
        console.log('DEBUG: Carregando stats para usuário:', profile.name, profile.user_id);
        
        let query = supabase
          .from('tasks')
          .select('*')
          .eq('created_by', profile.user_id);

        // Aplicar filtros de data se definidos
        if (dateFrom) {
          query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
        }
        if (dateTo) {
          query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
        }

        const { data: tasks, error: tasksError } = await query;

        if (tasksError) {
          console.error('Erro ao buscar tarefas do usuário:', profile.name, tasksError);
          return {
            name: profile.name,
            role: profile.role,
            user_id: profile.user_id,
            visits: 0,
            prospects: 0,
            sales: 0,
            conversionRate: 0,
            totalActivities: 0,
            visitas: 0,
            checklist: 0,
            ligacoes: 0
          };
        }

        console.log('DEBUG: Tasks encontradas para usuário', profile.name, ':', tasks?.length || 0);

        const visitas = tasks?.filter(task => task.task_type === 'prospection').length || 0;
        const checklist = tasks?.filter(task => task.task_type === 'checklist').length || 0;
        const ligacoes = tasks?.filter(task => task.task_type === 'ligacao').length || 0;
        const totalActivities = tasks?.length || 0;
        const prospects = tasks?.filter(task => task.is_prospect === true).length || 0;
        const salesValue = tasks?.reduce((sum, task) => sum + (Number(task.sales_value) || 0), 0) || 0;
        const confirmedSales = tasks?.filter(task => task.sales_confirmed === true).reduce((sum, task) => sum + (Number(task.sales_value) || 0), 0) || 0;
        
        // Taxa de conversão corrigida para usuário: (Vendas Realizadas / Valor Total de Prospects) * 100
        const conversionRate = salesValue > 0 ? (confirmedSales / salesValue) * 100 : 0;

        const userStat = {
          name: profile.name,
          role: profile.role,
          user_id: profile.user_id,
          visits: totalActivities,
          prospects,
          sales: Number(confirmedSales),
          conversionRate: Math.round(conversionRate * 10) / 10,
          totalActivities,
          visitas,
          checklist,
          ligacoes,
          salesValue: Number(salesValue)
        };

        console.log('DEBUG: Stats calculadas para', profile.name, ':', userStat);
        return userStat;
      });

      const results = await Promise.all(userStatsPromises);
      
      // Ordenar por valor de vendas confirmadas (maior para menor)
      const sortedResults = results.sort((a, b) => b.sales - a.sales);
      
      console.log('DEBUG: Resultados finais dos usuários:', sortedResults);
      setUserStats(sortedResults);
    } catch (error) {
      console.error('Erro ao carregar estatísticas dos usuários:', error);
      setUserStats([]);
    }
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
      console.log('DEBUG: Iniciando carregamento dos dados...');
      loadFilialStats();
      loadCollaborators();
      loadUserStats();
      
      // Configurar atualização automática silenciosa a cada 30 segundos para melhorar performance
      const interval = setInterval(() => {
        loadFilialStats(true); // true = silent update
        loadUserStats();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user, dateFrom, dateTo, selectedUser]);

  // Set up realtime subscription for task updates
  useEffect(() => {
    const channel = supabase
      .channel('task-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        () => {
          // Reload data when any task changes
          loadFilialStats(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      console.log('Dados das filiais:', filialStats);
      console.log('Filtros aplicados:', filtrosAplicados);
      
      toast({
        title: "📊 Relatório por Filial",
        description: "Exportação em desenvolvimento - dados das filiais com filtros aplicados"
      });
    } else {
      // Lógica para exportar relatório por CEP
      console.log('Dados dos CEPs:', userStats);
      console.log('Filtros aplicados:', filtrosAplicados);
      
      toast({
        title: "📍 Relatório por CEP", 
        description: "Exportação em desenvolvimento - dados dos CEPs com filtros aplicados"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
         <div>
           <h1 className="text-3xl font-bold">Relatórios</h1>
           <p className="text-muted-foreground">Análises e métricas de desempenho</p>
         </div>
         
         {/* Botões de Exportação */}
         <div className="flex gap-2">
           <Button 
             variant="gradient" 
             onClick={() => exportReport('filial')} 
             className="gap-2"
           >
             <Download className="h-4 w-4" />
             Relatório por Filial
           </Button>
           
           <Button 
             variant="outline" 
             onClick={() => exportReport('cep')} 
             className="gap-2 border-green-600 text-green-600 hover:bg-green-50"
           >
             <Download className="h-4 w-4" />
             Relatório por CEP
           </Button>
         </div>
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
                        {collaborator.name} - {
                          collaborator.role === 'consultant' ? 'Consultor' : 
                          collaborator.role === 'manager' ? 'Gerente' : 
                          collaborator.role === 'admin' ? 'Admin' : collaborator.role
                        }
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
                    onClick={() => loadFilialStats(false)}
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
                  {loading ? '...' : filialStats.reduce((sum, f) => sum + f.visitas + f.checklist + f.ligacoes, 0)}
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
                  {loading ? '...' : filialStats.reduce((sum, f) => sum + f.visitas, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Oport: R$ {loading ? '...' : filialStats.filter(f => f.visitas > 0).reduce((sum, f) => sum + f.prospectsValue, 0).toLocaleString('pt-BR')}
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
                  {loading ? '...' : filialStats.reduce((sum, f) => sum + f.checklist, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Oport: R$ {loading ? '...' : filialStats.filter(f => f.checklist > 0).reduce((sum, f) => sum + f.prospectsValue * (f.checklist / (f.visitas + f.checklist + f.ligacoes)), 0).toLocaleString('pt-BR')}
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
                  {loading ? '...' : filialStats.reduce((sum, f) => sum + f.ligacoes, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Oport: R$ {loading ? '...' : filialStats.filter(f => f.ligacoes > 0).reduce((sum, f) => sum + f.prospectsValue * (f.ligacoes / (f.visitas + f.checklist + f.ligacoes)), 0).toLocaleString('pt-BR')}
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
                  {loading ? '...' : `R$ ${filialStats.reduce((sum, f) => sum + f.prospectsValue, 0).toLocaleString('pt-BR')}`}
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

      {/* Dados por Filial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Desempenho por Filial
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && filialStats.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                    <div className="h-12 bg-muted rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filialStats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">Nenhuma filial encontrada</p>
              <p className="text-sm">Verifique os filtros ou aguarde o carregamento dos dados</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filialStats.map((filial) => (
                <Card key={filial.id} className="border-l-4 border-l-primary/50 hover:shadow-lg transition-all duration-200">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-foreground mb-1">{filial.nome}</h3>
                        <p className="text-sm text-muted-foreground">
                          {filial.visitas + filial.checklist + filial.ligacoes} atividades totais
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={filial.conversionRate > 15 ? "default" : "secondary"}
                          className="text-sm px-3 py-1"
                        >
                          {filial.conversionRate}% conversão
                        </Badge>
                        <div className="text-right hidden md:block">
                          <p className="text-lg font-bold text-success">
                            R$ {filial.salesValue.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-xs text-muted-foreground">em vendas</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-primary/5 rounded-lg p-4 text-center">
                        <Target className="h-6 w-6 mx-auto mb-2 text-primary" />
                        <p className="text-2xl font-bold text-primary">{filial.visitas}</p>
                        <p className="text-xs text-muted-foreground">Visitas</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {(filial.prospectsValue * (filial.visitas / Math.max(1, filial.visitas + filial.checklist + filial.ligacoes))).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-success/5 rounded-lg p-4 text-center">
                        <CheckSquare className="h-6 w-6 mx-auto mb-2 text-success" />
                        <p className="text-2xl font-bold text-success">{filial.checklist}</p>
                        <p className="text-xs text-muted-foreground">Checklist</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {(filial.prospectsValue * (filial.checklist / Math.max(1, filial.visitas + filial.checklist + filial.ligacoes))).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-warning/5 rounded-lg p-4 text-center">
                        <Users className="h-6 w-6 mx-auto mb-2 text-warning" />
                        <p className="text-2xl font-bold text-warning">{filial.ligacoes}</p>
                        <p className="text-xs text-muted-foreground">Ligações</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {(filial.prospectsValue * (filial.ligacoes / Math.max(1, filial.visitas + filial.checklist + filial.ligacoes))).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-accent/5 rounded-lg p-4 text-center">
                        <TrendingUp className="h-6 w-6 mx-auto mb-2 text-accent" />
                        <p className="text-2xl font-bold text-accent">{filial.prospects}</p>
                        <p className="text-xs text-muted-foreground">Prospects</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          R$ {filial.prospectsValue.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-secondary/5 rounded-lg p-4 text-center md:hidden">
                        <DollarSign className="h-6 w-6 mx-auto mb-2 text-success" />
                        <p className="text-lg font-bold text-success">R$ {filial.salesValue.toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-muted-foreground">Vendas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance por CEP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Performance dos CEPs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-muted rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-3 bg-muted rounded w-1/4"></div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="h-4 bg-muted rounded w-20"></div>
                    <div className="h-3 bg-muted rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : userStats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">Nenhum colaborador encontrado</p>
              <p className="text-sm">Verifique os filtros ou aguarde o carregamento dos dados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {userStats.map((user, index) => (
                <UserPerformanceItem 
                  key={`${user.name}-${user.user_id}`}
                  user={user}
                  index={index}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
