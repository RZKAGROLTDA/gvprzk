// Regras da aba Projeção: consolidação usa somente a ÚLTIMA semana lançada de cada filial.
export interface ProjectionRow {
  filial_id: string; filial_nome: string; divisional: string | null; meta: number | null;
  s1_sem: number | null; s1_com: number | null; s2_sem: number | null; s2_com: number | null;
  s3_sem: number | null; s3_com: number | null; s4_sem: number | null; s4_com: number | null;
  ultima_semana: number | null; ultima_sem_risco: number | null; ultima_com_risco: number | null;
  ultima_atualizacao: string | null; atualizado_por: string | null;
}
export interface Consolidated {
  meta: number; semRisco: number; comRisco: number; pendentes: number; filiais: number;
  pctSem: number | null; pctCom: number | null; gapSem: number; gapCom: number;
}
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));

export function normalizeRow(r: any): ProjectionRow {
  const out: any = { ...r };
  for (const k of ['meta','s1_sem','s1_com','s2_sem','s2_com','s3_sem','s3_com','s4_sem','s4_com','ultima_sem_risco','ultima_com_risco','ultima_semana']) out[k] = n(r[k]);
  return out;
}
export const isPending = (r: ProjectionRow) => r.ultima_semana == null;

export function consolidate(rows: ProjectionRow[]): Consolidated {
  let meta = 0, semRisco = 0, comRisco = 0, pendentes = 0;
  for (const r of rows) {
    meta += r.meta ?? 0;
    if (isPending(r)) { pendentes++; continue; }
    semRisco += r.ultima_sem_risco ?? 0; // última semana apenas, nunca soma S1..S4
    comRisco += r.ultima_com_risco ?? 0;
  }
  return {
    meta, semRisco, comRisco, pendentes, filiais: rows.length,
    pctSem: meta > 0 ? (semRisco / meta) * 100 : null,
    pctCom: meta > 0 ? (comRisco / meta) * 100 : null,
    gapSem: semRisco - meta, gapCom: comRisco - meta,
  };
}
export function consolidateByDivisional(rows: ProjectionRow[]) {
  const groups = new Map<string, ProjectionRow[]>();
  for (const r of rows) {
    const k = r.divisional ?? 'Sem divisional';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([divisional, rs]) => ({ divisional, ...consolidate(rs) }));
}

export interface GoalImportRow { filial: string; mes: number; ano: number; meta: number }
export interface GoalImportResult { valid: { filial_id: string; filial_nome: string; ano: number; mes: number; meta: number }[]; errors: string[] }
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Valida linhas da planilha (Filial, Mês, Ano, Meta) contra as filiais da projeção. */
export function validateGoalImport(raw: Record<string, unknown>[], filiais: { filial_id: string; filial_nome: string }[]): GoalImportResult {
  const byName = new Map(filiais.map((f) => [norm(f.filial_nome), f]));
  const valid: GoalImportResult['valid'] = []; const errors: string[] = []; const seen = new Set<string>();
  raw.forEach((row, i) => {
    const get = (key: string) => { const k = Object.keys(row).find((x) => norm(x) === key); return k ? row[k] : undefined; };
    const line = i + 2;
    const nome = String(get('filial') ?? '').trim();
    const mes = Number(get('mes')); const ano = Number(get('ano'));
    const metaRaw = get('meta');
    const meta = typeof metaRaw === 'number' ? metaRaw : Number(String(metaRaw ?? '').replace(/[R$\s.]/g, '').replace(',', '.'));
    if (!nome) return errors.push(`Linha ${line}: filial vazia`);
    if (norm(nome).replace(/\s/g, '') === 'televendas') return errors.push(`Linha ${line}: Tele Vendas fora da Projeção`);
    const f = byName.get(norm(nome));
    if (!f) return errors.push(`Linha ${line}: filial "${nome}" não encontrada`);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) return errors.push(`Linha ${line}: mês inválido`);
    if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) return errors.push(`Linha ${line}: ano inválido`);
    if (metaRaw == null || metaRaw === '' || !Number.isFinite(meta) || meta < 0) return errors.push(`Linha ${line}: meta inválida`);
    const key = `${f.filial_id}-${ano}-${mes}`;
    if (seen.has(key)) return errors.push(`Linha ${line}: filial/mês repetidos na planilha`);
    seen.add(key);
    valid.push({ filial_id: f.filial_id, filial_nome: f.filial_nome, ano, mes, meta });
  });
  return { valid, errors };
}
