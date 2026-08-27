import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle, ArrowLeft, Building2, ChevronLeft, ChevronRight, Search, Tractor, Users,
} from 'lucide-react';
import {
  usePopsProgram, usePopsGoalSummary, usePopsClients, usePopsClientMachines,
  usePopsPermissions, useFiliaisList, type PopsClientRow, type PopsMachineRow,
} from '@/hooks/usePops';
import { PopsGoalHeader } from '@/components/pops/PopsGoalHeader';
import { PopsStatusBadge } from '@/components/pops/PopsStatusBadge';
import { PopsMachineDrawer } from '@/components/pops/PopsMachineDrawer';

const PAGE_SIZE = 24;
const nf = new Intl.NumberFormat('pt-BR');

const getErrorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível carregar os dados do POPS.';

const Pops: React.FC = () => {
  const perms = usePopsPermissions();
  const { data: program, isLoading: loadingProgram, error: programError } = usePopsProgram();
  const [filialId, setFilialId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [selectedClient, setSelectedClient] = useState<PopsClientRow | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: filiais = [] } = useFiliaisList(perms.isGlobal);
  const goal = usePopsGoalSummary(program?.id, filialId);
  const clients = usePopsClients(program?.id, {
    search: searchTerm,
    filialId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const machines = usePopsClientMachines(program?.id, selectedClient?.client_key ?? null);

  const selectedMachine: PopsMachineRow | null = useMemo(
    () => machines.data?.find((m) => m.pops_machine_id === selectedMachineId) ?? null,
    [machines.data, selectedMachineId],
  );

  const totalPages = Math.max(1, Math.ceil((clients.data?.total ?? 0) / PAGE_SIZE));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearchTerm(search);
  };

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

      {!selectedClient ? (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base sm:text-lg font-semibold">Carteira de clientes</h2>
                <Badge variant="secondary">{nf.format(clients.data?.total ?? 0)}</Badge>
              </div>
              <form onSubmit={submitSearch} className="flex w-full sm:w-auto gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cliente"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="secondary">Buscar</Button>
              </form>
            </div>

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
                {searchTerm ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente disponível na sua carteira POPS.'}
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
            ) : (machines.data?.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Este cliente não possui máquinas disponíveis no POPS.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {machines.data!.map((m) => (
                  <button
                    key={m.pops_machine_id}
                    type="button"
                    onClick={() => {
                      setSelectedMachineId(m.pops_machine_id);
                      setDrawerOpen(true);
                    }}
                    className="rounded-lg border p-3 text-left transition-colors hover:bg-accent"
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
                ))}
              </div>
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
