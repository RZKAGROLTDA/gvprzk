/**
 * Classificação de vigência de regras de campanha (public.campaign_rules).
 *
 * A identidade da campanha é SEMPRE campaign_rules.id — campaign_name não é
 * único (ex.: AGRISHOW possui 3 regras com gatilhos diferentes).
 *
 * Regras:
 *   vigente     → active = true e hoje entre start_date e end_date
 *   futura      → start_date > hoje
 *   encerrada   → end_date < hoje ou active = false
 *   sem_periodo → start_date ou end_date ausente
 */

export type CampaignStatus = 'vigente' | 'futura' | 'encerrada' | 'sem_periodo';

export interface CampaignPeriodInput {
  id: string;
  campaign_name: string;
  trigger_min: number | string;
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const getCampaignStatus = (
  rule: Pick<CampaignPeriodInput, 'active' | 'start_date' | 'end_date'>,
  today = todayISO(),
): CampaignStatus => {
  const start = rule.start_date || null;
  const end = rule.end_date || null;

  if (!rule.active) return 'encerrada';
  if (!start || !end) return 'sem_periodo';
  if (start > today) return 'futura';
  if (end < today) return 'encerrada';
  return 'vigente';
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  vigente: 'Vigente',
  futura: 'Futura',
  encerrada: 'Encerrada',
  sem_periodo: 'Sem período',
};

export const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  'default' | 'secondary' | 'outline'
> = {
  vigente: 'default',
  futura: 'outline',
  encerrada: 'secondary',
  sem_periodo: 'outline',
};

const currency = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

/** Rótulo que desambigua regras com o mesmo campaign_name. */
export const getCampaignRuleLabel = (rule: CampaignPeriodInput) =>
  `${rule.campaign_name} — Gatilho ${currency(Number(rule.trigger_min) || 0)}`;

export const formatPeriod = (
  rule: Pick<CampaignPeriodInput, 'start_date' | 'end_date'>,
) => {
  const fmt = (iso?: string | null) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}/${m}/${y}` : null;
  };
  const s = fmt(rule.start_date);
  const e = fmt(rule.end_date);
  if (!s && !e) return 'Sem período definido';
  return `${s ?? '—'} a ${e ?? '—'}`;
};
