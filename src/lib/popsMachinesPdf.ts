/**
 * PDF "POPS — Relação de Máquinas".
 *
 * Documento puramente documental: usa exatamente os dados já carregados na
 * relação de máquinas do cliente. Não altera registros, status ou vínculos.
 * Segue o mesmo padrão jsPDF nativo usado em equipmentRegularizationPdf.ts.
 */
import jsPDF from 'jspdf';

export interface PopsPdfMachine {
  model: string | null;
  serial: string | null;
  year: string | null;
  situation: string;
}

export interface PopsPdfInput {
  clientName: string | null;
  clientCode: string | null;
  filial: string | null;
  responsible: string | null;
  machines: PopsPdfMachine[];
}

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;

const line = (pdf: jsPDF, y: number) => {
  pdf.setDrawColor(200);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
};

const ensureSpace = (pdf: jsPDF, y: number, needed: number): number => {
  if (y + needed <= PAGE_H - 20) return y;
  pdf.addPage();
  return 20;
};

const nowBr = () =>
  new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function buildPopsMachinesPdf(data: PopsPdfInput): { blob: Blob; fileName: string } {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const generatedAt = nowBr();
  let y = 18;

  // Cabeçalho
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('POPS', PAGE_W / 2, y, { align: 'center' });
  y += 6;
  pdf.setFontSize(12);
  pdf.text('Relação de Máquinas', PAGE_W / 2, y, { align: 'center' });
  y += 5;
  line(pdf, y);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Cliente: ${data.clientName || '—'}`, MARGIN, y);
  pdf.text(`Código: ${data.clientCode || '—'}`, PAGE_W / 2, y);
  y += 5;
  pdf.text(`Filial: ${data.filial || '—'}`, MARGIN, y);
  pdf.text(`Data de geração: ${generatedAt}`, PAGE_W / 2, y);
  y += 5;
  pdf.text(`Responsável: ${data.responsible || '—'}`, MARGIN, y);
  pdf.text(`Máquinas selecionadas: ${data.machines.length}`, PAGE_W / 2, y);
  y += 6;
  line(pdf, y);
  y += 8;

  // Tabela
  const cols = [MARGIN, MARGIN + 58, MARGIN + 118, MARGIN + 140];
  const header = () => {
    pdf.setFillColor(240, 240, 240);
    pdf.rect(MARGIN, y - 4, PAGE_W - MARGIN * 2, 6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Modelo', cols[0] + 1, y);
    pdf.text('Chassi / Série', cols[1], y);
    pdf.text('Ano', cols[2], y);
    pdf.text('Situação', cols[3], y);
    pdf.setFont('helvetica', 'normal');
    y += 6;
  };
  header();

  data.machines.forEach((m) => {
    const before = y;
    y = ensureSpace(pdf, y, 8);
    if (y !== before) header();
    pdf.text(String(m.model || '—').slice(0, 32), cols[0] + 1, y);
    pdf.text(String(m.serial || '—').slice(0, 30), cols[1], y);
    pdf.text(m.year ? String(m.year) : '—', cols[2], y);
    pdf.text(m.situation || '—', cols[3], y);
    y += 5;
    pdf.setDrawColor(235);
    pdf.line(MARGIN, y - 2, PAGE_W - MARGIN, y - 2);
  });

  y = ensureSpace(pdf, y, 24);
  y += 8;
  pdf.setFontSize(8.5);
  pdf.setTextColor(110);
  const wrapped = pdf.splitTextToSize(
    'Documento gerado a partir da relação de máquinas do POPS para fins de conferência. ' +
      'A geração deste documento não altera situação, vínculo ou cadastro das máquinas.',
    PAGE_W - MARGIN * 2,
  );
  pdf.text(wrapped, MARGIN, y);
  pdf.setTextColor(0);

  // Rodapé
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(140);
    pdf.text(`POPS — Relação de Máquinas · ${generatedAt}`, MARGIN, PAGE_H - 10);
    pdf.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
    pdf.setTextColor(0);
  }

  const slug = (data.clientName || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return { blob: pdf.output('blob') as Blob, fileName: `pops-maquinas-${slug || 'cliente'}.pdf` };
}
