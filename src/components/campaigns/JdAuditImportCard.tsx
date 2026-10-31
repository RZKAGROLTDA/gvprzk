import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateDisplay } from '@/lib/utils';
import {
  importJdAudit,
  parseJdAuditFile,
  validateJdAuditRows,
  JD_PROBLEM_LABEL,
  type JdAuditParsed,
  type JdAuditProblem,
} from '@/lib/jdChassis';

interface AuditImportRow {
  id: string;
  filename: string;
  sheet_name: string;
  status: string;
  total_linhas: number;
  qtd_ok: number;
  qtd_duplicado: number;
  qtd_sem_chassi: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  concluido: 'Concluída',
  processando: 'Em processamento',
  cancelado: 'Cancelada',
};

/** Auditoria JD v2 — duplicidade por checklist (aba "Checklist - Máquina"). Somente administradores. */
const JdAuditImportCard: React.FC = () => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<JdAuditParsed | null>(null);
  const [problems, setProblems] = useState<JdAuditProblem[] | null>(null);
  const [busy, setBusy] = useState<'lendo' | 'validando' | 'importando' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: imports = [] } = useQuery({
    queryKey: ['jd-audit-imports'],
    queryFn: async (): Promise<AuditImportRow[]> => {
      const { data, error } = await (supabase.from as any)('jd_audit_imports')
        .select('id, filename, sheet_name, status, total_linhas, qtd_ok, qtd_duplicado, qtd_sem_chassi, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AuditImportRow[];
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const vigente = imports.find((i) => i.status === 'concluido');

  const reset = () => {
    setFile(null); setParsed(null); setProblems(null); setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (f: File | undefined) => {
    reset();
    if (!f) return;
    setFile(f);
    try {
      setBusy('lendo');
      const p = await parseJdAuditFile(f);
      setParsed(p);
      if (p.idsVazios.length || p.idsDuplicados.length || p.idsInvalidos.length) return;
      setBusy('validando');
      setProblems(await validateJdAuditRows(p.rows));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const localBlock = !!parsed && (parsed.idsVazios.length > 0 || parsed.idsDuplicados.length > 0 || parsed.idsInvalidos.length > 0);
  const canImport = !!parsed && !localBlock && problems !== null && problems.length === 0 && parsed.rows.length > 0 && !busy;

  const onImport = async () => {
    if (!file || !parsed || !canImport) return;
    setBusy('importando');
    try {
      const r = await importJdAudit(file.name, parsed.sheet, parsed.rows, (done, total) => setProgress({ done, total }));
      toast.success(`Auditoria concluída: ${r.ok} OK, ${r.duplicado} duplicados, ${r.sem_chassi} sem chassi.`);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ['jd-audit-imports'] });
      qc.invalidateQueries({ queryKey: ['jd-classify-report'] });
      qc.invalidateQueries({ queryKey: ['service-opportunities-details'] });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Auditoria de duplicidade por checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use o Excel exportado pelo GVPS. A aba <strong>Checklist - Máquina</strong> é usada com as colunas
          <strong> ID Atividade</strong> e <strong>Chassi/Série</strong>. Pela ordem das linhas: primeira ocorrência
          do chassi = OK, seguintes = Duplicado, sem chassi = Sem chassi. Checklists fora da planilha ficam como
          Não auditado.
        </p>
        <p className="text-sm">
          Auditoria vigente:{' '}
          {vigente ? (
            <strong>{vigente.filename} — {formatDateDisplay(vigente.created_at)} ({vigente.total_linhas.toLocaleString('pt-BR')} linhas)</strong>
          ) : (
            <span className="text-muted-foreground">nenhuma (todos os checklists aparecem como Não auditado)</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <Upload className="h-4 w-4 mr-2" /> Selecionar planilha
          </Button>
          {file && <span className="text-sm">{file.name}</span>}
          {busy && busy !== 'importando' && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" /> {busy === 'lendo' ? 'Lendo arquivo…' : 'Validando IDs e chassis no GVPS…'}
            </span>
          )}
        </div>

        {parsed && (
          <div className="rounded-md border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>Aba: <strong>{parsed.sheet}</strong></span>
              <span>Colunas: <strong>{parsed.idColumn}</strong> + <strong>{parsed.chassiColumn}</strong></span>
              <span>Linhas: <strong>{parsed.rows.length.toLocaleString('pt-BR')}</strong></span>
              <span>Sem chassi: <strong>{parsed.semChassi.toLocaleString('pt-BR')}</strong></span>
            </div>
            <div className="text-muted-foreground">
              Exemplos: {parsed.samples.map((s) => `linha ${s.row}: ${s.task_id.slice(0, 8)}… / ${s.chassi || '(sem chassi)'}`).join(' · ')}
            </div>
            {parsed.idsVazios.length > 0 && (
              <p className="text-destructive">{parsed.idsVazios.length} linha(s) sem ID Atividade (ex.: linhas {parsed.idsVazios.slice(0, 10).join(', ')}).</p>
            )}
            {parsed.idsInvalidos.length > 0 && (
              <p className="text-destructive">{parsed.idsInvalidos.length} ID(s) em formato inválido (ex.: {parsed.idsInvalidos.slice(0, 5).join(', ')}).</p>
            )}
            {parsed.idsDuplicados.length > 0 && (
              <p className="text-destructive">{parsed.idsDuplicados.length} ID(s) repetidos na planilha (ex.: {parsed.idsDuplicados.slice(0, 5).join(', ')}).</p>
            )}
            {problems && problems.length === 0 && !localBlock && (
              <p className="text-success font-medium">Todos os IDs existem, são checklists e o chassi confere com a ficha.</p>
            )}
            {localBlock && <p className="font-medium text-destructive">Importação bloqueada: corrija a planilha.</p>}
          </div>
        )}

        {problems && problems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">
              Importação bloqueada: {problems.length.toLocaleString('pt-BR')} linha(s) com problema.
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead><TableHead>ID Atividade</TableHead><TableHead>Problema</TableHead>
                    <TableHead>Chassi planilha</TableHead><TableHead>Chassi ficha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {problems.slice(0, 200).map((p) => (
                    <TableRow key={`${p.row_number}-${p.task_id}`}>
                      <TableCell>{p.row_number}</TableCell>
                      <TableCell className="font-mono text-xs">{p.task_id}</TableCell>
                      <TableCell>{JD_PROBLEM_LABEL[p.problema] ?? p.problema}</TableCell>
                      <TableCell>{p.chassi_planilha || '—'}</TableCell>
                      <TableCell>{p.problema === 'inexistente' ? '—' : p.chassi_ficha || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {progress && (
          <div className="space-y-1">
            <Progress value={(progress.done / progress.total) * 100} />
            <p className="text-xs text-muted-foreground">{progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} linhas</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={onImport} disabled={!canImport}>
            {busy === 'importando' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirmar auditoria
          </Button>
          {parsed && <Button variant="ghost" onClick={reset} disabled={busy === 'importando'}>Cancelar</Button>}
        </div>

        {imports.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Arquivo</TableHead><TableHead>Situação</TableHead>
                  <TableHead className="text-right">Linhas</TableHead><TableHead className="text-right">OK</TableHead>
                  <TableHead className="text-right">Duplicado</TableHead><TableHead className="text-right">Sem chassi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{formatDateDisplay(i.created_at)}</TableCell>
                    <TableCell>{i.filename}</TableCell>
                    <TableCell>
                      <Badge variant={i.status === 'concluido' ? 'success' : i.status === 'cancelado' ? 'secondary' : 'warning'}>
                        {i.id === vigente?.id ? 'Vigente' : STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.total_linhas}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.qtd_ok}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.qtd_duplicado}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.qtd_sem_chassi}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JdAuditImportCard;
