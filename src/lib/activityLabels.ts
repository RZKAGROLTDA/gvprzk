// Centralized labels and helpers for follow-up activities and technical-visit
// funnel stages. Used by CRM, Management, Agenda and reports.

export type FollowupActivityType =
  | 'visita'
  | 'visita_tecnica'
  | 'ligacao'
  | 'checklist'
  | 'reuniao'
  | 'outro';

export const ACTIVITY_LABELS: Record<FollowupActivityType, string> = {
  visita: 'Visita Fazenda',
  visita_tecnica: 'Visita Técnica',
  ligacao: 'Ligação',
  checklist: 'Checklist',
  reuniao: 'Reunião',
  outro: 'Outro',
};

export const getActivityLabel = (t?: string | null): string => {
  if (!t) return '—';
  return ACTIVITY_LABELS[t as FollowupActivityType] ?? t;
};

// Funil técnico (mantido em sync com tasks.technical_funnel_stage)
export type TechnicalFunnelStage =
  | 'prospectado'
  | 'orcamento_enviado'
  | 'negociacao'
  | 'aguardando_aprovacao'
  | 'fechado'
  | 'perdido';

export const TECHNICAL_FUNNEL_LABELS: Record<TechnicalFunnelStage, string> = {
  prospectado: 'Prospectado',
  orcamento_enviado: 'Orçamento Enviado',
  negociacao: 'Negociação',
  aguardando_aprovacao: 'Aguardando Aprovação',
  fechado: 'Fechado',
  perdido: 'Perdido',
};

export const TECHNICAL_FUNNEL_OPTIONS: { value: TechnicalFunnelStage; label: string }[] =
  (Object.keys(TECHNICAL_FUNNEL_LABELS) as TechnicalFunnelStage[]).map(value => ({
    value,
    label: TECHNICAL_FUNNEL_LABELS[value],
  }));

// Próxima ação (lista controlada conforme spec)
export const TECHNICAL_NEXT_ACTIONS = [
  'Enviar orçamento',
  'Agendar retorno',
  'Programar visita técnica',
  'Acompanhamento comercial',
] as const;

export type TechnicalNextAction = (typeof TECHNICAL_NEXT_ACTIONS)[number];

// Estrutura padronizada do JSON technical_visit_data
export interface TechnicalVisitData {
  service_type?: string;
  estimates?: {
    servicos?: number;
    pecas?: number;
    treinamento?: number;
    puk?: number;
  };
  classification?: {
    interesse_cliente?: 'baixa' | 'media' | 'alta';
    urgencia_operacional?: 'baixa' | 'media' | 'alta';
    impacto_disponibilidade?: 'baixa' | 'media' | 'alta';
    possibilidade_fechamento?: 'baixa' | 'media' | 'alta';
  };
  next_action?: string;
}

export const emptyTechnicalVisitData = (): TechnicalVisitData => ({
  service_type: '',
  estimates: { servicos: 0, pecas: 0, treinamento: 0, puk: 0 },
  classification: {},
  next_action: '',
});

export const sumTechnicalEstimates = (d?: TechnicalVisitData | null): number => {
  const e = d?.estimates;
  if (!e) return 0;
  return (e.servicos || 0) + (e.pecas || 0) + (e.treinamento || 0) + (e.puk || 0);
};
