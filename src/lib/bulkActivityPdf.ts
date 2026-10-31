import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { classifyChecklistTasks, type JdStatus } from '@/lib/jdChassis';
import { generateReportPDF } from '@/lib/generateReportPDF';
import { formatDateToLocal, parseLocalDate } from '@/lib/utils';

export interface BulkActivity {
  id: string;
  client: string;
  filial: string;
  responsible: string;
  created_by: string;
  start_date: string;
  task_type: string;
  jd_status?: JdStatus;
}
export interface BulkFilters {
  start: string | null;
  end: string | null;
  filialId: string | null;
  filialName: string | null;
  responsibleId: string | null;
  filialAtendida: string | null;
  type: 'all' | 'checklist' | 'visita' | 'ligacao';
  jdStatus: 'all' | 'ok' | 'duplicado' | 'sem_chassi';
}
const columns = 'id,client,filial,responsible,created_by,start_date,task_type,filial_atendida';
export const normalizeBranch = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
export const activityTypeLabel = (type: string) => type === 'checklist' ? 'Checklist' : type === 'ligacao' ? 'Ligação' : 'Visita';

export function matchesBulkFilters(row: BulkActivity & { filial_atendida?: string }, f: BulkFilters): boolean {
  return (!f.filialName || normalizeBranch(row.filial) === normalizeBranch(f.filialName))
    && (!f.responsibleId || row.created_by === f.responsibleId)
    && (!f.start || row.start_date >= f.start)
    && (!f.end || row.start_date.slice(0, 10) <= f.end)
    && (!f.filialAtendida || normalizeBranch(row.filial_atendida) === normalizeBranch(f.filialAtendida))
    && (f.type === 'all' || (f.type === 'visita' ? ['prospection', 'technical_visit', 'visita'].includes(row.task_type) : row.task_type === f.type))
    && (f.jdStatus === 'all' || (row.task_type === 'checklist' && row.jd_status === f.jdStatus));
}

async function validatedBranchName(filters: BulkFilters): Promise<string | null> {
  const { data: scope, error } = await supabase.rpc('effective_filial_ids', { p_filial_id: filters.filialId });
  if (error) throw error;
  if ((scope?.length ?? 0) > 1) throw new Error('Selecione uma única Filial Ativa autorizada.');
  const scopeId = scope?.[0];
  if (!scopeId) {
    if (filters.filialId || filters.filialName) throw new Error('Filial não corresponde ao escopo autorizado.');
    return null;
  }
  const { data: branches, error: branchError } = await supabase.from('filiais').select('id,nome').limit(1000);
  if (branchError) throw branchError;
  if (branches?.length === 1000) throw new Error('Não foi possível validar o cadastro completo de filiais.');
  const branch = branches?.find(b => b.id === scopeId);
  if (!branch || !filters.filialName || normalizeBranch(branch.nome) !== normalizeBranch(filters.filialName)
    || branches?.filter(b => normalizeBranch(b.nome) === normalizeBranch(branch.nome)).length !== 1) {
    throw new Error('Filial da atividade não corresponde unicamente à Filial Ativa autorizada.');
  }
  return branch.nome;
}

/** RLS is the ceiling; validate scope on the server, then narrow by the activity's branch. */
export async function loadBulkActivities(filters: BulkFilters): Promise<BulkActivity[]> {
  const branchName = await validatedBranchName(filters);
  const validatedFilters = { ...filters, filialName: branchName };
  const result: BulkActivity[] = [];
  let after: string | null = null;
  for (;;) {
    let query = supabase.from('tasks').select(columns).order('id').limit(250);
    if (after) query = query.gt('id', after);
    if (filters.start) query = query.gte('start_date', filters.start);
    if (filters.end) query = query.lte('start_date', filters.end);
    if (filters.responsibleId) query = query.eq('created_by', filters.responsibleId);
    query = query.in('task_type', filters.type === 'checklist' || filters.jdStatus !== 'all' ? ['checklist']
      : filters.type === 'ligacao' ? ['ligacao'] : filters.type === 'visita' ? ['prospection', 'technical_visit', 'visita']
      : ['checklist', 'ligacao', 'prospection', 'technical_visit', 'visita']);
    const { data, error: pageError } = await query;
    if (pageError) throw pageError;
    const page = (data ?? []) as BulkActivity[];
    const statuses = await classifyChecklistTasks(page.filter(r => r.task_type === 'checklist').map(r => r.id));
    for (const r of page) {
      r.jd_status = statuses.get(r.id);
      if (matchesBulkFilters(r, validatedFilters)) result.push(r);
    }
    if (page.length < 250) break;
    const next = page[page.length - 1]?.id;
    if (!next || next === after) throw new Error('Não foi possível concluir a leitura das atividades.');
    after = next;
  }
  return result.sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id));
}

const safePart = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'sem_filial';
export function bulkPdfFilename(row: BulkActivity): string {
  const date = row.start_date ? formatDateToLocal(parseLocalDate(row.start_date)) : 'sem_data';
  return `${date}_${safePart(row.filial)}_${safePart(activityTypeLabel(row.task_type))}_${safePart(row.id)}.pdf`;
}
export interface BulkProgress { done: number; total: number; success: number; failures: { id: string; message: string }[] }

/** Sequential PDFs, yielding between small batches; never keep hydrated tasks in memory. */
export async function buildActivityZip(
  rows: BulkActivity[],
  generate: (row: BulkActivity) => Promise<Blob>,
  onProgress: (p: BulkProgress) => void,
  isCancelled: () => boolean = () => false,
): Promise<{ blob: Blob | null; progress: BulkProgress }> {
  const zip = new JSZip();
  const unique = [...new Map(rows.map(r => [r.id, r])).values()];
  const progress: BulkProgress = { done: 0, total: unique.length, success: 0, failures: [] };
  for (let i = 0; i < unique.length; i++) {
    if (isCancelled()) throw new Error('Os filtros ou a Filial Ativa mudaram. Gere novamente com a seleção atual.');
    const row = unique[i];
    try {
      const blob = await generate(row);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length < 100 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF vazio ou inválido.');
      if (isCancelled()) throw new Error('Seleção alterada durante a geração.');
      zip.file(bulkPdfFilename(row), bytes);
      progress.success++;
    } catch (e) {
      progress.failures.push({ id: row.id, message: e instanceof Error ? e.message : 'Falha na geração do PDF.' });
    }
    progress.done++;
    onProgress({ ...progress, failures: [...progress.failures] });
    if ((i + 1) % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (isCancelled()) throw new Error('Seleção alterada durante a geração.');
  return { blob: progress.success ? await zip.generateAsync({ type: 'blob', compression: 'STORE' }) : null, progress };
}

export async function generateAuthorizedActivityPdf(row: BulkActivity, filters: BulkFilters, filiais: { id: string; nome: string }[]): Promise<Blob> {
  // Read permission and filters again immediately before generating, not from cached list data.
  const branchName = await validatedBranchName(filters);
  const { data, error } = await supabase.from('tasks').select(columns).eq('id', row.id).limit(1);
  if (error) throw error;
  const current = data?.[0] as BulkActivity | undefined;
  if (!current) throw new Error('Atividade indisponível ou sem permissão.');
  if (current.task_type === 'checklist' && filters.jdStatus !== 'all') current.jd_status = (await classifyChecklistTasks([row.id])).get(row.id);
  if (!matchesBulkFilters(current, { ...filters, filialName: branchName })) throw new Error('Atividade não pertence mais aos filtros e à Filial Ativa selecionados.');
  const blob = await generateReportPDF(row.id, { output: 'blob', filialId: filters.filialId, filiais });
  if (!(blob instanceof Blob)) throw new Error('PDF não gerado.');
  return blob;
}

export async function deliverActivityZip(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'application/zip' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if ((e as DOMException).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}