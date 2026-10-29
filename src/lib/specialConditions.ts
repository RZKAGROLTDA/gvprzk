import { formatDateToLocal } from '@/lib/utils';

export type ConditionType = 'safra' | 'normal';
export const conditionTypeLabel = (type: string | null | undefined) =>
  type === 'safra' ? 'Condição Safra' : type === 'normal' ? 'Condição Normal' : '—';

export function currentConditionPeriod(now = new Date()) {
  return { start: formatDateToLocal(new Date(now.getFullYear(), now.getMonth(), 1)), end: formatDateToLocal(now) };
}

export function conditionInPeriod(date: string | null, start: string, end: string) {
  return (!start || (date !== null && date >= start)) && (!end || (date !== null && date <= end));
}

export function parseConditionMargin(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Informe uma margem válida com até duas casas decimais');
  const number = Number(normalized);
  if (!Number.isFinite(number) || Math.abs(number) >= 10000000000) throw new Error('Margem inválida');
  return number;
}

export function requireConditionType(type: string): ConditionType {
  if (type !== 'safra' && type !== 'normal') throw new Error('Selecione o Tipo de Condição');
  return type;
}

export function weightedConditionMargin(rows: { sale_value: number; margin_percent: number | null }[]) {
  const eligible = rows.filter(row => row.margin_percent !== null && Number.isFinite(Number(row.margin_percent)));
  const denominator = eligible.reduce((sum, row) => sum + Number(row.sale_value), 0);
  if (!eligible.length || denominator === 0) return null;
  return eligible.reduce((sum, row) => sum + Number(row.sale_value) * Number(row.margin_percent), 0) / denominator;
}

export const CONDITION_PAGE_SIZE = 1000;
export async function collectConditionPages<T extends { id: string }>(fetchPage: (after: string | null) => Promise<T[]>) {
  const rows: T[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  for (;;) {
    const batch = await fetchPage(after);
    if (!batch.length) return rows;
    if (batch.length > CONDITION_PAGE_SIZE) throw new Error('Lote acima do limite permitido');
    let previous = after;
    for (const row of batch) {
      if (seen.has(row.id) || (previous !== null && row.id <= previous)) throw new Error('Paginação inválida: IDs duplicados ou fora de ordem');
      seen.add(row.id);
      previous = row.id;
    }
    rows.push(...batch);
    after = batch[batch.length - 1]?.id ?? null;
    if (!after) throw new Error('Paginação não avançou');
  }
}