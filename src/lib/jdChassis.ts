import { supabase } from '@/integrations/supabase/client';

/**
 * Auditoria de duplicidade de chassis — Campanha JD.
 * Normalização espelha public.normalize_chassis (maiúsculas, sem espaços).
 * A classificação é sempre calculada no servidor contra a base completa;
 * o frontend nunca lê a base JD diretamente (restrita a administradores).
 */

/** Auditoria JD v2 — situação de cada CHECKLIST (por ID Atividade). */
export type JdStatus = 'ok' | 'duplicado' | 'sem_chassi' | 'nao_auditado';

export const JD_STATUS_LABEL: Record<JdStatus, string> = {
  ok: 'OK — Primeiro registro',
  duplicado: 'Duplicado',
  sem_chassi: 'Sem chassi',
  nao_auditado: 'Não auditado',
};

export const JD_STATUS_VARIANT: Record<JdStatus, 'destructive' | 'success' | 'warning' | 'secondary'> = {
  ok: 'success',
  duplicado: 'destructive',
  sem_chassi: 'warning',
  nao_auditado: 'secondary',
};

export const JD_STATUS_OPTIONS: JdStatus[] = ['ok', 'duplicado', 'sem_chassi', 'nao_auditado'];

/** Rótulo seguro: qualquer valor desconhecido/ausente vira "Não auditado". */
export const jdLabel = (st: string | null | undefined): string =>
  JD_STATUS_LABEL[(st as JdStatus)] ?? JD_STATUS_LABEL.nao_auditado;
export const jdVariant = (st: string | null | undefined) =>
  JD_STATUS_VARIANT[(st as JdStatus)] ?? JD_STATUS_VARIANT.nao_auditado;

export const normalizeChassis = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, '').toUpperCase();

/** Chassi válido: 5 a 30 caracteres alfanuméricos após normalização. */
export const isValidChassis = (normalized: string): boolean => /^[A-Z0-9]{5,30}$/.test(normalized);

const CLASSIFY_CHUNK = 1000;

/**
 * Classifica checklists (por ID) contra a base JD, em lotes de 1.000.
 * O servidor só devolve checklists que o usuário pode visualizar.
 */
export async function classifyChecklistTasks(taskIds: string[]): Promise<Map<string, JdStatus>> {
  const unique = [...new Set(taskIds.filter(Boolean))];
  const map = new Map<string, JdStatus>();
  for (let i = 0; i < unique.length; i += CLASSIFY_CHUNK) {
    const { data, error } = await (supabase.rpc as any)('jd_classify_checklists', {
      p_task_ids: unique.slice(i, i + CLASSIFY_CHUNK),
    });
    if (error) throw new Error(error.message);
    for (const row of (data || []) as { task_id: string; jd_status: JdStatus }[]) {
      map.set(row.task_id, row.jd_status);
    }
  }
  return map;
}

const normHeader = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Pontuação do cabeçalho: quanto maior, mais provável ser a coluna de chassi. */
const headerScore = (h: string): number => {
  if (!h) return 0;
  if (/\bchassi(s)?\b/.test(h) || /\bchassis?\b/.test(h)) return 3;
  if (/\b(n|num|numero|no)?\s*(de\s*)?serie\b/.test(h) || /\bserial\b/.test(h) || /\bpin\b/.test(h)) return 2;
  return 0;
};

/** Chassi plausível: formato válido e contém ao menos um dígito (nomes não passam). */
export const looksLikeChassis = (value: string): boolean => {
  const n = normalizeChassis(value);
  return isValidChassis(n) && /\d/.test(n);
};

/** Mínimo de valores compatíveis com chassi na coluna escolhida. */
export const MIN_CHASSIS_RATIO = 0.8;

export interface JdParsedFile {
  column: string;
  values: string[];
  samples: string[];
}

/**
 * Localiza a coluna de chassi pelo cabeçalho (qualquer posição, cabeçalho
 * nas 10 primeiras linhas) e extrai seus valores. Lança erro — bloqueando a
 * importação — se a coluna não for identificada ou não contiver chassis.
 */
export function extractJdChassisFromRows(rows: unknown[][]): JdParsedFile {
  let best: { row: number; col: number; score: number } | null = null;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const score = headerScore(normHeader(row[c]));
      if (score > 0 && (!best || score > best.score)) best = { row: r, col: c, score };
    }
    if (best) break;
  }
  if (!best) {
    throw new Error('Coluna de chassi não identificada. O arquivo precisa ter um cabeçalho como "Chassi" ou "Número de Série". Nada foi importado.');
  }
  const column = String(rows[best.row][best.col] ?? '').trim();
  const values = rows
    .slice(best.row + 1)
    .map((r) => String((r || [])[best!.col] ?? '').trim())
    .filter((v) => v !== '');
  if (values.length === 0) {
    throw new Error(`A coluna "${column}" está vazia. Nada foi importado.`);
  }
  const ok = values.filter(looksLikeChassis).length;
  if (ok / values.length < MIN_CHASSIS_RATIO) {
    throw new Error(
      `A coluna "${column}" não parece conter chassis (${ok} de ${values.length} valores compatíveis). Nada foi importado.`,
    );
  }
  return { column, values, samples: values.slice(0, 5) };
}

/** Lê o Excel/CSV e extrai a coluna de chassi identificada pelo cabeçalho. */
export async function parseJdChassisFile(file: File): Promise<JdParsedFile> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Arquivo sem planilhas. Nada foi importado.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
  return extractJdChassisFromRows(rows as unknown[][]);
}

export interface JdFilePreview {
  total: number;
  validos: number;
  invalidos: number;
  duplicadosArquivo: number;
}

/** Prévia local do arquivo (o servidor reconta tudo com fidelidade na gravação). */
export function previewJdFile(raw: string[]): JdFilePreview {
  const seen = new Set<string>();
  let invalidos = 0;
  let duplicados = 0;
  let validos = 0;
  for (const line of raw) {
    const n = normalizeChassis(line);
    if (!isValidChassis(n)) {
      invalidos++;
      continue;
    }
    if (seen.has(n)) {
      duplicados++;
      continue;
    }
    seen.add(n);
    validos++;
  }
  return { total: raw.length, validos, invalidos, duplicadosArquivo: duplicados };
}

const IMPORT_CHUNK = 5000;

export interface JdImportResult {
  novos: number;
  duplicados: number;
  invalidos: number;
}

/**
 * Importa TODAS as linhas em lotes; o lote só é concluído no servidor
 * após o último lote. Qualquer falha deixa o lote como 'processando'
 * (nunca concluído pela metade).
 */
export async function importJdChassis(
  filename: string,
  raw: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<JdImportResult> {
  const { data: batchId, error: startErr } = await (supabase.rpc as any)('jd_import_start', {
    p_filename: filename,
    p_total_linhas: raw.length,
  });
  if (startErr) throw new Error(startErr.message);

  const totals: JdImportResult = { novos: 0, duplicados: 0, invalidos: 0 };
  try {
    for (let i = 0; i < raw.length; i += IMPORT_CHUNK) {
      const chunk = raw.slice(i, i + IMPORT_CHUNK);
      const { data, error } = await (supabase.rpc as any)('jd_import_append', {
        p_batch_id: batchId,
        p_chassis: chunk,
      });
      if (error) throw new Error(error.message);
      totals.novos += Number(data?.novos ?? 0);
      totals.duplicados += Number(data?.duplicados ?? 0);
      totals.invalidos += Number(data?.invalidos ?? 0);
      onProgress?.(Math.min(i + chunk.length, raw.length), raw.length);
    }
    const { error: endErr } = await (supabase.rpc as any)('jd_import_conclude', {
      p_batch_id: batchId,
    });
    if (endErr) throw new Error(endErr.message);
  } catch (e) {
    throw new Error(
      `Importação interrompida e NÃO concluída: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return totals;
}


// ============================================================
// Auditoria JD v2 — aba "Checklist - Máquina" (ID Atividade + Chassi/Série)
// ============================================================

export interface JdAuditRow { row: number; task_id: string; chassi: string }
export interface JdAuditParsed {
  sheet: string;
  idColumn: string;
  chassiColumn: string;
  rows: JdAuditRow[];
  semChassi: number;
  idsVazios: number[];
  idsDuplicados: string[];
  idsInvalidos: string[];
  samples: JdAuditRow[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escolhe a aba "Checklist - Máquina" (nome normalizado). */
export function pickAuditSheet(names: string[]): string | null {
  return names.find((n) => normHeader(n) === 'checklist maquina')
    ?? names.find((n) => { const h = normHeader(n); return h.includes('checklist') && h.includes('maquina'); })
    ?? null;
}

/**
 * Extrai as linhas da aba: localiza "ID Atividade" e "Chassi/Série" pelo
 * cabeçalho. row = número real da linha na planilha (1 = primeira linha).
 */
export function extractJdAuditRows(rows: unknown[][], sheet = 'Checklist - Máquina'): JdAuditParsed {
  let hdr = -1, idCol = -1, chCol = -1;
  for (let r = 0; r < Math.min(rows.length, 10) && hdr < 0; r++) {
    const row = rows[r] || [];
    let id = -1, ch = -1;
    row.forEach((v, c) => {
      const h = normHeader(v);
      if (id < 0 && h === 'id atividade') id = c;
      if (ch < 0 && headerScore(h) > 0) ch = c;
    });
    if (id >= 0 && ch >= 0) { hdr = r; idCol = id; chCol = ch; }
  }
  if (hdr < 0) {
    throw new Error('Colunas "ID Atividade" e "Chassi/Série" não identificadas na aba. Nada foi importado.');
  }
  const out: JdAuditRow[] = [];
  const idsVazios: number[] = [];
  const seen = new Set<string>();
  const dup = new Set<string>();
  const invalid: string[] = [];
  for (let r = hdr + 1; r < rows.length; r++) {
    const line = rows[r] || [];
    const id = String(line[idCol] ?? '').trim();
    const chassi = String(line[chCol] ?? '').trim();
    if (!id && !chassi && line.every((v) => String(v ?? '').trim() === '')) continue; // linha em branco
    if (!id) { idsVazios.push(r + 1); continue; }
    if (!UUID_RE.test(id)) { invalid.push(id); continue; }
    const key = id.toLowerCase();
    if (seen.has(key)) dup.add(id); else seen.add(key);
    out.push({ row: r + 1, task_id: key, chassi });
  }
  if (out.length === 0 && idsVazios.length === 0 && invalid.length === 0) {
    throw new Error('A aba não tem linhas de dados. Nada foi importado.');
  }
  return {
    sheet,
    idColumn: String(rows[hdr][idCol] ?? '').trim(),
    chassiColumn: String(rows[hdr][chCol] ?? '').trim(),
    rows: out,
    semChassi: out.filter((r) => !normalizeChassis(r.chassi)).length,
    idsVazios,
    idsDuplicados: [...dup],
    idsInvalidos: invalid,
    samples: out.slice(0, 5),
  };
}

export async function parseJdAuditFile(file: File): Promise<JdAuditParsed> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = pickAuditSheet(wb.SheetNames);
  if (!sheet) {
    throw new Error(`Aba "Checklist - Máquina" não encontrada (abas: ${wb.SheetNames.join(', ')}). Nada foi importado.`);
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: false, defval: '' });
  return extractJdAuditRows(rows as unknown[][], sheet);
}

export interface JdAuditProblem {
  row_number: number;
  task_id: string;
  problema: 'inexistente' | 'nao_checklist' | 'chassi_divergente';
  chassi_planilha: string;
  chassi_ficha: string;
}

export const JD_PROBLEM_LABEL: Record<JdAuditProblem['problema'], string> = {
  inexistente: 'ID não existe no GVPS',
  nao_checklist: 'Atividade não é checklist',
  chassi_divergente: 'Chassi diferente da ficha',
};

const AUDIT_CHUNK = 1000;

/** Valida no servidor (lotes de 1.000): IDs existentes, checklist e chassi igual à ficha. */
export async function validateJdAuditRows(rows: JdAuditRow[]): Promise<JdAuditProblem[]> {
  const problems: JdAuditProblem[] = [];
  for (let i = 0; i < rows.length; i += AUDIT_CHUNK) {
    const { data, error } = await (supabase.rpc as any)('jd_audit_validate_rows', {
      p_rows: rows.slice(i, i + AUDIT_CHUNK),
    });
    if (error) throw new Error(error.message);
    problems.push(...((data || []) as JdAuditProblem[]));
  }
  return problems;
}

export interface JdAuditResult { total: number; ok: number; duplicado: number; sem_chassi: number }

/** Grava todas as linhas em lotes e conclui; falha => importação cancelada, auditoria anterior segue vigente. */
export async function importJdAudit(
  filename: string,
  sheet: string,
  rows: JdAuditRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<JdAuditResult> {
  const { data: importId, error: startErr } = await (supabase.rpc as any)('jd_audit_start', {
    p_filename: filename, p_sheet_name: sheet, p_total_linhas: rows.length,
  });
  if (startErr) throw new Error(startErr.message);
  try {
    for (let i = 0; i < rows.length; i += AUDIT_CHUNK) {
      const chunk = rows.slice(i, i + AUDIT_CHUNK);
      const { error } = await (supabase.rpc as any)('jd_audit_append', { p_import_id: importId, p_rows: chunk });
      if (error) throw new Error(error.message);
      onProgress?.(Math.min(i + chunk.length, rows.length), rows.length);
    }
    const { data, error } = await (supabase.rpc as any)('jd_audit_conclude', { p_import_id: importId });
    if (error) throw new Error(error.message);
    return data as JdAuditResult;
  } catch (e) {
    await (supabase.rpc as any)('jd_audit_cancel', { p_import_id: importId });
    throw new Error(`Importação interrompida e cancelada (auditoria anterior continua valendo): ${e instanceof Error ? e.message : String(e)}`);
  }
}
