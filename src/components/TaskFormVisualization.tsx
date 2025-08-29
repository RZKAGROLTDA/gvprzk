
import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar, User, Building, Crop, Package, Camera, FileText, Download, Printer, Mail, Phone, Hash, AtSign, Car, Loader2, CheckSquare, CheckCircle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Task } from "@/types/task";
import { useToast } from "@/hooks/use-toast";
import { useFiliais } from '@/hooks/useTasksOptimized';
import { mapSalesStatus, getStatusLabel, getStatusColor, getFilialDisplayName } from '@/lib/taskStandardization';
import { getTaskTypeLabel, calculateTaskTotalValue } from './TaskFormCore';
import { generateTaskPDF } from './TaskPDFGenerator';

interface TaskFormVisualizationProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export const TaskFormVisualization: React.FC<TaskFormVisualizationProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { data: filiais = [] } = useFiliais();


  // Early return if no task is provided
  if (!task) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nenhuma tarefa selecionada</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-center text-muted-foreground">
            Selecione uma tarefa para visualizar os detalhes.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Calculate sales status for display usando a lógica padronizada
  const salesStatus = mapSalesStatus(task);

  const handleGeneratePDF = async () => {
    if (!task) return;
    
    setIsGeneratingPDF(true);
    try {
      await generateTaskPDF(task, calculateTaskTotalValue, getTaskTypeLabel);
      
      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado automaticamente.",
      });
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o arquivo. Verifique os dados e tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = () => {
    const subject = `Relatório de Oportunidade - ${task?.client || 'Cliente'}`;
    const body = `Olá,\n\nSegue em anexo o relatório da oportunidade para o cliente ${task?.client || 'N/A'}.\n\nDetalhes:\n- Tipo: ${getTaskTypeLabel(task?.taskType || 'prospection')}\n- Propriedade: ${task?.property || 'N/A'}\n- Responsável: ${task?.responsible || 'N/A'}\n- Data: ${task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}\n\nAtenciosamente,\n${task?.responsible || 'Equipe'}`;
    
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-primary rounded-lg shadow-lg">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <DialogTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Relatório de {getTaskTypeLabel(task?.taskType || 'prospection')}
                </DialogTitle>
                <p className="text-lg text-muted-foreground mt-1">
                  Visualização detalhada de todas as informações
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="gradient" size="sm" onClick={handleGeneratePDF} disabled={isGeneratingPDF}>
                <Download className="w-4 h-4 mr-2" />
                {isGeneratingPDF ? 'Gerando...' : 'Gerar PDF'}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} className="border-primary text-primary hover:bg-primary hover:text-white">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={handleEmail} className="border-primary text-primary hover:bg-primary hover:text-white">
                <Mail className="w-4 h-4 mr-2" />
                Enviar Email
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-8 pt-6">
          {/* Cabeçalho da Oportunidade com Dados Principais */}
          <Card className="border-primary shadow-lg bg-gradient-to-r from-primary/5 via-white to-primary/5">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <User className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary">{task?.client || 'Cliente não informado'}</h3>
                    <p className="text-lg text-muted-foreground">{task?.property || 'Propriedade não informada'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={getStatusColor(salesStatus) as any} className="text-lg px-4 py-2">
                    {getStatusLabel(salesStatus)}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    {task?.taskType && getTaskTypeLabel(task.taskType)}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="flex items-center gap-3">
                  <Hash className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Código</p>
                    <p className="font-medium">{task?.clientCode || 'N/A'}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <AtSign className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium text-sm">{task?.email || 'N/A'}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Building className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Filial</p>
                    <p className="font-medium">{getFilialDisplayName(task, filiais)}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Responsável</p>
                    <p className="font-medium">{task?.responsible || 'N/A'}</p>
                    {task?.filial && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Filial: {getFilialDisplayName(task, filiais)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Calendar className="w-6 h-6 text-primary" />
                Informações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-muted-foreground mb-3">Agendamento</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Data de Início:</span>
                      <span className="font-medium">
                        {task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Data de Fim:</span>
                      <span className="font-medium">
                        {task?.endDate ? format(new Date(task.endDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Horário:</span>
                      <span className="font-medium">{task?.startTime || 'N/A'} - {task?.endTime || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-muted-foreground mb-3">Status e Prioridade</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Prioridade:</span>
                      <Badge variant={task?.priority === 'high' ? 'destructive' : task?.priority === 'medium' ? 'default' : 'secondary'}>
                        {task?.priority === 'high' ? 'Alta' : task?.priority === 'medium' ? 'Média' : 'Baixa'}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Status da Tarefa:</span>
                      <Badge variant={
                        task?.status === 'completed' ? 'default' : 
                        task?.status === 'in_progress' ? 'secondary' : 
                        'outline'
                      }>
                        {task?.status === 'completed' ? 'Concluída' : 
                         task?.status === 'in_progress' ? 'Em Andamento' : 
                         task?.status === 'closed' ? 'Fechada' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dados do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <User className="w-6 h-6 text-primary" />
                Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-muted-foreground">Nome do Cliente</Label>
                    <p className="font-medium text-lg">{task?.client || 'Não informado'}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Código do Cliente</Label>
                    <p className="font-medium">{task?.clientCode || 'Não informado'}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-muted-foreground">Email</Label>
                    <p className="font-medium">{task?.email || 'Não informado'}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">CPF</Label>
                    <p className="font-medium">{task?.cpf || 'Não informado'}</p>
                  </div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm text-muted-foreground">Propriedade</Label>
                  <p className="font-medium text-lg">{task?.property || 'Não informada'}</p>
                </div>
                {task?.propertyHectares && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Hectares da Propriedade</Label>
                    <p className="font-medium">{task.propertyHectares} ha</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Informações de Equipamentos - apenas se existirem */}
          {(task?.familyProduct || task?.equipmentQuantity || (task?.equipmentList && task.equipmentList.length > 0)) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Package className="w-6 h-6 text-primary" />
                  Informações de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {task?.familyProduct && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Família Principal do Produto</Label>
                      <p className="font-medium text-lg">{task.familyProduct}</p>
                    </div>
                  )}
                  
                  {task?.equipmentQuantity && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Quantidade Total de Equipamentos</Label>
                      <p className="font-medium">{task.equipmentQuantity}</p>
                    </div>
                  )}
                  
                  {task?.equipmentList && task.equipmentList.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground mb-3 block">Lista Detalhada de Equipamentos</Label>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted p-3 grid grid-cols-3 font-medium text-sm">
                          <div>Família do Produto</div>
                          <div>Quantidade</div>
                          <div>ID</div>
                        </div>
                        {task.equipmentList.map((equipment, index) => (
                          <div key={index} className="p-3 grid grid-cols-3 border-t text-sm">
                            <div>{equipment.familyProduct || 'N/A'}</div>
                            <div>{equipment.quantity || 0}</div>
                            <div className="text-muted-foreground">{equipment.id || 'N/A'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Produtos/Serviços */}
          {((task?.checklist && task.checklist.length > 0) || (task?.prospectItems && task.prospectItems.length > 0)) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <CheckSquare className="w-6 h-6 text-primary" />
                  {task?.taskType === 'ligacao' ? 'Produtos para Ofertar' : 'Produtos/Serviços'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {task?.checklist && task.checklist.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Checklist de Produtos</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted p-3 grid grid-cols-6 font-medium text-sm">
                          <div>Produto</div>
                          <div>Categoria</div>
                          <div>Qtd</div>
                          <div>Preço Unit.</div>
                          <div>Total</div>
                          <div>Status</div>
                        </div>
                        {task.checklist.map((item, index) => (
                          <div key={index} className={`p-3 grid grid-cols-6 border-t text-sm ${item.selected ? 'bg-green-50' : ''}`}>
                            <div className="font-medium">{item.name}</div>
                            <div>{item.category}</div>
                            <div>{item.quantity || 1}</div>
                            <div>R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <div className="font-medium">R$ {((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <div>
                              <Badge variant={item.selected ? 'default' : 'secondary'}>
                                {item.selected ? 'SELECIONADO' : 'NÃO SELECIONADO'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {task?.prospectItems && task.prospectItems.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Produtos para Prospecção</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted p-3 grid grid-cols-6 font-medium text-sm">
                          <div>Produto</div>
                          <div>Categoria</div>
                          <div>Qtd</div>
                          <div>Preço Unit.</div>
                          <div>Total</div>
                          <div>Status</div>
                        </div>
                        {task.prospectItems.map((item, index) => (
                          <div key={index} className={`p-3 grid grid-cols-6 border-t text-sm ${item.selected ? 'bg-blue-50' : ''}`}>
                            <div className="font-medium">{item.name}</div>
                            <div>{item.category}</div>
                            <div>{item.quantity || 1}</div>
                            <div>R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <div className="font-medium">R$ {((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <div>
                              <Badge variant={item.selected ? 'default' : 'secondary'}>
                                {item.selected ? 'OFERTADO' : 'NÃO OFERTADO'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Valor Total */}
                  <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-medium">Valor Total:</span>
                      <span className="text-2xl font-bold text-primary">
                        R$ {calculateTaskTotalValue(task as any).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fotos em anexo */}
          {task?.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Camera className="w-6 h-6 text-primary" />
                  Fotos em Anexo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {task.photos.map((photo, index) => (
                    <div key={index} className="aspect-square border rounded-lg overflow-hidden">
                      <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Localização */}
          {task?.checkInLocation && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <MapPin className="w-6 h-6 text-primary" />
                  Dados de Localização
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Coordenadas</Label>
                      <p className="font-medium">
                        {task.checkInLocation.lat}, {task.checkInLocation.lng}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Data/Hora do Check-in</Label>
                      <p className="font-medium">
                        {format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  
                  <Button variant="outline" asChild className="w-full">
                    <a 
                      href={`https://www.google.com/maps?q=${task.checkInLocation.lat},${task.checkInLocation.lng}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2"
                    >
                      <MapPin className="w-4 h-4" />
                      Ver no Google Maps
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações Adicionais */}
          {task?.observations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  Observações Adicionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.observations}</p>
              </CardContent>
            </Card>
          )}

          {/* Informações de Deslocamento */}
          {(task?.initialKm !== undefined || task?.finalKm !== undefined) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Car className="w-6 h-6 text-primary" />
                  Informações de Deslocamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <Label className="text-sm text-muted-foreground">KM Inicial</Label>
                    <p className="font-medium text-lg">{task?.initialKm || 0} km</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">KM Final</Label>
                    <p className="font-medium text-lg">{task?.finalKm || 0} km</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Total Percorrido</Label>
                    <p className="font-medium text-lg text-primary">
                      {Math.max(0, (task?.finalKm || 0) - (task?.initialKm || 0))} km
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status da Oportunidade */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-primary" />
                Status da Oportunidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-muted-foreground">Status da Tarefa</Label>
                    <Badge className="ml-2" variant={
                      task?.status === 'completed' ? 'default' : 
                      task?.status === 'in_progress' ? 'secondary' : 
                      'outline'
                    }>
                      {task?.status === 'completed' ? 'Concluída' : 
                       task?.status === 'in_progress' ? 'Em Andamento' : 
                       task?.status === 'closed' ? 'Fechada' : 'Pendente'}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Criado em</Label>
                    <p className="font-medium">
                      {task?.createdAt ? format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-muted-foreground">Valor da Venda</Label>
                    <p className="font-medium text-lg text-primary">
                      R$ {calculateTaskTotalValue(task as any).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Última atualização</Label>
                    <p className="font-medium">
                      {task?.updatedAt ? format(new Date(task.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notas de Prospecção */}
          {task?.prospectNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  Notas de Prospecção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.prospectNotes}</p>
              </CardContent>
            </Card>
          )}

          {/* Lembretes Configurados */}
          {task?.reminders && task.reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Clock className="w-6 h-6 text-primary" />
                  Lembretes Configurados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {task.reminders.map((reminder, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{reminder.title}</h4>
                        <Badge variant={reminder.completed ? 'default' : 'secondary'}>
                          {reminder.completed ? 'Concluído' : 'Pendente'}
                        </Badge>
                      </div>
                      {reminder.description && (
                        <p className="text-sm text-muted-foreground mb-2">{reminder.description}</p>
                      )}
                      <div className="text-sm">
                        <span className="text-muted-foreground">Data: </span>
                        <span className="font-medium">
                          {reminder.date ? format(new Date(reminder.date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'} às {reminder.time || 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documentos Anexados */}
          {task?.documents && task.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  Documentos Anexados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {task.documents.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        <span className="font-medium">Documento {index + 1}</span>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc} target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4 mr-2" />
                          Baixar
                        </a>
                      </Button>
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
