import { supabase } from '@/integrations/supabase/client';

/**
 * Auditoria de duplicidade de chassis — Campanha JD.
 * Normalização espelha public.normalize_chassis (maiúsculas, sem espaços).
 * A classificação é sempre calculada no servidor contra a base completa;
 * o frontend nunca lê a base JD diretamente (restrita a administradores).
 */

export type JdStatus = 'enviado' | 'disponivel' | 'sem_chassi';

export const JD_STATUS_LABEL: Record<JdStatus, string> = {
  enviado: 'Já enviado à JD',
  disponivel: 'Disponível',
  sem_chassi: 'Sem chassi',
};

export const JD_STATUS_VARIANT: Record<JdStatus, 'destructive' | 'success' | 'warning'> = {
  enviado: 'destructive',
  disponivel: 'success',
  sem_chassi: 'warning',
};

export const normalizeChassis = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, '').toUpperCase();

/** Chassi válido: 5 a 30 caracteres alfanuméricos após normalização. */
export const isValidChassis = (normalized: string): boolean => /^[A-Z0-9]{5,30}$/.test(normalized);

export const jdStatusFor = (
  chassi: string | null | undefined,
  classified: Map<string, JdStatus>,
): JdStatus => {
  const n = normalizeChassis(chassi);
  if (!n) return 'sem_chassi';
  return classified.get(n) ?? 'disponivel';
};

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
