import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckSquare, 
  Clock, 
  TrendingUp, 
  Users, 
  Eye,
  MapPin,
  Calendar,
  Target,
  DollarSign,
  TrendingDown
} from 'lucide-react';
import { Task, TaskStats } from '@/types/task';
import { TaskManager } from '@/components/TaskManager';
import { TaskDetailsModal } from '@/components/TaskDetailsModal';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useOffline } from '@/hooks/useOffline';
import { useTasks } from '@/hooks/useTasks';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { getOfflineTasks } = useOffline();
  const { tasks: onlineTasks } = useTasks();
  const navigate = useNavigate();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Carregar tarefas quando componente montar
  useEffect(() => {
    const loadTasks = () => {
      // Priorizar tarefas online do Supabase
      if (onlineTasks.length > 0) {
        setAllTasks(onlineTasks);
      } else {
        // Fallback para tarefas offline
        const offlineTasks = getOfflineTasks();
        setAllTasks(offlineTasks);
      }
    };
    
    loadTasks();
    
    // Recarregar quando onlineTasks mudarem
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, [onlineTasks]);

  // Calcular estatísticas baseadas nas tarefas reais
  const stats: TaskStats = {
    totalVisits: allTasks.length,
    completedVisits: allTasks.filter(task => task.status === 'completed').length,
    prospects: allTasks.filter(task => task.isProspect).length,
    salesValue: allTasks.reduce((sum, task) => sum + (task.salesValue || 0), 0),
    conversionRate: allTasks.length > 0 ? (allTasks.filter(task => task.salesConfirmed).length / allTasks.length) * 100 : 0
  };

  // Mostrar as 3 tarefas mais recentes
  const recentTasks = allTasks.slice(0, 3);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'secondary';
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      case 'pending': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das visitas e tarefas</p>
        </div>
        <Button variant="gradient" className="gap-2" onClick={() => navigate('/create-task')}>
          <CheckSquare className="h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      {/* Status Offline */}
      <OfflineIndicator />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVisits}</div>
            <p className="text-xs text-muted-foreground">Tarefas criadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedVisits}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalVisits > 0 ? ((stats.completedVisits / stats.totalVisits) * 100).toFixed(1) : 0}% do total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospecção</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.prospects}</div>
            <p className="text-xs text-muted-foreground">
              {allTasks.length > 0 ? `${((stats.prospects / allTasks.length) * 100).toFixed(1)}% dos clientes` : 'Prospects identificados'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {stats.salesValue.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              {allTasks.length > 0 ? 'Valor total gerado' : 'Aguardando dados'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {allTasks.length > 0 ? 'Prospects → Vendas' : 'Aguardando conversões'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Tarefas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma tarefa criada ainda</p>
                <p className="text-sm">Crie sua primeira tarefa para começar!</p>
              </div>
            ) : (
              recentTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <CheckSquare className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {task.client} - {task.property}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getPriorityColor(task.priority)}>
                      {task.priority}
                    </Badge>
                    <Badge variant={getStatusColor(task.status)}>
                      {task.status}
                    </Badge>
                     <Button 
                       variant="ghost" 
                       size="sm"
                       onClick={() => handleViewTask(task)}
                     >
                       <Eye className="h-4 w-4" />
                     </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gerenciador de Tarefas Offline */}
      <TaskManager />

      {/* Modal de Detalhes da Tarefa */}
      <TaskDetailsModal 
        task={selectedTask}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </div>
  );
};

export default Dashboard;