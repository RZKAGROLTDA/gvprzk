import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task } from '@/types/task';
import { formatDateDisplay } from '@/lib/utils';
import { getFilialNameRobust } from '@/lib/taskStandardization';
import {
  buildWorkshopChecklistReport,
  STATUS_META,
  ChecklistStatus,
  LEGACY_TRANSITION_NOTE,
} from '@/lib/workshopChecklistReport';

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

const statusMeta = (s: ChecklistStatus) => (s === null ? STATUS_META.none : STATUS_META[s]);

const statusColor = (s: ChecklistStatus): [number, number, number] =>
  s === 'conforme' ? [22, 163, 74]
  : s === 'atencao' ? [217, 119, 6]
  : s === 'nao_conforme' ? [220, 38, 38]
  : s === 'na' ? [110, 120, 135]
  : [140, 140, 140];

/**
 * Gera o PDF do Relatório de Checklist da Oficina — fluxo técnico isolado,
 * sem conteúdo comercial (Prospect, Valor, Oportunidade, Próxima ação, Timeline, Duração).
 */
export const generateWorkshopChecklistPDF = async (
  task: Task,
  filiais: any[] = [],
) => {
  const report = buildWorkshopChecklistReport(task);

  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let yPos = 20;

  const PRIMARY: [number, number, number] = [37, 99, 235];
  const MUTED: [number, number, number] = [110, 120, 135];
  const SUCCESS: [number, number, number] = [22, 163, 74];
  const WARNING: [number, number, number] = [217, 119, 6];
  const DANGER: [number, number, number] = [220, 38, 38];
  const BORDER: [number, number, number] = [220, 224, 232];

  const ensureSpace = (needed: number) => {
    if (yPos + needed > pageHeight - 18) {
      pdf.addPage();
      yPos = 20;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    yPos += 3;
    pdf.setDrawColor(...PRIMARY);
    pdf.setLineWidth(0.6);
    pdf.line(marginLeft, yPos - 1, marginLeft + 4, yPos - 1);
    pdf.setTextColor(...PRIMARY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title.toUpperCase(), marginLeft + 6, yPos + 1);
    pdf.setTextColor(0, 0, 0);
    yPos += 7;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
  };

  const kv = (label: string, value: string, colX: number, colW: number) => {
    pdf.setTextColor(...MUTED);
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

  const threeColRow = (items: Array<[string, string]>) => {
    ensureSpace(10);
    const colW = (contentWidth - 6) / 3;
    items.forEach(([l, v], i) => kv(l, v, marginLeft + i * (colW + 3), colW));
    yPos += 9;
  };

  const paragraph = (text: string, size = 9) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(5);
      pdf.text(line, marginLeft, yPos);
      yPos += size * 0.5;
    }
    yPos += 1;
  };

  // ================= 1. CABEÇALHO =================
  pdf.setFillColor(...PRIMARY);
  pdf.rect(0, 0, pageWidth, 20, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('RELATÓRIO DE CHECKLIST DA OFICINA', marginLeft, 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(
    `${task.startDate ? formatDateDisplay(task.startDate) : '—'}${task.startTime ? ' · ' + task.startTime : ''}`,
    pageWidth - marginRight,
    13,
    { align: 'right' },
  );
  pdf.setTextColor(0, 0, 0);
  yPos = 30;

  // Meta bar (Nº · Data · Responsável · Filial)
  pdf.setDrawColor(...BORDER);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(marginLeft, yPos, contentWidth, 16, 2, 2);
  const metaColW = contentWidth / 4;
  const metaTop = yPos + 4;
  const meta: Array<[string, string]> = [
    ['Nº do Relatório', task.id?.slice(0, 8).toUpperCase() || '—'],
    ['Data', task.startDate ? formatDateDisplay(task.startDate) : '—'],
    ['Responsável técnico', task.responsible || '—'],
    ['Filial', getFilialNameRobust(task.filial, filiais) || '—'],
  ];
  meta.forEach(([l, v], i) => {
    const x = marginLeft + 4 + i * metaColW;
    pdf.setTextColor(...MUTED);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.text(l.toUpperCase(), x, metaTop);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const vLines = pdf.splitTextToSize(v, metaColW - 6);
    pdf.text(vLines[0] || '—', x, metaTop + 5.5);
  });
  yPos += 22;

  // ================= 2. CLIENTE =================
  sectionTitle('Cliente');
  twoColRow('Nome', task.client || '—', 'Código', task.clientCode || '—');
  twoColRow('Propriedade', task.property || '—', 'Contato', task.contactName || task.responsible || '—');
  if (report.hasContact) {
    twoColRow('Telefone', task.phone || '—', 'E-mail', task.email || '—');
  }

  // ================= 3. MÁQUINA =================
  sectionTitle('Máquina');
  if (report.machine.hasAny) {
    // Chassi destacado
    ensureSpace(20);
    pdf.setFillColor(239, 246, 255);
    pdf.setDrawColor(...PRIMARY);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(marginLeft, yPos, contentWidth, 16, 2, 2, 'FD');
    pdf.setTextColor(...PRIMARY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('CHASSI / Nº DE SÉRIE', marginLeft + 4, yPos + 5);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(14);
    pdf.text(report.machine.chassi_serie || '—', marginLeft + 4, yPos + 12);
    pdf.setFont('helvetica', 'normal');
    yPos += 22;

    threeColRow([
      ['Tipo', report.machine.tipo || '—'],
      ['Modelo', report.machine.modelo || '—'],
      ['Ano', report.machine.ano || '—'],
    ]);
    threeColRow([
      ['Horímetro', report.machine.horimetro || '—'],
      ['Status', report.machine.status
        ? report.machine.status.charAt(0).toUpperCase() + report.machine.status.slice(1)
        : '—'],
      ['', ''],
    ]);
    if (report.machine.observacao) {
      pdf.setTextColor(...MUTED);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      ensureSpace(6);
      pdf.text('OBSERVAÇÃO DA MÁQUINA', marginLeft, yPos);
      yPos += 4;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      paragraph(report.machine.observacao);
    }
  } else {
    pdf.setTextColor(...MUTED);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    ensureSpace(6);
    pdf.text(
      report.isLegacy
        ? 'Dados da máquina não disponíveis no registro original.'
        : 'Máquina não informada.',
      marginLeft,
      yPos,
    );
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
    yPos += 7;
  }

  // ================= 4. LOCALIZAÇÃO =================
  sectionTitle('Localização do Checklist');
  if (report.location.hasLocation) {
    threeColRow([
      ['Latitude', report.location.lat!.toFixed(6)],
      ['Longitude', report.location.lng!.toFixed(6)],
      ['Horário do check-in',
        report.location.timestamp
          ? format(report.location.timestamp, "dd/MM/yyyy HH:mm", { locale: ptBR })
          : '—'],
    ]);
    pdf.setTextColor(...PRIMARY);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    ensureSpace(5);
    pdf.textWithLink(report.location.googleMapsUrl!, marginLeft, yPos, { url: report.location.googleMapsUrl! });
    pdf.setTextColor(0, 0, 0);
    yPos += 6;
  } else {
    pdf.setTextColor(...MUTED);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    ensureSpace(6);
    pdf.text('Localização não registrada.', marginLeft, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
    yPos += 7;
  }

  // ================= 5. RESUMO — oculto em legados =================
  if (!report.isLegacy) {
    sectionTitle('Resumo');
    const summary = [
      { label: 'Total', value: String(report.counts.total), color: PRIMARY },
      { label: 'Conformes', value: String(report.counts.conforme), color: SUCCESS },
      { label: 'Atenção', value: String(report.counts.atencao), color: WARNING },
      { label: 'Não conformes', value: String(report.counts.naoConforme), color: DANGER },
      { label: 'N/A', value: String(report.counts.na), color: MUTED },
      { label: 'Não preenchidos', value: String(report.counts.naoPreenchido), color: MUTED },
    ];
    ensureSpace(22);
    const cardW = (contentWidth - 5 * 2) / 6;
    const cardH = 18;
    summary.forEach((s, i) => {
      const x = marginLeft + i * (cardW + 2);
      pdf.setDrawColor(...s.color);
      pdf.setLineWidth(0.5);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, yPos, cardW, cardH, 1.5, 1.5, 'FD');
      pdf.setTextColor(...MUTED);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);
      pdf.text(s.label.toUpperCase(), x + 2, yPos + 4.5);
      pdf.setTextColor(...s.color);
      pdf.setFontSize(14);
      pdf.text(s.value, x + 2, yPos + 13);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
    });
    yPos += cardH + 6;
  }

  // ================= 6. SERVIÇOS VERIFICADOS =================
  sectionTitle('Serviços Verificados');

  // Table header
  ensureSpace(9);
  pdf.setFillColor(245, 247, 250);
  pdf.rect(marginLeft, yPos, contentWidth, 7, 'F');
  pdf.setTextColor(...MUTED);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('#', marginLeft + 2, yPos + 4.6);
  pdf.text('SERVIÇO', marginLeft + 10, yPos + 4.6);
  pdf.text('RESULTADO', marginLeft + 88, yPos + 4.6);
  pdf.text('OBSERVAÇÃO', marginLeft + 128, yPos + 4.6);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  yPos += 7;

  report.items.forEach((item, idx) => {
    const meta = statusMeta(item.status);
    const color = statusColor(item.status);
    const notesText = item.notes || '—';
    const noteLines = pdf.splitTextToSize(notesText, contentWidth - 128);
    const rowH = Math.max(8, 4 + noteLines.length * 3.8);
    ensureSpace(rowH + 2);

    if (idx % 2 === 1) {
      pdf.setFillColor(250, 251, 253);
      pdf.rect(marginLeft, yPos, contentWidth, rowH, 'F');
    }

    pdf.setTextColor(...MUTED);
    pdf.setFontSize(8);
    pdf.text(String(idx + 1), marginLeft + 2, yPos + 5);

    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    const nameLines = pdf.splitTextToSize(item.name, 74);
    pdf.text(nameLines[0], marginLeft + 10, yPos + 5);
    pdf.setFont('helvetica', 'normal');

    // Status badge
    pdf.setFillColor(...color);
    pdf.roundedRect(marginLeft + 88, yPos + 1.5, 36, 5.5, 1.2, 1.2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${meta.sym}  ${meta.label}`, marginLeft + 90, yPos + 5.3);
    pdf.setFont('helvetica', 'normal');

    // Observation
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(8);
    noteLines.forEach((ln: string, li: number) => {
      pdf.text(ln, marginLeft + 128, yPos + 5 + li * 3.8);
    });

    yPos += rowH;
    pdf.setDrawColor(...BORDER);
    pdf.setLineWidth(0.15);
    pdf.line(marginLeft, yPos, marginLeft + contentWidth, yPos);
  });
  yPos += 4;

  // ================= 6.1 FOTOS POR SERVIÇO =================
  const itemsWithPhotos = report.items.filter(i => i.photos.length > 0);
  if (itemsWithPhotos.length > 0) {
    sectionTitle('Fotos por Serviço');
    for (const it of itemsWithPhotos) {
      ensureSpace(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(it.name, marginLeft, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...MUTED);
      pdf.setFontSize(7);
      pdf.text(`${it.photos.length} foto(s)`, marginLeft + contentWidth, yPos, { align: 'right' });
      pdf.setTextColor(0, 0, 0);
      yPos += 4;

      // Photo grid — up to 4 per row
      const perRow = 4;
      const gap = 3;
      const photoW = (contentWidth - gap * (perRow - 1)) / perRow;
      const photoH = photoW * 0.75;

      for (let i = 0; i < it.photos.length; i += perRow) {
        const batch = it.photos.slice(i, i + perRow);
        ensureSpace(photoH + 4);
        for (let j = 0; j < batch.length; j++) {
          const url = batch[j];
          const base64 = await loadImageAsBase64(url);
          const x = marginLeft + j * (photoW + gap);
          if (base64) {
            try {
              const dim = await getImageDimensions(base64);
              const ratio = dim.width / dim.height;
              let w = photoW, h = photoH;
              if (ratio > w / h) h = w / ratio; else w = h * ratio;
              const ox = x + (photoW - w) / 2;
              const oy = yPos + (photoH - h) / 2;
              pdf.setDrawColor(...BORDER);
              pdf.setLineWidth(0.2);
              pdf.rect(x, yPos, photoW, photoH);
              pdf.addImage(base64, 'JPEG', ox, oy, w, h, undefined, 'FAST');
            } catch {
              pdf.setDrawColor(...BORDER);
              pdf.rect(x, yPos, photoW, photoH);
            }
          } else {
            pdf.setDrawColor(...BORDER);
            pdf.rect(x, yPos, photoW, photoH);
          }
        }
        yPos += photoH + 3;
      }
    }
  }

  // ================= 7. OBSERVAÇÃO GERAL =================
  if (report.hasGeneralObservations) {
    sectionTitle('Observação Geral');
    paragraph(report.generalObservations);
  }

  // ================= 8. RECOMENDAÇÕES TÉCNICAS =================
  sectionTitle('Recomendações Técnicas');
  if (report.recommendations.length === 0) {
    pdf.setTextColor(...SUCCESS);
    pdf.setFontSize(9);
    ensureSpace(6);
    pdf.text('Nenhuma recomendação técnica registrada.', marginLeft, yPos);
    pdf.setTextColor(0, 0, 0);
    yPos += 7;
  } else {
    report.recommendations.forEach((r) => {
      const color = r.status === 'nao_conforme' ? DANGER : WARNING;
      const noteLines = pdf.splitTextToSize(r.note || 'Sem observação registrada.', contentWidth - 10);
      const rowH = 8 + noteLines.length * 4.2;
      ensureSpace(rowH + 2);
      pdf.setDrawColor(...color);
      pdf.setFillColor(color[0], color[1], color[2]);
      pdf.rect(marginLeft, yPos, 1.5, rowH, 'F');
      pdf.setTextColor(...color);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(r.status === 'nao_conforme' ? 'NÃO CONFORME' : 'ATENÇÃO', marginLeft + 4, yPos + 4);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9);
      pdf.text(r.name, marginLeft + 34, yPos + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      noteLines.forEach((ln: string, i: number) => {
        pdf.text(ln, marginLeft + 4, yPos + 9 + i * 4.2);
      });
      yPos += rowH + 2;
    });
  }

  // ================= 9. CONCLUSÃO TÉCNICA =================
  ensureSpace(20);
  yPos += 2;
  const conclusionColor =
    report.counts.naoConforme > 0 ? DANGER
    : report.counts.atencao > 0 ? WARNING
    : report.counts.naoPreenchido > 0 ? WARNING
    : SUCCESS;
  pdf.setDrawColor(...conclusionColor);
  pdf.setFillColor(255, 255, 255);
  pdf.setLineWidth(0.6);
  const concLines = pdf.splitTextToSize(report.conclusion, contentWidth - 10);
  const concH = 10 + concLines.length * 5.2;
  pdf.roundedRect(marginLeft, yPos, contentWidth, concH, 2, 2, 'FD');
  pdf.setTextColor(...conclusionColor);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('CONCLUSÃO TÉCNICA', marginLeft + 4, yPos + 5);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  concLines.forEach((ln: string, i: number) => {
    pdf.text(ln, marginLeft + 4, yPos + 10 + i * 5.2);
  });
  yPos += concH + 6;

  // ================= 9.1 REGISTRO FOTOGRÁFICO GERAL =================
  if (report.generalPhotos.length > 0) {
    sectionTitle('Registro Fotográfico Geral');
    const perRow = 3;
    const gap = 4;
    const photoW = (contentWidth - gap * (perRow - 1)) / perRow;
    const photoH = photoW * 0.75;
    for (let i = 0; i < report.generalPhotos.length; i += perRow) {
      const batch = report.generalPhotos.slice(i, i + perRow);
      ensureSpace(photoH + 4);
      for (let j = 0; j < batch.length; j++) {
        const base64 = await loadImageAsBase64(batch[j]);
        const x = marginLeft + j * (photoW + gap);
        if (base64) {
          try {
            const dim = await getImageDimensions(base64);
            const ratio = dim.width / dim.height;
            let w = photoW, h = photoH;
            if (ratio > w / h) h = w / ratio; else w = h * ratio;
            const ox = x + (photoW - w) / 2;
            const oy = yPos + (photoH - h) / 2;
            pdf.setDrawColor(...BORDER);
            pdf.rect(x, yPos, photoW, photoH);
            pdf.addImage(base64, 'JPEG', ox, oy, w, h, undefined, 'FAST');
          } catch {
            pdf.setDrawColor(...BORDER);
            pdf.rect(x, yPos, photoW, photoH);
          }
        } else {
          pdf.setDrawColor(...BORDER);
          pdf.rect(x, yPos, photoW, photoH);
        }
      }
      yPos += photoH + 4;
    }
  }

  // ================= 10. ASSINATURAS =================
  ensureSpace(38);
  yPos += 6;
  sectionTitle('Assinaturas');
  const sigW = (contentWidth - 10) / 2;
  const sigTop = yPos + 6;
  // Linha assinatura técnico
  pdf.setDrawColor(80, 80, 80);
  pdf.setLineWidth(0.4);
  pdf.line(marginLeft, sigTop + 14, marginLeft + sigW, sigTop + 14);
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RESPONSÁVEL TÉCNICO', marginLeft, sigTop + 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(9);
  pdf.text(task.responsible || 'Nome:', marginLeft, sigTop + 22);
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(7);
  pdf.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, marginLeft, sigTop + 26);

  // Linha assinatura cliente
  const cx = marginLeft + sigW + 10;
  pdf.setDrawColor(80, 80, 80);
  pdf.line(cx, sigTop + 14, cx + sigW, sigTop + 14);
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('CLIENTE', cx, sigTop + 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(9);
  pdf.text(task.contactName || task.client || 'Nome:', cx, sigTop + 22);
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(7);
  pdf.text('Data: ____/____/________', cx, sigTop + 26);

  // ================= FOOTER (todas as páginas) =================
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...BORDER);
    pdf.setLineWidth(0.2);
    pdf.line(marginLeft, pageHeight - 12, pageWidth - marginRight, pageHeight - 12);
    pdf.setTextColor(...MUTED);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text('Relatório de Checklist da Oficina', marginLeft, pageHeight - 7);
    pdf.text(`Página ${p} de ${pageCount}`, pageWidth - marginRight, pageHeight - 7, { align: 'right' });
  }

  const safeClient = (task.client || 'cliente').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
  const dateStr = task.startDate ? format(new Date(task.startDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  pdf.save(`checklist-oficina_${safeClient}_${dateStr}.pdf`);
};
