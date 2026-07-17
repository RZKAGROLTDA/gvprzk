import { Task } from '@/types/task';

/**
 * Construtor único de dados para o Relatório de Checklist da Oficina.
 * Modal (TaskFormVisualization) e PDF (TaskPDFGenerator) DEVEM consumir daqui,
 * garantindo estrutura idêntica entre visualização e PDF.
 *
 * NÃO reutiliza campos comerciais (prospect, salesValue, vendaConfirmada,
 * próxima ação, oportunidade, timeline, tempo de execução).
 */

export const CANONICAL_CHECKLIST_ITEMS: string[] = [
  'Verificação de Óleo do Motor',
  'Nível de Óleo da Transmissão',
  'Verificação de Pneus',
  'Teste de Bateria',
  'Verificação de Luzes',
  'Inspeção de Suspensão',
  'Verificação de Líquidos',
  'Limpeza Geral',
];

export type ChecklistStatus = 'conforme' | 'atencao' | 'nao_conforme' | 'na' | null;

export interface ChecklistReportItem {
  name: string;
  status: ChecklistStatus;   // null = não preenchido
  notes: string;
  photos: string[];
}

export interface ChecklistReportMachine {
  tipo: string;
  modelo: string;
  chassi_serie: string;
  ano: string;
  horimetro: string;
  status: string;
  observacao: string;
  hasAny: boolean;
}

export interface ChecklistReportLocation {
  hasLocation: boolean;
  lat?: number;
  lng?: number;
  timestamp?: Date;
  googleMapsUrl?: string;
}

/**
 * Marco de transição do modelo de gravação da máquina do checklist.
 * Registros criados antes desta data podem não conter identificação
 * da máquina por limitação do modelo antigo. Não inferir, não editar.
 */
export const WORKSHOP_MACHINE_CUTOFF_DATE = new Date('2026-07-17T00:00:00');

export const LEGACY_TRANSITION_NOTE =
  `Registros anteriores a ${WORKSHOP_MACHINE_CUTOFF_DATE.toLocaleDateString('pt-BR')} ` +
  `podem não conter identificação da máquina devido ao modelo antigo de gravação.`;

export interface ChecklistReport {
  isLegacy: boolean;
  machine: ChecklistReportMachine;
  location: ChecklistReportLocation;
  items: ChecklistReportItem[];
  counts: {
    total: number;
    conforme: number;
    atencao: number;
    naoConforme: number;
    na: number;
    naoPreenchido: number;
  };
  conclusion: string;
  recommendations: Array<{ name: string; status: 'atencao' | 'nao_conforme'; note: string }>;
  hasGeneralObservations: boolean;
  generalObservations: string;
  generalPhotos: string[];
  hasContact: boolean;
  contact: {
    name: string;
    role: string;
    email: string;
    phone: string;
  };
}

const norm = (s: string) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

export function buildWorkshopChecklistReport(task: Task): ChecklistReport {
  const rawProducts: any[] = Array.isArray(task.checklist) ? (task.checklist as any[]) : [];

  const m: any = (task as any).checklistMachine || {};
  const machineHasAny = !!(
    m.tipo || m.modelo || m.chassi_serie || m.ano || m.horimetro || m.status || m.observacao
  );

  const createdAt = task.createdAt ? new Date(task.createdAt) : null;
  const isBeforeCutoff = !!createdAt && createdAt < WORKSHOP_MACHINE_CUTOFF_DATE;
  // Legacy = registros anteriores ao marco sem máquina persistida.
  // Não permite edição posterior nem inferência — só exibe o que foi realmente gravado.
  const isLegacy = isBeforeCutoff && !machineHasAny;

  // Itens: no fluxo novo, preenchemos os 8 canônicos.
  // No legado, mostramos APENAS itens realmente gravados (sem forçar "não preenchido").
  const canonicalItems: ChecklistReportItem[] = CANONICAL_CHECKLIST_ITEMS.map((canon) => {
    const match = rawProducts.find(p => norm(p.name) === norm(canon));
    const status = (match?.responseStatus ?? null) as ChecklistStatus;
    return {
      name: canon,
      status,
      notes: String(match?.responseNotes || '').trim(),
      photos: Array.isArray(match?.photos) ? match.photos.filter(Boolean) : [],
    };
  });

  const extras: ChecklistReportItem[] = rawProducts
    .filter(p => !CANONICAL_CHECKLIST_ITEMS.some(c => norm(c) === norm(p.name)))
    .filter(p => p?.responseStatus || (p?.responseNotes && String(p.responseNotes).trim()) || (Array.isArray(p?.photos) && p.photos.length))
    .map(p => ({
      name: p.name || 'Item',
      status: (p.responseStatus ?? null) as ChecklistStatus,
      notes: String(p.responseNotes || '').trim(),
      photos: Array.isArray(p.photos) ? p.photos.filter(Boolean) : [],
    }));

  const hasData = (i: ChecklistReportItem) =>
    i.status !== null || !!i.notes || i.photos.length > 0;

  const allItems = isLegacy
    ? [...canonicalItems.filter(hasData), ...extras]
    : [...canonicalItems, ...extras];

  const counts = {
    total: allItems.length,
    conforme: allItems.filter(i => i.status === 'conforme').length,
    atencao: allItems.filter(i => i.status === 'atencao').length,
    naoConforme: allItems.filter(i => i.status === 'nao_conforme').length,
    na: allItems.filter(i => i.status === 'na').length,
    naoPreenchido: allItems.filter(i => i.status === null).length,
  };

  const respondidos = counts.conforme + counts.atencao + counts.naoConforme + counts.na;
  let conclusion: string;
  if (counts.naoConforme > 0) {
    conclusion = 'Foram identificadas não conformidades que necessitam de correção.';
  } else if (counts.atencao > 0) {
    conclusion = 'Foram identificados pontos que exigem atenção.';
  } else if (respondidos > 0) {
    conclusion = 'Checklist concluído sem não conformidades.';
  } else {
    conclusion = 'Nenhum item do checklist foi avaliado.';
  }

  const recommendations = allItems
    .filter(i => i.status === 'atencao' || i.status === 'nao_conforme')
    .map(i => ({
      name: i.name,
      status: i.status as 'atencao' | 'nao_conforme',
      note: i.notes,
    }));

  const machine: ChecklistReportMachine = {
    tipo: String(m.tipo || ''),
    modelo: String(m.modelo || ''),
    chassi_serie: String(m.chassi_serie || ''),
    ano: String(m.ano || ''),
    horimetro: String(m.horimetro || ''),
    status: String(m.status || ''),
    observacao: String(m.observacao || ''),
    hasAny: machineHasAny,
  };

  const ci = task.checkInLocation;
  const hasLocation = !!(ci?.lat && ci?.lng);
  const location: ChecklistReportLocation = hasLocation
    ? {
        hasLocation: true,
        lat: ci!.lat,
        lng: ci!.lng,
        timestamp: ci!.timestamp ? new Date(ci!.timestamp) : undefined,
        googleMapsUrl: `https://www.google.com/maps?q=${ci!.lat},${ci!.lng}`,
      }
    : { hasLocation: false };

  const generalPhotos = Array.isArray(task.photos) ? task.photos.filter(Boolean) : [];
  const generalObservations = String(task.observations || '').trim();

  const hasContact = !!(task.contactName || task.contactFunction || task.email || task.phone);

  return {
    isLegacy,
    machine,
    location,
    items: allItems,
    counts,
    conclusion,
    recommendations,
    hasGeneralObservations: !!generalObservations,
    generalObservations,
    generalPhotos,
    hasContact,
    contact: {
      name: String(task.contactName || ''),
      role: String(task.contactFunction || ''),
      email: String(task.email || ''),
      phone: String(task.phone || ''),
    },
  };
}


export const STATUS_META: Record<Exclude<ChecklistStatus, null>, { label: string; sym: string }> & {
  none: { label: string; sym: string };
} = {
  conforme: { label: 'Conforme', sym: '✓' },
  atencao: { label: 'Atenção', sym: '!' },
  nao_conforme: { label: 'Não conforme', sym: '✕' },
  na: { label: 'Não se aplica', sym: '—' },
  none: { label: 'Não preenchido', sym: '○' },
};
