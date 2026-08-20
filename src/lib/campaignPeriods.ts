/**
 * Fonte única de verdade para os períodos (meses) de desconto das campanhas.
 *
 * A estrutura oficial é `campaign_rules.discount_periods`
 * (jsonb: `[{ label: string, percent: number }]`).
 *
 * As colunas legadas `gained_april` / `gained_may` / `gained_june` permanecem no
 * banco apenas por compatibilidade histórica e são usadas SOMENTE como fallback
 * de exibição, quando a regra/lançamento não possui `discount_periods`.
 *
 * Nada aqui escreve no banco nem altera cálculos de gatilho/compromisso.
 */

export interface DiscountPeriod {
  label: string;
  percent: number;
}

/** Normaliza o jsonb `discount_periods` para um array tipado e seguro. */
export const normalizeDiscountPeriods = (value: unknown): DiscountPeriod[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const p = (raw ?? {}) as { label?: unknown; percent?: unknown };
      return {
        label: String(p.label ?? '').trim(),
        percent: Number(p.percent ?? 0) || 0,
      };
    })
    .filter((p) => p.label.length > 0);
};

interface LegacyPercents {
  gained_april?: number | string | null;
  gained_may?: number | string | null;
  gained_june?: number | string | null;
}

const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Índice cronológico (0-11) do mês reconhecido no rótulo, ou null. */
export const monthIndexFromLabel = (label: string): number | null => {
  const norm = stripDiacritics(String(label || '').trim().toLowerCase());
  if (!norm) return null;
  for (let i = 0; i < MONTHS_PT.length; i++) {
    const month = stripDiacritics(MONTHS_PT[i]);
    if (norm.startsWith(month.slice(0, 3))) return i;
  }
  return null;
};

/** Rótulo curto para cabeçalhos: "Agosto" → "Ago". Rótulos livres são truncados. */
export const shortPeriodLabel = (label: string): string => {
  const raw = String(label || '').trim();
  if (!raw) return '—';
  const idx = monthIndexFromLabel(raw);
  if (idx !== null) {
    const m = MONTHS_PT[idx];
    return m.charAt(0).toUpperCase() + m.slice(1, 3);
  }
  return raw.length > 8 ? `${raw.slice(0, 8)}…` : raw;
};

const legacyPeriods = (src?: LegacyPercents | null): DiscountPeriod[] => {
  if (!src) return [];
  const candidates: DiscountPeriod[] = [
    { label: 'Abril', percent: Number(src.gained_april ?? 0) },
    { label: 'Maio', percent: Number(src.gained_may ?? 0) },
    { label: 'Junho', percent: Number(src.gained_june ?? 0) },
  ];
  return candidates.filter((p) => Number.isFinite(p.percent) && p.percent > 0);
};

/** Períodos oficiais de uma regra; fallback legado somente se o array estiver vazio. */
export const getRuleDiscountPeriods = (
  rule?: ({ discount_periods?: unknown } & LegacyPercents) | null,
): DiscountPeriod[] => {
  if (!rule) return [];
  const periods = normalizeDiscountPeriods(rule.discount_periods).filter((p) => p.label.trim());
  return periods.length > 0 ? periods : legacyPeriods(rule);
};

/**
 * Períodos de um lançamento. Prioriza a regra vinculada (fonte única);
 * lançamentos históricos sem regra caem no fallback legado do próprio registro.
 */
export const getEntryDiscountPeriods = (
  entry: LegacyPercents,
  rule?: ({ discount_periods?: unknown } & LegacyPercents) | null,
): DiscountPeriod[] => {
  const fromRule = getRuleDiscountPeriods(rule);
  if (fromRule.length > 0) return fromRule;
  return legacyPeriods(entry);
};

/**
 * Consolida os rótulos de várias campanhas/lançamentos:
 * sem duplicatas (case-insensitive), em ordem cronológica quando o mês é
 * reconhecível; rótulos livres vão ao final, na ordem de aparição.
 */
export const getSelectedCampaignPeriodLabels = (
  groups: DiscountPeriod[][],
): string[] => {
  const seen = new Map<string, { label: string; month: number | null; order: number }>();
  let order = 0;
  groups.forEach((periods) => {
    periods.forEach((p) => {
      const label = String(p.label || '').trim();
      if (!label) return;
      const key = stripDiacritics(label.toLowerCase());
      if (seen.has(key)) return;
      seen.set(key, { label, month: monthIndexFromLabel(label), order: order++ });
    });
  });
  return Array.from(seen.values())
    .sort((a, b) => {
      if (a.month !== null && b.month !== null) return a.month - b.month || a.order - b.order;
      if (a.month !== null) return -1;
      if (b.month !== null) return 1;
      return a.order - b.order;
    })
    .map((v) => v.label);
};

/** Percentual do rótulo informado dentro dos períodos, ou null se ausente. */
export const percentForLabel = (
  periods: DiscountPeriod[],
  label: string,
): number | null => {
  const key = stripDiacritics(String(label || '').trim().toLowerCase());
  const found = periods.find(
    (p) => stripDiacritics(String(p.label || '').trim().toLowerCase()) === key,
  );
  return found ? Number(found.percent) || 0 : null;
};

const pct = (v: number) =>
  `${(Number(v) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

/** "Agosto 2,00% / Setembro 3,00%" para seletores e resumos. */
export const formatPeriodsInline = (
  periods: DiscountPeriod[],
  separator = ' / ',
): string =>
  periods
    .filter((p) => String(p.label || '').trim())
    .map((p) => `${p.label} ${pct(p.percent)}`)
    .join(separator);
