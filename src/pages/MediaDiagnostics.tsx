import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, RefreshCw, ShieldAlert, HardDrive, Image as ImageIcon, CheckCircle2, XCircle } from 'lucide-react';
import {
  TASK_PHOTOS_BUCKET,
  PRODUCT_PHOTOS_BUCKET,
  resolveMediaUrl,
  invalidateSignedUrl,
  type MediaBucket,
} from '@/lib/mediaStorage';

interface SectionReport {
  base64_count: number;
  storage_count: number;
  base64_bytes: number;
  mixed_records: number;
  records_with_photos: number;
}

interface BucketReport {
  bucket: string;
  files: number;
  bytes: number;
}

interface MigrationReport {
  tasks: SectionReport;
  products: SectionReport;
  buckets: BucketReport[];
  generated_at: string;
}

interface StorageFile {
  bucket: MediaBucket;
  path: string;
  size: number | null;
  mimetype: string | null;
  updatedAt: string | null;
}

interface TestResult {
  label: string;
  ok: boolean;
  detail: string;
  ms?: number;
}

const EMPTY_SECTION: SectionReport = {
  base64_count: 0,
  storage_count: 0,
  base64_bytes: 0,
  mixed_records: 0,
  records_with_photos: 0,
};

function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes || 0);
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

const Metric: React.FC<{ label: string; value: string; hint?: string; tone?: 'default' | 'warn' | 'ok' }> = ({
  label,
  value,
  hint,
  tone = 'default',
}) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p
      className={`mt-1 text-2xl font-semibold ${
        tone === 'warn' ? 'text-destructive' : tone === 'ok' ? 'text-primary' : 'text-foreground'
      }`}
    >
      {value}
    </p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

/** Lista até `limit` objetos do bucket (varre as pastas por task_id). */
async function listBucketFiles(bucket: MediaBucket, limit = 25): Promise<StorageFile[]> {
  const { data: folders, error } = await supabase.storage
    .from(bucket)
    .list('', { limit: 50, sortBy: { column: 'updated_at', order: 'desc' } });
  if (error) throw new Error(error.message);

  const files: StorageFile[] = [];
  for (const folder of folders || []) {
    if (files.length >= limit) break;
    if (folder.id) {
      // arquivo na raiz (não esperado, mas tratado)
      files.push({
        bucket,
        path: folder.name,
        size: (folder.metadata as any)?.size ?? null,
        mimetype: (folder.metadata as any)?.mimetype ?? null,
        updatedAt: folder.updated_at ?? null,
      });
      continue;
    }
    const { data: inner } = await supabase.storage
      .from(bucket)
      .list(folder.name, { limit: 20, sortBy: { column: 'updated_at', order: 'desc' } });
    for (const obj of inner || []) {
      if (!obj.id) continue;
      files.push({
        bucket,
        path: `${folder.name}/${obj.name}`,
        size: (obj.metadata as any)?.size ?? null,
        mimetype: (obj.metadata as any)?.mimetype ?? null,
        updatedAt: obj.updated_at ?? null,
      });
      if (files.length >= limit) break;
    }
  }
  return files;
}

const MediaDiagnostics: React.FC = () => {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [bucket, setBucket] = useState<MediaBucket>(TASK_PHOTOS_BUCKET);
  const [selected, setSelected] = useState<StorageFile | null>(null);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState<number | null>(null);

  const reportQuery = useQuery({
    queryKey: ['media-migration-report'],
    queryFn: async (): Promise<MigrationReport> => {
      const { data, error } = await supabase.rpc('get_media_migration_report');
      if (error) throw new Error(error.message);
      const parsed = (data || {}) as unknown as MigrationReport;
      return {
        tasks: { ...EMPTY_SECTION, ...(parsed.tasks || {}) },
        products: { ...EMPTY_SECTION, ...(parsed.products || {}) },
        buckets: parsed.buckets || [],
        generated_at: parsed.generated_at,
      };
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filesQuery = useQuery({
    queryKey: ['media-diagnostics-files', bucket],
    queryFn: () => listBucketFiles(bucket),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const report = reportQuery.data;

  const totals = useMemo(() => {
    const t = report?.tasks || EMPTY_SECTION;
    const p = report?.products || EMPTY_SECTION;
    return {
      base64: t.base64_count + p.base64_count,
      storage: t.storage_count + p.storage_count,
      mixed: t.mixed_records + p.mixed_records,
      base64Bytes: t.base64_bytes + p.base64_bytes,
      bucketBytes: (report?.buckets || []).reduce((acc, b) => acc + Number(b.bytes || 0), 0),
    };
  }, [report]);

  const runTests = async (file: StorageFile) => {
    setRunning(true);
    setSelected(file);
    setPreviewUrl(null);
    setDownloadedBytes(null);
    const results: TestResult[] = [];

    // 1. Gerar Signed URL
    let url: string | null = null;
    try {
      const start = performance.now();
      url = await resolveMediaUrl(file.path, file.bucket, { force: true });
      const ms = Math.round(performance.now() - start);
      results.push({
        label: 'Gerar Signed URL',
        ok: !!url,
        ms,
        detail: url ? 'URL assinada gerada com sucesso.' : 'Retorno nulo — verifique RLS de storage.objects.',
      });
      setPreviewUrl(url);
    } catch (err: any) {
      results.push({ label: 'Gerar Signed URL', ok: false, detail: err?.message || String(err) });
    }

    // 2. Renovar Signed URL (invalida cache e gera outra)
    try {
      invalidateSignedUrl(file.path, file.bucket);
      const start = performance.now();
      const renewed = await resolveMediaUrl(file.path, file.bucket, { force: true });
      const ms = Math.round(performance.now() - start);
      results.push({
        label: 'Renovar Signed URL',
        ok: !!renewed && renewed !== url,
        ms,
        detail: !renewed
          ? 'Falha ao renovar a URL assinada.'
          : renewed === url
            ? 'URL renovada é idêntica à anterior (cache não invalidado).'
            : 'Nova URL assinada emitida (token diferente).',
      });
      if (renewed) {
        url = renewed;
        setPreviewUrl(renewed);
      }
    } catch (err: any) {
      results.push({ label: 'Renovar Signed URL', ok: false, detail: err?.message || String(err) });
    }

    // 3. Validar acesso ao arquivo
    if (url) {
      try {
        const start = performance.now();
        const response = await fetch(url);
        const ms = Math.round(performance.now() - start);
        if (!response.ok) {
          results.push({
            label: 'Validar acesso ao arquivo',
            ok: false,
            ms,
            detail: `HTTP ${response.status} ${response.statusText}`,
          });
        } else {
          const blob = await response.blob();
          setDownloadedBytes(blob.size);
          results.push({
            label: 'Validar acesso ao arquivo',
            ok: true,
            ms,
            detail: `${formatBytes(blob.size)} · ${blob.type || 'tipo desconhecido'}`,
          });
        }
      } catch (err: any) {
        results.push({
          label: 'Validar acesso ao arquivo',
          ok: false,
          detail: err?.message || 'Falha de rede ao baixar o objeto.',
        });
      }
    } else {
      results.push({
        label: 'Validar acesso ao arquivo',
        ok: false,
        detail: 'Sem URL assinada disponível para testar.',
      });
    }

    setTests(results);
    setRunning(false);
  };

  if (roleLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader className="items-center text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>Esta tela de diagnóstico é exclusiva para administradores.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico de Mídia</h1>
          <p className="text-sm text-muted-foreground">
            Tela temporária, somente leitura. Nenhum dado é alterado.
            {report?.generated_at && ` Última leitura: ${new Date(report.generated_at).toLocaleString('pt-BR')}`}
          </p>
        </div>
        <Button variant="outline" onClick={() => { reportQuery.refetch(); filesQuery.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </header>

      {reportQuery.isError && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            Falha ao carregar o relatório: {(reportQuery.error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* 1. Resumo da migração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Resumo da migração</CardTitle>
          <CardDescription>Contagem de fotos por origem e espaço ocupado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportQuery.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Base64 (Tasks)"
                  value={formatNumber(report?.tasks.base64_count)}
                  hint={`${formatBytes(report?.tasks.base64_bytes)} no banco`}
                  tone={(report?.tasks.base64_count || 0) > 0 ? 'warn' : 'ok'}
                />
                <Metric
                  label="Storage (Tasks)"
                  value={formatNumber(report?.tasks.storage_count)}
                  hint={`${formatNumber(report?.tasks.records_with_photos)} tarefas com fotos`}
                  tone="ok"
                />
                <Metric
                  label="Base64 (Products)"
                  value={formatNumber(report?.products.base64_count)}
                  hint={`${formatBytes(report?.products.base64_bytes)} no banco`}
                  tone={(report?.products.base64_count || 0) > 0 ? 'warn' : 'ok'}
                />
                <Metric
                  label="Storage (Products)"
                  value={formatNumber(report?.products.storage_count)}
                  hint={`${formatNumber(report?.products.records_with_photos)} produtos com fotos`}
                  tone="ok"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Registros mistos"
                  value={formatNumber(totals.mixed)}
                  hint="Registros com Base64 e Storage ao mesmo tempo"
                  tone={totals.mixed > 0 ? 'warn' : 'ok'}
                />
                <Metric
                  label="Espaço ocupado por Base64"
                  value={formatBytes(totals.base64Bytes)}
                  hint={`${formatNumber(totals.base64)} fotos ainda no banco`}
                  tone={totals.base64Bytes > 0 ? 'warn' : 'ok'}
                />
                <Metric
                  label="Espaço nos buckets"
                  value={formatBytes(totals.bucketBytes)}
                  hint={`${formatNumber(totals.storage)} referências no banco`}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Buckets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Buckets</CardTitle>
          <CardDescription>Arquivos e espaço utilizado por bucket privado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(report?.buckets || []).map((b) => (
            <div key={b.bucket} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{b.bucket}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(b.files)} arquivo(s)</p>
                </div>
              </div>
              <Badge variant="secondary">{formatBytes(b.bytes)}</Badge>
            </div>
          ))}
          {!reportQuery.isLoading && (report?.buckets || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum bucket retornado.</p>
          )}
        </CardContent>
      </Card>

      {/* 3. Testes de Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. Testes de Storage</CardTitle>
          <CardDescription>
            Selecione um arquivo para gerar, renovar e validar a Signed URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {[TASK_PHOTOS_BUCKET, PRODUCT_PHOTOS_BUCKET].map((b) => (
              <Button
                key={b}
                size="sm"
                variant={bucket === b ? 'default' : 'outline'}
                onClick={() => { setBucket(b as MediaBucket); setSelected(null); setTests([]); }}
              >
                {b}
              </Button>
            ))}
          </div>

          {filesQuery.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filesQuery.isError ? (
            <p className="text-sm text-destructive">
              Falha ao listar objetos: {(filesQuery.error as Error).message}
            </p>
          ) : (filesQuery.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum arquivo encontrado em <strong>{bucket}</strong>. Crie uma tarefa com foto para popular o bucket.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {(filesQuery.data || []).map((f) => (
                <button
                  key={f.path}
                  onClick={() => runTests(f)}
                  disabled={running}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    selected?.path === f.path ? 'bg-accent' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-xs">{f.path}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                </button>
              ))}
            </div>
          )}

          {running && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Executando testes…
            </div>
          )}

          {tests.length > 0 && (
            <div className="space-y-2">
              <Separator />
              {tests.map((t) => (
                <div key={t.label} className="flex items-start gap-3 rounded-md border p-3">
                  {t.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t.label}</p>
                      {typeof t.ms === 'number' && (
                        <Badge variant="outline" className="text-xs">{t.ms} ms</Badge>
                      )}
                    </div>
                    <p className="break-words text-xs text-muted-foreground">{t.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Informações da foto selecionada */}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">4. Foto selecionada</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="overflow-hidden rounded-lg border bg-muted">
              {previewUrl ? (
                <img src={previewUrl} alt={`Pré-visualização de ${selected.path}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  Sem pré-visualização
                </div>
              )}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Bucket</dt>
                <dd className="text-sm font-medium">{selected.bucket}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tipo</dt>
                <dd className="text-sm font-medium">Storage (path)</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-muted-foreground">Path</dt>
                <dd className="break-all font-mono text-xs">{selected.path}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tamanho no Storage</dt>
                <dd className="text-sm font-medium">{formatBytes(selected.size)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Tamanho baixado</dt>
                <dd className="text-sm font-medium">
                  {downloadedBytes != null ? formatBytes(downloadedBytes) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Equivalente Base64 (estimado)</dt>
                <dd className="text-sm font-medium">
                  {selected.size ? formatBytes(Math.round(selected.size * 1.37)) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Content-Type</dt>
                <dd className="text-sm font-medium">{selected.mimetype || '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MediaDiagnostics;
