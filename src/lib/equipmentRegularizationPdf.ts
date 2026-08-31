/**
 * PDF do lote de Regularização de Máquinas.
 *
 * IMPORTANTE: gerar o PDF NÃO regulariza nada. O documento é montado
 * exclusivamente a partir do snapshot gravado nos itens do lote
 * (equipment_regularization_items), nunca do estado atual do Parque.
 *
 * A função devolve o Blob do documento para que a MESMA instância possa ser
 * baixada, visualizada e, futuramente, anexada ao e-mail de envio.
 */
import type jsPDFType from 'jspdf';

type jsPDF = jsPDFType;
import { formatDateDisplay } from '@/lib/utils';

export interface RegBatchItem {
  id: string;
  equipment_id: string;
  serial_chassis: string | null;
  model: string | null;
  year: number | null;
  machine_situation: 'vendida' | 'inativa' | 'sucateada' | string;
  client_code: string | null;
  client_name: string | null;
  filial_id: string | null;
  filial_nome: string | null;
  dealer_location: string | null;
}

export interface RegBatchDetail {
  id: string;
  status: string;
  send_status: string;
  send_error: string | null;
  send_attempts: number;
  recipients: string[];
  email_subject: string | null;
  email_message: string | null;
  header_city: string | null;
  header_state: string | null;
  document_date: string | null;
  pmp_number: string | null;
  signer_name: string | null;
  signer_role: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  notes: string | null;
  generated_at: string | null;
  pdf_generated_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  items: RegBatchItem[];
}

export const SITUATION_PDF_LABEL: Record<string, string> = {
  vendida: 'Vendida',
  inativa: 'Inativa',
  sucateada: 'Sucata',
  sucata: 'Sucata',
};

const MARGIN = 25;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ensureSpace = (pdf: jsPDF, y: number, needed: number): number => {
  if (y + needed <= PAGE_H - 25) return y;
  pdf.addPage();
  return 30;
};

export async function buildRegularizationPdf(batch: RegBatchDetail): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const { default: JsPDF } = await import('jspdf');
  const pdf = new JsPDF('p', 'mm', 'a4');
  let y = 34;

  // Título
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('DECLARAÇÃO DE NÃO LOCALIZAÇÃO', PAGE_W / 2, y, { align: 'center' });
  y += 14;

  // Texto introdutório
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  const intro1 =
    'Declaramos para os devidos fins que os equipamentos John Deere listados abaixo não foram ' +
    'localizados pelo concessionário. Foram realizadas tentativas de contato e, conforme ' +
    'informações disponíveis, os equipamentos encontram-se vendidos, inativos ou não localizados.';
  const intro2 =
    'Diante disso, solicitamos a regularização desses equipamentos no Parque de Máquinas, ' +
    'considerando a situação apresentada para cada chassi.';
  [intro1, intro2].forEach((p) => {
    const lines = pdf.splitTextToSize(p, CONTENT_W);
    pdf.text(lines, MARGIN, y, { align: 'justify', maxWidth: CONTENT_W });
    y += lines.length * 5.2 + 5;
  });
  y += 4;

  const docDate = batch.document_date ? formatDateDisplay(batch.document_date) : '—';

  // Agrupamento por cliente
  const groups = new Map<string, RegBatchItem[]>();
  batch.items.forEach((it) => {
    const key = `${it.client_code ?? '—'}|${it.client_name ?? '—'}|${it.filial_nome ?? '—'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  });

  groups.forEach((items, key) => {
    const [code, name, filial] = key.split('|');
    y = ensureSpace(pdf, y, 40);

    // Identificação
    pdf.setFontSize(10.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Cliente:', MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(name, MARGIN + pdf.getTextWidth('Cliente:') + 2, y);
    y += 5.5;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Código:', MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(code, MARGIN + pdf.getTextWidth('Código:') + 2, y);
    y += 5.5;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Filial:', MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(filial, MARGIN + pdf.getTextWidth('Filial:') + 2, y);
    y += 5.5;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Data:', MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(docDate, MARGIN + pdf.getTextWidth('Data:') + 2, y);
    y += 10;

    // Tabela
    const colW = [56, 60, 18, 26];
    const tableW = colW.reduce((a, b) => a + b, 0);
    const x0 = (PAGE_W - tableW) / 2;
    const colX = [x0, x0 + colW[0], x0 + colW[0] + colW[1], x0 + colW[0] + colW[1] + colW[2]];

    const drawHeader = () => {
      pdf.setDrawColor(120);
      pdf.setLineWidth(0.2);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.line(x0, y - 5, x0 + tableW, y - 5);
      pdf.text('Chassi / Série', colX[0] + 2, y);
      pdf.text('Modelo', colX[1] + 2, y);
      pdf.text('Ano', colX[2] + 2, y);
      pdf.text('Situação', colX[3] + 2, y);
      y += 2.5;
      pdf.line(x0, y, x0 + tableW, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
    };

    drawHeader();

    items.forEach((it) => {
      const before = y;
      y = ensureSpace(pdf, y, 10);
      if (y !== before) drawHeader();
      pdf.setFontSize(9.5);
      pdf.text(String(it.serial_chassis || '—').slice(0, 28), colX[0] + 2, y);
      pdf.text(String(it.model || '—').slice(0, 30), colX[1] + 2, y);
      pdf.text(it.year ? String(it.year) : '—', colX[2] + 2, y);
      pdf.text(
        SITUATION_PDF_LABEL[it.machine_situation] ?? it.machine_situation,
        colX[3] + 2,
        y,
      );
      y += 3;
      pdf.setDrawColor(215);
      pdf.line(x0, y, x0 + tableW, y);
      y += 5;
    });

    pdf.setDrawColor(120);
    pdf.line(x0, y - 5, x0 + tableW, y - 5);
    y += 8;
  });

  // Texto final
  y = ensureSpace(pdf, y, 30);
  pdf.setFontSize(10.5);
  const fim = pdf.splitTextToSize(
    'Cientes das informações apresentadas, solicitamos a regularização dos equipamentos ' +
      'relacionados acima no Parque de Máquinas.',
    CONTENT_W,
  );
  pdf.text(fim, MARGIN, y, { align: 'justify', maxWidth: CONTENT_W });
  y += fim.length * 5.2 + 8;

  if (batch.notes) {
    y = ensureSpace(pdf, y, 20);
    const obs = pdf.splitTextToSize(batch.notes, CONTENT_W);
    pdf.text(obs, MARGIN, y);
    y += obs.length * 5.2 + 8;
  }

  // Assinatura
  y = ensureSpace(pdf, y, 34);
  y += 16;
  pdf.setDrawColor(80);
  pdf.line(PAGE_W / 2 - 40, y, PAGE_W / 2 + 40, y);
  y += 5;
  pdf.setFontSize(10);
  pdf.text(batch.signer_name || '—', PAGE_W / 2, y, { align: 'center' });
  y += 5;
  pdf.setFontSize(9.5);
  pdf.setTextColor(110);
  pdf.text(batch.signer_role || '—', PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0);

  const blob = pdf.output('blob') as Blob;
  const fileName = 'declaracao-nao-localizacao.pdf';
  return { blob, fileName };
}

/** Converte o Blob do PDF em base64 (uso futuro: anexo de e-mail). */
export async function pdfBlobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  buf.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}
