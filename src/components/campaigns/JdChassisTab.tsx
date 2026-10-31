import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Loader2, FileSpreadsheet, Database } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateDisplay } from '@/lib/utils';
import {
  importJdChassis,
  parseJdChassisFile,
  previewJdFile,
  type JdFilePreview,
} from '@/lib/jdChassis';

interface BatchRow {
  id: string;
  filename: string;
  status: string;
  total_linhas: number;
  novos: number;
  duplicados: number;
  invalidos: number;
  created_at: string;
  concluded_at: string | null;
}

/**
 * Base JD — importação administrativa da base de chassis enviados à John Deere.
 * O acesso direto à base e ao histórico é restrito a administradores (RLS no banco);
 * esta aba só é exibida para admin e o servidor valida novamente em cada chamada.
 */
const JdChassisTab: React.FC = () => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [raw, setRaw] = useState<string[]>([]);
  const [preview, setPreview] = useState<JdFilePreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['jd-chassis-batches'],
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await (supabase.from as any)('jd_chassis_import_batches')
        .select('id, filename, status, total_linhas, novos, duplicados, invalidos, created_at, concluded_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as BatchRow[];
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: baseTotal = 0 } = useQuery({
    queryKey: ['jd-chassis-base-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase.from as any)('jd_chassis_base')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const resetSelection = () => {
    setFile(null);
    setRaw([]);
    setPreview(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    setParsing(true);
    try {
      const lines = await parseJdChassisFile(f);
      if (lines.length === 0) {
        toast.error('Nenhum chassi encontrado na primeira coluna do arquivo.');
        resetSelection();
        return;
      }
      setFile(f);
      setRaw(lines);
      setPreview(previewJdFile(lines));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao ler o arquivo.');
      resetSelection();
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!file || raw.length === 0 || importing) return;
    setImporting(true);
    setProgress({ done: 0, total: raw.length });
    try {
      const result = await importJdChassis(file.name, raw, (done, total) =>
        setProgress({ done, total }),
      );
      toast.success(
        `Base JD atualizada: ${result.novos} novos, ${result.duplicados} duplicados, ${result.invalidos} inválidos.`,
      );
      resetSelection();
      queryClient.invalidateQueries({ queryKey: ['jd-chassis-batches'] });
      queryClient.invalidateQueries({ queryKey: ['jd-chassis-base-count'] });
      queryClient.invalidateQueries({ queryKey: ['service-opportunities-details'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na importação.');
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Chassis na base JD</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{baseTotal.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Importações realizadas</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {batches.filter((b) => b.status === 'concluido').length.toLocaleString('pt-BR')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Importar base de chassis enviados à JD</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione um arquivo Excel ou CSV com um chassi por linha (primeira coluna). Letras
            maiúsculas/minúsculas e espaços são ignorados; duplicados e inválidos são contabilizados
            sem alterar a base existente. A importação só é concluída após o processamento de todas
            as linhas.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={parsing || importing}
            >
              {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Selecionar arquivo
            </Button>
            {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
          </div>

          {preview && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{preview.total} linhas</Badge>
                <Badge variant="success">{preview.validos} válidos únicos</Badge>
                <Badge variant="warning">{preview.duplicadosArquivo} duplicados no arquivo</Badge>
                <Badge variant="destructive">{preview.invalidos} inválidos</Badge>
              </div>
              {importing && progress && (
                <div className="space-y-1">
                  <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Processando {progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} linhas...
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" onClick={handleImport} disabled={importing || preview.validos === 0}>
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Confirmar importação
                </Button>
                <Button type="button" variant="ghost" onClick={resetSelection} disabled={importing}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Histórico de importações</CardTitle>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : batches.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma importação realizada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead className="whitespace-nowrap">Arquivo</TableHead>
                    <TableHead className="whitespace-nowrap">Situação</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Linhas</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Novos</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Duplicados</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Inválidos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap">{formatDateDisplay(b.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap max-w-[220px] truncate" title={b.filename}>
                        {b.filename}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={b.status === 'concluido' ? 'success' : 'warning'}>
                          {b.status === 'concluido' ? 'Concluída' : 'Interrompida'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.total_linhas}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.novos}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.duplicados}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.invalidos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        A base JD e este histórico são visíveis apenas para administradores. Os demais usuários veem
        somente a classificação JD dos checklists que já têm permissão de visualizar. Nenhum checklist
        é alterado por esta auditoria.
      </p>
    </div>
  );
};

export default JdChassisTab;
