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

export const generateTaskPDF = async (
  task: Task,
  calculateTotalValue: (task: any) => number,
  getTaskTypeLabel: (type: string) => string
) => {
  console.log('🔄 Iniciando geração de PDF...');
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.width;
  
  // Helper functions
  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };
  
  const salesStatus = mapSalesStatus(task);
  const statusLabel = getStatusLabel(salesStatus);
  
  // Calculate values
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
  
  const closedValue = salesStatus === 'ganho' ? (totalValue || productsTotal) : 
                      salesStatus === 'parcial' ? (partialValue || productsSelected) : 0;
  
  // ===== CABEÇALHO =====
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RELATÓRIO DE OPORTUNIDADE', pageWidth / 2, 20, { align: 'center' });
  
  // Status badge
  pdf.setFontSize(12);
  const statusColors: Record<string, [number, number, number]> = {
    'ganho': [34, 197, 94],
    'parcial': [245, 158, 11],
    'perdido': [239, 68, 68],
    'prospect': [59, 130, 246]
  };
  const statusColor = statusColors[salesStatus] || statusColors.prospect;
  pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.roundedRect(pageWidth / 2 - 20, 25, 40, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.text(statusLabel.toUpperCase(), pageWidth / 2, 30, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  
  // Linha separadora
  pdf.setLineWidth(0.5);
  pdf.line(20, 38, pageWidth - 20, 38);
  
  let yPosition = 48;
  
  // ===== STATUS E VALORES =====
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RESUMO DA OPORTUNIDADE', 20, yPosition);
  yPosition += 8;
  
  const summaryData = [
    ['Status da Venda:', statusLabel],
    ['Valor Potencial:', formatCurrency(totalValue || productsTotal)],
    ['Valor Fechado:', closedValue > 0 ? formatCurrency(closedValue) : '-'],
    ['Taxa de Conversão:', totalValue > 0 && closedValue > 0 ? `${((closedValue / (totalValue || productsTotal)) * 100).toFixed(0)}%` : '-'],
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
  
  // ===== INFORMAÇÕES DO CLIENTE =====
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DADOS DO CLIENTE', 20, yPosition);
  yPosition += 8;
  
  const clientInfo = [
    ['Cliente:', task?.client || 'Não informado'],
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
    
    // ===== FILIAL E RESPONSÁVEL (lado direito) =====
    const filialInfo = [
      ['Responsável:', task?.responsible || 'N/A'],
      ['Filial:', task?.filial || 'N/A'],
      ['Filial Atendida:', task?.filialAtendida || 'Mesma'],
      ['Tipo:', getTaskTypeLabel(task?.taskType || 'prospection')],
      ['Prioridade:', task?.priority === 'high' ? 'Alta' : task?.priority === 'medium' ? 'Média' : 'Baixa'],
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
  
  // ===== EQUIPAMENTOS (se existirem) =====
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
  
  // ===== PRODUTOS/CHECKLIST =====
  if (task?.checklist && task.checklist.length > 0) {
    if (yPosition > 180) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`PRODUTOS (${task.checklist.length} itens)`, 20, yPosition);
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
        head: [['', 'Produto', 'Categoria', 'Qtd', 'Preço Unit.', 'Total']],
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
      
      // Resumo dos produtos
      const selectedCount = task.checklist.filter(i => i.selected).length;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Selecionados: ${selectedCount}/${task.checklist.length}  |  Valor Selecionado: ${formatCurrency(productsSelected)}  |  Valor Total: ${formatCurrency(productsTotal)}`, 20, yPosition);
      yPosition += 10;
    } catch (error) {
      console.error('Erro na tabela de produtos:', error);
      yPosition += 80;
    }
  }
  
  // ===== OBSERVAÇÕES =====
  if (task?.observations || task?.prospectNotes) {
    if (yPosition > 230) {
      pdf.addPage();
      yPosition = 20;
    }
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('OBSERVAÇÕES', 20, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    
    if (task.observations) {
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
  }
  
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
