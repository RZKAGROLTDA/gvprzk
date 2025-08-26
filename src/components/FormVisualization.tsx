
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar, User, Building, Crop, Package, Camera, FileText, Download, Printer, Mail, Phone, Hash, AtSign, Car, Loader2 } from 'lucide-react';
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
import { Task } from "@/types/task";
import { useToast } from "@/hooks/use-toast";
import { useTaskDetails, useTasksOptimized } from '@/hooks/useTasksOptimized';
import { mapSalesStatus, getStatusLabel, getStatusColor } from '@/lib/taskStandardization';
import { getTaskTypeLabel, calculateTaskTotalValue } from './TaskFormCore';
import { generateTaskPDF } from './TaskPDFGenerator';

// TypeScript module declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface FormVisualizationProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export const FormVisualization: React.FC<FormVisualizationProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Carregar detalhes completos da task se necessário
  const needsDetailsLoading = task && (!task.checklist || task.checklist.length === 0 || !task.reminders || task.reminders.length === 0);
  const { data: taskDetails, isLoading: loadingDetails } = useTaskDetails(
    needsDetailsLoading ? task.id : null
  );
  
  
  
  // Usar task completa (com detalhes carregados) ou task original
  const fullTask = taskDetails || task;

  // Enhanced debug logging for equipment and products
  console.log('FormVisualization - Dados recebidos:', {
    taskId: task.id,
    checklist: fullTask?.checklist?.length || 0,
    hasEquipmentData: !!fullTask?.equipmentList,
    equipmentCount: fullTask?.equipmentList?.length || 0,
    familyProduct: fullTask?.familyProduct,
    equipmentQuantity: fullTask?.equipmentQuantity,
    equipmentList: fullTask?.equipmentList,
    propertyHectares: fullTask?.propertyHectares
  });


  // Usar função padronizada do TaskFormCore

  // Calculate sales status for display
  const salesStatus = mapSalesStatus(fullTask);

  // Usar função padronizada do TaskFormCore

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateTaskPDF(fullTask, calculateTaskTotalValue, getTaskTypeLabel);
      
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
    const subject = `Relatório de Oportunidade - ${fullTask?.client || 'Cliente'}`;
    const body = `Olá,\n\nSegue em anexo o relatório da oportunidade para o cliente ${fullTask?.client || 'N/A'}.\n\nDetalhes:\n- Propriedade: ${fullTask?.property || 'N/A'}\n- Responsável: ${fullTask?.responsible || 'N/A'}\n- Data: ${fullTask?.startDate ? format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}\n\nAtenciosamente,\n${fullTask?.responsible || 'Equipe'}`;
    
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  if (loadingDetails) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2">Carregando detalhes...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
                  Relatório Completo de Oportunidade
                </DialogTitle>
                <p className="text-lg text-muted-foreground mt-1">
                  Visualização detalhada de todas as informações
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="gradient" size="sm" onClick={generatePDF} disabled={isGeneratingPDF}>
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
                    <h2 className="text-2xl font-bold text-primary">{fullTask.client}</h2>
                    <p className="text-lg text-muted-foreground">{fullTask.property}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {fullTask.startTime} - {fullTask.endTime}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={`${getStatusColor(salesStatus)} text-lg px-4 py-2 border-2`}>
                    {getStatusLabel(salesStatus)}
                  </Badge>
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">Valor da Oportunidade</p>
                    <p className="text-2xl font-bold text-primary">
                      R$ {calculateTaskTotalValue(fullTask as any).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>

          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Informações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Tarefa</label>
                  <p className="font-medium">{getTaskTypeLabel(fullTask.taskType || 'prospection')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                  <p className="font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {fullTask.responsible}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Filial</label>
                  <p className="font-medium flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    {fullTask.filial || 'Não informado'}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data</label>
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Horário</label>
                  <p className="font-medium">{fullTask.startTime} - {fullTask.endTime}</p>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Informações do Cliente */}
              <div className="space-y-4">
                <h4 className="font-semibold text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Dados do Cliente
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Nome do Cliente</label>
                    <p className="font-medium">{fullTask.client}</p>
                  </div>
                  {fullTask.clientCode && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Código do Cliente</label>
                      <p className="font-medium flex items-center gap-2">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        {fullTask.clientCode}
                      </p>
                    </div>
                  )}
                  {fullTask.email && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="font-medium flex items-center gap-2">
                        <AtSign className="w-4 h-4 text-muted-foreground" />
                        {fullTask.email}
                      </p>
                    </div>
                  )}
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-muted-foreground">Propriedade</label>
                     <p className="font-medium">{fullTask.property}</p>
                   </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-muted-foreground">Hectares da Propriedade</label>
                     <p className="font-medium flex items-center gap-2">
                       <Crop className="w-4 h-4 text-success" />
                       {fullTask.propertyHectares ? `${fullTask.propertyHectares} ha` : 'Não informado'}
                     </p>
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações de Equipamentos */}
          {(fullTask.familyProduct || fullTask.equipmentQuantity || (fullTask.equipmentList && fullTask.equipmentList.length > 0)) && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Informações de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fullTask.familyProduct && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Família Principal do Produto</label>
                      <p className="font-medium flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        {fullTask.familyProduct}
                      </p>
                    </div>
                  )}
                  {fullTask.equipmentQuantity && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Quantidade Total de Equipamentos</label>
                      <p className="font-medium text-lg text-primary">
                        {fullTask.equipmentQuantity} equipamentos
                      </p>
                    </div>
                  )}
                </div>

                {fullTask.equipmentList && fullTask.equipmentList.length > 0 && (
                  <div className="mt-6">
                    <Separator className="mb-4" />
                    <h4 className="font-semibold text-lg mb-4">Lista Detalhada de Equipamentos</h4>
                    <div className="space-y-3">
                      {fullTask.equipmentList.map((equipment, index) => (
                        <div key={equipment.id || index} className="border rounded-lg p-4 bg-muted/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">Família do Produto</label>
                              <p className="font-medium text-primary">{equipment.familyProduct}</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                              <p className="font-medium text-lg">{equipment.quantity}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 p-4 bg-gradient-card rounded-lg border">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Total de Equipamentos Listados</p>
                        <p className="text-xl font-bold text-primary">
                          {fullTask.equipmentList.reduce((total, eq) => total + eq.quantity, 0)} equipamentos
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lista de Equipamentos */}
          {fullTask.equipmentList && fullTask.equipmentList.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Lista de Equipamentos
                </CardTitle>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Total de famílias de equipamentos:</span>
                  <Badge variant="outline" className="border text-xs">
                    {fullTask.equipmentList.length} famílias
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fullTask.equipmentList.map((equipment, index) => (
                    <div 
                      key={index} 
                      className="border rounded-lg p-4 bg-gradient-to-r from-primary/5 to-primary/2 border-primary/20"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg text-primary">
                            {equipment.familyProduct}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Família de equipamentos identificada
                          </p>
                        </div>
                        <Badge variant="default" className="bg-primary text-primary-foreground">
                          {equipment.quantity} {equipment.quantity === 1 ? 'unidade' : 'unidades'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <label className="text-sm font-medium text-muted-foreground">Família do Produto</label>
                          <p className="font-medium text-lg capitalize">{equipment.familyProduct.toLowerCase()}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <label className="text-sm font-medium text-muted-foreground">Quantidade Identificada</label>
                          <p className="font-bold text-xl text-primary">{equipment.quantity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Resumo Total dos Equipamentos */}
                  <div className="mt-6 p-4 bg-gradient-to-r from-secondary/10 to-secondary/5 rounded-lg border border-secondary/20">
                    <h4 className="font-semibold mb-3 text-secondary">Resumo dos Equipamentos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Famílias</p>
                        <p className="text-2xl font-bold text-secondary">
                          {fullTask.equipmentList.length}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total de Equipamentos</p>
                        <p className="text-2xl font-bold text-secondary">
                          {fullTask.equipmentList.reduce((sum, equipment) => sum + equipment.quantity, 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Produtos/Serviços - Visualização */}
          {((fullTask.checklist && fullTask.checklist.length > 0) || (fullTask.prospectItems && fullTask.prospectItems.length > 0)) && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {fullTask.taskType === 'ligacao' ? 'Produtos para Ofertar' : 'Produtos e Serviços'}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {fullTask.taskType === 'ligacao' 
                    ? 'Lista de produtos ofertados durante a ligação'
                    : 'Lista de produtos e serviços da oportunidade'
                  }
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Renderizar produtos do checklist (para visitas e checklists) */}
                  {fullTask.checklist && fullTask.checklist.map((item, index) => {
                    const itemTotal = (item.price || 0) * (item.quantity || 1);
                    
                    return (
                      <div 
                        key={item.id || index} 
                        className={`border rounded-lg p-4 ${
                          item.selected 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-muted/20 border-border'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-lg">
                                  {item.name}
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                  Categoria: <span className="font-medium">{item.category}</span>
                                </p>
                              </div>
                              <Badge 
                                variant={item.selected ? "default" : "outline"}
                                className={item.selected ? "bg-success text-success-foreground" : ""}
                              >
                                {item.selected ? '✓ Selecionado' : 'Não Selecionado'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Quantidade</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className="text-sm font-medium">
                                    {item.quantity || 1}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Preço Unitário</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className="text-sm font-medium">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: 'BRL' 
                                    }).format(item.price || 0)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Total</label>
                                <div className={`h-8 px-2 rounded-md border flex items-center justify-end ${
                                  item.selected 
                                    ? 'bg-green-100 border-green-300 text-green-700 font-bold' 
                                    : 'bg-gray-50 border-gray-200 text-gray-500'
                                }`}>
                                  <span className="text-sm font-medium">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: 'BRL' 
                                    }).format(itemTotal)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Status</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className={`text-sm font-medium ${item.selected ? 'text-success' : 'text-muted-foreground'}`}>
                                    {item.selected ? 'Incluído' : 'Não incluído'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {item.observations && (
                              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                                <label className="text-sm font-medium text-muted-foreground">Observações</label>
                                <p className="text-sm mt-1 text-foreground">{item.observations}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Renderizar produtos prospect (para ligações) */}
                  {fullTask.prospectItems && fullTask.prospectItems.map((item, index) => {
                    const itemTotal = (item.price || 0) * (item.quantity || 1);
                    
                    return (
                      <div 
                        key={item.id || `prospect-${index}`} 
                        className={`border rounded-lg p-4 ${
                          item.selected 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-muted/20 border-border'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-lg">
                                  {item.name}
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                  Categoria: <span className="font-medium">{item.category}</span>
                                </p>
                              </div>
                              <Badge 
                                variant={item.selected ? "default" : "outline"}
                                className={item.selected ? "bg-success text-success-foreground" : ""}
                              >
                                {item.selected ? '✓ Ofertado' : 'Não Ofertado'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Quantidade</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className="text-sm font-medium">
                                    {item.quantity || 1}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Preço Unitário</label>
                                <div className="h-8 px-2 rounded-md bg-muted border flex items-center">
                                  <span className="text-sm font-medium">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: 'BRL' 
                                    }).format(item.price || 0)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Total</label>
                                <div className={`h-8 px-2 rounded-md border flex items-center justify-end ${
                                  item.selected 
                                    ? 'bg-green-100 border-green-300 text-green-700 font-bold' 
                                    : 'bg-gray-50 border-gray-200 text-gray-500'
                                }`}>
                                  <span className="text-sm font-medium">
                                    {new Intl.NumberFormat('pt-BR', { 
                                      style: 'currency', 
                                      currency: 'BRL' 
                                    }).format(itemTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {item.observations && (
                              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                                <label className="text-sm font-medium text-muted-foreground">Observações</label>
                                <p className="text-sm mt-1 text-foreground">{item.observations}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <Separator className="my-6" />
                
                {/* Resumo dos Produtos */}
                <div className="bg-gradient-card rounded-lg p-6 border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">
                        {fullTask.taskType === 'ligacao' ? 'Produtos Ofertados' : 'Produtos Selecionados'}
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {(fullTask.checklist?.filter(item => item.selected).length || 0) + 
                         (fullTask.prospectItems?.filter(item => item.selected).length || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Valor Total</p>
                      <p className="text-3xl font-bold text-success">
                        R$ {calculateTaskTotalValue(fullTask as any).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fotos */}
          {fullTask.photos && fullTask.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Fotos Anexadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {fullTask.photos.map((photo, index) => (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden border">
                      <img 
                        src={photo} 
                        alt={`Foto ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => window.open(photo, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Localização */}
          {fullTask.checkInLocation && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Dados de Localização
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Coordenadas</label>
                    <p className="font-medium">
                      {fullTask.checkInLocation.lat}, {fullTask.checkInLocation.lng}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Data/Hora do Check-in</label>
                    <p className="font-medium">
                      {format(new Date(fullTask.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
                
                {/* Link para Google Maps */}
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href={`https://www.google.com/maps?q=${fullTask.checkInLocation.lat},${fullTask.checkInLocation.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Ver no Google Maps
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {fullTask.observations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Observações Adicionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{fullTask.observations}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações de Deslocamento */}
          {(fullTask.initialKm || fullTask.finalKm) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Informações de Deslocamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">KM Inicial</label>
                    <p className="font-medium text-lg">{fullTask.initialKm || 'Não informado'} km</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">KM Final</label>
                    <p className="font-medium text-lg">{fullTask.finalKm || 'Não informado'} km</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Total Percorrido</label>
                    <p className="font-bold text-lg text-primary">
                      {fullTask.initialKm && fullTask.finalKm 
                        ? `${fullTask.finalKm - fullTask.initialKm} km` 
                        : 'Não calculado'
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status da Oportunidade */}
          <Card className="border-primary/20 shadow-lg bg-gradient-to-r from-primary/5 via-white to-primary/5">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <span className="text-xl">Status da Oportunidade</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Status Principal */}
                <div className="text-center p-6 bg-gradient-card rounded-xl border border-primary/20">
                  <label className="text-sm font-medium text-muted-foreground block mb-3">Status Tarefa</label>
                  <Badge className={`${getStatusColor(salesStatus)} text-xl px-6 py-3 border-2 shadow-lg`}>
                    {getStatusLabel(salesStatus)}
                  </Badge>
                </div>

                {/* Informações em Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4" />
                      Data de Criação
                    </label>
                    <p className="font-semibold text-lg">
                      {format(new Date(fullTask.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                  
                  <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4" />
                      Última Atualização
                    </label>
                    <p className="font-semibold text-lg">
                      {format(new Date(fullTask.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>

                {/* Valores e Status de Venda */}
                {(fullTask.salesValue || fullTask.salesConfirmed !== undefined) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {fullTask.salesValue && (
                      <div className="p-4 bg-gradient-to-br from-success/10 to-success/5 rounded-lg border border-success/20">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                          <Package className="w-4 h-4" />
                          Valor de Venda Direto
                        </label>
                        <p className="font-bold text-2xl text-success">
                          R$ {fullTask.salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                    
                    {fullTask.salesConfirmed !== undefined && (
                      <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4" />
                          Status da Venda
                        </label>
                        <Badge variant={fullTask.salesConfirmed ? 'default' : 'destructive'} className="text-base px-4 py-2">
                          {fullTask.salesConfirmed ? '✓ Confirmada' : '✗ Não Confirmada'}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notas de Prospect */}
          {fullTask.prospectNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Notas de Prospecção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-blue-500">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{fullTask.prospectNotes}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lembretes */}
          {fullTask.reminders && fullTask.reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Lembretes Configurados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {fullTask.reminders.map((reminder, index) => (
                    <div key={reminder.id || index} className="border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{reminder.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{reminder.description}</p>
                          <div className="flex items-center gap-4 mt-3 text-sm">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{format(new Date(reminder.date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>{reminder.time}</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant={reminder.completed ? 'default' : 'secondary'} className="ml-4">
                          {reminder.completed ? 'Concluído' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documentos */}
          {fullTask.documents && fullTask.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Documentos Anexados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fullTask.documents.map((doc, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="flex-1 font-medium">Documento {index + 1}</span>
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc} target="_blank" rel="noopener noreferrer">
                          Visualizar
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
