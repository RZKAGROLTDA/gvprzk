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
                  <span>{currentTask.responsible}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Cliente:</span>
                  <span>{currentTask.client}</span>
                </div>
                {currentTask.property && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Propriedade:</span>
                    <span>{currentTask.property}</span>
                  </div>
                )}
                {currentTask.filial && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Filial:</span>
                    <span>{currentTask.filial}</span>
                  </div>
                )}
                {currentTask.taskType && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Tipo:</span>
                    <Badge variant="outline">
                      {currentTask.taskType === 'prospection' ? 'Visita' :
                       currentTask.taskType === 'checklist' ? 'Checklist' :
                       currentTask.taskType === 'ligacao' ? 'Ligação' : currentTask.taskType}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  <Badge variant={getStatusColor(currentTask.status)}>
                    {getStatusLabel(currentTask.status)}
                  </Badge>
                </div>
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
                  <span>{format(currentTask.startDate, "PPP", { locale: ptBR })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Horário:</span>
                  <span>{currentTask.startTime} - {currentTask.endTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Km Inicial:</span>
                  <span>{currentTask.initialKm}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Km Final:</span>
                  <span>{currentTask.finalKm}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Observações */}
          {currentTask.observations && (
            <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{currentTask.observations}</p>
              </CardContent>
            </Card>
          )}

          {/* Check-in Location */}
          {currentTask.checkInLocation && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Localização do Check-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TaskLocationInfo checkInLocation={currentTask.checkInLocation} />
              </CardContent>
            </Card>
          )}

          {/* Checklist de Produtos */}
          {currentTask.checklist && currentTask.checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Checklist de Produtos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentTask.checklist.map((product, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-3">
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
                      
                      {/* Fotos do produto */}
                      {product.photos && product.photos.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium mb-2">Fotos do produto:</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {product.photos.map((photo, photoIndex) => (
                              <div key={photoIndex} className="aspect-square border rounded overflow-hidden bg-muted">
                                <img 
                                  src={photo} 
                                  alt={`Foto ${photoIndex + 1} do produto ${product.name}`}
                                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                                  onClick={() => window.open(photo, '_blank')}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `
                                        <div class="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                          <Camera class="h-4 w-4 mb-1" />
                                          <span class="text-xs text-center">Imagem não disponível</span>
                                        </div>
                                      `;
                                    }
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lembretes */}
          {currentTask.reminders && currentTask.reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Lembretes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {currentTask.reminders.map((reminder, index) => (
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
          {currentTask.salesValue && currentTask.salesValue > 0 && (
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
                    <span className="font-medium">Valor da Oportunidade:</span>
                    <span className="text-lg font-bold text-muted-foreground">
                      R$ {(() => {
                        // Calcular soma total dos produtos selecionados no checklist
                        const checklistTotal = currentTask.checklist?.reduce((sum, product) => {
                          return sum + (product.selected && product.price ? product.price * (product.quantity || 1) : 0);
                        }, 0) || 0;
                        
                        // Se não há checklist com produtos, usar salesValue diretamente
                        const totalValue = checklistTotal > 0 ? checklistTotal : (currentTask.salesValue || 0);
                        
                        return totalValue.toLocaleString('pt-BR');
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Venda Realizada:</span>
                    <span className="text-lg font-bold text-success">
                      R$ {currentTask.salesConfirmed ? currentTask.salesValue.toLocaleString('pt-BR') : '0,00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status:</span>
                    <Badge variant={currentTask.salesConfirmed ? 'success' : 'secondary'}>
                      {currentTask.salesConfirmed ? 'Confirmada' : 'Pendente'}
                    </Badge>
                  </div>
                  {currentTask.prospectNotes && (
                    <div className="mt-4">
                      <span className="font-medium">Notas do Prospect:</span>
                      <p className="text-muted-foreground mt-1">{currentTask.prospectNotes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fotos */}
          {currentTask.photos && currentTask.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Fotos ({currentTask.photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {currentTask.photos.map((photo, index) => (
                    <div key={index} className="aspect-square border rounded-lg overflow-hidden bg-muted">
                      <img 
                        src={photo} 
                        alt={`Foto ${index + 1} da tarefa`}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => window.open(photo, '_blank')}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = `
                              <div class="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                <Camera class="h-8 w-8 mb-2" />
                                <span class="text-xs text-center">Imagem não disponível</span>
                              </div>
                            `;
                          }
                        }}
                      />
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
