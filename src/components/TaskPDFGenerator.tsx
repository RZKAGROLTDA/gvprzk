import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import jsPDF from 'jspdf';
import { mapSalesStatus, getStatusLabel, getFilialNameRobust } from '@/lib/taskStandardization';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { formatDateDisplay } from '@/lib/utils';

const defaultGetTaskTypeLabel = (type: string) => {
  switch (type) {
    case 'prospection': return 'Visita à Fazenda';
    case 'technical_visit': return 'Visita Técnica';
    case 'checklist': return 'Checklist';
    case 'ligacao': return 'Ligação';
    default: return type;
  }
};

const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    if (url.startsWith('data:image')) return url;
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 100, height: 100 });
    img.src = base64;
  });

const formatDuration = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return '—';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return '—';
  let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const generateTaskPDF = async (
  task: Task,
  _calculateTotalValue?: (task: any) => number,
  getTaskTypeLabel: (type: string) => string = defaultGetTaskTypeLabel,
  filiais: any[] = []
) => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let yPos = 20;

  const PRIMARY: [number, number, number] = [37, 99, 235];
  const MUTED: [number, number, number] = [110, 120, 135];

  const currency = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const ensureSpace = (needed: number) => {
    if (yPos + needed > pageHeight - 20) {
      pdf.addPage();
      yPos = 20;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    yPos += 3;
    pdf.setDrawColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.setLineWidth(0.6);
    pdf.line(marginLeft, yPos - 1, marginLeft + 4, yPos - 1);
    pdf.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title.toUpperCase(), marginLeft + 6, yPos + 1);
    pdf.setTextColor(0, 0, 0);
    yPos += 7;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
  };

  const kv = (label: string, value: string, colX: number, colW: number) => {
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(label.toUpperCase(), colX, yPos);
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(value || '—', colW);
    pdf.text(lines[0] || '—', colX, yPos + 4.5);
  };

  const twoColRow = (l1: string, v1: string, l2: string, v2: string) => {
    ensureSpace(10);
    const colW = (contentWidth - 6) / 2;
    kv(l1, v1, marginLeft, colW);
    kv(l2, v2, marginLeft + colW + 6, colW);
    yPos += 9;
  };

  const fourColRow = (items: Array<[string, string]>) => {
    ensureSpace(10);
    const colW = (contentWidth - 9) / 4;
    items.forEach(([l, v], i) => kv(l, v, marginLeft + i * (colW + 3), colW));
    yPos += 9;
  };

  const paragraph = (text: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(5);
      pdf.text(line, marginLeft, yPos);
      yPos += 4.2;
    }
    yPos += 1;
  };

  // ===== Metrics =====
  const salesStatus = mapSalesStatus(task);
  const statusLabel = getStatusLabel(salesStatus);
  const totalValue = getSalesValueAsNumber(task.salesValue) || 0;
  const partialValue = task.partialSalesValue || 0;
  let productsTotal = 0, productsSelected = 0;
  (task.checklist || []).forEach((i) => {
    const t = (i.price || 0) * (i.quantity || 1);
    productsTotal += t;
    if (i.selected) productsSelected += t;
  });
  const potentialValue = totalValue || productsTotal;
  const closedValue =
    salesStatus === 'ganho' ? potentialValue
    : salesStatus === 'parcial' ? (partialValue || productsSelected)
    : 0;
  const conversion = potentialValue > 0 && closedValue > 0
    ? `${((closedValue / potentialValue) * 100).toFixed(0)}%` : '—';
  const duration = formatDuration(task.startTime, task.endTime);
  const equipmentCount = task.equipmentList?.length || 0;
  const equipmentUnits = (task.equipmentList || []).reduce((s: number, e: any) => s + (Number(e.quantity) || 0), 0);
  const photoCount = task.photos?.length || 0;
  const hasLocation = !!(task.checkInLocation?.lat && task.checkInLocation?.lng);
  const validatedEqCount = (task.equipmentList || []).filter((eq: any) => {
    const v = eq.validated ?? eq.validado ?? eq.is_validated;
    return v === true || v === 'true';
  }).length;
  const newMachineCount = (task.equipmentList || []).filter((eq: any) =>
    eq.isNew === true || eq.novo === true || eq.is_new === true || eq.new === true
  ).length;
  const hasContact = !!(task.contactName || task.contactFunction);
  const hasObservations = !!(task.observations || task.prospectNotes);
  const hasNextAction = !!(task.nextAction || task.nextActionDate);
  const hasCheckIn = !!task.checkInLocation?.timestamp;
  const itemsCount = task.checklist?.length || 0;
  const selectedItemsCount = task.checklist?.filter(i => i.selected).length || 0;

  // Resumo executivo
  const summarySentences: string[] = [];
  if (task.startDate) {
    const dateStr = formatDateDisplay(task.startDate);
    summarySentences.push(task.property
      ? `Visita realizada em ${dateStr} na ${task.property}.`
      : `Visita realizada em ${dateStr}.`);
  }
  if (equipmentCount > 0) {
    summarySentences.push(validatedEqCount > 0
      ? `Foram vistoriados ${equipmentCount} equipamento${equipmentCount > 1 ? 's' : ''}, sendo ${validatedEqCount} validado${validatedEqCount > 1 ? 's' : ''}.`
      : `Foram vistoriados ${equipmentCount} equipamento${equipmentCount > 1 ? 's' : ''}.`);
  }
  if (photoCount > 0) summarySentences.push(`Foram registradas ${photoCount} foto${photoCount > 1 ? 's' : ''}.`);
  if (newMachineCount > 0) summarySentences.push(`Foi cadastrada${newMachineCount > 1 ? 's' : ''} ${newMachineCount} nova${newMachineCount > 1 ? 's' : ''} máquina${newMachineCount > 1 ? 's' : ''}.`);
  if (selectedItemsCount > 0) summarySentences.push(`Foram vendidos ${selectedItemsCount} de ${itemsCount} itens ofertados.`);
  if (potentialValue > 0) summarySentences.push(`Existe potencial estimado de R$ ${potentialValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`);
  if (closedValue > 0) summarySentences.push(`Valor fechado de R$ ${closedValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`);
  if (task.nextActionDate) summarySentences.push(`Próxima ação programada para ${formatDateDisplay(task.nextActionDate as any)}.`);
  if (summarySentences.length === 0) summarySentences.push('Ainda não há dados suficientes para gerar um resumo desta visita.');

  // Indicadores
  const indicators: Array<[string, boolean]> = [
    ['Check-in realizado', hasCheckIn || hasLocation],
    ['Fotos anexadas', photoCount > 0],
    ['Equipamentos validados', validatedEqCount > 0],
    ['Contato da visita informado', hasContact],
    ['Observações preenchidas', hasObservations],
    ['Próxima ação definida', hasNextAction],
    ['Produtos registrados', itemsCount > 0],
    ['Nova máquina cadastrada', newMachineCount > 0],
  ];

  // Alertas
  const alerts: string[] = [];
  if (photoCount === 0) alerts.push('Nenhuma foto registrada');
  if (equipmentCount > 0 && validatedEqCount === 0) alerts.push('Nenhum equipamento validado');
  if (!hasNextAction) alerts.push('Próxima ação não definida');
  if (itemsCount === 0) alerts.push('Nenhum produto registrado');
  if (!hasLocation) alerts.push('Visita sem localização');
  if (!hasContact) alerts.push('Contato da visita não informado');

  // Conclusão
  const conclusionParts: string[] = [];
  const completedItems: string[] = [];
  if (hasLocation) completedItems.push('registro de localização');
  if (photoCount > 0) completedItems.push('fotos');
  if (validatedEqCount > 0) completedItems.push('validação de equipamentos');
  if (completedItems.length > 0) {
    const list = completedItems.length === 1
      ? completedItems[0]
      : `${completedItems.slice(0, -1).join(', ')} e ${completedItems.slice(-1)}`;
    conclusionParts.push(`A visita foi concluída com ${list}.`);
  } else {
    conclusionParts.push('A visita ainda não possui registros de campo relevantes.');
  }
  if (potentialValue > 0) {
    conclusionParts.push(hasNextAction
      ? `Foi identificada oportunidade comercial de R$ ${potentialValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} e programado retorno para o cliente.`
      : `Foi identificada oportunidade comercial de R$ ${potentialValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`);
  } else if (hasNextAction) {
    conclusionParts.push('Foi programado retorno para o cliente.');
  }
  conclusionParts.push(alerts.length === 0
    ? 'A documentação da visita está completa.'
    : `Ainda existe${alerts.length > 1 ? 'm' : ''} ${alerts.length} ponto${alerts.length > 1 ? 's' : ''} de atenção a ser tratado${alerts.length > 1 ? 's' : ''}.`);


  // ===== 1. HEADER BAND =====
  pdf.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  pdf.rect(0, 0, pageWidth, 42, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Relatório da Visita', marginLeft, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(
    `${getTaskTypeLabel(task.taskType || 'prospection')} · ${task.startDate ? formatDateDisplay(task.startDate) : '—'}${task.startTime ? ' · ' + task.startTime : ''}${task.endTime ? '–' + task.endTime : ''}`,
    marginLeft, 23
  );
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(task.client || 'Cliente não informado', marginLeft, 33);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  if (task.property) pdf.text(task.property, marginLeft, 38.5);

  // Status pill
  const pillW = 46;
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(pageWidth - marginRight - pillW, 10, pillW, 8, 2, 2, 'F');
  pdf.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(statusLabel.toUpperCase(), pageWidth - marginRight - pillW / 2, 15.5, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  yPos = 50;

  // ===== 2. KPI CARDS =====
  const kpis: Array<[string, string]> = [
    ['Duração', duration],
    ['Equipamentos', String(equipmentCount)],
    ['Fotos', String(photoCount)],
    ['Localização', hasLocation ? 'Sim' : '—'],
    ['Valor Potencial', currency(potentialValue)],
    ['Valor Fechado', closedValue > 0 ? currency(closedValue) : '—'],
    ['Conversão', conversion],
    ['Itens Vendidos', `${task.checklist?.filter(i => i.selected).length || 0}/${task.checklist?.length || 0}`],
  ];
  const cols = 4;
  const cardW = (contentWidth - (cols - 1) * 3) / cols;
  const cardH = 15;
  kpis.forEach(([label, value], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginLeft + col * (cardW + 3);
    const y = yPos + row * (cardH + 3);
    pdf.setFillColor(245, 247, 252);
    pdf.setDrawColor(220, 226, 235);
    pdf.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text(label.toUpperCase(), x + 3, y + 5);
    pdf.setFontSize(10);
    pdf.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.text(value, x + 3, y + 11.5);
  });
  pdf.setTextColor(0, 0, 0);
  yPos += Math.ceil(kpis.length / cols) * (cardH + 3) + 3;

  // ===== 2.1 RESUMO EXECUTIVO =====
  sectionTitle('Resumo Executivo');
  {
    ensureSpace(summarySentences.length * 5 + 6);
    const boxY = yPos - 2;
    pdf.setFillColor(240, 245, 255);
    pdf.setDrawColor(200, 215, 240);
    const boxH = summarySentences.length * 4.6 + 6;
    pdf.roundedRect(marginLeft, boxY, contentWidth, boxH, 2, 2, 'FD');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    let ty = boxY + 5;
    summarySentences.forEach((s) => {
      const lines = pdf.splitTextToSize(s, contentWidth - 6);
      lines.forEach((ln: string) => { pdf.text(ln, marginLeft + 3, ty); ty += 4.6; });
    });
    yPos = boxY + boxH + 3;
  }

  // ===== 2.2 INDICADORES DA VISITA =====
  sectionTitle('Indicadores da Visita');
  {
    const colsInd = 2;
    const colW = (contentWidth - 4) / colsInd;
    const rowH = 6;
    indicators.forEach(([label, ok], i) => {
      const col = i % colsInd;
      const row = Math.floor(i / colsInd);
      const x = marginLeft + col * (colW + 4);
      const y = yPos + row * rowH;
      ensureSpace(rowH);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      if (ok) { pdf.setTextColor(22, 163, 74); pdf.text('OK', x, y); }
      else    { pdf.setTextColor(148, 163, 184); pdf.text('--', x, y); }
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(label, x + 8, y);
    });
    yPos += Math.ceil(indicators.length / colsInd) * rowH + 3;
  }

  // ===== 2.3 PONTOS DE ATENÇÃO =====
  sectionTitle('Pontos de Atenção');
  {
    if (alerts.length === 0) {
      ensureSpace(8);
      pdf.setFillColor(230, 250, 235);
      pdf.setDrawColor(180, 220, 190);
      pdf.roundedRect(marginLeft, yPos - 4, contentWidth, 7, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(22, 101, 52);
      pdf.text('Não há pendências nesta visita.', marginLeft + 3, yPos);
      pdf.setTextColor(0, 0, 0);
      yPos += 6;
    } else {
      alerts.forEach((a) => {
        ensureSpace(6);
        pdf.setFillColor(255, 247, 230);
        pdf.setDrawColor(240, 200, 130);
        pdf.roundedRect(marginLeft, yPos - 4, contentWidth, 6, 1.5, 1.5, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(180, 90, 0);
        pdf.text('!', marginLeft + 3, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        pdf.text(a, marginLeft + 8, yPos);
        yPos += 6;
      });
    }
    yPos += 2;
  }

  // ===== 2.4 OPORTUNIDADE =====
  sectionTitle('Oportunidade');
  fourColRow([
    ['Valor Potencial', potentialValue > 0 ? currency(potentialValue) : '—'],
    ['Valor Fechado', closedValue > 0 ? currency(closedValue) : '—'],
    ['Valor Parcial', partialValue > 0 ? currency(partialValue) : '—'],
    ['Taxa de Conversão', conversion],
  ]);
  fourColRow([
    ['Classificação', statusLabel],
    ['Interesse', String(task.opportunityInterest || '—')],
    ['Urgência', String(task.opportunityUrgency || '—')],
    ['Impacto', String(task.opportunityImpact || '—')],
  ]);
  twoColRow('Possibilidade de Fechamento', String(task.opportunityClosing || '—'), '', '');

  // ===== 3. DADOS DO CLIENTE =====

  sectionTitle('Dados do Cliente');
  twoColRow('Nome', task.client || '—', 'Código', task.clientCode || '—');
  twoColRow('Propriedade', task.property || '—', 'Hectares', task.propertyHectares ? `${task.propertyHectares} ha` : '—');
  twoColRow('Email', task.email || '—', 'Telefone', task.phone || '—');
  twoColRow('Responsável', task.responsible || '—', 'Filial', getFilialNameRobust(task.filial, filiais));
  if (task.filialAtendida) {
    twoColRow('Filial Atendida', getFilialNameRobust(task.filialAtendida, filiais),
      'Prioridade', task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Média' : 'Baixa');
  }

  // ===== 4. CONTATO DA VISITA =====
  if (task.contactName || task.contactFunction) {
    sectionTitle('Contato da Visita');
    twoColRow('Nome', task.contactName || '—', 'Função', task.contactFunction || '—');
  }

  // ===== 5. LOCALIZAÇÃO =====
  if (hasLocation) {
    sectionTitle('Localização do Check-in');
    fourColRow([
      ['Latitude', task.checkInLocation!.lat.toFixed(6)],
      ['Longitude', task.checkInLocation!.lng.toFixed(6)],
      ['Horário', task.checkInLocation!.timestamp ? format(new Date(task.checkInLocation!.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'],
      ['Status', 'Registrado'],
    ]);
    pdf.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    ensureSpace(6);
    pdf.textWithLink('Abrir no Google Maps', marginLeft, yPos,
      { url: `https://www.google.com/maps?q=${task.checkInLocation!.lat},${task.checkInLocation!.lng}` });
    pdf.setTextColor(0, 0, 0);
    yPos += 6;
  } else {
    sectionTitle('Localização do Check-in');
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    ensureSpace(6);
    pdf.text('Localização não registrada', marginLeft, yPos);
    pdf.setTextColor(0, 0, 0);
    yPos += 6;
  }

  // ===== 6. EQUIPAMENTOS =====
  if (task.equipmentList && task.equipmentList.length > 0) {
    const validatedCount = task.equipmentList.filter((eq: any) => {
      const v = eq.validated ?? eq.validado ?? eq.is_validated;
      return v === true || v === 'true';
    }).length;
    const pendingCount = equipmentCount - validatedCount;
    sectionTitle(`Parque de Máquinas (${equipmentCount} itens · ${equipmentUnits} unidades · ${validatedCount} validados · ${pendingCount} pendentes)`);

    const headers = ['#', 'Prio.', 'Modelo', 'Tipo', 'Nº Série', 'Ano', 'Horas', 'Qtd', 'Status', 'Valid.', 'Validado em'];
    const widths = [7, 14, 34, 20, 22, 10, 14, 9, 15, 12, 25];
    const startX = marginLeft;

    ensureSpace(8);
    pdf.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.rect(startX, yPos - 4, contentWidth, 6, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    let cx = startX + 2;
    headers.forEach((h, i) => { pdf.text(h, cx, yPos); cx += widths[i]; });
    pdf.setTextColor(0, 0, 0);
    yPos += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);

    task.equipmentList.forEach((eq: any, idx: number) => {
      ensureSpace(6);
      const validated = eq.validated ?? eq.validado ?? eq.is_validated;
      const validatedStr = validated === true || validated === 'true' ? 'Sim' : validated === false || validated === 'false' ? 'Não' : '—';
      const validatedAtRaw = eq.validatedAt ?? eq.validated_at ?? eq.validadoEm ?? eq.validado_em;
      let validatedAtStr = '—';
      if (validatedAtRaw) {
        try { validatedAtStr = format(new Date(validatedAtRaw), 'dd/MM/yyyy HH:mm', { locale: ptBR }); }
        catch { validatedAtStr = String(validatedAtRaw); }
      }
      const priority = eq.priority || eq.prioridade || '—';
      const status = eq.status || '—';
      const row = [
        String(idx + 1),
        String(priority),
        String(eq.model || eq.modelo || eq.familyProduct || '—'),
        String(eq.type || eq.tipo || eq.equipmentType || '—'),
        String(eq.serialNumber || eq.serial_number || eq.numeroSerie || '—'),
        String(eq.year || eq.ano || '—'),
        eq.hours || eq.horas || eq.workHours ? Number(eq.hours || eq.horas || eq.workHours).toLocaleString('pt-BR') : '—',
        String(eq.quantity || 0),
        String(status),
        validatedStr,
        validatedAtStr,
      ];
      cx = startX + 2;
      row.forEach((cell, i) => {
        const t = pdf.splitTextToSize(cell, widths[i] - 2);
        pdf.text(t[0] || '—', cx, yPos);
        cx += widths[i];
      });
      yPos += 5;
      const obs = eq.observation || eq.observations || eq.observacao || eq.notes;
      if (obs) {
        ensureSpace(5);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        const obsLines = pdf.splitTextToSize(`Obs: ${String(obs)}`, contentWidth - 4);
        pdf.text(obsLines[0], startX + 4, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        yPos += 4;
      }
    });
    yPos += 2;
  }

  // ===== 7. PRODUTOS E SERVIÇOS =====
  if (task.checklist && task.checklist.length > 0) {
    const selectedCount = task.checklist.filter(i => i.selected).length;
    sectionTitle(`Produtos e Serviços (${task.checklist.length})`);

    ensureSpace(8);
    pdf.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.rect(marginLeft, yPos - 4, contentWidth, 6, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('', marginLeft + 2, yPos);
    pdf.text('Produto / Serviço', marginLeft + 8, yPos);
    pdf.text('Qtd', marginLeft + 100, yPos);
    pdf.text('Unit.', marginLeft + 118, yPos);
    pdf.text('Subtotal', marginLeft + 145, yPos);
    pdf.text('Status', marginLeft + 170, yPos);
    pdf.setTextColor(0, 0, 0);
    yPos += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    task.checklist.forEach((item) => {
      ensureSpace(6);
      const subtotal = (item.price || 0) * (item.quantity || 1);
      pdf.text(item.selected ? '✓' : '·', marginLeft + 2, yPos);
      const name = pdf.splitTextToSize(item.name || '—', 88);
      pdf.text(name[0], marginLeft + 8, yPos);
      pdf.text(String(item.quantity || 1), marginLeft + 100, yPos);
      pdf.text(currency(item.price || 0), marginLeft + 115, yPos);
      pdf.text(currency(subtotal), marginLeft + 142, yPos);
      pdf.text(item.selected ? 'Vendido' : 'Ofertado', marginLeft + 170, yPos);
      yPos += 5;
      if ((item as any).category) {
        ensureSpace(4);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        pdf.text(`Categoria: ${String((item as any).category)}`, marginLeft + 8, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        yPos += 4;
      }
      if ((item as any).observations) {
        ensureSpace(4);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        const obsLines = pdf.splitTextToSize(`Obs: ${String((item as any).observations)}`, contentWidth - 10);
        pdf.text(obsLines[0], marginLeft + 8, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        yPos += 4;
      }
    });
    yPos += 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    ensureSpace(6);
    pdf.text(
      `${selectedCount}/${task.checklist.length} selecionados · Selecionado: ${currency(productsSelected)} · Total: ${currency(productsTotal)}`,
      marginLeft, yPos
    );
    yPos += 6;
    pdf.setFontSize(9);
  }

  // ===== 8. VISITA TÉCNICA =====
  if (task.taskType === 'technical_visit') {
    const est = (task as any).salesEstimate;
    const hasTech = task.technicalCategory || task.technicalFunnelStage
      || task.opportunityInterest || task.opportunityUrgency
      || task.opportunityImpact || task.opportunityClosing || est;
    if (hasTech) {
      sectionTitle('Dados da Visita Técnica');
      twoColRow('Categoria Técnica', String(task.technicalCategory || '—'),
        'Etapa Funil', String(task.technicalFunnelStage || '—'));
      twoColRow('Interesse', String(task.opportunityInterest || '—'),
        'Urgência', String(task.opportunityUrgency || '—'));
      twoColRow('Impacto', String(task.opportunityImpact || '—'),
        'Fechamento', String(task.opportunityClosing || '—'));
      if (est && typeof est === 'object') {
        Object.entries(est).filter(([k]) => k !== 'puk').forEach(([k, v]) => {
          twoColRow(`Estimativa ${k}`, currency(Number(v || 0)), '', '');
        });
        const totalEst = Object.entries(est)
          .filter(([k]) => k !== 'puk')
          .reduce((s, [, v]) => s + Number(v || 0), 0);
        twoColRow('Total Estimativa', currency(totalEst), '', '');
      }
    }
  }

  // ===== 9. PRÓXIMA AÇÃO =====
  if (task.nextAction || task.nextActionDate) {
    sectionTitle('Próxima Ação');
    if (task.nextAction) paragraph(String(task.nextAction));
    if (task.nextActionDate || task.responsible) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
      ensureSpace(6);
      const parts: string[] = [];
      if (task.nextActionDate) parts.push(`Data prevista: ${formatDateDisplay(task.nextActionDate as any)}`);
      if (task.responsible) parts.push(`Responsável: ${task.responsible}`);
      pdf.text(parts.join('    ·    '), marginLeft, yPos);
      pdf.setTextColor(0, 0, 0);
      yPos += 6;
    }
  }

  // ===== 10. OBSERVAÇÕES =====
  {
    sectionTitle('Observações e Notas');
    const hasObs = task.observations || task.prospectNotes || (task as any).prospectNotesJustification;
    if (!hasObs) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      ensureSpace(6);
      pdf.text('Nenhuma observação registrada', marginLeft, yPos);
      pdf.setTextColor(0, 0, 0);
      yPos += 6;
    } else {
      if (task.observations) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        ensureSpace(6); pdf.text('Observações da atividade:', marginLeft, yPos); yPos += 5;
        paragraph(task.observations);
      }
      if (task.prospectNotes) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        ensureSpace(6); pdf.text('Notas do prospect:', marginLeft, yPos); yPos += 5;
        paragraph(String(task.prospectNotes));
      }
      if ((task as any).prospectNotesJustification) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        ensureSpace(6); pdf.text('Justificativa:', marginLeft, yPos); yPos += 5;
        paragraph(String((task as any).prospectNotesJustification));
      }
    }
  }

  // ===== 11. TIMELINE =====
  sectionTitle('Timeline da Visita');
  const timeline: Array<[string, string]> = [];
  if (task.createdAt) timeline.push(['Visita criada', format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })]);
  if (task.startDate) timeline.push(['Visita agendada', `${formatDateDisplay(task.startDate)}${task.startTime ? ' ' + task.startTime : ''}`]);
  if (task.checkInLocation?.timestamp) {
    timeline.push(['Check-in realizado', format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })]);
  }
  if (task.updatedAt) timeline.push(['Última atualização', format(new Date(task.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })]);
  if (task.nextActionDate) timeline.push(['Próxima ação prevista', formatDateDisplay(task.nextActionDate as any)]);
  timeline.forEach(([title, date]) => {
    ensureSpace(6);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text('•', marginLeft, yPos);
    pdf.text(title, marginLeft + 4, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text(date, pageWidth - marginRight, yPos, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    yPos += 5.5;
  });
  yPos += 2;

  // ===== 12. FOTOS (com imagens reais) =====
  if (task.photos && task.photos.length > 0) {
    pdf.addPage(); yPos = 20;
    sectionTitle(`Registro Fotográfico (${task.photos.length})`);

    const maxPhotos = 12;
    const photosToProcess = task.photos.slice(0, maxPhotos);
    const loaded = await Promise.all(photosToProcess.map(p => loadImageAsBase64(p)));

    const imgW = 80, imgH = 60, gap = 10;
    let currentX = marginLeft;
    let inRow = 0;

    for (let i = 0; i < loaded.length; i++) {
      const base64 = loaded[i];
      ensureSpace(imgH + 10);
      if (base64) {
        try {
          const dims = await getImageDimensions(base64);
          const ar = dims.width / dims.height;
          let fw = imgW, fh = imgW / ar;
          if (fh > imgH) { fh = imgH; fw = imgH * ar; }
          pdf.addImage(base64, 'JPEG', currentX, yPos, fw, fh);
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
          pdf.text(`Foto ${i + 1}`, currentX + fw / 2, yPos + fh + 3, { align: 'center' });
          pdf.setTextColor(0, 0, 0);
        } catch {
          pdf.setFontSize(8); pdf.text(`${i + 1}. (erro ao carregar)`, currentX, yPos);
        }
      } else {
        pdf.setFontSize(8);
        pdf.text(`${i + 1}. ${photosToProcess[i].substring(0, 40)}…`, currentX, yPos);
      }
      inRow++;
      if (inRow >= 2) {
        yPos += imgH + 8;
        currentX = marginLeft;
        inRow = 0;
      } else {
        currentX += imgW + gap;
      }
    }
    if (inRow > 0) yPos += imgH + 8;
    if (task.photos.length > maxPhotos) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      ensureSpace(6);
      pdf.text(`(+${task.photos.length - maxPhotos} outras fotos não incluídas)`, marginLeft, yPos);
      pdf.setTextColor(0, 0, 0);
      yPos += 6;
    }
  }

  // ===== FOOTER =====
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.setFont('helvetica', 'italic');
    pdf.text(
      `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} · ${task.client || ''} · Página ${i} de ${pageCount}`,
      pageWidth / 2, pageHeight - 10, { align: 'center' }
    );
  }
  pdf.setTextColor(0, 0, 0);

  const clientName = (task.client || 'cliente').replace(/\s+/g, '-').toLowerCase();
  pdf.save(`visita-${clientName}-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
};
