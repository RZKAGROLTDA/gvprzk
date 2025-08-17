
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
import { mapSalesStatus, getStatusLabel, getStatusColor, resolveFilialName } from '@/lib/taskStandardization';

// Interface para os dados completos da tarefa com informações do usuário e filial
interface TaskWithUserInfo extends Task {
  userName?: string;
  userFilial?: string;
}

const Tasks: React.FC = () => {
  const { getOfflineTasks } = useOffline();
  const { tasks: onlineTasks } = useTasks();
  const navigate = useNavigate();
  const [vendorFilter, setVendorFilter] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [filialFilter, setFilialFilter] = useState('all');
  const [tasks, setTasks] = useState<TaskWithUserInfo[]>([]);
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
        // Carregar vendedores e filiais em paralelo
        const [vendorsResponse, filiaisResponse] = await Promise.all([
          supabase.from('profiles').select('id, name').order('name'),
          supabase.from('filiais').select('id, nome').order('nome')
        ]);
        
        if (vendorsResponse.data) setVendors(vendorsResponse.data);
        if (filiaisResponse.data) setFiliais(filiaisResponse.data);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };
    
    loadData();
  }, []);

  // Função simplificada para carregar tarefas sem JOIN problemático
  const loadTasksWithUserInfo = async () => {
    try {
      console.log('Carregando tarefas...');
      
      // Carregar apenas as tarefas sem JOIN problemático
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (tasksError) {
        console.error('Erro ao carregar tarefas:', tasksError);
        // Usar tarefas do hook como fallback
        setTasks(onlineTasks.map(task => ({
          ...task,
          userName: task.responsible || 'N/A',
          userFilial: 'N/A'
        })));
        return;
      }

      if (!tasksData?.length) {
        console.log('Nenhuma tarefa encontrada');
        setTasks([]);
        return;
      }

      console.log('Tarefas carregadas:', tasksData.length);

      // Mapear dados de forma mais simples
      const tasksWithUserInfo: TaskWithUserInfo[] = tasksData.map(task => ({
        id: task.id,
        name: task.name,
        responsible: task.responsible,
        client: task.client,
        property: task.property || '',
        filial: task.filial || '',
        cpf: task.cpf || '',
        email: task.email || '',
        taskType: task.task_type || 'prospection',
        checklist: [],
        startDate: new Date(task.start_date),
        endDate: new Date(task.end_date),
        startTime: task.start_time,
        endTime: task.end_time,
        observations: task.observations || '',
        priority: task.priority,
        reminders: [],
        photos: task.photos || [],
        documents: task.documents || [],
        checkInLocation: task.check_in_location ? {
          lat: task.check_in_location.lat,
          lng: task.check_in_location.lng,
          timestamp: new Date(task.check_in_location.timestamp),
        } : undefined,
        initialKm: task.initial_km || 0,
        finalKm: task.final_km || 0,
        status: task.status,
        createdBy: task.created_by,
        createdAt: new Date(task.created_at),
        updatedAt: new Date(task.updated_at),
        isProspect: Boolean(task.is_prospect || task.sales_confirmed !== null || (task.sales_value && task.sales_value > 0)),
        prospectNotes: task.prospect_notes || '',
        prospectItems: [],
        salesValue: task.sales_value || 0,
        salesConfirmed: task.sales_confirmed,
        familyProduct: task.family_product || '',
        equipmentQuantity: task.equipment_quantity || 0,
        propertyHectares: task.property_hectares || 0,
        equipmentList: task.equipment_list || [],
        // Usar informações disponíveis
        userName: task.responsible || 'N/A',
        userFilial: 'N/A'
      }));

      console.log('Processamento concluído:', tasksWithUserInfo.length, 'tarefas');
      setTasks(tasksWithUserInfo);
    } catch (error) {
      console.error('Erro ao carregar tarefas:', error);
      // Fallback para tarefas básicas
      setTasks(onlineTasks.map(task => ({
        ...task,
        userName: task.responsible || 'N/A',
        userFilial: 'N/A'
      })));
    }
  };

  // Carregar tarefas quando componente montar
  useEffect(() => {
    loadTasksWithUserInfo();
  }, [onlineTasks]);

  // Configurar realtime listener separadamente
  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        async (payload) => {
          console.log('Realtime task change:', payload);
          // Recarregar dados otimizados
          loadTasksWithUserInfo();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredTasks = tasks.filter(task => {
    const matchesVendor = vendorFilter === 'all' || task.userName === vendorFilter || task.responsible === vendorFilter;
    const matchesTaskType = taskTypeFilter === 'all' || task.taskType === taskTypeFilter;
    const matchesFilial = filialFilter === 'all' || task.userFilial === filialFilter || task.filial === filialFilter;
    
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
    // O realtime já atualiza automaticamente a lista
    setIsEditModalOpen(false);
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

  const getProspectStatus = (task: TaskWithUserInfo) => {
    if (!task.isProspect) return null;
    
    const status = mapSalesStatus(task);
    return { 
      type: status,
      label: getStatusLabel(status), 
      variant: status === 'ganho' ? 'success' as const : 
               status === 'perdido' ? 'destructive' as const :
               status === 'parcial' ? 'warning' as const : 'secondary' as const
    };
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
          <div></div>
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
           filteredTasks.map((task) => {
             const prospectStatus = getProspectStatus(task);
             
             return (
            <Card key={task.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base mb-2 truncate">
                          {task.taskType === 'prospection' ? 'Visita' : 
                           task.taskType === 'ligacao' ? 'Ligação' : 
                           task.taskType === 'checklist' ? 'Checklist' : 
                           'Tarefa'}
                        </h3>
                        
                        {/* Grid layout para informações organizadas com dados corretos */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1 truncate">
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{task.userName}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {(() => {
                                try {
                                  const date = new Date(task.startDate);
                                  if (isNaN(date.getTime())) {
                                    return 'Data inválida';
                                  }
                                  return format(date, "dd/MM/yyyy", { locale: ptBR });
                                } catch (error) {
                                  return 'Data inválida';
                                }
                              })()}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{task.client || 'Cliente não informado'}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{task.startTime} - {task.endTime}</span>
                          </div>

                          <div className="col-span-2 flex items-center gap-1 truncate">
                            <span className="text-xs font-medium">Propriedade:</span>
                            <span className="truncate">{task.property || 'Não informada'}</span>
                          </div>

          <div className="col-span-2 flex items-center gap-1 truncate">
            <span className="text-xs font-medium">Filial:</span>
            <span className="truncate">{resolveFilialName(task.filial) || 'Não informado'}</span>
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
                      {prospectStatus && (
                        <Badge variant={prospectStatus.variant}>
                          {prospectStatus.label}
                        </Badge>
                      )}
                    </div>

                    {task.salesValue && task.salesValue > 0 && (
                      <div className="pl-13 space-y-1">
                        <p className="text-sm font-medium text-primary">
                          Valor da Oportunidade: R$ {task.salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {task.salesConfirmed === true && (
                          <p className="text-sm font-medium text-success">
                            Venda Realizada: R$ {task.salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
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
             );
           })
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
