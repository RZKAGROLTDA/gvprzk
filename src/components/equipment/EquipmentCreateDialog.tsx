import React, { useEffect, useState } from 'react';
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
import { Loader2, Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { MACHINE_STATUSES, MACHINE_TYPES } from './equipmentConstants';
import { useCreateEquipment, type ClientEquipment, DuplicateEquipmentError } from '@/hooks/useClientEquipment';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientCode?: string;
  clientName?: string;
  onCreated?: (eq: ClientEquipment) => void;
}

export const EquipmentCreateDialog: React.FC<Props> = ({
  open, onOpenChange, clientCode, clientName, onCreated,
}) => {
  const { mutateAsync, isPending } = useCreateEquipment();

  const [machineType, setMachineType] = useState<string>('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [year, setYear] = useState('');
  const [hours, setHours] = useState('');
  const [machineStatus, setMachineStatus] = useState('ativa');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    if (!open) return;
    setMachineType('');
    setModel('');
    setSerial('');
    setYear('');
    setHours('');
    setMachineStatus('ativa');
    setObservation('');
  }, [open]);

  const canSave = !!clientName?.trim() && (!!model.trim() || !!serial.trim());

  const handleSave = async () => {
    if (!clientName?.trim()) {
      toast({
        title: 'Cliente não informado',
        description: 'Selecione um cliente antes de adicionar uma máquina.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const created = await mutateAsync({
        client_code: clientCode ?? null,
        client_name: clientName,
        machine_type: machineType || null,
        model,
        serial_chassis: serial,
        year: year ? Number(year) : null,
        hours: hours ? Number(hours) : null,
        machine_status: machineStatus,
        observation,
      });
      toast({ title: '✅ Máquina adicionada ao parque do cliente' });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Erro ao adicionar máquina',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Adicionar nova máquina
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
          <p className="text-muted-foreground">Cliente</p>
          <p className="font-medium">
            {clientCode && (
              <span className="font-mono text-muted-foreground">{clientCode} · </span>
            )}
            {clientName || '—'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <Label>Tipo da máquina</Label>
            <Select value={machineType} onValueChange={setMachineType}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {MACHINE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status da máquina</Label>
            <Select value={machineStatus} onValueChange={setMachineStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MACHINE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Modelo</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1">
            <Label>Série / Chassi</Label>
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
          <div className="space-y-1 md:col-span-2">
            <Label>Observação</Label>
            <Textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: máquina identificada na visita, não constava na base."
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          A máquina será cadastrada manualmente e ficará disponível no parque do cliente para
          próximas visitas. Informe ao menos modelo ou chassi.
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Adicionar máquina
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
