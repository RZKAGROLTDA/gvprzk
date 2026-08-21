import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Wrench,
  Users,
  Tractor,
  ClipboardList,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDateDisplay } from '@/lib/utils';
import { getRoleLabel } from '@/lib/roles';
import type { ManagementFilters } from '@/hooks/useManagementData';
import {
  useServiceOpportunitiesSummary,
  useServiceOpportunitiesDetails,
  fetchAllServiceOpportunityRows,
  type ServiceOpportunityLocalFilters,
} from '@/hooks/useServiceOpportunities';
import {
  SERVICE_TYPES,
  SEVERITY_LABELS,
  severityVariant,
  monthLabel,
  exportServiceOpportunitiesExcel,
} from '@/lib/serviceOpportunities';

interface Props {
  filters: ManagementFilters;
  /** Filtro de cliente já existente na tela de Análise Gerencial. */
  clientFilter?: string;
  /** Exibir agrupamentos por filial/responsável (apenas gestão). */
  showManagerBreakdowns: boolean;
  pageSize: number;
}

const MACHINE_TYPES = ['Trator', 'Colheitadeira', 'Pulverizador', 'Plantadeira', 'Implemento', 'Outro'];

const ServiceOpportunitiesTab: React.FC<Props> = ({
  filters,
  clientFilter,
  showManagerBreakdowns,
  pageSize,
}) => {
  const [serviceType, setServiceType] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [machineType, setMachineType] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const local: ServiceOpportunityLocalFilters = useMemo(
    () => ({
      serviceType: serviceType === 'all' ? null : serviceType,
      severity: severity === 'all' ? null : (severity as 'alta' | 'media'),
      machineType: machineType === 'all' ? null : machineType,
      client: clientFilter?.trim() ? clientFilter.trim() : null,
    }),
    [serviceType, severity, machineType, clientFilter],
  );

  const { data: summary, isLoading: summaryLoading, isError: summaryError } =
    useServiceOpportunitiesSummary(filters, local);
  const {
    data: rows = [],
    isLoading: rowsLoading,
    isFetching: rowsFetching,
  } = useServiceOpportunitiesDetails(filters, local, page, pageSize, true);

  const kpis = summary?.kpis;
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasLocalFilter = serviceType !== 'all' || severity !== 'all' || machineType !== 'all';

  const resetLocal = () => {
    setServiceType('all');
    setSeverity('all');
    setMachineType('all');
    setPage(0);
  };

  const handleExport = async () => {
    if (!summary) return;
    setExporting(true);
    try {
      const all = await fetchAllServiceOpportunityRows(filters, local);
      if (all.length === 0) {
        toast.info('Nenhuma oportunidade potencial para exportar com os filtros atuais.');
        return;
      }
      exportServiceOpportunitiesExcel(all, summary);
      toast.success(`Exportadas ${all.length} oportunidades potenciais.`);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao exportar.');
    } finally {
      setExporting(false);
    }
  };

  const kpiCards = [
    {
      label: 'Oportunidades Potenciais',
      value: kpis?.oportunidades ?? 0,
      icon: Wrench,
      accent: 'text-primary',
    },
    { label: 'Clientes com Oportunidade', value: kpis?.clientes ?? 0, icon: Users, accent: '' },
    { label: 'Máquinas com Oportunidade', value: kpis?.maquinas ?? 0, icon: Tractor, accent: '' },
    {
      label: 'Checklists com Oportunidade',
      value: kpis?.checklists_com_oportunidade ?? 0,
      icon: ClipboardList,
      accent: '',
      hint: kpis ? `${kpis.taxa_oportunidade.toFixed(1)}% dos ${kpis.checklists_periodo} checklists` : undefined,
    },
    {
      label: 'Itens Não Avaliados',
      value: kpis?.itens_nao_avaliados ?? 0,
      icon: AlertTriangle,
      accent: 'text-muted-foreground',
      hint: 'Itens de checklist sem resposta registrada',
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <k.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground leading-tight">{k.label}</span>
              </div>
              <p className={`text-2xl font-bold ${k.accent}`}>
                {summaryLoading ? '...' : k.value.toLocaleString('pt-BR')}
              </p>
              {k.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{k.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {summaryError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Não foi possível carregar as oportunidades potenciais. Tente novamente.
          </CardContent>
        </Card>
      )}

      {/* Filtros locais + exportação */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Serviço</label>
              <Select value={serviceType} onValueChange={(v) => { setServiceType(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Severidade</label>
              <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="alta">Alta (Não conforme)</SelectItem>
                  <SelectItem value="media">Média (Atenção)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Máquina</label>
              <Select value={machineType} onValueChange={(v) => { setMachineType(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {MACHINE_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleExport}
                disabled={exporting || summaryLoading || total === 0}
              >
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Exportar Excel
              </Button>
              {hasLocalFilter && (
                <Button variant="ghost" size="icon" onClick={resetLocal} title="Limpar filtros">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ranking por tipo de serviço */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Ranking por Tipo de Serviço</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (summary?.by_service.length ?? 0) === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma oportunidade potencial encontrada para os filtros selecionados.
            </p>
          ) : (
            <div className="space-y-3">
              {summary!.by_service.map((s) => {
                const pct = (kpis?.oportunidades ?? 0) > 0 ? (s.oportunidades / kpis!.oportunidades) * 100 : 0;
                return (
                  <button
                    key={s.service_type}
                    type="button"
                    onClick={() => { setServiceType(s.service_type); setPage(0); }}
                    className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="font-medium text-sm">{s.service_type}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="destructive">{s.alta} alta</Badge>
                        <Badge variant="warning">{s.media} média</Badge>
                        <span className="text-sm font-bold tabular-nums">{s.oportunidades}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">({pct.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {s.clientes} cliente(s) · {s.maquinas} máquina(s) · {s.checklists} checklist(s)
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agrupamentos gerenciais */}
      {showManagerBreakdowns && !summaryLoading && (summary?.by_filial.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Por Filial</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Filial</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Oport.</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Alta</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Média</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Clientes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary!.by_filial.map((f) => (
                      <TableRow key={f.filial_nome}>
                        <TableCell className="whitespace-nowrap">{f.filial_nome}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{f.oportunidades}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.alta}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.media}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.clientes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Por Responsável</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Responsável</TableHead>
                      <TableHead className="whitespace-nowrap">Cargo</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Oport.</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Alta</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Clientes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary!.by_seller.map((s) => (
                      <TableRow key={`${s.seller_id ?? 'na'}-${s.seller_name}`}>
                        <TableCell className="whitespace-nowrap">{s.seller_name}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {getRoleLabel(s.seller_role)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{s.oportunidades}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.alta}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.clientes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Evolução mensal */}
      {!summaryLoading && (summary?.by_month.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Evolução Mensal</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {summary!.by_month.map((m) => (
                <div key={m.mes} className="rounded-lg border px-4 py-2 min-w-[130px]">
                  <p className="text-xs text-muted-foreground">{monthLabel(m.mes)}</p>
                  <p className="text-xl font-bold tabular-nums">{m.oportunidades}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.alta} alta · {m.media} média
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drill-down */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            Detalhamento das Oportunidades Potenciais {total > 0 && `(${total})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rowsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma oportunidade potencial encontrada para os filtros selecionados.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">Cliente</TableHead>
                      <TableHead className="whitespace-nowrap">Máquina</TableHead>
                      <TableHead className="whitespace-nowrap">Serviço</TableHead>
                      <TableHead className="whitespace-nowrap">Item</TableHead>
                      <TableHead className="whitespace-nowrap">Severidade</TableHead>
                      <TableHead className="whitespace-nowrap">Responsável</TableHead>
                      <TableHead className="whitespace-nowrap">Filial</TableHead>
                      <TableHead className="min-w-[200px]">Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={`${r.task_id}-${r.item_name}-${i}`}>
                        <TableCell className="whitespace-nowrap">
                          {r.checklist_date ? formatDateDisplay(r.checklist_date) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap max-w-[220px] truncate" title={r.client_name}>
                          {r.client_name}
                          {r.client_code && (
                            <span className="text-xs text-muted-foreground ml-1">({r.client_code})</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>{r.machine_type || '—'}{r.machine_model ? ` · ${r.machine_model}` : ''}</div>
                          {r.machine_serial && (
                            <div className="text-muted-foreground">{r.machine_serial}</div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{r.service_type}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.item_name}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={severityVariant(r.severity)}>
                            {SEVERITY_LABELS[r.severity] ?? r.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.seller_name}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.filial_nome}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.observation || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages}
                  {rowsFetching && ' · atualizando...'}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page + 1 >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Oportunidade Potencial = item de checklist respondido como "Não conforme" (severidade Alta) ou
        "Atenção" (severidade Média), classificado em um tipo de serviço comercializável. Itens de limpeza
        geral não geram oportunidade. Nenhum dado de checklist é alterado por esta análise.
      </p>
    </div>
  );
};

export default ServiceOpportunitiesTab;
