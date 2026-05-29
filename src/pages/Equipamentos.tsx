import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, FileSpreadsheet, Tractor, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { EquipmentCard, EquipmentEditDialog } from '@/components/equipment';
import { MACHINE_TYPES, MACHINE_STATUSES } from '@/components/equipment/equipmentConstants';
import { useEquipmentSearch, type ClientEquipment } from '@/hooks/useClientEquipment';

const ALL = 'all';
const PAGE_SIZE = 50;

const Equipamentos: React.FC = () => {
  const [search, setSearch] = useState('');
  const [machineType, setMachineType] = useState(ALL);
  const [machineStatus, setMachineStatus] = useState(ALL);
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
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
    }),
    [search, machineType, machineStatus, clientCode, clientName],
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {rows.map((eq) => (
              <EquipmentCard
                key={eq.id}
                equipment={eq}
                showClient
                onEdit={handleEdit}
              />
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
