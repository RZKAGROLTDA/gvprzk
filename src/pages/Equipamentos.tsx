import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, FileSpreadsheet, Tractor, ChevronLeft, ChevronRight, Pencil, Star } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { EquipmentEditDialog } from '@/components/equipment';
import {
  MACHINE_TYPES, MACHINE_STATUSES,
  machineStatusLabel, statusBadgeVariant, VALIDATION_PRIORITY_LABEL,
} from '@/components/equipment/equipmentConstants';
import { useEquipmentSearch, type ClientEquipment } from '@/hooks/useClientEquipment';

const ALL = 'all';
const PAGE_SIZE = 50;

const Equipamentos: React.FC = () => {
  const [search, setSearch] = useState('');
  const [machineType, setMachineType] = useState(ALL);
  const [machineStatus, setMachineStatus] = useState(ALL);
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ClientEquipment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(
    () => ({
      search,
      machineType: machineType === ALL ? null : machineType,
      machineStatus: machineStatus === ALL ? null : machineStatus,
      clientCode,
      clientName,
      validationPriority: priorityOnly ? true : null,
    }),
    [search, machineType, machineStatus, clientCode, clientName, priorityOnly],
  );

  const { data, isLoading, isFetching } = useEquipmentSearch(filters, page, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const total = data?.totalCount;

  const resetPage = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(0); };

  const handleEdit = (eq: ClientEquipment) => {
    setEditing(eq);
    setDialogOpen(true);
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
            'id, client_code, client_name, filial_id, model, serial_chassis, hours, year, observation, machine_type, product_raw, puk_status, machine_status, last_validation_at, validated_by, import_batch_id',
          )
          .order('updated_at', { ascending: false })
          .range(p * EXPORT_PAGE, p * EXPORT_PAGE + EXPORT_PAGE - 1);

        const norm = (v?: string) => (v && v.trim() ? v.trim() : null);
        if (norm(clientCode)) q = q.eq('client_code', norm(clientCode)!);
        if (norm(clientName)) q = q.ilike('client_name', `%${norm(clientName)!}%`);
        if (machineType !== ALL) q = q.eq('machine_type', machineType);
        if (machineStatus !== ALL) q = q.eq('machine_status', machineStatus);
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

      // Resolver nomes de filial (apenas para os ids presentes)
      const filialIds = Array.from(new Set(all.map((e) => e.filial_id).filter(Boolean))) as string[];
      let filialMap: Record<string, string> = {};
      if (filialIds.length) {
        const { data: filiais } = await supabase
          .from('filiais')
          .select('id, nome')
          .in('id', filialIds);
        filialMap = Object.fromEntries((filiais ?? []).map((f: any) => [f.id, f.nome]));
      }

      const exportRows = all.map((e) => ({
        'Código Cliente': e.client_code ?? '',
        'Nome Cliente': e.client_name ?? '',
        'Filial': e.filial_id ? filialMap[e.filial_id] ?? '' : '',
        'Tipo': e.machine_type ?? '',
        'Produto Original': e.product_raw ?? '',
        'Modelo': e.model ?? '',
        'Chassi/Série': e.serial_chassis ?? '',
        'Ano': e.year ?? '',
        'Horas': e.hours ?? '',
        'PUK': e.puk_status ?? '',
        'Status': e.machine_status ?? '',
        'Observação': e.observation ?? '',
        'Última Validação': e.last_validation_at
          ? new Date(e.last_validation_at).toLocaleString('pt-BR')
          : '',
        'Validado Por': e.validated_by ?? '',
        'Import Batch ID': e.import_batch_id ?? '',
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

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
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
          {/* Desktop: tabela compacta operacional */}
          <div className="hidden md:block rounded-lg border border-border/60 overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Modelo</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Chassi/Série</th>
                    <th className="px-3 py-2 font-medium text-right">Ano</th>
                    <th className="px-3 py-2 font-medium text-right">Horas</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">Validado em</th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((eq) => (
                    <tr key={eq.id} className="border-t border-border/40 hover:bg-muted/30">
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
                        <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[10px]">
                          {machineStatusLabel(eq.machine_status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        {eq.last_validation_at
                          ? new Date(eq.last_validation_at).toLocaleDateString('pt-BR')
                          : '—'}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: linhas condensadas */}
          <div className="md:hidden rounded-lg border border-border/60 divide-y divide-border/40">
            {rows.map((eq) => (
              <div key={eq.id} className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{eq.model || '—'}</p>
                    <Badge variant={statusBadgeVariant(eq.machine_status)} className="text-[9px]">
                      {machineStatusLabel(eq.machine_status)}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {eq.client_code ? `${eq.client_code} · ` : ''}{eq.client_name || '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {eq.serial_chassis || '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {eq.hours != null ? `${eq.hours} h` : '— h'} · {eq.year || '—'}
                    {eq.last_validation_at && (
                      <> · val. {new Date(eq.last_validation_at).toLocaleDateString('pt-BR')}</>
                    )}
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
