import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, MapPin, User, Building, Flag, CheckSquare, DollarSign, Camera, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import { TaskLocationInfo } from './TaskLocationInfo';
import { TaskReportExporter } from './TaskReportExporter';
import { supabase } from '@/integrations/supabase/client';
import { resolveFilialName } from '@/lib/taskStandardization';
import { useTaskDetails } from '@/hooks/useTasksOptimized';
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

  // Carregar detalhes completos da task se necessário (produtos, lembretes)
  const needsDetailsLoading = task && (!task.checklist || task.checklist.length === 0 || !task.reminders || task.reminders.length === 0);
  const { data: taskDetails, isLoading: loadingDetails } = useTaskDetails(
    needsDetailsLoading ? task.id : null
  );

  // Usar task completa (com detalhes carregados) ou task original
  const fullTask = taskDetails || task;

  // Atualizar estado local quando a prop task mudar
  useEffect(() => {
    setCurrentTask(fullTask);
  }, [fullTask]);

  // Configurar realtime listener para atualizar a tarefa específica
  useEffect(() => {
    if (!task?.id || !open) return;
    const channel = supabase.channel(`task-${task.id}`).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'tasks',
      filter: `id=eq.${task.id}`
    }, async payload => {
      console.log('Task detail updated:', payload);
      // Buscar dados atualizados da tarefa
      const {
        data: updatedTask
      } = await supabase.from('tasks').select(`
        *,
        products(*),
        reminders(*),
        profiles!tasks_created_by_fkey(
          name,
          filiais(nome)
        )
      `).eq('id', task.id).single();
      if (updatedTask) {
        setCurrentTask(updatedTask);
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [task?.id, open]);
  if (loadingDetails) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2">Carregando detalhes...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!currentTask) return null;
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'warning';
      case 'low':
        return 'success';
      default:
        return 'secondary';
    }
  };
  const getStatusColor = (task: Task) => {
    // Se é prospect e ainda não foi finalizado, usar cor de warning (mesmo do prospect)
    if (task.isProspect && (task.salesConfirmed === null || task.salesConfirmed === undefined)) {
      return 'warning';
    }

    // Se é prospect e foi finalizado, usar cor de success
    if (task.isProspect && (task.salesConfirmed === true || task.salesConfirmed === false)) {
      return 'success';
    }

    // Para não-prospects, usar a lógica original
    switch (task.status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'warning';
      case 'pending':
        return 'secondary';
      default:
        return 'secondary';
    }
  };
  const getStatusLabel = (task: Task) => {
    // Se é prospect e ainda não foi finalizado (null/undefined), mostrar Em Andamento
    if (task.isProspect && (task.salesConfirmed === null || task.salesConfirmed === undefined)) {
      return 'Em Andamento';
    }

    // Se é prospect e foi finalizado (true ou false), mostrar Concluído
    if (task.isProspect && (task.salesConfirmed === true || task.salesConfirmed === false)) {
      return 'Concluído';
    }

    // Para não-prospects, usar a lógica original
    switch (task.status) {
      case 'completed':
        return 'Concluída';
      case 'in_progress':
        return 'Em Andamento';
      case 'pending':
        return 'Pendente';
      case 'closed':
        return 'Fechada';
      default:
        return task.status;
    }
  };
  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'Alta';
      case 'medium':
        return 'Média';
      case 'low':
        return 'Baixa';
      default:
        return priority;
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">{currentTask.name}</DialogTitle>
            <TaskReportExporter task={currentTask} filialName={currentTask.filial} variant="outline" size="sm" />
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status do Formulário */}
          <div className="flex items-center gap-4">
            {currentTask.isProspect && <>
                {currentTask.salesConfirmed === true && <Badge variant="success" className="text-sm">
                    Venda Realizada
                  </Badge>}
                {currentTask.salesConfirmed === false && <Badge variant="destructive" className="text-sm">
                    Venda Perdida
                  </Badge>}
                {(currentTask.salesConfirmed === null || currentTask.salesConfirmed === undefined) && <Badge variant="warning" className="text-sm">
                    Prospect
                  </Badge>}
              </>}
          </div>

          {/* Informações Principais - Reorganizadas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações da Tarefa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coluna Esquerda - Informações do Cliente */}
                <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold text-primary border-b pb-2">Informações do Cliente</h4>
                  
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Nome do Contato:</span>
                    <span>{currentTask.responsible}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Cliente:</span>
                    <span>{currentTask.client}</span>
                  </div>

                  {currentTask.property && <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Propriedade:</span>
                      <span>{currentTask.property}</span>
                    </div>}

                  {currentTask.cpf && <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">CPF:</span>
                      <span>{currentTask.cpf}</span>
                    </div>}

                  {currentTask.email && <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Email:</span>
                      <span>{currentTask.email}</span>
                    </div>}

                  {currentTask.propertyHectares && <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Hectares:</span>
                      <span>{currentTask.propertyHectares} ha</span>
                    </div>}

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Data do Relatório:</span>
                    <span>{format(currentTask.startDate, "PPP", {
                      locale: ptBR
                    })}</span>
                  </div>
                </div>

                {/* Coluna Direita - Informações RZKAgro */}
                <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold text-primary border-b pb-2">Informações RZKAgro</h4>
                  
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Vendedor:</span>
                    <span>{currentTask.responsible}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Filial:</span>
                    <span>{resolveFilialName(currentTask.filial) || 'Não informado'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Tipo:</span>
                    <Badge variant="outline">
                      {currentTask.taskType === 'prospection' ? 'Visita' : currentTask.taskType === 'checklist' ? 'Checklist' : currentTask.taskType === 'ligacao' ? 'Ligação' : currentTask.taskType}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Horário:</span>
                    <span>{currentTask.startTime} - {currentTask.endTime}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Status:</span>
                    <Badge variant={getStatusColor(currentTask)}>
                      {getStatusLabel(currentTask)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Prioridade:</span>
                    <Badge variant={getPriorityColor(currentTask.priority)}>
                      {getPriorityLabel(currentTask.priority)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observações */}
          {currentTask.observations && <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{currentTask.observations}</p>
              </CardContent>
            </Card>}

          {/* Check-in Location */}
          {currentTask.checkInLocation && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Localização do Check-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TaskLocationInfo checkInLocation={currentTask.checkInLocation} />
              </CardContent>
            </Card>}

          {/* Checklist de Produtos */}
          {currentTask.checklist && currentTask.checklist.length > 0 && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Checklist de Produtos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentTask.checklist.map((product, index) => <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${product.selected ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                            {product.selected && <CheckSquare className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            
                            {product.observations && <p className="text-xs text-muted-foreground">{product.observations}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          {product.quantity && <p className="text-sm">Qtd: {product.quantity}</p>}
                          {product.price && <p className="text-sm font-medium">R$ {product.price.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}</p>}
                        </div>
                      </div>
                      
                      {/* Fotos do produto */}
                      {product.photos && product.photos.length > 0 && <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium mb-2">Fotos do produto:</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {product.photos.map((photo, photoIndex) => <div key={photoIndex} className="aspect-square border rounded overflow-hidden bg-muted">
                                <img src={photo} alt={`Foto ${photoIndex + 1} do produto ${product.name}`} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" onClick={() => window.open(photo, '_blank')} onError={e => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          // Safe DOM manipulation without innerHTML
                          parent.removeChild(target);
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'w-full h-full flex flex-col items-center justify-center text-muted-foreground';
                          
                          const iconDiv = document.createElement('div');
                          iconDiv.innerHTML = '📷'; // Safe emoji instead of Lucide icon
                          iconDiv.className = 'text-lg mb-1';
                          
                          const textSpan = document.createElement('span');
                          textSpan.textContent = 'Imagem não disponível';
                          textSpan.className = 'text-xs text-center';
                          
                          errorDiv.appendChild(iconDiv);
                          errorDiv.appendChild(textSpan);
                          parent.appendChild(errorDiv);
                        }
                      }} />
                              </div>)}
                          </div>
                        </div>}
                    </div>)}
                </div>
              </CardContent>
            </Card>}

          {/* Lista de Equipamentos */}
          {currentTask.equipmentList && currentTask.equipmentList.length > 0 && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Lista de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentTask.equipmentList.map((equipment, index) => (
                    <div key={equipment.id} className="border rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">Família do Produto:</span>
                          <p className="text-muted-foreground">{equipment.familyProduct}</p>
                        </div>
                        <div>
                          <span className="font-medium">Quantidade:</span>
                          <p className="text-muted-foreground">{equipment.quantity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>}

          {/* Produtos da Venda Parcial */}
          {currentTask.prospectItems && currentTask.prospectItems.length > 0 && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Produtos da Venda Parcial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentTask.prospectItems.map((product, index) => (
                    <div key={product.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${product.selected ? 'bg-green-500 border-green-500' : 'border-muted-foreground'}`}>
                            {product.selected && <CheckSquare className="h-3 w-3 text-white" />}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">({product.category})</p>
                            {product.observations && <p className="text-xs text-muted-foreground">{product.observations}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          {product.quantity && <p className="text-sm">Qtd: {product.quantity}</p>}
                          {product.price && <p className="text-sm font-medium">R$ {product.price.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}</p>}
                          {product.selected && product.price && product.quantity && (
                            <p className="text-sm font-bold text-green-600">
                              Total: R$ {(product.price * product.quantity).toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Fotos do produto da venda parcial */}
                      {product.photos && product.photos.length > 0 && <div className="mt-3 pt-3 border-t">
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
                                      parent.removeChild(target);
                                      const errorDiv = document.createElement('div');
                                      errorDiv.className = 'w-full h-full flex flex-col items-center justify-center text-muted-foreground';
                                      
                                      const iconDiv = document.createElement('div');
                                      iconDiv.innerHTML = '📷';
                                      iconDiv.className = 'text-lg mb-1';
                                      
                                      const textSpan = document.createElement('span');
                                      textSpan.textContent = 'Imagem não disponível';
                                      textSpan.className = 'text-xs text-center';
                                      
                                      errorDiv.appendChild(iconDiv);
                                      errorDiv.appendChild(textSpan);
                                      parent.appendChild(errorDiv);
                                    }
                                  }} 
                                />
                              </div>
                            ))}
                          </div>
                        </div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>}

          {/* Lembretes */}
          {currentTask.reminders && currentTask.reminders.length > 0 && <Card>
              <CardHeader>
                <CardTitle>Lembretes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {currentTask.reminders.map((reminder, index) => <div key={index} className="flex items-center gap-3 p-2 border rounded">
                      <div className={`w-4 h-4 rounded border-2 ${reminder.completed ? 'bg-success border-success' : 'border-muted-foreground'}`} />
                      <div className="flex-1">
                        <p className="font-medium">{reminder.title}</p>
                        {reminder.description && <p className="text-sm text-muted-foreground">{reminder.description}</p>}
                        <p className="text-xs text-muted-foreground">
                          {format(reminder.date, "PPP", {
                      locale: ptBR
                    })} às {reminder.time}
                        </p>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>}

          {/* Vendas */}
          {currentTask.salesValue && currentTask.salesValue > 0 && <Card>
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
                    const totalValue = checklistTotal > 0 ? checklistTotal : currentTask.salesValue || 0;
                    return totalValue.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    });
                  })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Venda Realizada:</span>
                    <span className="text-lg font-bold text-success">
                      R$ {currentTask.salesConfirmed ? currentTask.salesValue.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  }) : '0,00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status :</span>
                    {(() => {
                  // Mesma lógica do getProspectStatus do Tasks.tsx
                  if (currentTask.isProspect) {
                    if (currentTask.salesConfirmed === true) {
                      return <Badge variant="success">Venda Realizada</Badge>;
                    } else if (currentTask.salesConfirmed === false) {
                      return <Badge variant="destructive">Venda Perdida</Badge>;
                    } else {
                      return <Badge variant="warning">Prospect</Badge>;
                    }
                  }
                  return <Badge variant="secondary">Não é Prospect</Badge>;
                })()}
                  </div>
                  {currentTask.prospectNotes && <div className="mt-4">
                      <span className="font-medium">Notas do Prospect:</span>
                      <p className="text-muted-foreground mt-1">{currentTask.prospectNotes}</p>
                    </div>}
                </div>
              </CardContent>
            </Card>}

          {/* Fotos */}
          {currentTask.photos && currentTask.photos.length > 0 && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Fotos ({currentTask.photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {currentTask.photos.map((photo, index) => <div key={index} className="aspect-square border rounded-lg overflow-hidden bg-muted">
                      <img src={photo} alt={`Foto ${index + 1} da tarefa`} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" onClick={() => window.open(photo, '_blank')} onError={e => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    // Safe DOM manipulation without innerHTML
                    parent.removeChild(target);
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'w-full h-full flex flex-col items-center justify-center text-muted-foreground';
                    
                    const iconDiv = document.createElement('div');
                    iconDiv.innerHTML = '📷'; // Safe emoji instead of HTML
                    iconDiv.className = 'text-2xl mb-2';
                    
                    const textSpan = document.createElement('span');
                    textSpan.textContent = 'Imagem não disponível';
                    textSpan.className = 'text-xs text-center';
                    
                    errorDiv.appendChild(iconDiv);
                    errorDiv.appendChild(textSpan);
                    parent.appendChild(errorDiv);
                  }
                }} />
                    </div>)}
                </div>
              </CardContent>
            </Card>}
        </div>
      </DialogContent>
    </Dialog>;
};