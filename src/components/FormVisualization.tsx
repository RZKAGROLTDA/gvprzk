import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar, User, Building, Crop, Package, Camera, FileText, Download, Printer, Mail } from 'lucide-react';
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
      'prospect': 'bg-blue-100 text-blue-800',
      'ganho': 'bg-green-100 text-green-800',
      'perdido': 'bg-red-100 text-red-800',
      'parcial': 'bg-yellow-100 text-yellow-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
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
        ['Propriedade:', task.property],
        ['Responsável:', task.responsible],
        ['Filial:', task.filial || 'Não informado'],
        ['Data:', format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })],
        ['Horário:', `${task.startTime} - ${task.endTime}`],
        ['Hectares:', task.propertyHectares ? `${task.propertyHectares} ha` : 'Não informado'],
        ['Status:', task.salesType || 'Prospect']
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
          item.selected ? 'Sim' : 'Não'
        ]);
        
        (pdf as any).autoTable({
          startY: yPosition,
          head: [['Produto', 'Categoria', 'Qtd', 'Preço Unit.', 'Total', 'Selecionado']],
          body: products,
          margin: { left: 20, right: 20 },
          styles: { fontSize: 8 },
          headStyles: { fillColor: [51, 122, 183] }
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
                <Badge className={`${getStatusColor(task.salesType || 'prospect')} text-sm px-3 py-1`}>
                  {task.salesType || 'Prospect'}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Tarefa</label>
                  <p className="font-medium">{getTaskTypeLabel(task.taskType || 'prospection')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Responsável</label>
                  <p className="font-medium">{task.responsible}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Filial</label>
                  <p className="font-medium">{task.filial || 'Não informado'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data</label>
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Horário</label>
                  <p className="font-medium">{task.startTime} - {task.endTime}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Hectares</label>
                  <p className="font-medium flex items-center gap-2">
                    <Crop className="w-4 h-4" />
                    {task.propertyHectares ? `${task.propertyHectares} ha` : 'Não informado'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Produtos/Serviços */}
          {task.checklist && task.checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Família de Produtos e Oportunidades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {task.checklist.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg">{item.name}</h4>
                          <p className="text-sm text-muted-foreground mb-2">Categoria: {item.category}</p>
                        </div>
                        <Badge variant={item.selected ? 'default' : 'secondary'} className="ml-4">
                          {item.selected ? 'Selecionado' : 'Não selecionado'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                          <p className="font-medium">{item.quantity || 1}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Preço Unitário</label>
                          <p className="font-medium">R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Total</label>
                          <p className="font-semibold text-primary">
                            R$ {((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      
                      {item.observations && (
                        <div className="mt-3">
                          <label className="text-sm font-medium text-muted-foreground">Observações</label>
                          <p className="text-sm mt-1">{item.observations}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <Separator className="my-4" />
                
                <div className="flex justify-end">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Valor Total da Oportunidade</p>
                    <p className="text-2xl font-bold text-primary">
                      R$ {calculateTotalValue().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
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
                <CardTitle>Observações Adicionais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="whitespace-pre-wrap">{task.observations}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações de Quilometragem */}
          {(task.initialKm || task.finalKm) && (
            <Card>
              <CardHeader>
                <CardTitle>Informações de Deslocamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">KM Inicial</label>
                    <p className="font-medium">{task.initialKm || 0} km</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">KM Final</label>
                    <p className="font-medium">{task.finalKm || 0} km</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Total Percorrido</label>
                    <p className="font-medium text-primary">
                      {((task.finalKm || 0) - (task.initialKm || 0))} km
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