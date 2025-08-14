import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Building, 
  Flag,
  CheckSquare,
  DollarSign,
  Camera
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import { TaskLocationInfo } from './TaskLocationInfo';
import { TaskReportExporter } from './TaskReportExporter';
import { supabase } from '@/integrations/supabase/client';

interface TaskDetailsModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  task,
  open,
  onOpenChange
}) => {
  const [currentTask, setCurrentTask] = useState<Task | null>(task);

  // Atualizar estado local quando a prop task mudar
  useEffect(() => {
    setCurrentTask(task);
  }, [task]);

  // Configurar realtime listener para atualizar a tarefa específica
  useEffect(() => {
    if (!task?.id || !open) return;

    const channel = supabase
      .channel(`task-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${task.id}`
        },
        async (payload) => {
          console.log('Task detail updated:', payload);
          // Buscar dados atualizados da tarefa
          const { data: updatedTask } = await supabase
            .from('tasks')
            .select('*,products(*),reminders(*)')
            .eq('id', task.id)
            .single();
          
          if (updatedTask) {
            setCurrentTask(updatedTask);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [task?.id, open]);

  if (!currentTask) return null;

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">{currentTask.name}</DialogTitle>
            <TaskReportExporter 
              task={currentTask} 
              filialName={currentTask.filial}
              variant="outline"
              size="sm"
            />
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status do Formulário */}
          <div className="flex items-center gap-4">
            {currentTask.isProspect && currentTask.salesConfirmed === undefined && (
              <Badge variant="warning" className="text-sm">
                Prospect
              </Badge>
            )}
            {currentTask.salesConfirmed === true && (
              <Badge variant="success" className="text-sm">
                Venda Realizada
              </Badge>
            )}
            {currentTask.salesConfirmed === false && (
              <Badge variant="destructive" className="text-sm">
                Venda Perdida
              </Badge>
            )}
          </div>

          {/* Informações Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações Gerais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Responsável:</span>
                  <span>{task.responsible}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Cliente:</span>
                  <span>{task.client}</span>
                </div>
                {task.property && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Propriedade:</span>
                    <span>{task.property}</span>
                  </div>
                )}
                {task.filial && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Filial:</span>
                    <span>{task.filial}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Data e Horário
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Data:</span>
                  <span>{format(task.startDate, "PPP", { locale: ptBR })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Horário:</span>
                  <span>{task.startTime} - {task.endTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Km Inicial:</span>
                  <span>{task.initialKm}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Km Final:</span>
                  <span>{task.finalKm}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Observações */}
          {task.observations && (
            <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{task.observations}</p>
              </CardContent>
            </Card>
          )}

          {/* Check-in Location */}
          {task.checkInLocation && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Localização do Check-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TaskLocationInfo checkInLocation={task.checkInLocation} />
              </CardContent>
            </Card>
          )}

          {/* Checklist de Produtos */}
          {task.checklist && task.checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Checklist de Produtos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {task.checklist.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          product.selected ? 'bg-primary border-primary' : 'border-muted-foreground'
                        }`}>
                          {product.selected && <CheckSquare className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.category}</p>
                          {product.observations && (
                            <p className="text-xs text-muted-foreground">{product.observations}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {product.quantity && (
                          <p className="text-sm">Qtd: {product.quantity}</p>
                        )}
                        {product.price && (
                          <p className="text-sm font-medium">R$ {product.price.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lembretes */}
          {task.reminders && task.reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Lembretes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {task.reminders.map((reminder, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 border rounded">
                      <div className={`w-4 h-4 rounded border-2 ${
                        reminder.completed ? 'bg-success border-success' : 'border-muted-foreground'
                      }`} />
                      <div className="flex-1">
                        <p className="font-medium">{reminder.title}</p>
                        {reminder.description && (
                          <p className="text-sm text-muted-foreground">{reminder.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(reminder.date, "PPP", { locale: ptBR })} às {reminder.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vendas */}
          {task.salesValue && task.salesValue > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Informações de Venda
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Valor da Venda:</span>
                    <span className="text-lg font-bold text-success">
                      R$ {task.salesValue.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status:</span>
                    <Badge variant={task.salesConfirmed ? 'success' : 'secondary'}>
                      {task.salesConfirmed ? 'Confirmada' : 'Pendente'}
                    </Badge>
                  </div>
                  {task.prospectNotes && (
                    <div className="mt-4">
                      <span className="font-medium">Notas do Prospect:</span>
                      <p className="text-muted-foreground mt-1">{task.prospectNotes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fotos */}
          {task.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Fotos ({task.photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {task.photos.map((photo, index) => (
                    <div key={index} className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                      <Camera className="h-8 w-8 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
