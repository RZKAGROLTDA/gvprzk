import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { mapSalesStatus, getStatusLabel, getFilialNameRobust } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

// TypeScript module declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface GenerateTaskPDFOptions {
  task: Task;
  filiais?: any[];
  calculateTotalValue?: (task: any) => number;
  getTaskTypeLabel?: (type: string) => string;
}

const defaultGetTaskTypeLabel = (type: string) => {
  switch (type) {
    case 'prospection': return 'Visita à Fazenda';
    case 'checklist': return 'Checklist';
    case 'ligacao': return 'Ligação';
    default: return type;
  }
};

export const generateTaskPDF = async (
  task: Task,
  calculateTotalValue?: (task: any) => number,
  getTaskTypeLabel: (type: string) => string = defaultGetTaskTypeLabel,
  filiais: any[] = []
) => {
  console.log('🔄 Iniciando geração de PDF...');
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.width;
  
  // Helper functions
  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return priority;
    }
  };
  
  const salesStatus = mapSalesStatus(task);
  const statusLabel = getStatusLabel(salesStatus);
  
  // Calculate values - EXACTLY like the modal
  const totalValue = getSalesValueAsNumber(task.salesValue) || 0;
  const partialValue = task.partialSalesValue || 0;
  let productsTotal = 0;
  let productsSelected = 0;
  
  if (task.checklist && task.checklist.length > 0) {
    task.checklist.forEach(item => {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      productsTotal += itemTotal;
      if (item.selected) {
        productsSelected += itemTotal;
      }
    });
  }
  
  const potentialValue = totalValue || productsTotal;
  const closedValue = salesStatus === 'ganho' ? potentialValue : 
                      salesStatus === 'parcial' ? (partialValue || productsSelected) : 0;
  const conversionRate = potentialValue > 0 && closedValue > 0 
    ? ((closedValue / potentialValue) * 100).toFixed(0) + '%'
    : '-';
  
  // ===== CABEÇALHO =====
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RELATÓRIO DE OPORTUNIDADE', pageWidth / 2, 20, { align: 'center' });
  
  // Subtítulo com tipo e data
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(128, 128, 128);
  pdf.text(
    `${getTaskTypeLabel(task?.taskType || 'prospection')} • ${task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}`,
    pageWidth / 2,
    27,
    { align: 'center' }
  );
  pdf.setTextColor(0, 0, 0);
  
  // Status badge
  pdf.setFontSize(10);
  const statusColors: Record<string, [number, number, number]> = {
    'ganho': [34, 197, 94],
    'parcial': [245, 158, 11],
    'perdido': [239, 68, 68],
    'prospect': [59, 130, 246]
  };
  const statusColor = statusColors[salesStatus] || statusColors.prospect;
  pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.roundedRect(pageWidth / 2 - 20, 32, 40, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.text(statusLabel.toUpperCase(), pageWidth / 2, 37, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  
  // Linha separadora
  pdf.setLineWidth(0.5);
  pdf.line(20, 45, pageWidth - 20, 45);
  
  let yPosition = 55;
  
  // ===== STATUS E VALORES (igual ao card de destaque do modal) =====
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RESUMO DA OPORTUNIDADE', 20, yPosition);
  yPosition += 8;
  
  const summaryData = [
    ['Status da Venda:', statusLabel],
    ['Valor Potencial:', formatCurrency(potentialValue)],
    ['Valor Fechado:', closedValue > 0 ? formatCurrency(closedValue) : '-'],
    ['Taxa de Conversão:', conversionRate],
  ];
  
  try {
    pdf.autoTable({
      startY: yPosition,
      body: summaryData,
      columns: [
        { header: 'Campo', dataKey: 0 },
        { header: 'Valor', dataKey: 1 }
      ],
      margin: { left: 20, right: 20 },
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { cellWidth: 'auto', fontStyle: 'bold' }
      },
      theme: 'plain',
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });
    
    yPosition = pdf.lastAutoTable.finalY + 10;
  } catch (error) {
    console.error('Erro na tabela de resumo:', error);
    yPosition += 40;
  }
  
  // ===== DADOS DO CLIENTE (igual ao card do modal) =====
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DADOS DO CLIENTE', 20, yPosition);
  yPosition += 8;
  
  const clientInfo = [
    ['Nome:', task?.client || 'Não informado'],
    ['Código:', task?.clientCode || 'N/A'],
    ['Email:', task?.email || 'N/A'],
    ['Telefone:', task?.phone || 'N/A'],
    ['Propriedade:', task?.property || 'N/A'],
    ['Hectares:', task?.propertyHectares ? `${task.propertyHectares} ha` : 'N/A'],
  ];
  
  try {
    pdf.autoTable({
      startY: yPosition,
      body: clientInfo,
      columns: [
        { header: 'Campo', dataKey: 0 },
        { header: 'Valor', dataKey: 1 }
      ],
      margin: { left: 20, right: pageWidth / 2 + 5 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 30 },
        1: { cellWidth: 'auto' }
      },
      theme: 'grid'
    });
    
    const clientTableEnd = pdf.lastAutoTable.finalY;
    
    // ===== FILIAL E RESPONSÁVEL (lado direito - igual ao card do modal) =====
    const filialInfo = [
      ['Responsável:', task?.responsible || 'N/A'],
      ['Filial:', getFilialNameRobust(task?.filial, filiais)],
      ['Filial Atendida:', task?.filialAtendida ? getFilialNameRobust(task.filialAtendida, filiais) : 'Mesma do responsável'],
      ['Tipo:', getTaskTypeLabel(task?.taskType || 'prospection')],
      ['Prioridade:', getPriorityLabel(task?.priority || 'medium')],
      ['Status Tarefa:', task?.status === 'completed' ? 'Concluída' : task?.status === 'in_progress' ? 'Em Andamento' : 'Pendente'],
    ];
    
    pdf.autoTable({
      startY: yPosition,
      body: filialInfo,
      columns: [
        { header: 'Campo', dataKey: 0 },
        { header: 'Valor', dataKey: 1 }
      ],
      margin: { left: pageWidth / 2 + 5, right: 20 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 'auto' }
      },
      theme: 'grid'
    });
    
    yPosition = Math.max(clientTableEnd, pdf.lastAutoTable.finalY) + 10;
  } catch (error) {
    console.error('Erro nas tabelas de cliente/filial:', error);
    yPosition += 60;
  }
  
  // ===== PRODUTOS E SERVIÇOS (igual ao card do modal) =====
  if (task?.checklist && task.checklist.length > 0) {
    if (yPosition > 180) {
      pdf.addPage();
      yPosition = 20;
    }
    
    const selectedCount = task.checklist.filter(i => i.selected).length;
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`PRODUTOS E SERVIÇOS (${task.checklist.length} itens)`, 20, yPosition);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Total: ${formatCurrency(productsTotal)}`, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 8;
    
    const products = task.checklist.map(item => [
      item.selected ? '✓' : '',
      item.name || 'N/A',
      item.category || 'N/A',
      (item.quantity || 1).toString(),
      formatCurrency(item.price || 0),
      formatCurrency((item.price || 0) * (item.quantity || 1)),
    ]);
    
    try {
      pdf.autoTable({
        startY: yPosition,
        head: [['', 'Produto / Serviço', 'Categoria', 'Qtd', 'Preço Unit.', 'Subtotal']],
        body: products,
        margin: { left: 20, right: 20 },
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [51, 122, 183] },
        columnStyles: { 
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 25 },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
        },
        theme: 'grid'
      });
      
      yPosition = pdf.lastAutoTable.finalY + 5;
      
      // Resumo dos produtos (igual ao modal)
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Selecionados: ${selectedCount}/${task.checklist.length}  |  Valor Selecionado: ${formatCurrency(productsSelected)}  |  Valor Total: ${formatCurrency(productsTotal)}`, 20, yPosition);
      yPosition += 10;
    } catch (error) {
      console.error('Erro na tabela de produtos:', error);
      yPosition += 80;
    }
  }
  
  // ===== EQUIPAMENTOS (igual ao card do modal) =====
  if (task?.familyProduct || task?.equipmentQuantity || (task?.equipmentList && task.equipmentList.length > 0)) {
    if (yPosition > 200) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('EQUIPAMENTOS', 20, yPosition);
    yPosition += 8;
    
    if (task.familyProduct || task.equipmentQuantity) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      if (task.familyProduct) {
        pdf.text(`Família Principal: ${task.familyProduct}`, 20, yPosition);
        yPosition += 5;
      }
      if (task.equipmentQuantity) {
        pdf.text(`Quantidade Total: ${task.equipmentQuantity}`, 20, yPosition);
        yPosition += 5;
      }
      yPosition += 3;
    }
    
    if (task.equipmentList && task.equipmentList.length > 0) {
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
        yPosition += 40;
      }
    }
  }
  
  // ===== OBSERVAÇÕES E NOTAS (igual ao card do modal) =====
  if (task?.observations || task?.prospectNotes || task?.prospectNotesJustification) {
    if (yPosition > 230) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('OBSERVAÇÕES E NOTAS', 20, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    
    if (task.observations) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Observações Gerais:', 20, yPosition);
      yPosition += 5;
      pdf.setFont('helvetica', 'normal');
      const splitObs = pdf.splitTextToSize(task.observations, pageWidth - 40);
      pdf.text(splitObs, 20, yPosition);
      yPosition += splitObs.length * 4 + 5;
    }
    
    if (task.prospectNotes) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Notas de Prospecção:', 20, yPosition);
      yPosition += 5;
      pdf.setFont('helvetica', 'normal');
      const splitNotes = pdf.splitTextToSize(task.prospectNotes, pageWidth - 40);
      pdf.text(splitNotes, 20, yPosition);
      yPosition += splitNotes.length * 4 + 5;
    }
    
    if (task.prospectNotesJustification) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Justificativa:', 20, yPosition);
      yPosition += 5;
      pdf.setFont('helvetica', 'normal');
      const splitJust = pdf.splitTextToSize(task.prospectNotesJustification, pageWidth - 40);
      pdf.text(splitJust, 20, yPosition);
      yPosition += splitJust.length * 4 + 5;
    }
  }
  
  // ===== FOTOS (se existirem) =====
  if (task?.photos && task.photos.length > 0) {
    if (yPosition > 250) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`FOTOS (${task.photos.length})`, 20, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Total de fotos anexadas: ${task.photos.length}`, 20, yPosition);
    yPosition += 5;
    
    task.photos.forEach((photo, index) => {
      pdf.text(`${index + 1}. Foto ${index + 1}`, 25, yPosition);
      yPosition += 5;
    });
    yPosition += 5;
  }
  
  // ===== DOCUMENTOS (se existirem) =====
  if (task?.documents && task.documents.length > 0) {
    if (yPosition > 250) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`DOCUMENTOS (${task.documents.length})`, 20, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    
    task.documents.forEach((doc, index) => {
      pdf.text(`${index + 1}. Documento ${index + 1}`, 25, yPosition);
      yPosition += 5;
    });
    yPosition += 5;
  }
  
  // ===== LOCALIZAÇÃO =====
  if (task?.checkInLocation) {
    if (yPosition > 250) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LOCALIZAÇÃO DO CHECK-IN', 20, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Coordenadas: ${task.checkInLocation.lat}, ${task.checkInLocation.lng}`, 20, yPosition);
    yPosition += 5;
    pdf.text(`Data/Hora: ${format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, yPosition);
    yPosition += 5;
    pdf.text(`Link: https://www.google.com/maps?q=${task.checkInLocation.lat},${task.checkInLocation.lng}`, 20, yPosition);
    yPosition += 10;
  }
  
  // ===== METADADOS (igual ao rodapé do modal) =====
  if (yPosition > 260) {
    pdf.addPage();
    yPosition = 20;
  }
  
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(128, 128, 128);
  const createdAt = task?.createdAt ? format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A';
  const updatedAt = task?.updatedAt ? format(new Date(task.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A';
  pdf.text(`Criado em: ${createdAt}  |  Atualizado em: ${updatedAt}  |  ID: ${task?.id?.substring(0, 8)}...`, 20, yPosition);
  pdf.setTextColor(0, 0, 0);
  
  // ===== RODAPÉ =====
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(128, 128, 128);
    pdf.text(
      `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} | Página ${i} de ${pageCount}`, 
      pageWidth / 2, 
      pdf.internal.pageSize.height - 10, 
      { align: 'center' }
    );
  }
  
  // Salvar PDF
  const clientName = task?.client?.replace(/\s+/g, '-').toLowerCase() || 'cliente';
  const statusSuffix = salesStatus !== 'prospect' ? `-${salesStatus}` : '';
  pdf.save(`oportunidade-${clientName}${statusSuffix}-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  
  console.log('✅ PDF gerado com sucesso!');
};
