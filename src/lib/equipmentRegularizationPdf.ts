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
import jsPDF from 'jspdf';
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

export function buildRegularizationPdf(batch: RegBatchDetail): {
  blob: Blob;
  fileName: string;
} {
  const pdf = new jsPDF('p', 'mm', 'a4');
  let y = 18;

  // Cabeçalho
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('REGULARIZAÇÃO DE MÁQUINAS', PAGE_W / 2, y, { align: 'center' });
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text('Documento de comunicação ao cliente — Parque de Máquinas', PAGE_W / 2, y, {
    align: 'center',
  });
  pdf.setTextColor(0);
  y += 4;
  line(pdf, y);
  y += 7;

  // Dados do documento
  const docDate = batch.document_date ? formatDateDisplay(batch.document_date) : '—';
  const place = [batch.header_city, batch.header_state].filter(Boolean).join(' / ') || '—';
  pdf.setFontSize(9);
  pdf.text(`Local: ${place}`, MARGIN, y);
  pdf.text(`Data: ${docDate}`, PAGE_W / 2, y);
  y += 5;
  pdf.text(`Lote: ${batch.id}`, MARGIN, y);
  if (batch.pmp_number) pdf.text(`PMP: ${batch.pmp_number}`, PAGE_W / 2, y);
  y += 5;
  pdf.text(`Total de máquinas: ${batch.items.length}`, MARGIN, y);
  y += 6;
  line(pdf, y);
  y += 8;

  // Agrupamento por cliente
  const groups = new Map<string, RegBatchItem[]>();
  batch.items.forEach((it) => {
    const key = `${it.client_code ?? '—'}|${it.client_name ?? '—'}|${it.filial_nome ?? '—'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  });

  groups.forEach((items, key) => {
    const [code, name, filial] = key.split('|');
    y = ensureSpace(pdf, y, 30);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(`Cliente: ${name}`, MARGIN, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Código: ${code}    Filial: ${filial}`, MARGIN, y);
    y += 6;

    // Cabeçalho da tabela
    const cols = [MARGIN, MARGIN + 48, MARGIN + 108, MARGIN + 132];
    pdf.setFillColor(240, 240, 240);
    pdf.rect(MARGIN, y - 4, PAGE_W - MARGIN * 2, 6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Chassi / Série', cols[0] + 1, y);
    pdf.text('Modelo', cols[1], y);
    pdf.text('Ano', cols[2], y);
    pdf.text('Situação', cols[3], y);
    pdf.setFont('helvetica', 'normal');
    y += 6;

    items.forEach((it) => {
      y = ensureSpace(pdf, y, 8);
      pdf.text(String(it.serial_chassis || '—').slice(0, 26), cols[0] + 1, y);
      pdf.text(String(it.model || '—').slice(0, 30), cols[1], y);
      pdf.text(it.year ? String(it.year) : '—', cols[2], y);
      pdf.text(SITUATION_PDF_LABEL[it.machine_situation] ?? it.machine_situation, cols[3], y);
      y += 5;
      pdf.setDrawColor(235);
      pdf.line(MARGIN, y - 2, PAGE_W - MARGIN, y - 2);
    });

    y += 6;
  });

  // Texto final
  y = ensureSpace(pdf, y, 40);
  y += 2;
  pdf.setFontSize(9);
  const texto =
    'Comunicamos que as máquinas relacionadas neste documento constam em nosso Parque de Máquinas ' +
    'com as situações acima indicadas. Solicitamos a conferência das informações e, caso haja ' +
    'divergência, o retorno a esta concessionária para atualização cadastral. Não havendo ' +
    'manifestação, as informações serão consideradas corretas para fins de controle do parque e ' +
    'atendimento de garantia.';
  const wrapped = pdf.splitTextToSize(texto, PAGE_W - MARGIN * 2);
  pdf.text(wrapped, MARGIN, y);
  y += wrapped.length * 4.5 + 10;

  if (batch.notes) {
    y = ensureSpace(pdf, y, 20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Observações:', MARGIN, y);
    pdf.setFont('helvetica', 'normal');
    y += 5;
    const obs = pdf.splitTextToSize(batch.notes, PAGE_W - MARGIN * 2);
    pdf.text(obs, MARGIN, y);
    y += obs.length * 4.5 + 8;
  }

  // Assinatura (somente responsável RZK)
  y = ensureSpace(pdf, y, 30);
  y += 8;
  pdf.line(MARGIN, y, MARGIN + 80, y);
  y += 5;
  pdf.text(batch.signer_name || '—', MARGIN, y);
  y += 4.5;
  pdf.setTextColor(110);
  pdf.text(batch.signer_role || '—', MARGIN, y);
  y += 4.5;
  pdf.text(`Data: ${docDate}`, MARGIN, y);
  pdf.setTextColor(0);

  // Rodapé
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(140);
    pdf.text(`Lote ${batch.id}`, MARGIN, PAGE_H - 10);
    pdf.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
    pdf.setTextColor(0);
  }

  const blob = pdf.output('blob') as Blob;
  const fileName = `regularizacao-${batch.id.slice(0, 8)}.pdf`;
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
