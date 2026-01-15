import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  MapPin, Calendar, User, Building, Package, Camera, FileText, Download, 
  Printer, Mail, Phone, Hash, AtSign, Car, Loader2, CheckCircle, Clock, 
  TrendingUp, DollarSign, AlertTriangle, Target, ShoppingCart, Percent,
  MapPinned, Tag
} from 'lucide-react';
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
import { Task, ProductType } from "@/types/task";
import { useToast } from "@/hooks/use-toast";
import { useFiliais } from '@/hooks/useTasksOptimized';
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { mapSalesStatus, getStatusLabel, getStatusColor, getFilialNameRobust } from '@/lib/taskStandardization';
import { getTaskTypeLabel as getTaskTypeLabelCore, calculateTaskTotalValue } from './TaskFormCore';
import { generateTaskPDF } from './TaskPDFGenerator';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

interface TaskFormVisualizationProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export const TaskFormVisualization: React.FC<TaskFormVisualizationProps> = ({
  task: taskProp,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { data: filiais = [] } = useFiliais();

  // USAR EXATAMENTE A MESMA LÓGICA DO TaskEditModal - hook useTaskEditData
  const { data: taskEditData, loading: isLoadingDetails, error } = useTaskEditData(
    isOpen ? taskProp?.id || null : null
  );

  // Montar task a partir dos dados do hook (mesma lógica do TaskEditModal)
  const task = useMemo((): Task | null => {
    if (!taskEditData) {
      return taskProp;
    }

    // Mapear items para checklist (ProductType[])
    const mappedChecklist: ProductType[] = (taskEditData.items || []).map((item) => ({
      id: item.id,
      name: item.produto,
      category: (item.sku || 'other') as ProductType['category'],
      selected: item.qtd_vendida > 0,
      quantity: item.qtd_ofertada,
      price: item.preco_unit,
      observations: '',
      photos: [],
    }));

    return {
      id: taskEditData.id,
      name: taskEditData.name || '',
      client: taskEditData.cliente_nome,
      clientCode: taskEditData.clientCode,
      property: taskEditData.property || '',
      propertyHectares: taskEditData.propertyHectares,
      responsible: taskEditData.responsible || '',
      startDate: taskEditData.startDate ? new Date(taskEditData.startDate) : new Date(),
      endDate: taskEditData.endDate ? new Date(taskEditData.endDate) : new Date(),
      startTime: taskEditData.startTime || '',
      endTime: taskEditData.endTime || '',
      priority: (taskEditData.priority || 'medium') as Task['priority'],
      status: (taskProp?.status || 'pending') as Task['status'],
      taskType: (taskEditData.taskType || taskEditData.tipo || 'prospection') as Task['taskType'],
      observations: taskEditData.notas || taskEditData.observations || '',
      photos: taskProp?.photos || [],
      documents: taskProp?.documents || [],
      initialKm: taskProp?.initialKm || 0,
      finalKm: taskProp?.finalKm || 0,
      equipmentQuantity: taskEditData.equipmentQuantity,
      equipmentList: taskProp?.equipmentList,
      familyProduct: taskEditData.familyProduct,
      email: taskEditData.cliente_email,
      phone: taskEditData.phone,
      filial: taskEditData.filial,
      filialAtendida: taskEditData.filialAtendida,
      isProspect: !taskEditData.sales_confirmed,
      prospectNotes: taskProp?.prospectNotes,
      salesConfirmed: taskEditData.sales_confirmed,
      salesType: taskEditData.sales_type as Task['salesType'],
      salesValue: taskEditData.sales_value,
      partialSalesValue: taskEditData.partial_sales_value,
      checkInLocation: taskProp?.checkInLocation,
      createdAt: taskProp?.createdAt || new Date(),
      updatedAt: taskProp?.updatedAt || new Date(),
      createdBy: taskEditData.vendedor_id,
      checklist: mappedChecklist,
      reminders: taskProp?.reminders || [],
    };
  }, [taskEditData, taskProp]);

  // IMPORTANTE: hooks (ex.: useMemo) não podem ficar depois de returns condicionais.
  // Então, todos os cálculos com hooks ficam ANTES de qualquer early-return.
  const salesStatus = task ? mapSalesStatus(task) : 'prospect';

  const calculatedValues = useMemo(() => {
    if (!task) return { total: 0, closed: 0, partial: 0, products: 0 };

    const total = getSalesValueAsNumber(task.salesValue) || 0;
    const partial = task.partialSalesValue || 0;

    // Calculate from products if available
    let productsTotal = 0;
    let productsSelected = 0;

    if (task.checklist && task.checklist.length > 0) {
      task.checklist.forEach((item) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        productsTotal += itemTotal;
        if (item.selected) {
          productsSelected += itemTotal;
        }
      });
    }

    const closed =
      salesStatus === 'ganho'
        ? total || productsTotal
        : salesStatus === 'parcial'
          ? partial || productsSelected
          : 0;

    return {
      total: total || productsTotal,
      closed,
      partial: partial || productsSelected,
      products: productsTotal,
    };
  }, [task, salesStatus]);

  // Enquanto os produtos/itens (taskEditData.items) não terminaram de carregar,
  // não renderizar o dialog (evita o status “piscar” com dados do taskProp).
  const isWaitingForProducts = isOpen && taskProp && (!taskEditData || isLoadingDetails) && !error;
  if (isWaitingForProducts) {
    return null;
  }

  // Em caso de erro, exibir um dialog simples para permitir fechar.
  if (isOpen && taskProp && error) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erro ao carregar detalhes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  console.log('TaskFormVisualization - Dados carregados via useTaskEditData:', {
    taskId: taskProp?.id,
    hasTaskEditData: !!taskEditData,
    itemsCount: taskEditData?.items?.length || 0,
    salesType: taskEditData?.sales_type,
    salesConfirmed: taskEditData?.sales_confirmed,
    isLoadingDetails,
    error,
  });

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
    const statusLabel = getStatusLabel(salesStatus);
    const valorFormatado = calculatedValues.closed > 0 
      ? `R$ ${calculatedValues.closed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : calculatedValues.total > 0 
        ? `R$ ${calculatedValues.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (potencial)`
        : 'N/A';
    
    const subject = `Relatório de Oportunidade - ${task?.client || 'Cliente'} - ${statusLabel}`;
    const body = `Olá,

Segue o relatório da oportunidade:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 INFORMAÇÕES GERAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Cliente: ${task?.client || 'N/A'}
• Código: ${task?.clientCode || 'N/A'}
• Propriedade: ${task?.property || 'N/A'}
• Tipo: ${getTaskTypeLabel(task?.taskType || 'prospection')}
• Data: ${task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 STATUS DA VENDA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Status: ${statusLabel}
• Valor: ${valorFormatado}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 FILIAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Filial do Responsável: ${getFilialNameRobust(task?.filial, filiais)}
• Filial Atendida: ${task?.filialAtendida ? getFilialNameRobust(task.filialAtendida, filiais) : 'Mesma do responsável'}
• Responsável: ${task?.responsible || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 OBSERVAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${task?.observations || task?.prospectNotes || 'Nenhuma observação'}

Atenciosamente,
${task?.responsible || 'Equipe Comercial'}`;
    
    const mailtoLink = `mailto:${task?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  // Get status badge style
  const getStatusBadgeStyle = () => {
    switch (salesStatus) {
      case 'ganho':
        return 'bg-green-500 text-white hover:bg-green-600';
      case 'parcial':
        return 'bg-amber-500 text-white hover:bg-amber-600';
      case 'perdido':
        return 'bg-red-500 text-white hover:bg-red-600';
      default:
        return 'bg-blue-500 text-white hover:bg-blue-600';
    }
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-primary rounded-lg shadow-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Detalhes da Oportunidade
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {getTaskTypeLabel(task?.taskType || 'prospection')} • {task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="gradient" size="sm" onClick={handleGeneratePDF} disabled={isGeneratingPDF}>
                <Download className="w-4 h-4 mr-2" />
                {isGeneratingPDF ? 'Gerando...' : 'PDF'}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={handleEmail}>
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* STATUS E VALORES - Destaque Principal */}
          <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Status */}
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg border">
                  <Target className="w-8 h-8 text-primary mb-2" />
                  <span className="text-xs text-muted-foreground mb-1">Status</span>
                  <Badge className={`text-sm px-4 py-1 ${getStatusBadgeStyle()}`}>
                    {getStatusLabel(salesStatus)}
                  </Badge>
                </div>
                
                {/* Valor Potencial */}
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg border">
                  <TrendingUp className="w-8 h-8 text-blue-500 mb-2" />
                  <span className="text-xs text-muted-foreground mb-1">Valor Potencial</span>
                  <span className="text-lg font-bold text-blue-600">
                    {formatCurrency(calculatedValues.total)}
                  </span>
                </div>
                
                {/* Valor Fechado */}
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg border">
                  <DollarSign className="w-8 h-8 text-green-500 mb-2" />
                  <span className="text-xs text-muted-foreground mb-1">Valor Fechado</span>
                  <span className={`text-lg font-bold ${calculatedValues.closed > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {calculatedValues.closed > 0 ? formatCurrency(calculatedValues.closed) : '-'}
                  </span>
                </div>
                
                {/* Taxa de Conversão */}
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg border">
                  <Percent className="w-8 h-8 text-amber-500 mb-2" />
                  <span className="text-xs text-muted-foreground mb-1">Conversão</span>
                  <span className={`text-lg font-bold ${calculatedValues.total > 0 && calculatedValues.closed > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {calculatedValues.total > 0 && calculatedValues.closed > 0 
                      ? `${((calculatedValues.closed / calculatedValues.total) * 100).toFixed(0)}%`
                      : '-'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DADOS DO CLIENTE E FILIAL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cliente */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="w-5 h-5 text-primary" />
                  Dados do Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <p className="font-medium">{task?.client || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Código</Label>
                    <p className="font-medium">{task?.clientCode || 'N/A'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium text-sm truncate">{task?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Telefone</Label>
                    <p className="font-medium">{task?.phone || 'N/A'}</p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Propriedade</Label>
                    <p className="font-medium">{task?.property || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Hectares</Label>
                    <p className="font-medium">{task?.propertyHectares ? `${task.propertyHectares} ha` : 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filial e Responsável */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building className="w-5 h-5 text-primary" />
                  Filial e Responsável
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Responsável</Label>
                  <p className="font-medium">{task?.responsible || 'N/A'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Filial do Responsável</Label>
                    <p className="font-medium">{getFilialNameRobust(task?.filial, filiais)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Filial Atendida</Label>
                    <p className="font-medium">
                      {task?.filialAtendida 
                        ? getFilialNameRobust(task.filialAtendida, filiais)
                        : <span className="text-muted-foreground italic">Mesma do responsável</span>
                      }
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo de Atividade</Label>
                    <Badge variant="outline" className="mt-1">
                      {getTaskTypeLabel(task?.taskType || 'prospection')}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Prioridade</Label>
                    <Badge 
                      className="mt-1"
                      variant={task?.priority === 'high' ? 'destructive' : task?.priority === 'medium' ? 'default' : 'secondary'}
                    >
                      {task?.priority === 'high' ? 'Alta' : task?.priority === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* PRODUTOS E SERVIÇOS */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  Produtos e Serviços ({task?.checklist?.length || 0})
                </div>
                <Badge variant="outline" className="text-sm">
                  Total: {formatCurrency(calculatedValues.products)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Carregando produtos e serviços...
                </div>
              ) : task?.checklist && task.checklist.length > 0 ? (
                <>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted p-3 grid grid-cols-12 gap-2 font-medium text-xs">
                      <div className="col-span-1">Status</div>
                      <div className="col-span-4">Produto / Serviço</div>
                      <div className="col-span-2">Categoria</div>
                      <div className="col-span-1 text-center">Qtd</div>
                      <div className="col-span-2 text-right">Preço Unit.</div>
                      <div className="col-span-2 text-right">Subtotal</div>
                    </div>
                    {task.checklist.map((item, index) => {
                      const itemTotal = (item.price || 0) * (item.quantity || 1);
                      return (
                        <div
                          key={index}
                          className={`p-3 grid grid-cols-12 gap-2 border-t text-sm items-start ${
                            item.selected ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="col-span-1 pt-0.5">
                            {item.selected ? (
                              <CheckCircle className="w-5 h-5 text-primary" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                            )}
                          </div>
                          <div className="col-span-4">
                            <p className="font-medium leading-5">{item.name}</p>
                            {item.observations ? (
                              <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                                {item.observations}
                              </p>
                            ) : null}
                          </div>
                          <div className="col-span-2">
                            <Badge variant="secondary" className="text-xs">
                              {item.category}
                            </Badge>
                          </div>
                          <div className="col-span-1 text-center pt-0.5">{item.quantity || 1}</div>
                          <div className="col-span-2 text-right pt-0.5">{formatCurrency(item.price || 0)}</div>
                          <div className={`col-span-2 text-right font-medium pt-0.5 ${item.selected ? 'text-primary' : ''}`}>
                            {formatCurrency(itemTotal)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumo de Produtos */}
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg grid grid-cols-3 gap-4 text-center">
                    <div>
                      <span className="text-xs text-muted-foreground">Selecionados</span>
                      <p className="font-bold text-primary">
                        {task.checklist.filter(i => i.selected).length} de {task.checklist.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Valor Selecionado</span>
                      <p className="font-bold text-primary">
                        {formatCurrency(
                          task.checklist.reduce(
                            (sum, i) =>
                              i.selected ? sum + ((i.price || 0) * (i.quantity || 1)) : sum,
                            0
                          )
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Valor Total</span>
                      <p className="font-bold">{formatCurrency(calculatedValues.products)}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum produto/serviço cadastrado nesta atividade.
                </div>
              )}
            </CardContent>
          </Card>

          {/* EQUIPAMENTOS (se existirem) */}
          {(task?.familyProduct || task?.equipmentQuantity || (task?.equipmentList && task.equipmentList.length > 0)) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="w-5 h-5 text-primary" />
                  Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {task?.familyProduct && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Família Principal</Label>
                      <p className="font-medium">{task.familyProduct}</p>
                    </div>
                  )}
                  {task?.equipmentQuantity && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Quantidade Total</Label>
                      <p className="font-medium">{task.equipmentQuantity}</p>
                    </div>
                  )}
                </div>
                
                {task?.equipmentList && task.equipmentList.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted p-3 grid grid-cols-3 font-medium text-xs">
                      <div>Família do Produto</div>
                      <div className="text-center">Quantidade</div>
                      <div>ID</div>
                    </div>
                    {task.equipmentList.map((eq, index) => (
                      <div key={index} className="p-3 grid grid-cols-3 border-t text-sm">
                        <div>{eq.familyProduct || 'N/A'}</div>
                        <div className="text-center font-medium">{eq.quantity || 0}</div>
                        <div className="text-muted-foreground text-xs">{eq.id || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* OBSERVAÇÕES E NOTAS */}
          {(task?.observations || task?.prospectNotes) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-primary" />
                  Observações e Notas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {task?.observations && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Observações Gerais</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                      {task.observations}
                    </p>
                  </div>
                )}
                {task?.prospectNotes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notas de Prospecção</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                      {task.prospectNotes}
                    </p>
                  </div>
                )}
                {task?.prospectNotesJustification && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Justificativa</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                      {task.prospectNotesJustification}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* FOTOS */}
          {task?.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="w-5 h-5 text-primary" />
                  Fotos ({task.photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {task.photos.map((photo, index) => (
                    <a 
                      key={index} 
                      href={photo} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="aspect-square border rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                    >
                      <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* DOCUMENTOS */}
          {task?.documents && task.documents.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-primary" />
                  Documentos ({task.documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {task.documents.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium text-sm">Documento {index + 1}</span>
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

          {/* METADADOS */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Criado em: {task?.createdAt ? format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'}</span>
                <span>Atualizado em: {task?.updatedAt ? format(new Date(task.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'}</span>
                <span>ID: {task?.id?.substring(0, 8)}...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
