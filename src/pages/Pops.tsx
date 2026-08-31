import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle, ArrowLeft, Building2, ChevronLeft, ChevronRight, Download, FileText,
  Tractor, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  usePopsProgram, usePopsGoalSummary, usePopsClients, usePopsClientMachines,
  usePopsExecutorResults, usePopsPermissions, useFiliaisList,
  type PopsClientRow, type PopsMachineRow, type PopsPlatformFilter,
} from '@/hooks/usePops';
import { useProfile } from '@/hooks/useProfile';
import { buildPopsMachinesPdf } from '@/lib/popsMachinesPdf';
import { PopsGoalHeader } from '@/components/pops/PopsGoalHeader';
import { PopsMachineDrawer } from '@/components/pops/PopsMachineDrawer';
import { PopsPortfolioFilters, type PortfolioFilters } from '@/components/pops/PopsPortfolioFilters';
import { PopsExecutorResults } from '@/components/pops/PopsExecutorResults';


const PAGE_SIZE = 24;
const nf = new Intl.NumberFormat('pt-BR');

const getErrorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível carregar os dados do POPS.';

/** "Esmaga" o texto para comparação flexível (sem acento/espaço/pontuação). */
const crush = (v?: string | null) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const EMPTY_FILTERS: PortfolioFilters = { client: '', serial: '', model: '', platform: 'all' };

/** Rótulos de situação usados no PDF (mesmos exibidos na relação de máquinas). */
const SITUATION_LABEL: Record<PopsMachineRow['status'], string> = {
  foco: 'Foco',
  em_andamento: 'Em andamento',
  servicada: 'Serviçada',
};


const Pops: React.FC = () => {
  const perms = usePopsPermissions();
  const { data: program, isLoading: loadingProgram, error: programError } = usePopsProgram();
  const [filialId, setFilialId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PortfolioFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<PortfolioFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [selectedClient, setSelectedClient] = useState<PopsClientRow | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [execPlatform, setExecPlatform] = useState<PopsPlatformFilter>('all');
  const [execUser, setExecUser] = useState<string | null>(null);
  // Seleção de máquinas apenas para geração documental do PDF (não altera registros)
  const [selectedForPdf, setSelectedForPdf] = useState<Record<string, PopsMachineRow>>({});
  const { profile } = useProfile();


  // Debounce da busca inteligente
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(filters);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [filters]);

  const { data: filiais = [] } = useFiliaisList(perms.isGlobal);
  const goal = usePopsGoalSummary(program?.id, filialId);
  const clients = usePopsClients(program?.id, {
    search: applied.client,
    serial: applied.serial,
    model: applied.model,
    platform: applied.platform,
    filialId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const machines = usePopsClientMachines(program?.id, selectedClient?.client_key ?? null);

  const showManagementPanel = perms.isGlobal || perms.isSupervisorOnly;
  const executors = usePopsExecutorResults(showManagementPanel ? program?.id : undefined, {
    filialId,
    platform: execPlatform,
    executedBy: execUser,
  });

  const selectedMachine: PopsMachineRow | null = useMemo(
    () => machines.data?.find((m) => m.pops_machine_id === selectedMachineId) ?? null,
    [machines.data, selectedMachineId],
  );

  // Destaque e ordenação das máquinas conforme os filtros aplicados (somente apresentação)
  const machineList = useMemo(() => {
    const rows = machines.data ?? [];
    const serial = crush(applied.serial);
    const model = crush(applied.model);
    const platform = applied.platform;
    const hasFilter = !!serial || !!model || platform !== 'all';
    if (!hasFilter) return rows.map((m) => ({ machine: m, highlight: false }));

    const matches = (m: PopsMachineRow) =>
      (!serial || crush(m.pops_serial).includes(serial)) &&
      (!model || crush(m.pops_model).includes(model) || crush(m.pops_product_series).includes(model)) &&
      (platform === 'all' || (m.pops_platform ?? '') === platform);

    return rows
      .map((m) => ({ machine: m, highlight: matches(m) }))
      .sort((a, b) => Number(b.highlight) - Number(a.highlight));
  }, [machines.data, applied]);

  // Limpa a seleção ao trocar de cliente
  useEffect(() => {
    setSelectedForPdf({});
  }, [selectedClient?.client_key]);

  const selectAllRef = useRef<HTMLButtonElement>(null);
  const visibleMachineIds = useMemo(() => machineList.map(({ machine }) => machine.pops_machine_id), [machineList]);
  const selectedCount = pdfSelection.length;
  const visibleCount = machineList.length;
  const allSelected = visibleCount > 0 && selectedCount === visibleCount;
  const someSelected = selectedCount > 0 && selectedCount < visibleCount;

  useEffect(() => {
    if (selectAllRef.current) {
      (selectAllRef.current as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleSelectAll = (checked: boolean) => {
    setSelectedForPdf((prev) => {
      const next = { ...prev };
      machineList.forEach(({ machine }) => {
        if (checked) next[machine.pops_machine_id] = machine;
        else delete next[machine.pops_machine_id];
      });
      return next;
    });
  };

  const pdfSelection = useMemo(() => Object.values(selectedForPdf), [selectedForPdf]);

  const toggleMachineSelection = (m: PopsMachineRow, checked: boolean) =>
    setSelectedForPdf((prev) => {
      const next = { ...prev };
      if (checked) next[m.pops_machine_id] = m;
      else delete next[m.pops_machine_id];
      return next;
    });

  /** Geração puramente documental: nada é alterado nas máquinas. */
  const handleGeneratePdf = (mode: 'preview' | 'download') => {
    if (pdfSelection.length === 0) return;
    const first = pdfSelection[0];
    const { blob, fileName } = buildPopsMachinesPdf({
      clientName: selectedClient?.pops_client_name ?? first.pops_client_name,
      clientCode: first.pops_client_code,
      filial:
        selectedClient?.filial_nome ??
        first.filial_nome ??
        selectedClient?.pops_dealer_location ??
        first.pops_dealer_location,
      responsible: profile?.name ?? null,
      machines: pdfSelection.map((m) => ({
        model: m.pops_model,
        serial: m.pops_serial,
        year: m.pops_manufacture_year,
        situation: SITUATION_LABEL[m.status] ?? m.status,
      })),
    });

    const url = URL.createObjectURL(blob);
    if (mode === 'download') {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF gerado e baixado.');
    } else {
      window.open(url, '_blank');
      toast.success('PDF gerado para visualização.');
    }
  };


  const highlightedCount = machineList.filter((m) => m.highlight).length;
  const totalPages = Math.max(1, Math.ceil((clients.data?.total ?? 0) / PAGE_SIZE));
  const anyFilterApplied =
    !!applied.client.trim() || !!applied.serial.trim() || !!applied.model.trim() || applied.platform !== 'all';

  if (perms.isLoading || loadingProgram) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!perms.canAccess) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Acesso restrito</AlertTitle>
        <AlertDescription>Seu perfil não tem acesso ao módulo POPS.</AlertDescription>
      </Alert>
    );
  }

  if (programError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar o programa</AlertTitle>
        <AlertDescription>{getErrorMessage(programError)}</AlertDescription>
      </Alert>
    );
  }

  if (!program) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Nenhum programa POPS ativo</AlertTitle>
        <AlertDescription>Não há programa POPS ativo disponível para o seu acesso.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PopsGoalHeader
        programName={program.name}
        summary={goal.data}
        isLoading={goal.isLoading}
        showFilialFilter={perms.isGlobal}
        filiais={filiais}
        filialId={filialId}
        onFilialChange={(id) => {
          setFilialId(id);
          setPage(0);
          setSelectedClient(null);
        }}
      />

      {goal.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{getErrorMessage(goal.error)}</AlertDescription>
        </Alert>
      )}

      {showManagementPanel && (
        <PopsExecutorResults
          rows={executors.data?.rows ?? []}
          totalServiced={executors.data?.total_serviced ?? 0}
          isLoading={executors.isLoading}
          error={executors.error}
          platform={execPlatform}
          onPlatformChange={setExecPlatform}
          executedBy={execUser}
          onExecutedByChange={setExecUser}
        />
      )}

      {!selectedClient ? (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base sm:text-lg font-semibold">Carteira de clientes</h2>
                <Badge variant="secondary">{nf.format(clients.data?.total ?? 0)}</Badge>
              </div>
            </div>

            <PopsPortfolioFilters value={filters} onChange={setFilters} />

            {clients.isLoading ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : clients.error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{getErrorMessage(clients.error)}</AlertDescription>
              </Alert>
            ) : (clients.data?.rows.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {anyFilterApplied
                  ? 'Nenhum cliente encontrado para os filtros aplicados.'
                  : 'Nenhum cliente disponível na sua carteira POPS.'}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {clients.data!.rows.map((c) => (
                  <button
                    key={c.client_key}
                    type="button"
                    onClick={() => {
                      setSelectedClient(c);
                      setSelectedMachineId(null);
                    }}
                    className="rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p className="font-semibold text-foreground line-clamp-2">{c.pops_client_name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {c.filial_nome || c.pops_dealer_location || 'Filial não mapeada'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline">{nf.format(c.total_maquinas)} máquinas</Badge>
                      <Badge variant="default">{nf.format(c.servicadas)} serviçadas</Badge>
                      <Badge variant="secondary">{nf.format(c.pendentes)} pendentes</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Carteira
              </Button>
              <Separator orientation="vertical" className="hidden sm:block h-6" />
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold truncate">{selectedClient.pops_client_name}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedClient.filial_nome || selectedClient.pops_dealer_location || 'Filial não mapeada'} ·{' '}
                  {nf.format(selectedClient.total_maquinas)} máquinas
                  {highlightedCount > 0 && ` · ${nf.format(highlightedCount)} correspondem ao filtro`}
                </p>
              </div>
            </div>

            {machines.isLoading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : machines.error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{getErrorMessage(machines.error)}</AlertDescription>
              </Alert>
            ) : machineList.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Este cliente não possui máquinas disponíveis no POPS.
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {machineList.map(({ machine: m, highlight }) => (
                    <div
                      key={m.pops_machine_id}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        highlight ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={!!selectedForPdf[m.pops_machine_id]}
                          onCheckedChange={(v) => toggleMachineSelection(m, v === true)}
                          aria-label="Selecionar máquina para o PDF"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMachineId(m.pops_machine_id);
                            setDrawerOpen(true);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Tractor className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="font-mono text-sm font-semibold break-all">
                                {m.pops_serial || 'Sem serial'}
                              </span>
                            </div>
                            <PopsStatusBadge status={m.status} />
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>Modelo: <span className="text-foreground">{m.pops_model || '—'}</span></span>
                            <span>Série: <span className="text-foreground">{m.pops_product_series || '—'}</span></span>
                            <span>Ano: <span className="text-foreground">{m.pops_manufacture_year || '—'}</span></span>
                            <span>Plataforma: <span className="text-foreground">{m.pops_platform || '—'}</span></span>
                          </div>
                          {m.status === 'servicada' && (
                            <p className="mt-2 text-xs text-primary">
                              {m.final_service_name} · OS {m.os_number}
                            </p>
                          )}
                          {m.equipment_id && (
                            <p className="mt-1 text-[11px] text-muted-foreground/70">Vinculada ao Parque</p>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {pdfSelection.length > 0 && (
                  <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3 shadow-lg">
                    <p className="text-sm font-medium">
                      {nf.format(pdfSelection.length)} máquina(s) selecionada(s)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedForPdf({})}>
                        Limpar seleção
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleGeneratePdf('preview')}>
                        <FileText className="mr-2 h-4 w-4" /> Gerar PDF
                      </Button>
                      <Button size="sm" onClick={() => handleGeneratePdf('download')}>
                        <Download className="mr-2 h-4 w-4" /> Baixar PDF
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

          </CardContent>
        </Card>
      )}

      <PopsMachineDrawer
        machine={selectedMachine}
        open={drawerOpen && !!selectedMachine}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (!v) setSelectedMachineId(null);
        }}
        canComplete={perms.canComplete}
      />
    </div>
  );
};

export default Pops;
