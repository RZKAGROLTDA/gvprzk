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

/** Extrai os chassis da primeira coluna de um arquivo Excel/CSV. */
export async function parseJdChassisFile(file: File): Promise<string[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
  return rows.map((r) => String((r as unknown[])[0] ?? '').trim()).filter((v) => v !== '');
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
