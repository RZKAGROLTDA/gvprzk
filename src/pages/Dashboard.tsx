import React from 'react';
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
  Calendar
} from 'lucide-react';
import { Task, TaskStats } from '@/types/task';

const Dashboard: React.FC = () => {
  const stats: TaskStats = {
    totalVisits: 45,
    completedVisits: 32,
    prospects: 12,
    salesValue: 85000,
    conversionRate: 26.7
  };

  const recentTasks: Task[] = [
    {
      id: '1',
      name: 'Visita Cliente ABC',
      responsible: 'João Silva',
      client: 'ABC Transportes',
      property: 'Matriz São Paulo',
      taskType: 'prospection',
      checklist: [],
      startDate: new Date(),
      endDate: new Date(),
      startTime: '09:00',
      endTime: '11:00',
      observations: '',
      priority: 'high',
      reminders: [],
      photos: [],
      documents: [],
      initialKm: 0,
      finalKm: 0,
      status: 'pending',
      createdBy: 'Gestor',
      createdAt: new Date(),
      updatedAt: new Date(),
      isProspect: false
    },
    {
      id: '2',
      name: 'Visita Cliente XYZ',
      responsible: 'Maria Santos',
      client: 'XYZ Logística',
      property: 'Filial Campinas',
      taskType: 'prospection',
      checklist: [],
      startDate: new Date(),
      endDate: new Date(),
      startTime: '14:00',
      endTime: '16:00',
      observations: '',
      priority: 'medium',
      reminders: [],
      photos: [],
      documents: [],
      initialKm: 0,
      finalKm: 0,
      status: 'in_progress',
      createdBy: 'Gestor',
      createdAt: new Date(),
      updatedAt: new Date(),
      isProspect: false
    }
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'secondary';
    }
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
        <Button variant="gradient" className="gap-2">
          <CheckSquare className="h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVisits}</div>
            <p className="text-xs text-muted-foreground">Este mês</p>
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
              {((stats.completedVisits / stats.totalVisits) * 100).toFixed(1)}% do total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospects</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.prospects}</div>
            <p className="text-xs text-muted-foreground">
              {stats.conversionRate}% de conversão
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Geradas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {stats.salesValue.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              +12% vs mês anterior
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
            {recentTasks.map((task) => (
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
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;