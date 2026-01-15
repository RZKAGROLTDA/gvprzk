import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import jsPDF from 'jspdf';
import { mapSalesStatus, getStatusLabel, getFilialNameRobust } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

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

// Helper para carregar imagem como base64
const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Erro ao carregar imagem:', error);
    return null;
  }
};

// Helper para obter dimensões da imagem
const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 100, height: 100 });
    img.src = base64;
  });
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
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let yPos = 20;

  const formatCurrency = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const ensureSpace = (needed: number) => {
    if (yPos + needed > pageHeight - 25) {
      pdf.addPage();
      yPos = 20;
    }
  };

  const writeLine = (label: string, value: string, labelWidth = 50) => {
    ensureSpace(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(label, marginLeft, yPos);
    pdf.setFont('helvetica', 'normal');
    const valueLines = pdf.splitTextToSize(value || 'N/A', contentWidth - labelWidth);
    pdf.text(valueLines, marginLeft + labelWidth, yPos);
    yPos += 5 * Math.max(1, valueLines.length);
  };

  const writeSectionTitle = (title: string) => {
    ensureSpace(12);
    yPos += 4;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(51, 122, 183);
    pdf.text(title, marginLeft, yPos);
    pdf.setTextColor(0, 0, 0);
    yPos += 7;
    pdf.setFontSize(9);
  };

  const writeTextBlock = (title: string, text?: string | null) => {
    if (!text) return;
    writeSectionTitle(title);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(6);
      pdf.text(line, marginLeft, yPos);
      yPos += 4;
    }
    yPos += 2;
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
  pdf.setTextColor(100, 100, 100);
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

  // ===== DADOS DO CLIENTE =====
  writeSectionTitle('Dados do Cliente');
  writeLine('Nome:', task?.client || 'N/A');
  writeLine('Código:', (task as any)?.clientCode || 'N/A');
  writeLine('Email:', task?.email || 'N/A');
  writeLine('Telefone:', task?.phone || 'N/A');
  writeLine('Propriedade:', task?.property || 'N/A');
  writeLine('Hectares:', task?.propertyHectares ? `${task.propertyHectares} ha` : 'N/A');

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

  // ===== PRODUTOS E SERVIÇOS =====
  if (task?.checklist?.length) {
    const selectedCount = task.checklist.filter((i) => i.selected).length;
    writeSectionTitle(`Produtos e Serviços (${task.checklist.length})`);

    // Header da tabela manual
    ensureSpace(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setFillColor(51, 122, 183);
    pdf.setTextColor(255, 255, 255);
    pdf.rect(marginLeft, yPos - 4, contentWidth, 6, 'F');
    pdf.text('', marginLeft + 2, yPos);
    pdf.text('Produto / Serviço', marginLeft + 10, yPos);
    pdf.text('Qtd', marginLeft + 100, yPos);
    pdf.text('Preço', marginLeft + 118, yPos);
    pdf.text('Subtotal', marginLeft + 145, yPos);
    pdf.setTextColor(0, 0, 0);
    yPos += 5;

    // Linhas da tabela
    pdf.setFont('helvetica', 'normal');
    task.checklist.forEach((item) => {
      ensureSpace(6);
      const subtotal = (item.price || 0) * (item.quantity || 1);
      pdf.text(item.selected ? '✓' : '', marginLeft + 2, yPos);
      const nameText = pdf.splitTextToSize(item.name || 'N/A', 85);
      pdf.text(nameText[0], marginLeft + 10, yPos);
      pdf.text(String(item.quantity || 1), marginLeft + 100, yPos);
      pdf.text(formatCurrency(item.price || 0), marginLeft + 110, yPos);
      pdf.text(formatCurrency(subtotal), marginLeft + 140, yPos);
      yPos += 5;
    });

    yPos += 3;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(
      `${selectedCount}/${task.checklist.length} selecionados | Selecionado: ${formatCurrency(productsSelected)} | Total: ${formatCurrency(productsTotal)}`,
      marginLeft,
      yPos
    );
    yPos += 6;
    pdf.setFontSize(9);
  }

  // ===== EQUIPAMENTOS =====
  if (task?.familyProduct || task?.equipmentQuantity) {
    writeSectionTitle('Equipamentos');
    if (task.familyProduct) writeLine('Família Principal:', task.familyProduct);
    if (task.equipmentQuantity) writeLine('Quantidade Total:', String(task.equipmentQuantity));
  }

  // ===== OBSERVAÇÕES E NOTAS =====
  writeTextBlock('Observações Gerais', task?.observations);
  writeTextBlock('Notas de Prospecção', (task as any)?.prospectNotes);
  writeTextBlock('Justificativa', (task as any)?.prospectNotesJustification);

  // ===== FOTOS (com imagens reais) =====
  if (task?.photos?.length) {
    writeSectionTitle(`Fotos da Visita (${task.photos.length})`);
    
    const maxPhotos = 6; // Limitar para não deixar PDF muito grande
    const photosToProcess = task.photos.slice(0, maxPhotos);
    
    // Carregar imagens em paralelo
    const imagePromises = photosToProcess.map(url => loadImageAsBase64(url));
    const loadedImages = await Promise.all(imagePromises);
    
    const imageWidth = 80; // Largura máxima da imagem em mm
    const imageHeight = 60; // Altura máxima da imagem em mm
    const imagesPerRow = 2;
    const gapX = 10;
    
    let currentX = marginLeft;
    let imagesInRow = 0;
    
    for (let i = 0; i < loadedImages.length; i++) {
      const base64 = loadedImages[i];
      
      if (base64) {
        ensureSpace(imageHeight + 10);
        
        try {
          // Obter dimensões para manter proporção
          const dims = await getImageDimensions(base64);
          const aspectRatio = dims.width / dims.height;
          
          let finalWidth = imageWidth;
          let finalHeight = imageWidth / aspectRatio;
          
          if (finalHeight > imageHeight) {
            finalHeight = imageHeight;
            finalWidth = imageHeight * aspectRatio;
          }
          
          // Adicionar imagem
          pdf.addImage(base64, 'JPEG', currentX, yPos, finalWidth, finalHeight);
          
          // Legenda da foto
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Foto ${i + 1}`, currentX + finalWidth / 2, yPos + finalHeight + 3, { align: 'center' });
          pdf.setTextColor(0, 0, 0);
          
          imagesInRow++;
          
          if (imagesInRow >= imagesPerRow) {
            // Nova linha
            yPos += imageHeight + 8;
            currentX = marginLeft;
            imagesInRow = 0;
          } else {
            // Próxima coluna
            currentX += imageWidth + gapX;
          }
        } catch (imgError) {
          console.error('Erro ao adicionar imagem ao PDF:', imgError);
          // Fallback: mostrar URL
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.text(`${i + 1}. Erro ao carregar: ${photosToProcess[i].substring(0, 50)}...`, marginLeft, yPos);
          yPos += 5;
        }
      } else {
        // Imagem não carregou, mostrar URL como fallback
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(`${i + 1}. ${photosToProcess[i].substring(0, 60)}...`, marginLeft, yPos);
        yPos += 5;
      }
    }
    
    // Ajustar yPos se terminou no meio de uma linha
    if (imagesInRow > 0) {
      yPos += imageHeight + 8;
    }
    
    if (task.photos.length > maxPhotos) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`(+${task.photos.length - maxPhotos} outras fotos não incluídas)`, marginLeft, yPos);
      pdf.setTextColor(0, 0, 0);
      yPos += 6;
    }
  }

  // ===== DOCUMENTOS =====
  if (task?.documents?.length) {
    writeSectionTitle(`Documentos (${task.documents.length})`);
    pdf.setFont('helvetica', 'normal');
    task.documents.slice(0, 5).forEach((url, idx) => {
      ensureSpace(5);
      pdf.text(`${idx + 1}. ${url.substring(0, 60)}...`, marginLeft, yPos);
      yPos += 4;
    });
    if (task.documents.length > 5) {
      pdf.setFont('helvetica', 'italic');
      pdf.text(`(+${task.documents.length - 5} outros)`, marginLeft, yPos);
      yPos += 4;
    }
  }

  // ===== LOCALIZAÇÃO =====
  if (task?.checkInLocation) {
    writeSectionTitle('Localização do Check-in');
    writeLine('Coordenadas:', `${task.checkInLocation.lat}, ${task.checkInLocation.lng}`);
    if (task.checkInLocation.timestamp) {
      writeLine('Data/Hora:', format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }));
    }
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
