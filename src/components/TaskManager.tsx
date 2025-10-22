import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOffline } from '@/hooks/useOffline';
import { useTaskDetails } from '@/hooks/useTasksOptimized';
import { Task } from '@/types/task';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Calendar, 
  Clock, 
  User, 
  Building2, 
  CheckCircle2, 
  Circle,
  WifiOff,
  RefreshCw,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { FormVisualization } from '@/components/FormVisualization';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const TaskManager: React.FC = () => {
  const { getOfflineTasks, isOnline, isSyncing } = useOffline();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; name: string } | null>(null);
  const { invalidateAll } = useSecurityCache();
  const { isAdmin } = useUserRole();
  
  // Cache e debounce para otimização
  const lastLoadTime = useRef<number>(0);
  const loadCooldown = 8000; // 8 segundos entre carregamentos
  const tasksCache = useRef<Task[]>([]);

  const loadTasks = useCallback(() => {
    const now = Date.now();
    
    // Implementar cooldown para evitar carregamentos excessivos
    if (now - lastLoadTime.current < loadCooldown) {
      return;
    }
    lastLoadTime.current = now;

    const offlineTasks = getOfflineTasks();
    
    // Verificar se os dados realmente mudaram antes de atualizar o estado
    const tasksString = JSON.stringify(offlineTasks);
    const cacheString = JSON.stringify(tasksCache.current);
    
    if (tasksString !== cacheString) {
      tasksCache.current = offlineTasks;
      setTasks(offlineTasks);
    }
  }, [getOfflineTasks]);

  useEffect(() => {
    loadTasks();
    
    // Reduzir frequência de refresh para 15 segundos
    const interval = setInterval(loadTasks, 15000);
    
    return () => clearInterval(interval);
  }, [loadTasks]);

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusColor = (status: 'pending' | 'in_progress' | 'completed' | 'closed') => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'default';
      case 'pending': return 'secondary';
      case 'closed': return 'outline';
      default: return 'outline';
    }
  };

  const getPriorityText = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return 'Não definida';
    }
  };

  const getStatusText = (status: 'pending' | 'in_progress' | 'completed' | 'closed') => {
    switch (status) {
      case 'completed': return 'Concluída';
      case 'in_progress': return 'Em Andamento';
      case 'pending': return 'Pendente';
      case 'closed': return 'Fechada';
    default: return 'Não definido';
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskToDelete.id);

      if (error) throw error;

      // Atualizar estado local imediatamente
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskToDelete.id));
      
      toast.success('Tarefa excluída com sucesso');
      await invalidateAll();
      setTaskToDelete(null);
    } catch (error: any) {
      console.error('Erro ao excluir tarefa:', error);
      toast.error(error.message || 'Erro ao excluir tarefa');
      setTaskToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tarefas Criadas</h2>
        {!isOnline && (
          <Badge variant="destructive" className="flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            Offline
          </Badge>
        )}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Circle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">Nenhuma tarefa criada</h3>
            <p className="text-sm text-muted-foreground">
              {!isOnline ? 'Crie tarefas offline - elas serão sincronizadas quando conectar' : 'Crie sua primeira tarefa'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <Card key={task.id} className={`border-l-4 ${(task as any).offline ? 'border-l-orange-500' : 'border-l-primary'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {task.name}
                      {(task as any).offline && (
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          <WifiOff className="h-3 w-3 mr-1" />
                          Offline
                        </Badge>
                      )}
                      {isSyncing && (task as any).offline && (
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Sincronizando
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {task.responsible}
                      </div>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {task.client}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getPriorityColor(task.priority)}>
                      {getPriorityText(task.priority)}
                    </Badge>
                    <Badge variant={getStatusColor(task.status)}>
                      {getStatusText(task.status)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {task.startDate ? format(new Date(task.startDate), "PPP", { locale: ptBR }) : 'Data não definida'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {task.startTime} - {task.endTime}
                    </span>
                  </div>
                </div>

                {task.observations && (
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-sm">{task.observations}</p>
                  </div>
                )}

                <TaskItemsDisplay task={task} />

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted-foreground">
                    Criado em: {task.createdAt ? format(new Date(task.createdAt), "PPpp", { locale: ptBR }) : 'Data não disponível'}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setSelectedTask(task);
                        setIsReportModalOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Relatório
                    </Button>
                    <Button size="sm" variant="outline">
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    {isAdmin && (
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => setTaskToDelete({ id: task.id, name: task.name })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Relatório */}
      {selectedTask && (
        <FormVisualization
          task={selectedTask}
          isOpen={isReportModalOpen}
          onClose={() => {
            setIsReportModalOpen(false);
            setSelectedTask(null);
          }}
          onTaskUpdated={async () => {
            // Invalidar cache para garantir sincronização
            await invalidateAll();
          }}
        />
      )}

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa "{taskToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Componente separado para exibir produtos com carregamento automático
const TaskItemsDisplay: React.FC<{ task: Task }> = ({ task }) => {
  const needsDetailsLoading = task && (!task.checklist || task.checklist.length === 0);
  const { data: taskDetails } = useTaskDetails(needsDetailsLoading ? task.id : null);
  
  const currentTask = taskDetails || task;
  
  if (!currentTask.checklist || currentTask.checklist.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Itens Selecionados:</h4>
      <div className="flex flex-wrap gap-1">
        {currentTask.checklist.filter(item => item.selected).map((item) => (
          <Badge key={item.id} variant="outline" className="text-xs">
            {item.name}
            {item.quantity && item.quantity > 0 && ` (${item.quantity})`}
          </Badge>
        ))}
      </div>
    </div>
  );
};