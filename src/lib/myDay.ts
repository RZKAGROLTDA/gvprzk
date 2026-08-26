/**
 * Meu Dia — tipos, normalização e navegação.
 *
 * Fonte de dados EXCLUSIVA: RPCs get_my_day_summary() e get_my_day_details().
 * Nunca consultar tasks / task_followups / trainings / visit_schedules aqui.
 * As chaves técnicas dos blocos (inclusive `open_tasks`) nunca aparecem na UI.
 */

import { formatDateDisplay } from '@/lib/utils';

export type MyDayBlock = 'visit_schedules' | 'returns' | 'trainings' | 'open_tasks';
export type MyDayBucket = 'overdue' | 'today' | 'upcoming';

/** Rótulos visuais oficiais dos blocos. */
export const BLOCK_LABELS: Record<MyDayBlock, string> = {
  visit_schedules: 'Visitas Programadas',
  returns: 'Retornos',
  trainings: 'Treinamentos',
  open_tasks: 'Próximas Ações',
};

export const BLOCK_ORDER: MyDayBlock[] = ['visit_schedules', 'returns', 'trainings', 'open_tasks'];

export const BUCKET_LABELS: Record<MyDayBucket, string> = {
  overdue: 'Atrasado',
  today: 'Hoje',
  upcoming: 'Próximos',
};

/** Mensagens de vazio por bloco/bucket (nunca tratar vazio como erro). */
export const emptyMessage = (block: MyDayBlock, bucket: MyDayBucket): string => {
  const label = BLOCK_LABELS[block].toLowerCase();
  if (bucket === 'today') return `Nenhum item de ${label} para hoje`;
  if (bucket === 'overdue') return `Nenhum item de ${label} atrasado`;
  return `Nenhum item de ${label} nos próximos dias`;
};

export interface MyDayGoal {
  meta: number | null;
  realizado: number;
  faltam: number | null;
  atingida: boolean | null;
  period_type: 'daily' | 'weekly' | null;
  weekdays_only: boolean | null;
  sem_meta_hoje: boolean;
}

export interface MyDayBlockData {
  overdue_count: number;
  today_count: number;
  upcoming_count: number;
  overdue_preview: any[];
  today_preview: any[];
  upcoming_preview: any[];
}

export interface MyDaySummary {
  user: {
    user_id: string;
    role: string;
    today: string;
    week_start: string;
    week_end: string;
    is_weekend: boolean;
  };
  goals: { visitas: MyDayGoal; ligacoes: MyDayGoal };
  visit_schedules: MyDayBlockData;
  returns: MyDayBlockData;
  trainings: MyDayBlockData;
  open_tasks: MyDayBlockData;
}

export interface MyDayDetails {
  block: MyDayBlock;
  bucket: MyDayBucket;
  today: string;
  limit: number;
  offset: number;
  total_count: number;
  items: any[];
}

/** Item normalizado exibido na interface. */
export interface MyDayItem {
  key: string;
  id: string;
  block: MyDayBlock;
  typeLabel: string;
  clientLabel: string;
  date: string | null;
  dateLabel: string;
  time: string | null;
  description: string | null;
}

const clean = (value?: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const clientWithCode = (name?: string | null, code?: string | null): string => {
  const n = clean(name);
  const c = clean(code);
  if (n && c) return `${c} — ${n}`;
  return n || c || 'Cliente não informado';
};

/** Converte o item cru da RPC no formato exibido, por bloco. */
export const normalizeItem = (block: MyDayBlock, raw: any): MyDayItem => {
  const base = { block, typeLabel: BLOCK_LABELS[block], id: String(raw?.id ?? '') };

  if (block === 'visit_schedules') {
    return {
      ...base,
      key: `visit_schedules-${base.id}`,
      clientLabel: clientWithCode(raw?.client_name, raw?.client_code),
      date: raw?.planned_date ?? null,
      dateLabel: raw?.planned_date ? formatDateDisplay(raw.planned_date) : '—',
      time: null,
      description: clean(raw?.observation),
    };
  }

  if (block === 'returns') {
    return {
      ...base,
      key: `returns-${base.id}`,
      clientLabel: clientWithCode(raw?.client_name, raw?.client_code),
      date: raw?.next_return_date ?? null,
      dateLabel: raw?.next_return_date ? formatDateDisplay(raw.next_return_date) : '—',
      time: null,
      description: clean(raw?.notes),
    };
  }

  if (block === 'trainings') {
    const hours = raw?.hours != null ? `${raw.hours}h` : null;
    return {
      ...base,
      key: `trainings-${base.id}`,
      clientLabel: clean(raw?.name) || 'Treinamento',
      date: raw?.training_date ?? null,
      dateLabel: raw?.training_date ? formatDateDisplay(raw.training_date) : '—',
      time: clean(raw?.training_time)?.slice(0, 5) ?? null,
      description: hours,
    };
  }

  return {
    ...base,
    key: `open_tasks-${base.id}`,
    clientLabel: clientWithCode(raw?.client, raw?.clientcode),
    date: raw?.next_action_date ?? null,
    dateLabel: raw?.next_action_date ? formatDateDisplay(raw.next_action_date) : '—',
    time: null,
    description: clean(raw?.next_action) || clean(raw?.title),
  };
};

export const previewOf = (data: MyDayBlockData | undefined, bucket: MyDayBucket): any[] => {
  if (!data) return [];
  if (bucket === 'overdue') return data.overdue_preview ?? [];
  if (bucket === 'today') return data.today_preview ?? [];
  return data.upcoming_preview ?? [];
};

export const countOf = (data: MyDayBlockData | undefined, bucket: MyDayBucket): number => {
  if (!data) return 0;
  if (bucket === 'overdue') return Number(data.overdue_count ?? 0);
  if (bucket === 'today') return Number(data.today_count ?? 0);
  return Number(data.upcoming_count ?? 0);
};

export const bucketTotal = (summary: MyDaySummary | undefined, bucket: MyDayBucket): number =>
  BLOCK_ORDER.reduce((acc, block) => acc + countOf(summary?.[block], bucket), 0);

/** Ordena itens de blocos diferentes por data e hora dentro do bucket. */
export const sortByDateTime = (items: MyDayItem[]): MyDayItem[] =>
  [...items].sort((a, b) => {
    const da = a.date ?? '9999-12-31';
    const db = b.date ?? '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.time ?? '99:99';
    const tb = b.time ?? '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.clientLabel.localeCompare(b.clientLabel, 'pt-BR');
  });

/**
 * Destino de navegação. O Meu Dia é somente leitura: sempre reaproveita as
 * telas existentes, nunca abre edição própria.
 */
export const destinationFor = (item: MyDayItem): string => {
  switch (item.block) {
    case 'visit_schedules':
      return '/crm?tab=programacao';
    case 'returns':
      return '/crm?tab=retornos';
    case 'trainings':
      return '/crm?tab=treinamentos';
    default:
      return '/dashboard?view=details';
  }
};

/** Cargos operacionais que iniciam a sessão no Meu Dia. */
export const MY_DAY_LANDING_ROLES = [
  'sales_consultant',
  'consultant',
  'technical_consultant',
  'rac',
  'cpa',
  'csa',
];

export const shouldLandOnMyDay = (roles: string[]): boolean =>
  roles.some((r) => MY_DAY_LANDING_ROLES.includes(String(r).toLowerCase()));
