
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  CheckSquare, 
  Download,
  Calendar,
  DollarSign,
  Target,
  Activity,
  Building2,
  RefreshCw
} from 'lucide-react';
import { TaskStats } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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

const Reports: React.FC = () => {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedUser, setSelectedUser] = useState('all');
  const [filialStats, setFilialStats] = useState<FilialStats[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const stats: TaskStats = {
    totalVisits: 0,
    completedVisits: 0,
    prospects: 0,
    salesValue: 0,
    conversionRate: 0
  };

  const detailedStats: any[] = [];
  const userStats: any[] = [];

  const loadCollaborators = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, role')
        .order('name');

      if (error) throw error;
      setCollaborators(profiles || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadFilialStats = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Buscar todas as filiais
      const { data: filiais, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) throw filiaisError;

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
        
        // Buscar tarefas dos usuários desta filial
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .in('created_by', userIds);

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
        const prospectsValue = tasks?.filter(task => task.is_prospect === true)
          .reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        const salesValue = tasks?.reduce((sum, task) => sum + (task.sales_value || 0), 0) || 0;
        const conversionRate = totalTasks > 0 ? (prospects / totalTasks) * 100 : 0;

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

  useEffect(() => {
    if (user) {
      loadFilialStats();
      loadCollaborators();
      
      // Configurar atualização automática a cada 10 segundos para sincronização em tempo real
      const interval = setInterval(() => {
        loadFilialStats();
      }, 10000);
      
      return () => clearInterval(interval);
    }
  }, [user, selectedPeriod, selectedUser]);

  const exportReport = () => {
    // Implementar exportação para PDF/Excel
    console.log('Exportando relatório...');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Análises e métricas de desempenho</p>
        </div>
        <Button variant="gradient" onClick={exportReport} className="gap-2">
          <Download className="h-4 w-4" />
          Exportar Relatório
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Esta Semana</SelectItem>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="quarter">Este Trimestre</SelectItem>
                  <SelectItem value="year">Este Ano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Colaborador</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Colaboradores</SelectItem>
                  {collaborators.map((collaborator) => (
                    <SelectItem key={collaborator.id} value={collaborator.id}>
                      {collaborator.name} - {collaborator.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" className="flex-1" onClick={loadFilialStats}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Atualizando...' : 'Atualizar Dados'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filialStats.reduce((sum, f) => sum + f.visitas + f.checklist + f.ligacoes, 0)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Todas as filiais</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visitas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filialStats.reduce((sum, f) => sum + f.visitas, 0)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Todas as filiais</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checklist</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filialStats.reduce((sum, f) => sum + f.checklist, 0)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Todas as filiais</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ligações</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filialStats.reduce((sum, f) => sum + f.ligacoes, 0)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Todas as filiais</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oportunidades Geradas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {filialStats.reduce((sum, f) => sum + f.prospectsValue, 0).toLocaleString('pt-BR')}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Todas as filiais</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Realizadas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {filialStats.reduce((sum, f) => sum + f.salesValue, 0).toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Todas as filiais</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dados por Filial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Dados por Filial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
                <p>Carregando dados das filiais...</p>
              </div>
            ) : filialStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma filial com dados disponíveis</p>
                <p className="text-sm">Os dados aparecerão conforme as tarefas forem criadas</p>
              </div>
            ) : (
              filialStats.map((filial) => (
                <div key={filial.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{filial.nome}</h3>
                      <p className="text-sm text-muted-foreground">
                        {filial.visitas + filial.checklist + filial.ligacoes} tarefas realizadas
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-lg font-bold">{filial.visitas}</div>
                        <div className="text-xs text-muted-foreground">Visitas</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-600">{filial.checklist}</div>
                        <div className="text-xs text-muted-foreground">Checklist</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-purple-600">{filial.ligacoes}</div>
                        <div className="text-xs text-muted-foreground">Ligações</div>
                      </div>
                       <div className="text-center">
                         <div className="text-lg font-bold text-green-600">
                           R$ {filial.prospectsValue.toLocaleString('pt-BR')}
                         </div>
                         <div className="text-xs text-muted-foreground">Oportunidades</div>
                       </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">
                          R$ {filial.salesValue.toLocaleString('pt-BR')}
                        </div>
                        <div className="text-xs text-muted-foreground">Vendas</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance por Colaborador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Performance por Colaborador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {userStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum colaborador com dados ainda</p>
                <p className="text-sm">Os dados aparecerão conforme as tarefas forem realizadas</p>
              </div>
            ) : (
              userStats.map((user, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                      <Users className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{user.name}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{user.role}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {user.visits} visitas realizadas
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-sm font-medium">{user.prospects}</div>
                        <div className="text-xs text-muted-foreground">Prospects</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium">R$ {user.sales.toLocaleString('pt-BR')}</div>
                        <div className="text-xs text-muted-foreground">Vendas</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium">{user.conversionRate}%</div>
                        <div className="text-xs text-muted-foreground">Conversão</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
