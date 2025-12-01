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
  Users,
  RefreshCw,
  Calendar as CalendarIcon,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

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

const PerformanceBySeller: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState('all');
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userStats, setUserStats] = useState<any[]>([]);

  const loadCollaborators = async () => {
    try {
      // SECURITY FIX: Fetch roles from user_roles table
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, user_id')
        .order('name');

      if (profilesError) throw profilesError;

      // Fetch roles from user_roles table
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      const collaboratorsWithRoles = profiles?.map(p => ({
        ...p,
        role: rolesMap.get(p.user_id) || 'consultant'
      })) || [];

      setCollaborators(collaboratorsWithRoles);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadUserStats = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // SECURITY FIX: Fetch roles from user_roles table
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, name, id')
        .eq('approval_status', 'approved')
        .order('name');

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        setUserStats([]);
        return;
      }

      // Fetch roles from user_roles table
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['consultant', 'manager', 'admin']);

      if (rolesError) throw rolesError;

      // Create a map of user_id to role
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      // Filter profiles to only include those with valid roles
      const profilesWithRoles = profiles.filter(p => rolesMap.has(p.user_id));

      const userStatsPromises = profilesWithRoles.map(async (profile) => {
        const userRole = rolesMap.get(profile.user_id) || 'consultant';
        let query = supabase
          .from('tasks')
          .select('*')
          .eq('created_by', profile.user_id);

        if (dateFrom) {
          query = query.gte('start_date', dateFrom.toISOString().split('T')[0]);
        }
        if (dateTo) {
          query = query.lte('end_date', dateTo.toISOString().split('T')[0]);
        }

        const { data: tasks, error: tasksError } = await query;

        if (tasksError) {
          return {
            name: profile.name,
            role: userRole,
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

        const visitas = tasks?.filter(task => task.task_type === 'prospection').length || 0;
        const checklist = tasks?.filter(task => task.task_type === 'checklist').length || 0;
        const ligacoes = tasks?.filter(task => task.task_type === 'ligacao').length || 0;
        const totalActivities = tasks?.length || 0;
        const prospects = tasks?.filter(task => task.is_prospect === true).length || 0;
        const prospectsValue = tasks?.filter(task => task.is_prospect === true).reduce((sum, task) => sum + (Number(task.sales_value) || 0), 0) || 0;
        const confirmedSales = tasks?.filter(task => task.sales_confirmed === true).reduce((sum, task) => sum + (Number(task.sales_value) || 0), 0) || 0;
        
        const conversionRate = prospectsValue > 0 ? (confirmedSales / prospectsValue) * 100 : 0;

        return {
          name: profile.name,
          role: userRole,
          user_id: profile.user_id,
          visits: totalActivities,
          prospects,
          sales: Number(confirmedSales),
          conversionRate: Math.round(conversionRate * 10) / 10,
          totalActivities,
          visitas,
          checklist,
          ligacoes,
          salesValue: Number(prospectsValue)
        };
      });

      const results = await Promise.all(userStatsPromises);
      const sortedResults = results.sort((a, b) => b.sales - a.sales);
      setUserStats(sortedResults);
    } catch (error) {
      console.error('Erro ao carregar estatísticas dos usuários:', error);
      setUserStats([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadCollaborators();
      loadUserStats();
    }
  }, [user, dateFrom, dateTo, selectedUser]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/reports')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Performance dos Vendedores</h1>
            <p className="text-muted-foreground">Análise detalhada da performance individual dos vendedores</p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => loadUserStats()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Performance por Vendedor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Ranking dos Vendedores
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

export default PerformanceBySeller;