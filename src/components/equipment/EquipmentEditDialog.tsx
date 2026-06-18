import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  CheckCircle2, PauseCircle, ShoppingCart, Trash2, Save, Loader2,
  ArrowRightLeft, X,
} from 'lucide-react';
import { MACHINE_STATUSES } from './equipmentConstants';
import {
  useUpdateEquipment, useTransferEquipment, type ClientEquipment,
} from '@/hooks/useClientEquipment';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  equipment: ClientEquipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClientSearchResult {
  client_code: string | null;
  client_name: string;
}

export const EquipmentEditDialog: React.FC<Props> = ({ equipment, open, onOpenChange }) => {
  const { mutateAsync, isPending } = useUpdateEquipment();
  const { mutateAsync: transferAsync, isPending: isTransferring } = useTransferEquipment();

  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [hours, setHours] = useState('');
  const [serial, setSerial] = useState('');
  const [observation, setObservation] = useState('');
  const [machineStatus, setMachineStatus] = useState('ativa');
  const [clientCode, setClientCode] = useState('');

  // Transferência
  const [showTransfer, setShowTransfer] = useState(false);
  const [destSearch, setDestSearch] = useState('');
  const [destPicked, setDestPicked] = useState<ClientSearchResult | null>(null);
  const [destResults, setDestResults] = useState<ClientSearchResult[]>([]);
  const [searchingDest, setSearchingDest] = useState(false);
  const [transferDate, setTransferDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [transferNote, setTransferNote] = useState('');

  useEffect(() => {
    if (!equipment) return;
    setModel(equipment.model ?? '');
    setYear(equipment.year != null ? String(equipment.year) : '');
    setHours(equipment.hours != null ? String(equipment.hours) : '');
    setSerial(equipment.serial_chassis ?? '');
    setObservation(equipment.observation ?? '');
    setMachineStatus(equipment.machine_status ?? 'ativa');
    setClientCode(equipment.client_code ?? '');
    setShowTransfer(false);
    setDestSearch('');
    setDestPicked(null);
    setDestResults([]);
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferNote('');
  }, [equipment]);

  // Busca clientes para transferência
  useEffect(() => {
    if (!showTransfer) return;
    const term = destSearch.trim();
    if (term.length < 2) {
      setDestResults([]);
      return;
    }
    let cancelled = false;
    setSearchingDest(true);
    const handle = setTimeout(async () => {
      try {
        const safe = term.replace(/[%,]/g, '');
        const { data } = await (supabase as any)
          .from('client_equipment')
          .select('client_code, client_name')
          .or(`client_code.ilike.%${safe}%,client_name.ilike.%${safe}%`)
          .limit(20);
        if (cancelled) return;
        const map = new Map<string, ClientSearchResult>();
        (data ?? []).forEach((r: any) => {
          const key = `${r.client_code ?? ''}::${(r.client_name ?? '').toLowerCase()}`;
          if (!map.has(key)) map.set(key, r);
        });
        setDestResults(Array.from(map.values()).slice(0, 12));
      } finally {
        if (!cancelled) setSearchingDest(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [destSearch, showTransfer]);

  if (!equipment) return null;

  const buildPatch = () => ({
    model: model.trim() || null,
    year: year ? Number(year) : null,
    hours: hours ? Number(hours) : null,
    serial_chassis: serial.trim() || null,
    observation: observation.trim() || null,
    machine_status: machineStatus,
    client_code: equipment.client_code
      ? equipment.client_code
      : (clientCode.trim() || null),
  });

  const persist = async (markValidated: boolean, successMsg: string) => {
    try {
      await mutateAsync({
        id: equipment.id,
        patch: { ...buildPatch(), markValidated },
      });
      toast({ title: '✅ ' + successMsg });
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Erro ao salvar',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const saveOnly = () => persist(false, 'Dados atualizados');
  const saveAndValidate = () => persist(true, 'Dados atualizados e validados');

  const canTransfer =
    !!destPicked &&
    !!destPicked.client_name?.trim() &&
    !!transferDate;

  const confirmTransfer = async () => {
    if (!canTransfer || !destPicked) return;
    try {
      await transferAsync({
        id: equipment.id,
        destClientCode: destPicked.client_code?.trim() || null,
        destClientName: destPicked.client_name.trim(),
        transferDate: new Date(transferDate).toISOString(),
        note: transferNote,
        current: {
          client_code: equipment.client_code,
          client_name: equipment.client_name,
        },
      });
      toast({ title: '✅ Máquina transferida' });
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Erro ao transferir',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const busy = isPending || isTransferring;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Editar equipamento
            {equipment.machine_type && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {equipment.machine_type}
              </Badge>
            )}
            {equipment.transfer_date && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <ArrowRightLeft className="h-3 w-3" />
                Transferida
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Ações rápidas de status (apenas alteram o campo, NÃO salvam) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Status (clique para alterar — salve abaixo)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              type="button" size="sm"
              variant={machineStatus === 'ativa' ? 'default' : 'outline'}
              onClick={() => setMachineStatus('ativa')}
              disabled={busy}
              className="justify-start"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Ativa
            </Button>
            <Button
              type="button" size="sm"
              variant={machineStatus === 'inativa' ? 'secondary' : 'outline'}
              onClick={() => setMachineStatus('inativa')}
              disabled={busy}
              className="justify-start"
            >
              <PauseCircle className="h-4 w-4 mr-1.5" /> Inativa
            </Button>
            <Button
              type="button" size="sm"
              variant={machineStatus === 'vendida' ? 'secondary' : 'outline'}
              onClick={() => setMachineStatus('vendida')}
              disabled={busy}
              className="justify-start"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" /> Vendida
            </Button>
            <Button
              type="button" size="sm"
              variant={machineStatus === 'sucateada' ? 'destructive' : 'outline'}
              onClick={() => setMachineStatus('sucateada')}
              disabled={busy}
              className="justify-start"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Sucateada
            </Button>
          </div>
        </div>

        {/* Campos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <Label>Modelo</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1">
            <Label>Chassi / Série</Label>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label>Ano</Label>
            <Input
              type="number" inputMode="numeric"
              value={year} onChange={(e) => setYear(e.target.value)}
              min={1950} max={2100}
            />
          </div>
          <div className="space-y-1">
            <Label>Horas</Label>
            <Input
              type="number" inputMode="decimal"
              value={hours} onChange={(e) => setHours(e.target.value)}
              min={0}
            />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={machineStatus} onValueChange={setMachineStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MACHINE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!equipment.client_code && (
            <div className="space-y-1 md:col-span-2">
              <Label>Código do cliente (vincular)</Label>
              <Input
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                placeholder="Informe o código se conhecido"
                maxLength={30}
              />
            </div>
          )}
          <div className="space-y-1 md:col-span-2">
            <Label>Observação</Label>
            <Textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        {/* Histórico de transferência */}
        {equipment.previous_client_name && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
              Histórico de transferência
            </p>
            <p>
              Cliente anterior:{' '}
              <span className="font-medium">
                {equipment.previous_client_code ? `${equipment.previous_client_code} · ` : ''}
                {equipment.previous_client_name}
              </span>
            </p>
            {equipment.transfer_date && (
              <p>
                Data: {new Date(equipment.transfer_date).toLocaleDateString('pt-BR')}
              </p>
            )}
            {equipment.transfer_note && (
              <p className="text-muted-foreground">{equipment.transfer_note}</p>
            )}
          </div>
        )}

        {/* Bloco de transferência */}
        <div className="border-t border-border/60 pt-3 space-y-2">
          {!showTransfer ? (
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setShowTransfer(true)}
              disabled={busy}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />
              Transferir Máquina
            </Button>
          ) : (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Transferir para outro cliente
                </p>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => { setShowTransfer(false); setDestPicked(null); }}
                  aria-label="Cancelar transferência"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1">
                <Label>Cliente destino (código ou nome)</Label>
                {destPicked ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                    <span className="truncate">
                      {destPicked.client_code && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {destPicked.client_code} ·{' '}
                        </span>
                      )}
                      {destPicked.client_name}
                    </span>
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => setDestPicked(null)}
                      className="h-7"
                    >
                      Trocar
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={destSearch}
                      onChange={(e) => setDestSearch(e.target.value)}
                      placeholder="Digite ao menos 2 caracteres..."
                    />
                    {searchingDest && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                      </p>
                    )}
                    {!searchingDest && destResults.length > 0 && (
                      <div className="max-h-48 overflow-auto rounded-md border border-border/60 bg-background divide-y divide-border/40">
                        {destResults.map((r, i) => (
                          <button
                            key={`${r.client_code ?? ''}-${i}`}
                            type="button"
                            onClick={() => { setDestPicked(r); setDestSearch(''); setDestResults([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          >
                            {r.client_code && (
                              <span className="font-mono text-xs text-muted-foreground">
                                {r.client_code} ·{' '}
                              </span>
                            )}
                            {r.client_name}
                          </button>
                        ))}
                      </div>
                    )}
                    {!searchingDest && destSearch.trim().length >= 2 && destResults.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum cliente encontrado. Digite manualmente abaixo.
                      </p>
                    )}
                    {destSearch.trim().length >= 2 && (
                      <Button
                        type="button" size="sm" variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          setDestPicked({ client_code: null, client_name: destSearch.trim() })
                        }
                      >
                        Usar &quot;{destSearch.trim()}&quot; como novo cliente
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Data da transferência</Label>
                  <Input
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Observação da transferência</Label>
                <Textarea
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Ex.: venda usada, transferência entre fazendas..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => { setShowTransfer(false); setDestPicked(null); }}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button
                  type="button" size="sm"
                  onClick={confirmTransfer}
                  disabled={!canTransfer || busy}
                >
                  {isTransferring ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                  )}
                  Confirmar Transferência
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={saveOnly} disabled={busy}>
              {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Salvar
            </Button>
            <Button type="button" onClick={saveAndValidate} disabled={busy}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Salvar e validar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
