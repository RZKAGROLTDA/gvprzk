import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileArchive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { formatDateDisplay, formatDateToLocal } from '@/lib/utils';
import { jdLabel, jdVariant } from '@/lib/jdChassis';
import { activityTypeLabel, buildActivityZip, deliverActivityZip, generateAuthorizedActivityPdf, loadBulkActivities, type BulkFilters, type BulkProgress } from '@/lib/bulkActivityPdf';

interface Props {
  filters: Omit<BulkFilters, 'type' | 'jdStatus'>;
  ready: boolean;
  filiais: { id: string; nome: string }[];
}
export function BulkActivityPdfExport({ filters, ready, filiais }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<BulkFilters['type']>('all');
  const [jdStatus, setJdStatus] = useState<BulkFilters['jdStatus']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const effectiveFilters: BulkFilters = { ...filters, type, jdStatus };
  const scopeKey = JSON.stringify([user?.id, ready, effectiveFilters]);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const { data: rows = [], isFetching, error: loadError } = useQuery({
    queryKey: ['bulk-activity-pdfs', scopeKey],
    enabled: ready && !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => loadBulkActivities(effectiveFilters),
  });
  useEffect(() => {
    setSelected(new Set()); setPage(0); setZip(null); setProgress(null); setError('');
  }, [scopeKey]);
  const visible = rows.slice(page * 20, (page + 1) * 20);
  const selectedRows = rows.filter(r => selected.has(r.id));
  const locked = busy || isFetching || !ready;
  const toggle = (id: string, checked: boolean) => {
    setZip(null);
    setSelected(prev => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next; });
  };
  const generate = async () => {
    const startedScope = scopeKey;
    setBusy(true); setZip(null); setError('');
    setProgress({ done: 0, total: selectedRows.length, success: 0, failures: [] });
    try {
      const result = await buildActivityZip(selectedRows,
        row => generateAuthorizedActivityPdf(row, effectiveFilters, filiais),
        p => { if (currentScope.current === startedScope) setProgress(p); },
        () => currentScope.current !== startedScope);
      if (currentScope.current === startedScope) {
        setZip(result.blob);
        if (!result.blob) setError('Nenhum PDF completo foi gerado. Confira as falhas abaixo.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao gerar ZIP.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-4 border-t pt-6" aria-label="PDFs das atividades">
      <h2 className="text-xl font-semibold flex items-center gap-2"><FileArchive className="h-5 w-5" />PDFs das atividades</h2>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2 w-full sm:w-56">
          <label className="text-sm font-medium">Tipo de atividade</label>
          <Select value={type} disabled={busy} onValueChange={v => { setType(v as BulkFilters['type']); if (v !== 'checklist') setJdStatus('all'); }}>
            <SelectTrigger aria-label="Tipo de atividade"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="checklist">Checklist</SelectItem><SelectItem value="visita">Visita</SelectItem><SelectItem value="ligacao">Ligação</SelectItem></SelectContent>
          </Select>
        </div>
        {type === 'checklist' && <div className="space-y-2 w-full sm:w-64">
          <label className="text-sm font-medium">Situação JD</label>
          <Select value={jdStatus} disabled={busy} onValueChange={v => setJdStatus(v as BulkFilters['jdStatus'])}>
            <SelectTrigger aria-label="Situação JD"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="ok">OK — Primeiro registro</SelectItem><SelectItem value="duplicado">Duplicado</SelectItem><SelectItem value="sem_chassi">Sem chassi</SelectItem></SelectContent>
          </Select>
        </div>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox aria-label="Selecionar todos os resultados filtrados" disabled={locked || rows.length === 0}
            checked={rows.length > 0 && selectedRows.length === rows.length ? true : selectedRows.length > 0 ? 'indeterminate' : false}
            onCheckedChange={v => { setZip(null); setSelected(v === true ? new Set(rows.map(r => r.id)) : new Set()); }} />
          Selecionar todos os resultados filtrados ({rows.length})
        </label>
        <span className="text-sm font-medium" aria-live="polite">{selectedRows.length} atividades selecionadas</span>
        <Button className="gap-2" disabled={locked || selectedRows.length === 0} onClick={generate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {busy ? 'Gerando PDFs…' : 'Exportar PDFs em massa'}
        </Button>
        {zip && <Button variant="outline" className="gap-2" onClick={() => deliverActivityZip(zip, `atividades_${formatDateToLocal(new Date())}.zip`).catch(e => setError(e.message))}><Download className="h-4 w-4" />Baixar ZIP ({progress?.success} PDFs)</Button>}
      </div>
      {(error || loadError) && <p role="alert" className="text-sm text-destructive">{error || (loadError instanceof Error ? loadError.message : 'Não foi possível carregar as atividades.')}</p>}
      {progress && <div className="space-y-2" aria-live="polite">
        <Progress value={progress.total ? progress.done * 100 / progress.total : 0} />
        <p className="text-sm">{progress.done}/{progress.total} processadas · {progress.success} PDFs completos · {progress.failures.length} falhas</p>
        {progress.failures.length > 0 && <ul className="max-h-48 overflow-auto text-sm text-destructive space-y-1">{progress.failures.map(f => <li key={f.id} className="break-all">{f.id}: {f.message}</li>)}</ul>}
      </div>}
      <div className="overflow-x-auto border rounded-md">
        <Table><TableHeader><TableRow><TableHead className="w-12">Selecionar</TableHead><TableHead>Data</TableHead><TableHead>Filial</TableHead><TableHead>Responsável</TableHead><TableHead>Tipo</TableHead><TableHead>Cliente</TableHead><TableHead>Situação JD</TableHead><TableHead>ID Atividade</TableHead></TableRow></TableHeader>
          <TableBody>{isFetching ? <TableRow><TableCell colSpan={8}>Carregando todas as atividades autorizadas…</TableCell></TableRow>
            : visible.length === 0 ? <TableRow><TableCell colSpan={8}>Nenhuma atividade encontrada.</TableCell></TableRow>
            : visible.map(r => <TableRow key={r.id}>
              <TableCell><Checkbox aria-label={`Selecionar atividade ${r.id}`} checked={selected.has(r.id)} disabled={locked} onCheckedChange={v => toggle(r.id, v === true)} /></TableCell>
              <TableCell className="whitespace-nowrap">{r.start_date ? formatDateDisplay(r.start_date) : '—'}</TableCell><TableCell>{r.filial || '—'}</TableCell><TableCell>{r.responsible}</TableCell><TableCell>{activityTypeLabel(r.task_type)}</TableCell><TableCell>{r.client}</TableCell>
              <TableCell>{r.task_type === 'checklist' ? <Badge variant={jdVariant(r.jd_status)} className="whitespace-nowrap">{jdLabel(r.jd_status)}</Badge> : '—'}</TableCell><TableCell className="font-mono text-xs whitespace-nowrap">{r.id}</TableCell>
            </TableRow>)}</TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3 text-sm">
        <span>{rows.length} resultados · Página {page + 1} de {Math.max(1, Math.ceil(rows.length / 20))}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || locked} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * 20 >= rows.length || locked} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>
      </div>
    </section>
  );
}