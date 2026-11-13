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

/** Indicadores da tabela; variação consolidada compara somente filiais com um par de lançamentos. */
export function projectionPanelMetrics(rows: ProjectionRow[]) {
  const total = consolidate(rows);
  const launched = rows.filter((r) => !isPending(r) && r.ultima_sem_risco != null && Number.isFinite(r.ultima_sem_risco));
  let previous = 0, current = 0, pairs = 0;
  for (const r of launched) {
    for (let week = (r.ultima_semana ?? 1) - 1; week >= 1; week--) {
      const value = r[`s${week}_sem` as 's1_sem' | 's2_sem' | 's3_sem' | 's4_sem'];
      if (value == null || !Number.isFinite(value)) continue;
      previous += value;
      current += r.ultima_sem_risco ?? 0;
      pairs++;
      break;
    }
  }
  return {
    ...total,
    pctMeta: launched.length && total.meta > 0 && Number.isFinite(total.meta) ? total.pctSem : null,
    gap: launched.length && total.meta > 0 && Number.isFinite(total.meta) ? total.gapSem : null,
    variation: pairs && previous > 0 ? ((current - previous) / previous) * 100 : null,
    weeks: ([1, 2, 3, 4] as const).map((week) => {
      const values = rows.map((r) => r[`s${week}_sem`]).filter((v): v is number => v != null && Number.isFinite(v));
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    }),
  };
}

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
export const DIVISIONAIS = ['MT', 'GO', 'PA', 'C&F'] as const;
const divRank = (d: string | null) => { const i = (DIVISIONAIS as readonly string[]).indexOf(d ?? ''); return i < 0 ? DIVISIONAIS.length : i; };
/** Ordena filiais MT → GO → PA → C&F → sem divisional, e por nome dentro de cada uma. */
export function sortByDivisional<T extends { divisional: string | null; filial_nome: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => divRank(a.divisional) - divRank(b.divisional) || a.filial_nome.localeCompare(b.filial_nome, 'pt-BR'));
}
/** Consolida por divisional na ordem oficial. includeAll mostra as quatro divisionais mesmo sem filiais. */
export function consolidateByDivisional(rows: ProjectionRow[], includeAll = false) {
  const groups = new Map<string, ProjectionRow[]>();
  if (includeAll) for (const d of DIVISIONAIS) groups.set(d, []);
  for (const r of rows) {
    const k = r.divisional ?? 'Sem divisional';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => divRank(a === 'Sem divisional' ? null : a) - divRank(b === 'Sem divisional' ? null : b))
    .map(([divisional, rs]) => ({ divisional, ...consolidate(rs) }));
}
/** Filtro do painel: divisional ('all' | código | 'none') e filial ('all' | id). */
export function filterRows(rows: ProjectionRow[], div: string, filial: string) {
  return rows.filter((r) => (div === 'all' || (r.divisional ?? 'none') === div) && (filial === 'all' || r.filial_id === filial));
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

export type ProjectionWeek = 1 | 2 | 3 | 4;
/** Semana padrão do painel: dias 1–7 = S1, 8–14 = S2, 15–21 = S3, 22+ = S4; mês passado = S4, futuro = S1. */
export function defaultProjectionWeek(today: Date, ano: number, mes: number): ProjectionWeek {
  const cur = today.getFullYear() * 12 + today.getMonth(), sel = ano * 12 + (mes - 1);
  if (sel < cur) return 4;
  if (sel > cur) return 1;
  return Math.min(4, Math.floor((today.getDate() - 1) / 7) + 1) as ProjectionWeek;
}
/**
 * Visão da semana selecionada: cada filial passa a valer somente o lançamento ativo daquela semana
 * (uma vez por filial). Sem lançamento na semana = PENDENTE, sem recorrer a outra semana. Meta inalterada.
 */
export function rowsForWeek(rows: ProjectionRow[], week: ProjectionWeek): ProjectionRow[] {
  return rows.map((r) => {
    const sem = r[`s${week}_sem` as 's1_sem'];
    const com = r[`s${week}_com` as 's1_com'];
    const has = sem != null && Number.isFinite(sem);
    const sameAsLatest = has && r.ultima_semana === week;
    return {
      ...r,
      ultima_semana: has ? week : null,
      ultima_sem_risco: has ? sem : null,
      ultima_com_risco: has ? (com ?? null) : null,
      ultima_atualizacao: sameAsLatest ? r.ultima_atualizacao : null,
      atualizado_por: sameAsLatest ? r.atualizado_por : null,
    };
  });
}

/** Tele Vendas nunca participa da Projeção (o servidor também exclui). */
export const isTeleVendasName = (nome: string | null | undefined) =>
  (nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '').includes('televendas');

/**
 * Filial de contexto da Projeção (somente local; não altera a Filial Ativa global).
 * Admin: null (escopo global). Supervisor: só a Filial Ativa. Gerente: Filial Ativa,
 * ou automaticamente a única filial autorizada elegível (sem Tele Vendas).
 */
export function resolveProjectionScopeFilial(p: {
  isAdmin: boolean; isManager: boolean; activeFilialId: string | null | undefined;
  filiais: { id: string; nome: string }[];
}): string | null {
  if (p.isAdmin) return null;
  if (p.activeFilialId) return p.activeFilialId;
  if (!p.isManager) return null;
  const elegiveis = p.filiais.filter((f) => !isTeleVendasName(f.nome));
  return elegiveis.length === 1 ? elegiveis[0].id : null;
}
