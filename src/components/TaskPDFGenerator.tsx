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
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;
  let yPos = 20;

  const formatCurrency = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const ensureSpace = (needed: number) => {
    if (yPos + needed > pageHeight - 20) {
      pdf.addPage();
      yPos = 20;
    }
  };

  const writeLine = (label: string, value: string) => {
    ensureSpace(6);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}`, 20, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || 'N/A', 60, yPos);
    yPos += 5;
  };

  const writeSectionTitle = (title: string) => {
    ensureSpace(10);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, 20, yPos);
    yPos += 6;
    pdf.setFontSize(9);
  };

  const writeTextBlock = (title: string, text?: string | null) => {
    if (!text) return;
    writeSectionTitle(title);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(text, pageWidth - 40);
    for (const line of lines) {
      ensureSpace(6);
      pdf.text(line, 20, yPos);
      yPos += 4;
    }
    yPos += 4;
  };

  // ===== CÁLCULOS (mesma lógica do modal) =====
  const salesStatus = mapSalesStatus(task);
  const statusLabel = getStatusLabel(salesStatus);

  const totalValue = getSalesValueAsNumber(task.salesValue) || 0;
  const partialValue = task.partialSalesValue || 0;

  let productsTotal = 0;
  let productsSelected = 0;
  if (task.checklist?.length) {
    task.checklist.forEach((item) => {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      productsTotal += itemTotal;
      if (item.selected) productsSelected += itemTotal;
    });
  }

  const potentialValue = totalValue || productsTotal;
  const closedValue =
    salesStatus === 'ganho'
      ? potentialValue
      : salesStatus === 'parcial'
        ? (partialValue || productsSelected)
        : 0;

  // ===== CABEÇALHO =====
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Detalhes da Oportunidade', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    `${getTaskTypeLabel(task?.taskType || 'prospection')} • ${task?.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}`,
    pageWidth / 2,
    yPos,
    { align: 'center' }
  );
  pdf.setTextColor(0, 0, 0);
  yPos += 10;

  // ===== RESUMO (Status e Valores) =====
  writeSectionTitle('Resumo da Oportunidade');
  writeLine('Status:', statusLabel);
  writeLine('Valor Potencial:', formatCurrency(potentialValue));
  writeLine('Valor Fechado:', closedValue > 0 ? formatCurrency(closedValue) : '-');
  const conversionRate = potentialValue > 0 && closedValue > 0 ? `${((closedValue / potentialValue) * 100).toFixed(0)}%` : '-';
  writeLine('Conversão:', conversionRate);
  yPos += 6;

  // ===== DADOS DO CLIENTE =====
  writeSectionTitle('Dados do Cliente');
  writeLine('Nome:', task?.client || 'N/A');
  writeLine('Código:', (task as any)?.clientCode || 'N/A');
  writeLine('Email:', task?.email || 'N/A');
  writeLine('Telefone:', task?.phone || 'N/A');
  writeLine('Propriedade:', task?.property || 'N/A');
  writeLine('Hectares:', task?.propertyHectares ? `${task.propertyHectares} ha` : 'N/A');
  yPos += 6;

  // ===== FILIAL E RESPONSÁVEL =====
  writeSectionTitle('Filial e Responsável');
  writeLine('Responsável:', task?.responsible || 'N/A');
  writeLine('Filial:', getFilialNameRobust(task?.filial, filiais));
  writeLine(
    'Filial Atendida:',
    task?.filialAtendida ? getFilialNameRobust(task.filialAtendida, filiais) : 'Mesma do responsável'
  );
  writeLine('Tipo:', getTaskTypeLabel(task?.taskType || 'prospection'));
  const priorityLabel = task?.priority === 'high' ? 'Alta' : task?.priority === 'medium' ? 'Média' : 'Baixa';
  writeLine('Prioridade:', priorityLabel);
  yPos += 6;

  // ===== PRODUTOS E SERVIÇOS =====
  if (task?.checklist?.length) {
    const selectedCount = task.checklist.filter((i) => i.selected).length;

    writeSectionTitle(`Produtos e Serviços (${task.checklist.length})`);

    const products = task.checklist.map((item) => [
      item.selected ? '✓' : '',
      item.name || 'N/A',
      String(item.category || 'N/A'),
      String(item.quantity || 1),
      formatCurrency(item.price || 0),
      formatCurrency((item.price || 0) * (item.quantity || 1)),
    ]);

    pdf.autoTable({
      startY: yPos,
      head: [['', 'Produto / Serviço', 'Categoria', 'Qtd', 'Preço Unit.', 'Subtotal']],
      body: products,
      margin: { left: 20, right: 20 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 122, 183], fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 24 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      theme: 'grid',
    });

    yPos = pdf.lastAutoTable.finalY + 4;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    ensureSpace(8);
    pdf.text(
      `${selectedCount}/${task.checklist.length} selecionados | Valor Selecionado: ${formatCurrency(productsSelected)} | Valor Total: ${formatCurrency(productsTotal)}`,
      20,
      yPos
    );
    yPos += 10;
    pdf.setFontSize(9);
  }

  // ===== EQUIPAMENTOS =====
  if (task?.familyProduct || task?.equipmentQuantity || (task as any)?.equipmentList?.length) {
    writeSectionTitle('Equipamentos');
    if (task.familyProduct) writeLine('Família Principal:', task.familyProduct);
    if (task.equipmentQuantity) writeLine('Quantidade Total:', String(task.equipmentQuantity));

    const equipmentList = (task as any)?.equipmentList as Array<{ familyProduct?: string; quantity?: number; id?: string }> | undefined;
    if (equipmentList?.length) {
      pdf.autoTable({
        startY: yPos,
        head: [['Família do Produto', 'Quantidade', 'ID']],
        body: equipmentList.map((eq) => [eq.familyProduct || 'N/A', String(eq.quantity || 0), eq.id || 'N/A']),
        margin: { left: 20, right: 20 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [51, 122, 183], fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 30 },
        },
        theme: 'grid',
      });
      yPos = pdf.lastAutoTable.finalY + 10;
    } else {
      yPos += 4;
    }
  }

  // ===== OBSERVAÇÕES E NOTAS =====
  writeTextBlock('Observações Gerais', task?.observations);
  writeTextBlock('Notas de Prospecção', (task as any)?.prospectNotes);
  writeTextBlock('Justificativa', (task as any)?.prospectNotesJustification);

  // ===== FOTOS =====
  if (task?.photos?.length) {
    writeSectionTitle(`Fotos (${task.photos.length})`);
    const maxList = 10;
    const list = task.photos.slice(0, maxList);
    list.forEach((url, idx) => {
      ensureSpace(6);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${idx + 1}. ${url}`, 20, yPos);
      yPos += 4;
    });
    if (task.photos.length > maxList) {
      ensureSpace(6);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`(+${task.photos.length - maxList} outras)`, 20, yPos);
      yPos += 6;
    }
    yPos += 4;
  }

  // ===== DOCUMENTOS =====
  if (task?.documents?.length) {
    writeSectionTitle(`Documentos (${task.documents.length})`);
    const maxList = 10;
    const list = task.documents.slice(0, maxList);
    list.forEach((url, idx) => {
      ensureSpace(6);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${idx + 1}. ${url}`, 20, yPos);
      yPos += 4;
    });
    if (task.documents.length > maxList) {
      ensureSpace(6);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`(+${task.documents.length - maxList} outros)`, 20, yPos);
      yPos += 6;
    }
    yPos += 4;
  }

  // ===== LOCALIZAÇÃO =====
  if (task?.checkInLocation) {
    writeSectionTitle('Localização do Check-in');
    writeLine('Coordenadas:', `${task.checkInLocation.lat}, ${task.checkInLocation.lng}`);
    writeLine(
      'Data/Hora:',
      format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })
    );
    writeLine('Mapa:', `https://www.google.com/maps?q=${task.checkInLocation.lat},${task.checkInLocation.lng}`);
    yPos += 4;
  }

  // ===== METADADOS =====
  writeSectionTitle('Metadados');
  const createdAt = task?.createdAt ? format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A';
  const updatedAt = task?.updatedAt ? format(new Date(task.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A';
  writeLine('Criado em:', createdAt);
  writeLine('Atualizado em:', updatedAt);
  writeLine('ID:', task?.id ? `${task.id.substring(0, 8)}...` : 'N/A');

  // ===== RODAPÉ =====
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.setFont('helvetica', 'italic');
    pdf.text(
      `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} | Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
  pdf.setTextColor(0, 0, 0);

  const clientName = (task?.client || 'cliente').replace(/\s+/g, '-').toLowerCase();
  pdf.save(`oportunidade-${clientName}-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
};
