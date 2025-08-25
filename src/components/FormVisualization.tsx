import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar, User, Building, Crop, Package, Camera, FileText, Download, Printer, Mail, Phone, Hash, AtSign, Car } from 'lucide-react';
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
    if (task.salesValue) return task.salesValue;
    
    let total = 0;
    if (task.checklist) {
      total += task.checklist
        .filter(item => item.selected)
        .reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    }
    if (task.prospectItems) {
      total += task.prospectItems
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
        ['Tipo de Tarefa:', getTaskTypeLabel(task.taskType || 'prospection')],
        ['Cliente:', task.client],
        ['Código do Cliente:', task.clientCode || 'Não informado'],
        ['Email:', task.email || 'Não informado'],
        ['CPF:', task.cpf || 'Não informado'],
        ['Propriedade:', task.property],
        ['Hectares:', task.propertyHectares ? `${task.propertyHectares} ha` : 'Não informado'],
        ['Responsável:', task.responsible],
        ['Filial:', task.filial || 'Não informado'],
        ['Data:', format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })],
        ['Horário:', `${task.startTime} - ${task.endTime}`],
        ['Status:', getStatusLabel(task.salesType || 'prospect')]
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
      if (task.familyProduct || task.equipmentQuantity || (task.equipmentList && task.equipmentList.length > 0)) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('INFORMAÇÕES DE EQUIPAMENTOS', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        if (task.familyProduct) {
          pdf.text(`Família Principal do Produto: ${task.familyProduct}`, 20, yPosition);
          yPosition += 5;
        }
        
        if (task.equipmentQuantity) {
          pdf.text(`Quantidade Total de Equipamentos: ${task.equipmentQuantity}`, 20, yPosition);
          yPosition += 5;
        }
        
        if (task.equipmentList && task.equipmentList.length > 0) {
          yPosition += 5;
          pdf.setFont('helvetica', 'bold');
          pdf.text('Lista Detalhada de Equipamentos:', 20, yPosition);
          yPosition += 5;
          
          const equipmentData = task.equipmentList.map(eq => [
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
          
          const totalEquipment = task.equipmentList.reduce((total, eq) => total + eq.quantity, 0);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`Total de Equipamentos Listados: ${totalEquipment}`, 20, yPosition);
          yPosition += 15;
        } else {
          yPosition += 10;
        }
      }
      
      // Produtos/Serviços
      if (task.checklist && task.checklist.length > 0) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PRODUTOS/SERVIÇOS', 20, yPosition);
        yPosition += 10;
        
        const products = task.checklist.map(item => [
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
      
      // Observações
      if (task.observations) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('OBSERVAÇÕES', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const splitText = pdf.splitTextToSize(task.observations, pageWidth - 40);
        pdf.text(splitText, 20, yPosition);
        yPosition += splitText.length * 5 + 10;
      }
      
      // Localização
      if (task.checkInLocation) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('LOCALIZAÇÃO', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Latitude: ${task.checkInLocation.lat}`, 20, yPosition);
        yPosition += 5;
        pdf.text(`Longitude: ${task.checkInLocation.lng}`, 20, yPosition);
        yPosition += 5;
        // Note: address property may not exist in this location type
        pdf.text(`Data/Hora: ${format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, yPosition);
      }
      
      // Rodapé
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, pdf.internal.pageSize.height - 20);
      
      // Salvar PDF
      pdf.save(`oportunidade-${task.client.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
      
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
    const subject = `Relatório de Oportunidade - ${task.client}`;
    const body = `Olá,\n\nSegue em anexo o relatório da oportunidade para o cliente ${task.client}.\n\nDetalhes:\n- Propriedade: ${task.property}\n- Responsável: ${task.responsible}\n- Data: ${format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })}\n\nAtenciosamente,\n${task.responsible}`;
    
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-primary">
              Visualização Completa do Formulário
            </DialogTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generatePDF} disabled={isGeneratingPDF}>
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

        <div className="space-y-6">
          {/* Cabeçalho da Oportunidade */}
          <Card className="border-primary">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{task.client}</h3>
                    <p className="text-sm text-muted-foreground">{task.property}</p>
                  </div>
                </div>
                <Badge className={`${getStatusColor(task.salesType || 'prospect')} text-sm px-3 py-1 border`}>
                  {getStatusLabel(task.salesType || 'prospect')}
                </Badge>
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
                  <p className="font-medium">{getTaskTypeLabel(task.taskType || 'prospection')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                  <p className="font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {task.responsible}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Filial</label>
                  <p className="font-medium flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    {task.filial || 'Não informado'}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data</label>
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Horário</label>
                  <p className="font-medium">{task.startTime} - {task.endTime}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Hectares da Propriedade</label>
                  <p className="font-medium flex items-center gap-2">
                    <Crop className="w-4 h-4 text-success" />
                    {task.propertyHectares ? `${task.propertyHectares} ha` : 'Não informado'}
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
                    <p className="font-medium">{task.client}</p>
                  </div>
                  {task.clientCode && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Código do Cliente</label>
                      <p className="font-medium flex items-center gap-2">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        {task.clientCode}
                      </p>
                    </div>
                  )}
                  {task.email && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="font-medium flex items-center gap-2">
                        <AtSign className="w-4 h-4 text-muted-foreground" />
                        {task.email}
                      </p>
                    </div>
                  )}
                  {task.cpf && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">CPF</label>
                      <p className="font-medium">{task.cpf}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Propriedade</label>
                    <p className="font-medium">{task.property}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações de Equipamentos */}
          {(task.familyProduct || task.equipmentQuantity || (task.equipmentList && task.equipmentList.length > 0)) && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Informações de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {task.familyProduct && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Família Principal do Produto</label>
                      <p className="font-medium flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        {task.familyProduct}
                      </p>
                    </div>
                  )}
                  {task.equipmentQuantity && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Quantidade Total de Equipamentos</label>
                      <p className="font-medium text-lg text-primary">
                        {task.equipmentQuantity} equipamentos
                      </p>
                    </div>
                  )}
                </div>

                {task.equipmentList && task.equipmentList.length > 0 && (
                  <div className="mt-6">
                    <Separator className="mb-4" />
                    <h4 className="font-semibold text-lg mb-4">Lista Detalhada de Equipamentos</h4>
                    <div className="space-y-3">
                      {task.equipmentList.map((equipment, index) => (
                        <div key={equipment.id || index} className="border rounded-lg p-4 bg-muted/30">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">Família do Produto</label>
                              <p className="font-medium text-primary">{equipment.familyProduct}</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                              <p className="font-medium text-lg">{equipment.quantity}</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-muted-foreground">ID do Equipamento</label>
                              <p className="font-mono text-sm text-muted-foreground">{equipment.id}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 p-4 bg-gradient-card rounded-lg border">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Total de Equipamentos Listados</p>
                        <p className="text-xl font-bold text-primary">
                          {task.equipmentList.reduce((total, eq) => total + eq.quantity, 0)} equipamentos
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Produtos/Serviços */}
          {task.checklist && task.checklist.length > 0 && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Família de Produtos e Oportunidades
                </CardTitle>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Status atual:</span>
                  <Badge className={`${getStatusColor(task.salesType || 'prospect')} border text-xs`}>
                    {getStatusLabel(task.salesType || 'prospect')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {task.checklist.map((item, index) => {
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
                      <p className="text-2xl font-bold text-foreground">{task.checklist.length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Produtos Selecionados</p>
                      <p className="text-2xl font-bold text-primary">
                        {task.checklist.filter(item => item.selected).length}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">
                        {task.salesType === 'prospect' ? 'Valor Potencial Total' : 'Valor da Oportunidade'}
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
          {task.photos && task.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Fotos Anexadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {task.photos.map((photo, index) => (
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
          {task.checkInLocation && (
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
                      {task.checkInLocation.lat}, {task.checkInLocation.lng}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Data/Hora do Check-in</label>
                    <p className="font-medium">
                      {format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
                
                {/* Link para Google Maps */}
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href={`https://www.google.com/maps?q=${task.checkInLocation.lat},${task.checkInLocation.lng}`}
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
          {task.observations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Observações Adicionais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.observations}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações de Deslocamento */}
          {(task.initialKm || task.finalKm) && (
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
                    <p className="font-medium text-lg">{task.initialKm || 'Não informado'} km</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">KM Final</label>
                    <p className="font-medium text-lg">{task.finalKm || 'Não informado'} km</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Total Percorrido</label>
                    <p className="font-bold text-lg text-primary">
                      {task.initialKm && task.finalKm 
                        ? `${task.finalKm - task.initialKm} km` 
                        : 'Não calculado'
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};