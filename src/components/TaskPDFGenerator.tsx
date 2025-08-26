import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// TypeScript module declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export const generateTaskPDF = async (
  task: Task,
  calculateTotalValue: (task: any) => number,
  getTaskTypeLabel: (type: string) => string
) => {
  console.log('🔄 Iniciando geração de PDF...');
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
  
  // Informações básicas - usando dados seguros
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('INFORMAÇÕES GERAIS', 20, yPosition);
  yPosition += 10;
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  const basicInfo = [
    ['Tipo de Tarefa:', getTaskTypeLabel(task?.taskType || 'prospection')],
    ['Cliente:', task?.client || 'Não informado'],
    ['Código do Cliente:', task?.clientCode || 'Não informado'],
    ['Email:', task?.email || 'Não informado'],
    ['Propriedade:', task?.property || 'Não informado'],
    ['Hectares:', task?.propertyHectares ? `${task.propertyHectares} ha` : 'Não informado'],
    ['Responsável:', task?.responsible || 'Não informado'],
    ['Filial:', task?.filial || 'Não informado'],
    ['Data:', task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'Não informado'],
    ['Horário:', `${task?.startTime || ''} - ${task?.endTime || ''}`],
  ];
  
  try {
    pdf.autoTable({
      startY: yPosition,
      body: basicInfo,
      columns: [
        { header: 'Campo', dataKey: 0 },
        { header: 'Valor', dataKey: 1 }
      ],
      margin: { left: 20, right: 20 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 'auto' }
      },
      theme: 'grid'
    });
    
    yPosition = pdf.lastAutoTable.finalY + 15;
  } catch (error) {
    console.error('Erro na tabela de informações básicas:', error);
    yPosition += 100; // Fallback position
  }
  
  // Informações de Equipamentos (se existirem)
  if (task?.familyProduct || task?.equipmentQuantity || (task?.equipmentList && task.equipmentList.length > 0)) {
    if (yPosition > 250) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INFORMAÇÕES DE EQUIPAMENTOS', 20, yPosition);
    yPosition += 10;
    
    if (task.familyProduct) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Família Principal do Produto: ${task.familyProduct}`, 20, yPosition);
      yPosition += 5;
    }
    
    if (task.equipmentQuantity) {
      pdf.text(`Quantidade Total de Equipamentos: ${task.equipmentQuantity}`, 20, yPosition);
      yPosition += 5;
    }
    
    if (task.equipmentList && task.equipmentList.length > 0) {
      yPosition += 5;
      
      const equipmentData = task.equipmentList.map(eq => [
        eq.familyProduct || 'N/A',
        (eq.quantity || 0).toString(),
        eq.id || 'N/A'
      ]);
      
      try {
        pdf.autoTable({
          startY: yPosition,
          head: [['Família do Produto', 'Quantidade', 'ID']],
          body: equipmentData,
          margin: { left: 20, right: 20 },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [51, 122, 183] },
          theme: 'grid'
        });
        
        yPosition = pdf.lastAutoTable.finalY + 10;
      } catch (error) {
        console.error('Erro na tabela de equipamentos:', error);
        yPosition += 50;
      }
    }
    
    yPosition += 10;
  }
  
  // Produtos/Serviços
  if ((task?.checklist && task.checklist.length > 0) || (task?.prospectItems && task.prospectItems.length > 0)) {
    if (yPosition > 200) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(task?.taskType === 'ligacao' ? 'PRODUTOS PARA OFERTAR' : 'PRODUTOS/SERVIÇOS', 20, yPosition);
    yPosition += 10;
    
    const products = [];
    
    // Adicionar produtos do checklist
    if (task?.checklist) {
      task.checklist.forEach(item => {
        products.push([
          item.name || 'N/A',
          item.category || 'N/A',
          (item.quantity || 1).toString(),
          `R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          item.selected ? 'SELECIONADO' : 'NÃO SELECIONADO',
          item.observations || '-'
        ]);
      });
    }
    
    // Adicionar produtos prospect
    if (task?.prospectItems) {
      task.prospectItems.forEach(item => {
        products.push([
          item.name || 'N/A',
          item.category || 'N/A',
          (item.quantity || 1).toString(),
          `R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          item.selected ? 'OFERTADO' : 'NÃO OFERTADO',
          item.observations || '-'
        ]);
      });
    }
    
    try {
      pdf.autoTable({
        startY: yPosition,
        head: [['Produto', 'Categoria', 'Qtd', 'Preço Unit.', 'Total', 'Status', 'Observações']],
        body: products,
        margin: { left: 20, right: 20 },
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [51, 122, 183] },
        columnStyles: { 
          5: { fontStyle: 'bold' },
          6: { cellWidth: 30 }
        },
        theme: 'grid'
      });
      
      yPosition = pdf.lastAutoTable.finalY + 15;
    } catch (error) {
      console.error('Erro na tabela de produtos:', error);
      yPosition += 100;
    }
  }
  
  // Valor total
  const totalValue = calculateTotalValue(task);
  if (totalValue > 0) {
    if (yPosition > 250) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`VALOR TOTAL: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, yPosition);
    yPosition += 15;
  }
  
  // Lembretes (se existirem)
  if (task?.reminders && task.reminders.length > 0) {
    if (yPosition > 200) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LEMBRETES CONFIGURADOS', 20, yPosition);
    yPosition += 10;
    
    const remindersData = task.reminders.map(reminder => [
      reminder.title || 'N/A',
      reminder.description || '',
      reminder.date ? format(new Date(reminder.date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A',
      reminder.time || 'N/A',
      reminder.completed ? 'Concluído' : 'Pendente'
    ]);
    
    try {
      pdf.autoTable({
        startY: yPosition,
        head: [['Título', 'Descrição', 'Data', 'Horário', 'Status']],
        body: remindersData,
        margin: { left: 20, right: 20 },
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [51, 122, 183] },
        theme: 'grid'
      });
      
      yPosition = pdf.lastAutoTable.finalY + 15;
    } catch (error) {
      console.error('Erro na tabela de lembretes:', error);
      yPosition += 50;
    }
  }
  
  // Observações (se existirem)
  if (task?.observations) {
    if (yPosition > 240) {
      pdf.addPage();
      yPosition = 20;
    }
    
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
  
  // Localização (se existir)
  if (task?.checkInLocation) {
    if (yPosition > 240) {
      pdf.addPage();
      yPosition = 20;
    }
    
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
    pdf.text(`Data/Hora: ${format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, yPosition);
  }
  
  // Rodapé
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.text(`Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, pdf.internal.pageSize.height - 20);
  
  // Salvar PDF
  const clientName = task?.client?.replace(/\s+/g, '-').toLowerCase() || 'cliente';
  pdf.save(`oportunidade-${clientName}-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  
  console.log('✅ PDF gerado com sucesso!');
};