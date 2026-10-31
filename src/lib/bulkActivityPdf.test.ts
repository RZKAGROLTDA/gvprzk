import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import JSZip from 'jszip';
import { buildActivityZip, bulkPdfFilename, matchesBulkFilters, loadBulkActivities, type BulkActivity, type BulkFilters } from './bulkActivityPdf';
import { generateTaskPDF } from '@/components/TaskPDFGenerator';
import { generateWorkshopChecklistPDF } from './workshopChecklistPdf';
import type { Task } from '@/types/task';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), classify: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock('./jdChassis', () => ({ classifyChecklistTasks: mock.classify }));
const filters: BulkFilters = { start: '2026-10-01', end: '2026-10-31', filialId: 'authorized', filialName: 'Filial A', responsibleId: null, filialAtendida: null, type: 'all', jdStatus: 'all' };
const row = (i: number): BulkActivity => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, client: 'Cliente teste', filial: 'Filial A', responsible: 'RAC teste', created_by: 'seller', start_date: '2026-10-31', task_type: i % 3 === 0 ? 'checklist' : i % 3 === 1 ? 'ligacao' : 'prospection' });
const task = (r: BulkActivity): Task => ({ id: r.id, name: 'Teste', client: r.client, filial: r.filial, responsible: r.responsible, createdBy: r.created_by,
  taskType: r.task_type as Task['taskType'], startDate: new Date(2026, 9, 31), endDate: new Date(2026, 9, 31), createdAt: new Date(2026, 9, 31), updatedAt: new Date(2026, 9, 31),
  property: 'Fazenda teste', startTime: '08:00', endTime: '09:00', observations: 'Observações preservadas', priority: 'medium', reminders: [], photos: [], documents: [], initialKm: 0, finalKm: 0, status: 'completed', isProspect: false,
  checklistMachine: { chassi_serie: '1CQ2122AKG0110160', modelo: 'Teste' }, checklist: [{ id: 'item', name: 'Inspeção teste', category: 'services', selected: true, responseStatus: 'conforme' }] });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('Blob', NodeBlob); });

describe('PDFs em massa — regras', () => {
  it.each([5, 20, 50])('gera ZIP com %i PDFs reais individuais usando os geradores atuais', async count => {
    const rows = Array.from({ length: count }, (_, i) => row(i + 1));
    const snapshots = JSON.stringify(rows);
    const updates: number[] = [];
    const result = await buildActivityZip(rows, async r => {
      const t = task(r);
      const blob = t.taskType === 'checklist' ? await generateWorkshopChecklistPDF(t, [], true) : await generateTaskPDF(t, undefined, undefined, [], true);
      if (!blob) throw new Error('PDF ausente');
      return blob as Blob;
    }, p => updates.push(p.done));
    expect(result.progress.success).toBe(count);
    expect(result.progress.failures).toEqual([]);
    const zip = await JSZip.loadAsync(await result.blob?.arrayBuffer());
    const files = Object.values(zip.files);
    expect(files).toHaveLength(count);
    for (const f of files) {
      const bytes = await f.async('uint8array');
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(f.name).toContain('2026-10-31_Filial_A_');
    }
    expect(updates.at(-1)).toBe(count);
    expect(JSON.stringify(rows)).toBe(snapshots);
  });
  it('falha individual e PDF vazio não entram no ZIP nem cancelam os demais', async () => {
    const result = await buildActivityZip([row(1), row(2), row(3)], async r => {
      if (r.id === row(2).id) throw new Error('Sem permissão');
      return new Blob([r.id === row(3).id ? '' : '%PDF-' + 'x'.repeat(200)]);
    }, () => {});
    expect(result.progress.success).toBe(1);
    expect(result.progress.failures.map(f => f.id)).toEqual([row(2).id, row(3).id]);
    const zip = await JSZip.loadAsync(await result.blob?.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual([bulkPdfFilename(row(1))]);
  });
  it('filtro JD inclui somente checklists do status escolhido', () => {
    expect(matchesBulkFilters({ ...row(3), jd_status: 'duplicado' }, { ...filters, jdStatus: 'duplicado' })).toBe(true);
    expect(matchesBulkFilters({ ...row(3), jd_status: 'ok' }, { ...filters, jdStatus: 'duplicado' })).toBe(false);
    expect(matchesBulkFilters({ ...row(1), jd_status: 'duplicado' }, { ...filters, jdStatus: 'duplicado' })).toBe(false);
  });
  it('filial da atividade e responsável restringem a seleção mesmo com RLS mais amplo', () => {
    expect(matchesBulkFilters({ ...row(1), filial: ' filial a ' }, filters)).toBe(true);
    expect(matchesBulkFilters({ ...row(1), filial: 'Filial B' }, filters)).toBe(false);
    expect(matchesBulkFilters(row(1), { ...filters, responsibleId: 'outro' })).toBe(false);
    expect(matchesBulkFilters(row(1), { ...filters, responsibleId: 'seller' })).toBe(true);
  });
  it('carrega todos os resultados de outras páginas por chave e aplica filial da atividade', async () => {
    mock.rpc.mockResolvedValue({ data: ['authorized'], error: null });
    mock.classify.mockResolvedValue(new Map());
    const pages = [Array.from({ length: 250 }, (_, i) => row(i + 1)), [row(251), { ...row(252), filial: 'Filial B' }]];
    const cursors: string[] = [];
    mock.from.mockImplementation((table: string) => {
      if (table === 'filiais') return { select: () => ({ limit: () => Promise.resolve({ data: [{ id: 'authorized', nome: 'Filial A' }], error: null }) }) };
      const q: Record<string, any> = {};
      for (const method of ['select', 'order', 'limit', 'gte', 'lte', 'eq', 'gt']) q[method] = (...args: unknown[]) => { if (method === 'gt') cursors.push(String(args[1])); return q; };
      q.in = () => Promise.resolve({ data: pages.shift(), error: null });
      return q;
    });
    const result = await loadBulkActivities(filters);
    expect(result).toHaveLength(251);
    expect(cursors).toEqual([row(250).id]);
    expect(result.some(r => r.id === row(251).id)).toBe(true);
    expect(result.some(r => r.id === row(252).id)).toBe(false);
  });
  it('filial não autorizada é recusada antes de ler atividades', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('42501') });
    await expect(loadBulkActivities(filters)).rejects.toThrow('42501');
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('nome forjado ou ambíguo não contorna o ID da filial autorizado no servidor', async () => {
    mock.rpc.mockResolvedValue({ data: ['authorized'], error: null });
    mock.from.mockImplementation(() => ({ select: () => ({ limit: () => Promise.resolve({ data: [{ id: 'authorized', nome: 'Filial A' }], error: null }) }) }));
    await expect(loadBulkActivities({ ...filters, filialName: 'Filial B' })).rejects.toThrow('unicamente');
    mock.from.mockImplementation(() => ({ select: () => ({ limit: () => Promise.resolve({ data: [{ id: 'authorized', nome: 'Filial A' }, { id: 'other', nome: ' filial a ' }], error: null }) }) }));
    await expect(loadBulkActivities(filters)).rejects.toThrow('unicamente');
  });
  it('troca de escopo interrompe e não libera ZIP antigo', async () => {
    await expect(buildActivityZip([row(1)], async () => new Blob(['%PDF-' + 'x'.repeat(200)]), () => {}, () => true)).rejects.toThrow('Filial Ativa');
  });
});