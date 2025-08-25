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
import { useTaskDetails } from '@/hooks/useTasksOptimized';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface FormVisualizationProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

export const FormVisualization: React.FC<FormVisualizationProps> = ({
  task,
  isOpen,
  onClose
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Carregar detalhes completos da task se necessário
  const { data: taskDetails, isLoading: loadingDetails } = useTaskDetails(
    task && (!task.checklist?.length || !task.reminders?.length) ? task.id : null
  );
  
  // Usar task completa (com detalhes carregados) ou task original
  const fullTask = taskDetails || task;

  const getTaskTypeLabel = (type: string) => {
    const types = {
      'prospection': 'Prospecção',
      'field_visit': 'Visita de Campo',
      'workshop_checklist': 'Checklist de Oficina',
      'call': 'Ligação'
    };
    return types[type as keyof typeof types] || type;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      'prospect': 'bg-primary/10 text-primary border-primary/20',
      'ganho': 'bg-success/10 text-success border-success/20',
      'perdido': 'bg-destructive/10 text-destructive border-destructive/20',
      'parcial': 'bg-warning/10 text-warning border-warning/20'
    };
    return colors[status as keyof typeof colors] || 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      'prospect': 'Prospecção',
      'ganho': 'Venda Confirmada',
      'perdido': 'Oportunidade Perdida',
      'parcial': 'Venda Parcial'
    };
    return labels[status as keyof typeof labels] || status;
  };

  const calculateTotalValue = () => {
    if (fullTask.salesValue) return fullTask.salesValue;
    
    let total = 0;
    if (fullTask.checklist) {
      total += fullTask.checklist
        .filter(item => item.selected)
        .reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    }
    if (fullTask.prospectItems) {
      total += fullTask.prospectItems
        .filter(item => item.selected)
        .reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    }
    return total;
  };

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.width;
      
      // Cabeçalho
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RELATÓRIO DE OPORTUNIDADE', pageWidth / 2, 20, { align: 'center' });
      
      // Linha separadora
      pdf.setLineWidth(0.5);
      pdf.line(20, 25, pageWidth - 20, 25);
      
      let yPosition = 35;
      
      // Informações básicas
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INFORMAÇÕES GERAIS', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      
        const basicInfo = [
          ['Tipo de Tarefa:', getTaskTypeLabel(fullTask.taskType || 'prospection')],
          ['Cliente:', fullTask.client],
          ['Código do Cliente:', fullTask.clientCode || 'Não informado'],
          ['Email:', fullTask.email || 'Não informado'],
          ['CPF:', fullTask.cpf || 'Não informado'],
          ['Propriedade:', fullTask.property],
          ['Hectares:', fullTask.propertyHectares ? `${fullTask.propertyHectares} ha` : 'Não informado'],
          ['Responsável:', fullTask.responsible],
          ['Filial:', fullTask.filial || 'Não informado'],
          ['Data:', format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR })],
          ['Horário:', `${fullTask.startTime} - ${fullTask.endTime}`],
          ['Status:', getStatusLabel(fullTask.salesType || 'prospect')]
        ];
      
      (pdf as any).autoTable({
        startY: yPosition,
        body: basicInfo,
        columns: [
          { header: 'Campo', dataKey: 0 },
          { header: 'Valor', dataKey: 1 }
        ],
        margin: { left: 20, right: 20 },
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
      });
      
      yPosition = (pdf as any).lastAutoTable.finalY + 15;
      
      // Informações de Equipamentos
      if (fullTask.familyProduct || fullTask.equipmentQuantity || (fullTask.equipmentList && fullTask.equipmentList.length > 0)) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('INFORMAÇÕES DE EQUIPAMENTOS', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        if (fullTask.familyProduct) {
          pdf.text(`Família Principal do Produto: ${fullTask.familyProduct}`, 20, yPosition);
          yPosition += 5;
        }
        
        if (fullTask.equipmentQuantity) {
          pdf.text(`Quantidade Total de Equipamentos: ${fullTask.equipmentQuantity}`, 20, yPosition);
          yPosition += 5;
        }
        
        if (fullTask.equipmentList && fullTask.equipmentList.length > 0) {
          yPosition += 5;
          pdf.setFont('helvetica', 'bold');
          pdf.text('Lista Detalhada de Equipamentos:', 20, yPosition);
          yPosition += 5;
          
          const equipmentData = fullTask.equipmentList.map(eq => [
            eq.familyProduct,
            eq.quantity.toString(),
            eq.id
          ]);
          
          (pdf as any).autoTable({
            startY: yPosition,
            head: [['Família do Produto', 'Quantidade', 'ID']],
            body: equipmentData,
            margin: { left: 20, right: 20 },
            styles: { fontSize: 9 },
            headStyles: { fillColor: [51, 122, 183] }
          });
          
          yPosition = (pdf as any).lastAutoTable.finalY + 10;
          
          const totalEquipment = fullTask.equipmentList.reduce((total, eq) => total + eq.quantity, 0);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`Total de Equipamentos Listados: ${totalEquipment}`, 20, yPosition);
          yPosition += 15;
        } else {
          yPosition += 10;
        }
      }
      
      // Produtos/Serviços
      if (fullTask.checklist && fullTask.checklist.length > 0) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PRODUTOS/SERVIÇOS', 20, yPosition);
        yPosition += 10;
        
        const products = fullTask.checklist.map(item => [
          item.name,
          item.category,
          item.quantity || 1,
          `R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          item.selected ? 'SELECIONADO' : 'NÃO SELECIONADO',
          item.observations || '-'
        ]);
        
        (pdf as any).autoTable({
          startY: yPosition,
          head: [['Produto', 'Categoria', 'Qtd', 'Preço Unit.', 'Total', 'Status', 'Observações']],
          body: products,
          margin: { left: 20, right: 20 },
          styles: { fontSize: 7 },
          headStyles: { fillColor: [51, 122, 183] },
          columnStyles: { 
            5: { fontStyle: 'bold' },
            6: { cellWidth: 30 }
          }
        });
        
        yPosition = (pdf as any).lastAutoTable.finalY + 15;
      }
      
      // Valor total
      const totalValue = calculateTotalValue();
      if (totalValue > 0) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`VALOR TOTAL: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, yPosition);
        yPosition += 15;
      }
      
      // Lembretes configurados
      if (fullTask.reminders && fullTask.reminders.length > 0) {
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('LEMBRETES CONFIGURADOS', 20, yPosition);
        yPosition += 10;
        
        const remindersData = fullTask.reminders.map(reminder => [
          reminder.title,
          reminder.description || '',
          format(new Date(reminder.date), 'dd/MM/yyyy', { locale: ptBR }),
          reminder.time,
          reminder.completed ? 'Concluído' : 'Pendente'
        ]);
        
        (pdf as any).autoTable({
          startY: yPosition,
          head: [['Título', 'Descrição', 'Data', 'Horário', 'Status']],
          body: remindersData,
          margin: { left: 20, right: 20 },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [51, 122, 183] }
        });
        
        yPosition = (pdf as any).lastAutoTable.finalY + 15;
      }
      
      // Documentos anexados
      if (fullTask.documents && fullTask.documents.length > 0) {
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('DOCUMENTOS ANEXADOS', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        fullTask.documents.forEach((doc, index) => {
          pdf.text(`${index + 1}. Documento anexado`, 20, yPosition);
          yPosition += 5;
        });
        
        yPosition += 10;
      }
      
      // Fotos da visita
      if (fullTask.photos && fullTask.photos.length > 0) {
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = 20;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('FOTOS DA VISITA', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Total de fotos anexadas: ${fullTask.photos.length}`, 20, yPosition);
        yPosition += 10;
      }
      
      // Observações
      if (fullTask.observations) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('OBSERVAÇÕES', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const splitText = pdf.splitTextToSize(fullTask.observations, pageWidth - 40);
        pdf.text(splitText, 20, yPosition);
        yPosition += splitText.length * 5 + 10;
      }
      
      // Localização
      if (fullTask.checkInLocation) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('LOCALIZAÇÃO', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Latitude: ${fullTask.checkInLocation.lat}`, 20, yPosition);
        yPosition += 5;
        pdf.text(`Longitude: ${fullTask.checkInLocation.lng}`, 20, yPosition);
        yPosition += 5;
        // Note: address property may not exist in this location type
        pdf.text(`Data/Hora: ${format(new Date(fullTask.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, yPosition);
      }
      
      // Rodapé
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, pdf.internal.pageSize.height - 20);
      
      // Salvar PDF
      pdf.save(`oportunidade-${fullTask.client.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
      
      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado automaticamente.",
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o arquivo.",
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
    const subject = `Relatório de Oportunidade - ${fullTask.client}`;
    const body = `Olá,\n\nSegue em anexo o relatório da oportunidade para o cliente ${fullTask.client}.\n\nDetalhes:\n- Propriedade: ${fullTask.property}\n- Responsável: ${fullTask.responsible}\n- Data: ${format(new Date(fullTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}\n\nAtenciosamente,\n${fullTask.responsible}`;
    
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
                  <Badge className={`${getStatusColor(fullTask.salesType || 'prospect')} text-lg px-4 py-2 border-2`}>
                    {getStatusLabel(fullTask.salesType || 'prospect')}
                  </Badge>
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">Valor da Oportunidade</p>
                    <p className="text-2xl font-bold text-primary">
                      R$ {calculateTotalValue().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Hectares da Propriedade</label>
                  <p className="font-medium flex items-center gap-2">
                    <Crop className="w-4 h-4 text-success" />
                    {fullTask.propertyHectares ? `${fullTask.propertyHectares} ha` : 'Não informado'}
                  </p>
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
                  {fullTask.cpf && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">CPF</label>
                      <p className="font-medium">{fullTask.cpf}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Propriedade</label>
                    <p className="font-medium">{fullTask.property}</p>
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

          {/* Produtos/Serviços */}
          {fullTask.checklist && fullTask.checklist.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Família de Produtos e Oportunidades
                </CardTitle>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Status atual:</span>
                  <Badge className={`${getStatusColor(fullTask.salesType || 'prospect')} border text-xs`}>
                    {getStatusLabel(fullTask.salesType || 'prospect')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {fullTask.checklist.map((item, index) => {
                    const isSelected = item.selected;
                    const itemTotal = (item.price || 0) * (item.quantity || 1);
                    
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-4 transition-all ${
                          isSelected 
                            ? 'bg-primary/5 border-primary/30 shadow-sm' 
                            : 'bg-muted/30 border-border'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className={`font-semibold text-lg ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                              {item.name}
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              Categoria: <span className="font-medium">{item.category}</span>
                            </p>
                          </div>
                          <Badge 
                            variant={isSelected ? 'default' : 'secondary'} 
                            className={`ml-4 ${
                              isSelected 
                                ? 'bg-success text-success-foreground' 
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isSelected ? '✓ Selecionado' : '○ Disponível'}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                            <p className="font-medium text-lg">{item.quantity || 1}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Preço Unitário</label>
                            <p className="font-medium text-lg">
                              R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">
                              {isSelected ? 'Valor Confirmado' : 'Valor Potencial'}
                            </label>
                            <p className={`font-bold text-xl ${
                              isSelected ? 'text-success' : 'text-muted-foreground'
                            }`}>
                              R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                        
                        {item.observations && (
                          <div className="mt-4 p-3 bg-muted/50 rounded-md">
                            <label className="text-sm font-medium text-muted-foreground">Observações do Produto</label>
                            <p className="text-sm mt-1 text-foreground">{item.observations}</p>
                          </div>
                        )}
                        
                        {item.photos && item.photos.length > 0 && (
                          <div className="mt-4">
                            <label className="text-sm font-medium text-muted-foreground mb-2 block">Fotos do Produto</label>
                            <div className="flex gap-2">
                              {item.photos.map((photo, photoIndex) => (
                                <img 
                                  key={photoIndex}
                                  src={photo} 
                                  alt={`Foto ${photoIndex + 1} - ${item.name}`}
                                  className="w-16 h-16 object-cover rounded border cursor-pointer hover:scale-105 transition-transform"
                                  onClick={() => window.open(photo, '_blank')}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <Separator className="my-6" />
                
                {/* Resumo de Valores */}
                <div className="bg-gradient-card rounded-lg p-6 border">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Produtos Totais</p>
                      <p className="text-2xl font-bold text-foreground">{fullTask.checklist.length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Produtos Selecionados</p>
                      <p className="text-2xl font-bold text-primary">
                        {fullTask.checklist.filter(item => item.selected).length}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">
                        {fullTask.salesType === 'prospect' ? 'Valor Potencial Total' : 'Valor da Oportunidade'}
                      </p>
                      <p className="text-3xl font-bold text-primary">
                        R$ {calculateTotalValue().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Status da Oportunidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Resultado</label>
                  <Badge className={`${getStatusColor(fullTask.salesType || 'prospect')} text-lg px-4 py-2 border-2`}>
                    {getStatusLabel(fullTask.salesType || 'prospect')}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data de Criação</label>
                  <p className="font-medium">
                    {format(new Date(fullTask.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Última Atualização</label>
                  <p className="font-medium">
                    {format(new Date(fullTask.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
                {fullTask.salesValue && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Valor de Venda Direto</label>
                    <p className="font-bold text-lg text-success">
                      R$ {fullTask.salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
                {fullTask.salesConfirmed !== undefined && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Status da Venda</label>
                    <Badge variant={fullTask.salesConfirmed ? 'default' : 'destructive'} className="text-sm">
                      {fullTask.salesConfirmed ? 'Confirmada' : 'Não Confirmada'}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Produtos Oferecidos */}
          {fullTask.prospectItems && fullTask.prospectItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Produtos Oferecidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fullTask.prospectItems.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-muted/30">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-muted-foreground">Produto</label>
                          <p className="font-medium text-primary">{item.name}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-muted-foreground">Categoria</label>
                          <p className="font-medium">{item.category}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                          <p className="font-medium text-lg">{item.quantity || 1}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-muted-foreground">Valor Total</label>
                          <p className="font-bold text-lg text-primary">
                            R$ {((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        {item.observations && (
                          <div className="md:col-span-4 space-y-1">
                            <label className="text-sm font-medium text-muted-foreground">Observações</label>
                            <p className="text-sm bg-muted/50 p-2 rounded">{item.observations}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="mt-4 p-4 bg-gradient-card rounded-lg border">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Valor Total dos Produtos Oferecidos</p>
                      <p className="text-2xl font-bold text-primary">
                        R$ {fullTask.prospectItems
                          .reduce((total, item) => total + ((item.price || 0) * (item.quantity || 1)), 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Itens de Prospect */}
          {fullTask.prospectItems && fullTask.prospectItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Itens de Prospecção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {fullTask.prospectItems.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-blue-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Nome</label>
                          <p className="font-medium">{item.name}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Categoria</label>
                          <p className="font-medium">{item.category}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                          <p className="font-medium">{item.quantity || 1}</p>
                        </div>
                        {item.price && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Preço</label>
                            <p className="font-medium">R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        )}
                        {item.observations && (
                          <div className="md:col-span-3">
                            <label className="text-sm font-medium text-muted-foreground">Observações</label>
                            <p className="text-sm">{item.observations}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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