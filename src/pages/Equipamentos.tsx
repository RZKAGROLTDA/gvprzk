import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, FileSpreadsheet, Tractor, ChevronLeft, ChevronRight, Pencil, Star, ArrowRightLeft, CheckCircle2, Clock, UserCheck } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { EquipmentEditDialog } from '@/components/equipment';
import {
  MACHINE_TYPES, MACHINE_STATUSES,
  machineStatusLabel, statusBadgeVariant, VALIDATION_PRIORITY_LABEL,
} from '@/components/equipment/equipmentConstants';
import {
  useEquipmentSearch, useEquipmentValidators,
  type ClientEquipment, type EquipmentValidator,
} from '@/hooks/useClientEquipment';

const ALL = 'all';
const PAGE_SIZE = 50;

const Equipamentos: React.FC = () => {
  const [search, setSearch] = useState('');
  const [machineType, setMachineType] = useState(ALL);
  const [machineStatus, setMachineStatus] = useState(ALL);
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [validatedByFilter, setValidatedByFilter] = useState(ALL);
  const [validatorFilialFilter, setValidatorFilialFilter] = useState(ALL);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ClientEquipment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Diretório de validadores (id → nome, filial)
  const { data: validators = [] } = useEquipmentValidators();
  const validatorMap = useMemo(() => {
    const map = new Map<string, EquipmentValidator>();
    validators.forEach((v) => map.set(v.user_id, v));
    return map;
  }, [validators]);

  // Lista de filiais únicas dos validadores (para o filtro)
  const validatorFiliais = useMemo(() => {
    const seen = new Map<string, string>();
    validators.forEach((v) => {
      if (v.filial_id && v.filial_nome) seen.set(v.filial_id, v.filial_nome);
    });
    return Array.from(seen.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [validators]);

  // Resolve o array de user_ids a filtrar: seleção direta, ou todos os
  // validadores da filial escolhida.
  const validatedByIn = useMemo(() => {
    if (validatedByFilter !== ALL) return [validatedByFilter];
    if (validatorFilialFilter !== ALL) {
      return validators
        .filter((v) => v.filial_id === validatorFilialFilter)
        .map((v) => v.user_id);
    }
    return null;
  }, [validatedByFilter, validatorFilialFilter, validators]);

  const filters = useMemo(
    () => ({
      search,
      machineType: machineType === ALL ? null : machineType,
      machineStatus: machineStatus === ALL ? null : machineStatus,
      clientCode,
      clientName,
      validationPriority: priorityOnly ? true : null,
      validatedByIn,
    }),
    [search, machineType, machineStatus, clientCode, clientName, priorityOnly, validatedByIn],
  );

  const { data, isLoading, isFetching } = useEquipmentSearch(filters, page, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const total = data?.totalCount;

  // Resumo global do parque (ignora filtros)
  const { data: parkSummary } = useQuery({
    queryKey: ['client-equipment', 'park-summary-v3'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const now = Date.now();
      const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayIso = startOfToday.toISOString();
      const tbl = 'client_equipment' as any;
      const [totalRes, validadasRes, prioridadeRes, transferidasRes, hojeRes, seteDiasRes] = await Promise.all([
        supabase.from(tbl).select('id', { count: 'exact', head: true }),
        supabase.from(tbl).select('id', { count: 'exact', head: true })
          .not('last_validation_at', 'is', null),
        supabase.from(tbl).select('id', { count: 'exact', head: true })
          .eq('validation_priority', true),
        supabase.from(tbl).select('id', { count: 'exact', head: true })
          .gte('transferred_at', since30),
        supabase.from(tbl).select('id', { count: 'exact', head: true })
          .gte('last_validation_at', todayIso),
        supabase.from(tbl).select('id', { count: 'exact', head: true })
          .gte('last_validation_at', since7),
      ]);
      const total = totalRes.count ?? 0;
      const validadas = validadasRes.count ?? 0;
      const pendentes = Math.max(0, total - validadas);
      const prioridade = prioridadeRes.count ?? 0;
      const transferidas = transferidasRes.count ?? 0;
      const hoje = hojeRes.count ?? 0;
      const seteDias = seteDiasRes.count ?? 0;
      const pct = total > 0 ? Math.round((validadas / total) * 100) : 0;
      return { total, validadas, pendentes, prioridade, transferidas, hoje, seteDias, pct };
    },
  });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const handleEdit = (eq: ClientEquipment) => {
    setEditing(eq);
    setDialogOpen(true);
  };

  const validatorName = (userId: string | null) => {
    if (!userId) return '—';
    const v = validatorMap.get(userId);
    return v?.name || '—';
  };
  const validatorFilial = (userId: string | null) => {
    if (!userId) return '—';
    const v = validatorMap.get(userId);
    return v?.filial_nome || '—';
  };

  // -----------------------------------------------------------------
  // Exportar para Excel — respeita filtros ativos
  // -----------------------------------------------------------------
  const handleExport = async () => {
    setExporting(true);
    try {
      const all: ClientEquipment[] = [];
      const EXPORT_PAGE = 1000;
      let p = 0;
      while (true) {
        let q = supabase
          .from('client_equipment' as any)
          .select(
            'id, client_code, client_name, filial_id, model, serial_chassis, hours, year, observation, machine_type, product_raw, puk_status, machine_status, last_validation_at, validated_by, import_batch_id, validation_priority, validation_source, validation_priority_reason, validation_priority_updated_at',
          )
          .order('validation_priority', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .range(p * EXPORT_PAGE, p * EXPORT_PAGE + EXPORT_PAGE - 1);

        const norm = (v?: string) => (v && v.trim() ? v.trim() : null);
        if (norm(clientCode)) q = q.eq('client_code', norm(clientCode)!);
        if (norm(clientName)) q = q.ilike('client_name', `%${norm(clientName)!}%`);
        if (machineType !== ALL) q = q.eq('machine_type', machineType);
        if (machineStatus !== ALL) q = q.eq('machine_status', machineStatus);
        if (priorityOnly) q = q.eq('validation_priority', true);
        if (validatedByIn && validatedByIn.length > 0) q = q.in('validated_by', validatedByIn);
        if (norm(search)) {
          const s = search.replace(/[%,]/g, '');
          q = q.or(
            `model.ilike.%${s}%,serial_chassis.ilike.%${s}%,client_name.ilike.%${s}%,client_code.ilike.%${s}%`,
          );
        }
        const { data: batch, error } = await q;
        if (error) throw error;
        const list = (batch as unknown as ClientEquipment[]) ?? [];
        all.push(...list);
        if (list.length < EXPORT_PAGE) break;
        p += 1;
        if (all.length > 50000) break; // segurança
      }

      if (all.length === 0) {
        toast({ title: 'Nada para exportar', description: 'Nenhum equipamento corresponde aos filtros.' });
        return;
      }

      const exportRows = all.map((e) => ({
        'Código Cliente': e.client_code ?? '',
        'Cliente': e.client_name ?? '',
        'Modelo': e.model ?? '',
        'Tipo': e.machine_type ?? '',
        'Chassi/Série': e.serial_chassis ?? '',
        'Ano': e.year ?? '',
        'Horas': e.hours ?? '',
        'Status': e.machine_status ?? '',
        'Prioridade': e.validation_priority ? 'SIM' : 'NÃO',
        'Validado em': e.last_validation_at
          ? new Date(e.last_validation_at).toLocaleString('pt-BR')
          : '—',
        'Validado por': validatorName(e.validated_by),
        'Filial do Validador': validatorFilial(e.validated_by),
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Parque de Máquinas');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `parque-de-maquinas-${stamp}.xlsx`);
      toast({ title: `✅ ${exportRows.length} equipamentos exportados` });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Erro ao exportar',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const totalPages = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;

  // Resumo por usuário (ordenado desc por validações)
  const validatorsRanked = useMemo(
    () => [...validators].sort((a, b) => b.validated_count - a.validated_count),
    [validators],
  );

  // Distintos: buscar validated_by + client_code/client_name em client_equipment
  // (apenas registros com last_validation_at). Paginação segura, teto 20k linhas.
  const { data: validatedClientsRaw = [] } = useQuery({
    queryKey: ['client-equipment', 'validated-clients-index'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const PAGE = 1000;
      const MAX = 20000;
      const rows: { validated_by: string | null; client_code: string | null; client_name: string | null }[] = [];
      let p = 0;
      while (rows.length < MAX) {
        const { data, error } = await supabase
          .from('client_equipment' as any)
          .select('validated_by, client_code, client_name')
          .not('last_validation_at', 'is', null)
          .range(p * PAGE, p * PAGE + PAGE - 1);
        if (error) throw error;
        const batch = (data as unknown as typeof rows) ?? [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        p += 1;
      }
      return rows;
    },
  });

  const clientKey = (r: { client_code: string | null; client_name: string | null }) => {
    const code = (r.client_code ?? '').trim().toLowerCase();
    if (code) return `c:${code}`;
    const name = (r.client_name ?? '').trim().toLowerCase();
    return name ? `n:${name}` : '';
  };

  // Mapa filial_id → filial_nome (derivado dos validadores)
  const filialIdToName = useMemo(() => {
    const m = new Map<string, string>();
    validators.forEach((v) => {
      if (v.filial_id && v.filial_nome) m.set(v.filial_id, v.filial_nome);
    });
    return m;
  }, [validators]);

  // Distinct clients per validator's filial (usando validatorMap para mapear
  // validated_by → filial_nome, mesma regra usada em filialRanked)
  const distinctClientsByFilial = useMemo(() => {
    const map = new Map<string, Set<string>>();
    validatedClientsRaw.forEach((r) => {
      if (!r.validated_by) return;
      const v = validatorMap.get(r.validated_by);
      const filial = v?.filial_nome || '—';
      const k = clientKey(r);
      if (!k) return;
      if (!map.has(filial)) map.set(filial, new Set());
      map.get(filial)!.add(k);
    });
    const out: Record<string, number> = {};
    map.forEach((set, filial) => { out[filial] = set.size; });
    return out;
  }, [validatedClientsRaw, validatorMap]);

  // Total distinct clients com pelo menos uma máquina validada (KPI do topo)
  const distinctValidatedClientsTotal = useMemo(() => {
    const set = new Set<string>();
    validatedClientsRaw.forEach((r) => {
      const k = clientKey(r);
      if (k) set.add(k);
    });
    return set.size;
  }, [validatedClientsRaw]);

  // Máquinas prioritárias JÁ VALIDADAS — base para a tabela por filial
  const { data: priorityRaw = [] } = useQuery({
    queryKey: ['client-equipment', 'priority-validated-index'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const PAGE = 1000;
      const MAX = 20000;
      const rows: {
        filial_id: string | null;
        validated_by: string | null;
        client_code: string | null;
        client_name: string | null;
      }[] = [];
      let p = 0;
      while (rows.length < MAX) {
        const { data, error } = await supabase
          .from('client_equipment' as any)
          .select('filial_id, validated_by, client_code, client_name')
          .eq('validation_priority', true)
          .not('last_validation_at', 'is', null)
          .range(p * PAGE, p * PAGE + PAGE - 1);
        if (error) throw error;
        const batch = (data as unknown as typeof rows) ?? [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        p += 1;
      }
      return rows;
    },
  });

  const priorityValidatedByFilial = useMemo(() => {
    const totals = new Map<string, number>();
    const resolveFilialName = (r: { filial_id: string | null; validated_by: string | null }) => {
      if (r.validated_by) {
        const v = validatorMap.get(r.validated_by);
        if (v?.filial_nome) return v.filial_nome;
      }
      if (r.filial_id) return filialIdToName.get(r.filial_id) || '—';
      return '—';
    };
    priorityRaw.forEach((r) => {
      const filial = resolveFilialName(r);
      totals.set(filial, (totals.get(filial) ?? 0) + 1);
    });
    return totals;
  }, [priorityRaw, validatorMap, filialIdToName]);

  const priorityValidatedTotal = priorityRaw.length;
  const nonPriorityValidatedTotal = Math.max(
    0,
    (parkSummary?.validadas ?? 0) - priorityValidatedTotal,
  );

  const filialRanked = useMemo(() => {
    const map = new Map<string, { filial_nome: string; validated_count: number }>();
    validators.forEach((v) => {
      const key = v.filial_nome || '—';
      const cur = map.get(key);
      if (cur) cur.validated_count += v.validated_count;
      else map.set(key, { filial_nome: key, validated_count: v.validated_count });
    });
    priorityValidatedByFilial.forEach((_, filial) => {
      if (!map.has(filial)) map.set(filial, { filial_nome: filial, validated_count: 0 });
    });
    return [...map.values()].sort((a, b) => b.validated_count - a.validated_count);
  }, [validators, priorityValidatedByFilial]);


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Tractor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Parque de Máquinas</h1>
            <p className="text-sm text-muted-foreground">
              Cadastro mestre de equipamentos dos clientes
            </p>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting} className="shrink-0">
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 mr-2" />
          )}
          Exportar Excel
        </Button>
      </div>

      {/* Resumo do parque */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <SummaryCell
            icon={<Tractor className="h-4 w-4 text-muted-foreground" />}
            label="Total"
            value={parkSummary?.total}
          />
          <SummaryCell
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            label="Total Validadas"
            value={parkSummary?.validadas}
          />
          <SummaryCell
            icon={<Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
            label="Prioridades"
            value={priorityValidatedTotal}
            highlight={priorityOnly}
            onClick={() => { setPriorityOnly((v) => !v); setPage(0); }}
          />
          <SummaryCell
            icon={<Tractor className="h-4 w-4 text-muted-foreground" />}
            label="Não Prioridades"
            value={nonPriorityValidatedTotal}
          />
          <SummaryCell
            icon={<UserCheck className="h-4 w-4 text-primary" />}
            label="Clientes Validados"
            value={distinctValidatedClientsTotal}
          />
          <SummaryCell
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            label="Pendentes"
            value={parkSummary?.pendentes}
          />
          <SummaryCell
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            label="Validações 7 dias"
            value={parkSummary?.seteDias}
          />
        </CardContent>
      </Card>

      {/* Execução das Validações — resumo por usuário */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4 text-primary" />
            Execução das Validações
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filialRanked.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma validação registrada ainda.
            </p>
          ) : (
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Filial</th>
                    <th className="px-3 py-2 font-medium text-right">Total Validadas</th>
                    <th className="px-3 py-2 font-medium text-right">Prioridades</th>
                    <th className="px-3 py-2 font-medium text-right">Não Prioridades</th>
                    <th className="px-3 py-2 font-medium text-right">Clientes Validados</th>
                  </tr>
                </thead>
                <tbody>
                  {filialRanked.map((f) => {
                    const priority = priorityValidatedByFilial.get(f.filial_nome) ?? 0;
                    const nonPriority = Math.max(0, f.validated_count - priority);
                    const distinctClients = distinctClientsByFilial[f.filial_nome] ?? 0;
                    return (
                      <tr
                        key={f.filial_nome}
                        className="border-t border-border/40"
                      >
                        <td className="px-3 py-1.5 font-medium">{f.filial_nome}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {f.validated_count.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {priority.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {nonPriority.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {distinctClients.toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Busca livre</label>
            <Input
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Modelo, chassi, cliente..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Código cliente</label>
            <Input
              value={clientCode}
              onChange={(e) => resetPage(setClientCode)(e.target.value)}
              placeholder="Ex: 12345"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <Select value={machineType} onValueChange={resetPage(setMachineType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {MACHINE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={machineStatus} onValueChange={resetPage(setMachineStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {MACHINE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Validado por</label>
            <Select
              value={validatedByFilter}
              onValueChange={(v) => { setValidatedByFilter(v); setPage(0); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {validatorsRanked.map((v) => (
                  <SelectItem key={v.user_id} value={v.user_id}>
                    {v.name || v.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Filial do Validador</label>
            <Select
              value={validatorFilialFilter}
              onValueChange={(v) => { setValidatorFilialFilter(v); setValidatedByFilter(ALL); setPage(0); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {validatorFiliais.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-10">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipamentos...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-6 text-center">
          Nenhum equipamento corresponde aos filtros atuais.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total != null ? (
                <>Total: <Badge variant="secondary">{total.toLocaleString('pt-BR')}</Badge></>
              ) : (
                <>Mostrando {rows.length} resultados</>
              )}
              {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
            </span>
            {totalPages != null && (
              <div className="flex items-center gap-2">
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>Pág. {page + 1} / {totalPages}</span>
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          {/* Desktop */}
          <div className="hidden md:block rounded-lg border border-border/60 overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Prio.</th>
                    <th className="px-3 py-2 font-medium">Modelo</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Chassi/Série</th>
                    <th className="px-3 py-2 font-medium text-right">Ano</th>
                    <th className="px-3 py-2 font-medium text-right">Horas</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Validado em</th>
                    <th className="px-3 py-2 font-medium">Validado por</th>
                    <th className="px-3 py-2 font-medium">Filial Validador</th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((eq) => {
                    const priority = !!eq.validation_priority;
                    return (
                    <tr
                      key={eq.id}
                      className={`border-t border-border/40 hover:bg-muted/30 ${
                        priority ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        {priority ? (
                          <Badge variant="warning" className="text-[9px] gap-1 px-1.5 py-0">
                            <Star className="h-3 w-3 fill-current" />
                            {VALIDATION_PRIORITY_LABEL}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">
                        {eq.model || '—'}
                        {eq.machine_type && (
                          <span className="ml-1 text-[10px] text-muted-foreground uppercase">
                            · {eq.machine_type}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 truncate max-w-[220px]">
                        {eq.client_code && (
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {eq.client_code} ·{' '}
                          </span>
                        )}
                        <span className="truncate">{eq.client_name || '—'}</span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] truncate max-w-[140px]">
                        {eq.serial_chassis || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {eq.year || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {eq.hours != null ? eq.hours : '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[10px]">
                            {machineStatusLabel(eq.machine_status)}
                          </Badge>
                          {eq.transferred_at && (
                            <Badge variant="outline" className="text-[9px] gap-0.5" title={
                              eq.previous_client_name
                                ? `Anterior: ${eq.previous_client_name}`
                                : 'Transferida'
                            }>
                              <ArrowRightLeft className="h-2.5 w-2.5" /> transf.
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        {eq.last_validation_at
                          ? new Date(eq.last_validation_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] truncate max-w-[160px]">
                        {validatorName(eq.validated_by)}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-muted-foreground truncate max-w-[140px]">
                        {validatorFilial(eq.validated_by)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button" size="sm" variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleEdit(eq)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden rounded-lg border border-border/60 divide-y divide-border/40">
            {rows.map((eq) => (
              <div
                key={eq.id}
                className={`flex items-start gap-2 px-3 py-2 ${
                  eq.validation_priority
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500'
                    : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {eq.validation_priority && (
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    )}
                    <p className="text-sm font-medium truncate">{eq.model || '—'}</p>
                    <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[9px]">
                      {machineStatusLabel(eq.machine_status)}
                    </Badge>
                    {eq.validation_priority && (
                      <Badge variant="warning" className="text-[9px]">
                        {VALIDATION_PRIORITY_LABEL}
                      </Badge>
                    )}
                    {eq.transferred_at && (
                      <Badge variant="outline" className="text-[9px] gap-0.5">
                        <ArrowRightLeft className="h-2.5 w-2.5" /> transf.
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {eq.client_code ? `${eq.client_code} · ` : ''}{eq.client_name || '—'}
                  </p>
                  {eq.previous_client_name && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      Anterior: {eq.previous_client_code ? `${eq.previous_client_code} · ` : ''}
                      {eq.previous_client_name}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {eq.serial_chassis || '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {eq.hours != null ? `${eq.hours} h` : '— h'} · {eq.year || '—'}
                    {eq.last_validation_at && (
                      <> · val. {new Date(eq.last_validation_at).toLocaleDateString('pt-BR')}</>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Val. por: {validatorName(eq.validated_by)}
                    {' · '}
                    {validatorFilial(eq.validated_by)}
                  </p>
                </div>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => handleEdit(eq)}
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <EquipmentEditDialog
        equipment={editing}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
      />
    </div>
  );
};

export default Equipamentos;

const KPI_LABELS: Record<string, string> = {
  Total: 'Total',
  Prioritárias: 'Prioritárias',
  Validadas: 'Validadas',
  'Clientes Validados': 'Clientes',
  Pendentes: 'Pendentes',
  'Validações hoje': 'Validações (hoje)',
  'Validações 7 dias': 'Validações (7d)',
};

interface SummaryCellProps {
  icon?: React.ReactNode;
  label: string;
  value?: number | string;
  highlight?: boolean;
  onClick?: () => void;
}

const SummaryCell: React.FC<SummaryCellProps> = ({ icon, label, value, highlight, onClick }) => {
  const displayLabel = KPI_LABELS[label] ?? label;
  const content = (
    <div
      className={`rounded-md border px-3 py-2 transition-colors h-full flex flex-col justify-between ${
        highlight ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/20' : 'border-border/60'
      } ${onClick ? 'cursor-pointer hover:bg-muted/40' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0 h-4">
        <span className="shrink-0">{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis leading-none">
          {displayLabel}
        </span>
      </div>
      <p className="text-lg font-bold tabular-nums leading-none">
        {value == null ? '—' : typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </p>
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left h-full w-full">
        {content}
      </button>
    );
  }
  return content;
};
