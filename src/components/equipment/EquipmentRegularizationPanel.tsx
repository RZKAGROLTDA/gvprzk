/**
 * R2 — Painel de Pendências da Regularização do Parque (somente leitura).
 * Dados exclusivamente das RPCs equipment_regularization_pending_*.
 */
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  ClipboardList, Loader2, Tractor,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { formatDateDisplay } from '@/lib/utils';
import {
  useFiliaisList, useRegularizationClients, useRegularizationKpis,
  useRegularizationMachines,
  type RegClientGroup, type RegFilters, type RegMachine, type RegSituation,
} from '@/hooks/useEquipmentRegularization';

const ALL = 'all';
const NO_FILIAL = 'none';
const PAGE_SIZE = 20;

const SITUATION_LABEL: Record<RegSituation, string> = {
  vendida: 'Vendida',
  inativa: 'Inativa',
  sucata: 'Sucata',
};

const situationVariant = (s: RegSituation): 'outline' | 'secondary' | 'destructive' =>
  s === 'vendida' ? 'outline' : s === 'inativa' ? 'secondary' : 'destructive';

const Kpi: React.FC<{ label: string; value?: number; loading?: boolean }> = ({
  label, value, loading,
}) => (
  <div className="rounded-md border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (value ?? 0).toLocaleString('pt-BR')}
    </p>
  </div>
);

const dateOrDash = (v: string | null) => (v ? formatDateDisplay(v) : '—');

interface GroupRowProps {
  group: RegClientGroup;
  filters: RegFilters;
  selected: Record<string, RegMachine>;
  onToggleMachine: (m: RegMachine, checked: boolean) => void;
  onToggleGroup: (machines: RegMachine[], checked: boolean) => void;
}

const GroupRow: React.FC<GroupRowProps> = ({
  group, filters, selected, onToggleMachine, onToggleGroup,
}) => {
  const [open, setOpen] = useState(false);
  const groupFilters = useMemo<RegFilters>(
    () => ({
      ...filters,
      filialId: group.filial_id ?? null,
      withoutFilial: group.filial_id == null,
    }),
    [filters, group.filial_id],
  );
  const { data: machines, isLoading, isError, error } = useRegularizationMachines(
    group.client_key, groupFilters, open,
  );

  const list = machines ?? [];
  const allSelected = list.length > 0 && list.every((m) => selected[m.equipment_id]);

  return (
    <div className="border-t">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox
            checked={allSelected}
            disabled={!open || list.length === 0}
            onCheckedChange={(v) => onToggleGroup(list, v === true)}
            aria-label="Selecionar todas as máquinas do grupo"
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="min-w-0 text-left"
          >
            <p className="truncate font-medium">{group.client_name || '—'}</p>
            <p className="text-xs text-muted-foreground">
              Código: {group.client_code || '—'} · Filial: {group.filial_nome || 'Não informada'} ·
              {' '}Última validação: {dateOrDash(group.last_validation_at)}
            </p>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{group.total_pending} pendentes</Badge>
          <Badge variant="outline">Vendidas: {group.by_situation?.vendida ?? 0}</Badge>
          <Badge variant="secondary">Inativas: {group.by_situation?.inativa ?? 0}</Badge>
          <Badge variant="destructive">Sucatas: {group.by_situation?.sucata ?? 0}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t bg-muted/30 p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando máquinas...
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              Erro ao carregar máquinas: {(error as Error)?.message}
            </p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma máquina pendente neste grupo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium"> </th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Modelo</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Chassi/Série</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Ano</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Situação</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Última validação</th>
                    <th className="py-2 font-medium whitespace-nowrap">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.equipment_id} className="border-t">
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={!!selected[m.equipment_id]}
                          onCheckedChange={(v) => onToggleMachine(m, v === true)}
                          aria-label="Selecionar máquina"
                        />
                      </td>
                      <td className="py-2 pr-3">{m.model || '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{m.serial_chassis || '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{m.year ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={situationVariant(m.machine_situation)}>
                          {SITUATION_LABEL[m.machine_situation] ?? m.machine_situation}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {dateOrDash(m.last_validation_at)}
                      </td>
                      <td className="py-2">{m.validation_source || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export const EquipmentRegularizationPanel: React.FC = () => {
  const [filialFilter, setFilialFilter] = useState(ALL);
  const [situation, setSituation] = useState(ALL);
  const [clientInput, setClientInput] = useState('');
  const [chassisInput, setChassisInput] = useState('');
  const [client, setClient] = useState('');
  const [chassis, setChassis] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, RegMachine>>({});

  const { data: filiais = [] } = useFiliaisList();

  const filters = useMemo<RegFilters>(
    () => ({
      filialId: filialFilter === ALL || filialFilter === NO_FILIAL ? null : filialFilter,
      withoutFilial: filialFilter === NO_FILIAL,
      client: client.trim() || null,
      situation: situation === ALL ? null : (situation as RegSituation),
      chassis: chassis.trim() || null,
    }),
    [filialFilter, client, situation, chassis],
  );

  const kpis = useRegularizationKpis(filters);
  const groups = useRegularizationClients(filters, page, PAGE_SIZE);

  const resetPage = () => setPage(1);
  const applySearch = () => {
    setClient(clientInput);
    setChassis(chassisInput);
    resetPage();
  };
  const clearFilters = () => {
    setFilialFilter(ALL);
    setSituation(ALL);
    setClientInput('');
    setChassisInput('');
    setClient('');
    setChassis('');
    resetPage();
  };

  const toggleMachine = (m: RegMachine, checked: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[m.equipment_id] = m;
      else delete next[m.equipment_id];
      return next;
    });

  const toggleGroup = (machines: RegMachine[], checked: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      machines.forEach((m) => {
        if (checked) next[m.equipment_id] = m;
        else delete next[m.equipment_id];
      });
      return next;
    });

  const selectedCount = Object.keys(selected).length;
  const totalGroups = groups.data?.total_groups ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const list = groups.data?.clients ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" />
          Regularização do Parque
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Máquinas vendidas, inativas ou sucata que ainda não foram regularizadas.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Máquinas Pendentes" value={kpis.data?.total_pending} loading={kpis.isLoading} />
          <Kpi label="Clientes Pendentes" value={kpis.data?.total_clients} loading={kpis.isLoading} />
          <Kpi label="Vendidas" value={kpis.data?.by_situation?.vendida} loading={kpis.isLoading} />
          <Kpi label="Inativas" value={kpis.data?.by_situation?.inativa} loading={kpis.isLoading} />
          <Kpi label="Sucatas" value={kpis.data?.by_situation?.sucata} loading={kpis.isLoading} />
          <Kpi label="Regularizadas" value={kpis.data?.total_regularized} loading={kpis.isLoading} />
        </div>
        {kpis.isError ? (
          <p className="text-sm text-destructive">
            Erro nos indicadores: {(kpis.error as Error)?.message}
          </p>
        ) : null}

        {/* Filtros */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={filialFilter}
            onValueChange={(v) => { setFilialFilter(v); resetPage(); }}
          >
            <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as filiais</SelectItem>
              <SelectItem value={NO_FILIAL}>Sem filial</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={situation} onValueChange={(v) => { setSituation(v); resetPage(); }}>
            <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as situações</SelectItem>
              <SelectItem value="vendida">Vendida</SelectItem>
              <SelectItem value="inativa">Inativa</SelectItem>
              <SelectItem value="sucata">Sucata</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Cliente (nome ou código)"
            value={clientInput}
            onChange={(e) => setClientInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
          />

          <Input
            placeholder="Chassi/Série"
            value={chassisInput}
            onChange={(e) => setChassisInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={applySearch}>Buscar</Button>
          <Button size="sm" variant="outline" onClick={clearFilters}>Limpar filtros</Button>
        </div>

        {/* Lista agrupada */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between p-3 text-sm text-muted-foreground">
            <span>
              {groups.isLoading ? 'Carregando grupos...' : `${totalGroups} grupo(s) cliente + filial`}
            </span>
            {groups.isFetching && !groups.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
          </div>

          {groups.isError ? (
            <div className="flex items-center gap-2 border-t p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Erro ao carregar pendências: {(groups.error as Error)?.message}
              <Button size="sm" variant="outline" onClick={() => groups.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : groups.isLoading ? (
            <div className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : list.length === 0 ? (
            <div className="flex items-center gap-2 border-t p-6 text-sm text-muted-foreground">
              <Tractor className="h-4 w-4" /> Nenhuma pendência encontrada com os filtros atuais.
            </div>
          ) : (
            list.map((g) => (
              <GroupRow
                key={g.client_key}
                group={g}
                filters={filters}
                selected={selected}
                onToggleMachine={toggleMachine}
                onToggleGroup={toggleGroup}
              />
            ))
          )}
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || groups.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || groups.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Barra de seleção */}
        {selectedCount > 0 ? (
          <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3 shadow-lg">
            <p className="text-sm font-medium">
              {selectedCount} máquina(s) selecionada(s)
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelected({})}>
                Limpar seleção
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  toast({
                    title: 'Próxima fase',
                    description: 'Etapa de criação do lote será habilitada na próxima fase.',
                  })
                }
              >
                Criar lote de regularização
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
