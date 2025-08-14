import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  CheckSquare, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Clock,
  MapPin,
  User,
  Calendar,
  Plus
} from 'lucide-react';
import { Task } from '@/types/task';
import { TaskDetailsModal } from '@/components/TaskDetailsModal';
import { TaskEditModal } from '@/components/TaskEditModal';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useOffline } from '@/hooks/useOffline';
import { useTasks } from '@/hooks/useTasks';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const Tasks: React.FC = () => {
  const { getOfflineTasks } = useOffline();
  const { tasks: onlineTasks } = useTasks();
  const navigate = useNavigate();
  const [vendorFilter, setVendorFilter] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [filialFilter, setFilialFilter] = useState('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [vendors, setVendors] = useState<{id: string, name: string}[]>([]);
  const [filiais, setFiliais] = useState<{id: string, nome: string}[]>([]);

  // Carregar vendedores e filiais registrados
  useEffect(() => {
    const loadData = async () => {
      try {
        // Carregar vendedores
        const { data: vendorsData, error: vendorsError } = await supabase
          .from('profiles')
          .select('id, name')
          .order('name');
        
        if (vendorsError) throw vendorsError;
        setVendors(vendorsData || []);

        // Carregar filiais
        const { data: filiaisData, error: filiaisError } = await supabase
          .from('filiais')
          .select('id, nome')
          .order('nome');
        
        if (filiaisError) throw filiaisError;
        setFiliais(filiaisData || []);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };
    
    loadData();
  }, []);

  // Carregar tarefas quando componente montar
  useEffect(() => {
    const loadTasks = () => {
      // Priorizar tarefas online do Supabase
      if (onlineTasks.length > 0) {
        setTasks(onlineTasks);
      } else {
        // Fallback para tarefas offline
        const offlineTasks = getOfflineTasks();
        setTasks(offlineTasks);
      }
    };
    
    loadTasks();
    
    // Recarregar quando onlineTasks mudarem
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, [onlineTasks]);

  const filteredTasks = tasks.filter(task => {
    const matchesVendor = vendorFilter === 'all' || task.responsible === vendorFilter;
    const matchesTaskType = taskTypeFilter === 'all' || task.taskType === taskTypeFilter;
    const matchesFilial = filialFilter === 'all' || task.filial === filialFilter;
    
    return matchesVendor && matchesTaskType && matchesFilial;
  });

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

  const handleEditTask = (task: Task) => {
    setEditTask(task);
    setIsEditModalOpen(true);
  };

  const handleTaskUpdate = () => {
    // Reload tasks after update
    const loadTasks = () => {
      if (onlineTasks.length > 0) {
        setTasks(onlineTasks);
      } else {
        const offlineTasks = getOfflineTasks();
        setTasks(offlineTasks);
      }
    };
    loadTasks();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      case 'pending': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Concluída';
      case 'in_progress': return 'Em Andamento';
      case 'pending': return 'Pendente';
      case 'closed': return 'Fechada';
      default: return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return priority;
    }
  };

  return (
    <div className="space-y-6">
      {/* Indicador de Status Offline */}
      <OfflineIndicator />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Tarefas</h1>
          <p className="text-muted-foreground">Gerenciar tarefas de visitas</p>
        </div>
        <Button variant="gradient" className="gap-2" onClick={() => navigate('/create-task')}>
          <Plus className="h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Nome do Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Vendedores</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.name}>{vendor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Tarefa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="prospection">Visitas</SelectItem>
                <SelectItem value="checklist">Checklist</SelectItem>
                <SelectItem value="ligacao">Ligações</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filialFilter} onValueChange={setFilialFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Filiais</SelectItem>
                {filiais.map(filial => (
                  <SelectItem key={filial.id} value={filial.nome}>{filial.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="mt-4">
            <Button variant="outline" onClick={() => {
              setVendorFilter('all');
              setTaskTypeFilter('all');
              setFilialFilter('all');
            }}>
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <div className="space-y-4">
        {filteredTasks.length === 0 && tasks.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <CheckSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma tarefa criada ainda</h3>
              <p className="text-muted-foreground mb-4">
                Crie sua primeira tarefa para começar!
              </p>
              <Button variant="gradient" className="gap-2" onClick={() => navigate('/create-task')}>
                <Plus className="h-4 w-4" />
                Criar Primeira Tarefa
              </Button>
            </CardContent>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma tarefa encontrada</h3>
              <p className="text-muted-foreground">
                Tente ajustar os filtros ou criar uma nova tarefa
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task) => (
            <Card key={task.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <CheckSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{task.name}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {task.responsible}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {task.client} - {task.property}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(task.createdAt), "PPP", { locale: ptBR })}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {task.startTime} - {task.endTime}
                          </div>
                        </div>
                      </div>
                    </div>

                    {task.observations && (
                      <p className="text-sm text-muted-foreground pl-13">
                        {task.observations}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pl-13">
                      {task.isProspect && task.salesConfirmed === undefined && (
                        <Badge variant="warning">
                          Prospect
                        </Badge>
                      )}
                      {task.salesConfirmed === true && (
                        <Badge variant="success">
                          Venda Realizada
                        </Badge>
                      )}
                      {task.salesConfirmed === false && (
                        <Badge variant="destructive">
                          Venda Perdida
                        </Badge>
                      )}
                    </div>

                    {task.salesValue && task.salesValue > 0 && (
                      <div className="pl-13">
                        <p className="text-sm font-medium text-success">
                          Valor da Venda: R$ {task.salesValue.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleViewTask(task)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditTask(task)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modal de Detalhes da Tarefa */}
      <TaskDetailsModal 
        task={selectedTask}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />

      {/* Modal de Edição da Tarefa */}
      <TaskEditModal 
        task={editTask}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onTaskUpdate={handleTaskUpdate}
      />
    </div>
  );
};

export default Tasks;