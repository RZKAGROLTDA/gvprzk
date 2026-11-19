export interface SummaryActivity {
  id: string;
  filial_id: string | null;
  responsible_user_id: string | null;
  activity_type: string | null;
  client_code?: string | null;
  client_name?: string | null;
}
export interface SummaryMetrics { total: number; visitas: number; ligacoes: number; checklists: number; clientes: number }
export interface SummaryRow extends SummaryMetrics { key: string; label: string }

const clientKey = (a: SummaryActivity) => a.client_code?.trim().toLowerCase() || a.client_name?.trim().toLowerCase() || '';

/** Agrega por chave; cada atividade conta uma vez (pelo id) e clientes únicos são distintos por grupo. */
export function summarize(
  activities: SummaryActivity[],
  keyOf: (a: SummaryActivity) => string | null,
  groups: { key: string; label: string }[] = [],
  labelOf: (key: string) => string = (k) => k,
): SummaryRow[] {
  const acc = new Map<string, SummaryRow & { set: Set<string> }>();
  const ensure = (key: string, label: string) => {
    if (!acc.has(key)) acc.set(key, { key, label, total: 0, visitas: 0, ligacoes: 0, checklists: 0, clientes: 0, set: new Set() });
    return acc.get(key)!;
  };
  groups.forEach((g) => ensure(g.key, g.label));
  const seen = new Set<string>();
  for (const a of activities) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const k = keyOf(a);
    if (k === null) continue;
    const r = ensure(k, acc.get(k)?.label ?? labelOf(k));
    r.total++;
    if (a.activity_type === 'visita') r.visitas++;
    else if (a.activity_type === 'ligacao') r.ligacoes++;
    else if (a.activity_type === 'checklist') r.checklists++;
    const c = clientKey(a);
    if (c) r.set.add(c);
  }
  return [...acc.values()].map(({ set, ...r }) => ({ ...r, clientes: set.size }));
}
