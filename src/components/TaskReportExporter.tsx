
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import { mapTaskToStandardFields, mapSalesStatus, getStatusLabel, getStatusColor } from '@/lib/taskStandardization';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface TaskReportExporterProps {
  task: Task;
  filialName?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'gradient';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export const TaskReportExporter: React.FC<TaskReportExporterProps> = ({ 
  task,
  filialName = 'Não informado',
  variant = 'outline', 
  size = 'default',
  className = '' 
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const getTaskTypeLabel = (taskType: string) => {
    switch (taskType) {
      case 'prospection': return 'Visita à Fazenda';
      case 'checklist': return 'Checklist';
      case 'ligacao': return 'Ligação';
      default: return taskType;
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

  const exportTaskToPDF = async () => {
    try {
      setIsExporting(true);
      
      // Mapear dados para formato padronizado
      const standardData = await mapTaskToStandardFields(task);
      const salesStatus = mapSalesStatus(task);
      
      const doc = new jsPDF();
      let yPosition = 20;

      // Header com informações da filial e vendedor
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('RELATÓRIO DE TAREFA', 20, yPosition);
      yPosition += 15;

      // Linha separadora
      doc.setLineWidth(0.5);
      doc.line(20, yPosition, 190, yPosition);
      yPosition += 15;

      // Informações do cabeçalho
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      
      doc.setFont('helvetica', 'bold');
      doc.text('FILIAL:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(filialName, 50, yPosition);
      
      doc.setFont('helvetica', 'bold');
      doc.text('VENDEDOR:', 120, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(task.responsible, 150, yPosition);
      yPosition += 10;

      doc.setFont('helvetica', 'bold');
      doc.text('TIPO DE TAREFA:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(getTaskTypeLabel(task.taskType), 70, yPosition);
      
      doc.setFont('helvetica', 'bold');
      doc.text('STATUS:', 120, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(getStatusLabel(task.status), 145, yPosition);
      yPosition += 10;

      doc.setFont('helvetica', 'bold');
      doc.text('DATA:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(format(task.startDate, 'dd/MM/yyyy', { locale: ptBR }), 45, yPosition);
      
      doc.setFont('helvetica', 'bold');
      doc.text('HORÁRIO:', 120, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(`${task.startTime} - ${task.endTime}`, 150, yPosition);
      yPosition += 15;

      // Seção - Dados Padronizados do Cliente
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('DADOS DO CLIENTE', 20, yPosition);
      yPosition += 10;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Nome do Contato:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(standardData.nome_contato, 70, yPosition);
      yPosition += 8;

      if (standardData.cpf) {
        doc.setFont('helvetica', 'bold');
        doc.text('CPF:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(standardData.cpf, 45, yPosition);
        yPosition += 8;
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Cliente:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(standardData.cliente_nome, 50, yPosition);
      yPosition += 8;

      if (standardData.cliente_email) {
        doc.setFont('helvetica', 'bold');
        doc.text('Email:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(standardData.cliente_email, 45, yPosition);
        yPosition += 8;
      }

      if (standardData.propriedade_nome) {
        doc.setFont('helvetica', 'bold');
        doc.text('Propriedade:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(standardData.propriedade_nome, 60, yPosition);
        yPosition += 8;
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Vendedor:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(standardData.vendedor_nome, 55, yPosition);
      yPosition += 8;

      doc.setFont('helvetica', 'bold');
      doc.text('Filial:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(standardData.filial_nome, 45, yPosition);
      yPosition += 8;

      doc.setFont('helvetica', 'bold');
      doc.text('Prioridade:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.text(getPriorityLabel(task.priority), 55, yPosition);
      yPosition += 8;

      if (task.initialKm || task.finalKm) {
        doc.setFont('helvetica', 'bold');
        doc.text('Quilometragem:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(`Inicial: ${task.initialKm}km | Final: ${task.finalKm}km`, 70, yPosition);
        yPosition += 8;
      }

      yPosition += 10;

      // Seção - Observações
      if (task.observations) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('OBSERVAÇÕES', 20, yPosition);
        yPosition += 10;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        const splitText = doc.splitTextToSize(task.observations, 170);
        doc.text(splitText, 20, yPosition);
        yPosition += splitText.length * 6 + 10;
      }

      // Seção - Checklist de Produtos/Oportunidades
      if (task.checklist && task.checklist.length > 0) {
        // Verificar se cabe na página atual
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PRODUTOS E OPORTUNIDADES', 20, yPosition);
        yPosition += 15;

        // Criar tabela de produtos
        const productTableData = task.checklist.map((product) => [
          product.selected ? '✓' : '✗',
          product.name,
          product.category,
          product.quantity || '-',
          product.price ? `R$ ${product.price.toFixed(2)}` : '-',
          product.observations || '-'
        ]);

        doc.autoTable({
          head: [['Selecionado', 'Produto', 'Categoria', 'Qtd', 'Preço', 'Observações']],
          body: productTableData,
          startY: yPosition,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [22, 160, 133] },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 40 },
            2: { cellWidth: 25 },
            3: { cellWidth: 15 },
            4: { cellWidth: 25 },
            5: { cellWidth: 35 }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + 15;
      }

      // Seção - Informações de Venda
      if (task.salesValue && task.salesValue > 0) {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMAÇÕES DE VENDA', 20, yPosition);
        yPosition += 10;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Valor da Oportunidade:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(`R$ ${task.salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 90, yPosition);
        yPosition += 8;

        doc.setFont('helvetica', 'bold');
        doc.text('Status da Oportunidade:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(getStatusLabel(salesStatus), 85, yPosition);
        yPosition += 8;

        doc.setFont('helvetica', 'bold');
        doc.text('Valor Confirmado:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(standardData.oportunidades.confirmada ? 'Sim' : 'Não', 75, yPosition);
        yPosition += 8;

        if (task.prospectNotes) {
          yPosition += 5;
          doc.setFont('helvetica', 'bold');
          doc.text('Notas do Prospect:', 20, yPosition);
          yPosition += 8;
          doc.setFont('helvetica', 'normal');
          const splitNotes = doc.splitTextToSize(task.prospectNotes, 170);
          doc.text(splitNotes, 20, yPosition);
          yPosition += splitNotes.length * 6 + 10;
        }
      }

      // Seção - Lembretes
      if (task.reminders && task.reminders.length > 0) {
        if (yPosition > 230) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('LEMBRETES', 20, yPosition);
        yPosition += 15;

        const reminderTableData = task.reminders.map((reminder) => [
          reminder.completed ? '✓' : '✗',
          reminder.title,
          reminder.description || '-',
          format(reminder.date, 'dd/MM/yyyy', { locale: ptBR }),
          reminder.time
        ]);

        doc.autoTable({
          head: [['Status', 'Título', 'Descrição', 'Data', 'Horário']],
          body: reminderTableData,
          startY: yPosition,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [22, 160, 133] },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 40 },
            2: { cellWidth: 50 },
            3: { cellWidth: 30 },
            4: { cellWidth: 20 }
          }
        });

        yPosition = (doc as any).lastAutoTable.finalY + 15;
      }

      // Seção - Localização do Check-in
      if (task.checkInLocation) {
        if (yPosition > 240) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('LOCALIZAÇÃO DO CHECK-IN', 20, yPosition);
        yPosition += 10;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Coordenadas:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(`Lat: ${task.checkInLocation.lat.toFixed(6)}, Lng: ${task.checkInLocation.lng.toFixed(6)}`, 65, yPosition);
        yPosition += 8;

        doc.setFont('helvetica', 'bold');
        doc.text('Data/Hora do Check-in:', 20, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(format(task.checkInLocation.timestamp, 'dd/MM/yyyy HH:mm', { locale: ptBR }), 85, yPosition);
        yPosition += 15;
      }

      // Seção - Fotos
      if (task.photos && task.photos.length > 0) {
        if (yPosition > 240) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('FOTOS ANEXADAS', 20, yPosition);
        yPosition += 10;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total de fotos anexadas: ${task.photos.length}`, 20, yPosition);
        yPosition += 8;

        // Lista das fotos (apenas nomes/referências, já que não podemos incorporar as imagens facilmente)
        task.photos.forEach((photo, index) => {
          doc.text(`${index + 1}. Foto ${index + 1}`, 25, yPosition);
          yPosition += 6;
        });
      }

      // Rodapé
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, 285);
        doc.text(`Página ${i} de ${pageCount}`, 170, 285);
      }

      // Salvar o PDF
      const fileName = `relatorio-tarefa-${task.client.replace(/[^a-zA-Z0-9]/g, '')}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "✅ Relatório Gerado",
        description: "PDF da tarefa exportado com sucesso!"
      });

    } catch (error) {
      console.error('Erro ao exportar relatório da tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o relatório PDF",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button 
      type="button" 
      variant={variant} 
      size={size}
      className={className}
      onClick={exportTaskToPDF}
      disabled={isExporting}
    >
      <FileText className="h-4 w-4 mr-2" />
      {isExporting ? 'Gerando...' : 'Relatório PDF'}
    </Button>
  );
};
