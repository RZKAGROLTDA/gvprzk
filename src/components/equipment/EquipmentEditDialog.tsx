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
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
  CheckCircle2, PauseCircle, ShoppingCart, Trash2, Save, Loader2,
} from 'lucide-react';
import {
  MACHINE_STATUSES,
} from './equipmentConstants';
import {
  useUpdateEquipment, type ClientEquipment,
} from '@/hooks/useClientEquipment';

interface Props {
  equipment: ClientEquipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EquipmentEditDialog: React.FC<Props> = ({ equipment, open, onOpenChange }) => {
  const { mutateAsync, isPending } = useUpdateEquipment();

  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [hours, setHours] = useState('');
  const [serial, setSerial] = useState('');
  const [observation, setObservation] = useState('');
  const [machineStatus, setMachineStatus] = useState('ativa');
  // puk_status removido da UI; campo permanece intocado no banco
  const [clientCode, setClientCode] = useState('');

  useEffect(() => {
    if (!equipment) return;
    setModel(equipment.model ?? '');
    setYear(equipment.year != null ? String(equipment.year) : '');
    setHours(equipment.hours != null ? String(equipment.hours) : '');
    setSerial(equipment.serial_chassis ?? '');
    setObservation(equipment.observation ?? '');
    setMachineStatus(equipment.machine_status ?? 'ativa');
    
    setClientCode(equipment.client_code ?? '');
  }, [equipment]);

  if (!equipment) return null;

  const buildPatch = () => ({
    model: model.trim() || null,
    year: year ? Number(year) : null,
    hours: hours ? Number(hours) : null,
    serial_chassis: serial.trim() || null,
    observation: observation.trim() || null,
    machine_status: machineStatus,
    
    client_code: equipment.client_code ? equipment.client_code : (clientCode.trim() || null),
  });

  const persist = async (
    overrides: Record<string, any> = {},
    markValidated = false,
    successMsg = 'Equipamento atualizado',
  ) => {
    try {
      await mutateAsync({
        id: equipment.id,
        patch: { ...buildPatch(), ...overrides, markValidated },
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

  const validateActive = () =>
    persist({ machine_status: 'ativa' }, true, 'Máquina validada como ativa');
  const markInactive = () => persist({ machine_status: 'inativa' }, true, 'Marcada como inativa');
  const markSold = () => persist({ machine_status: 'vendida' }, true, 'Marcada como vendida');
  const markScrapped = () =>
    persist({ machine_status: 'sucateada' }, true, 'Marcada como sucateada');
  const saveOnly = () => persist({}, false, 'Dados atualizados');
  const saveAndValidate = () => persist({}, true, 'Dados atualizados e validados');

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
          </DialogTitle>
        </DialogHeader>

        {/* Ações rápidas */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Ações rápidas
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              type="button" size="sm" variant="default"
              onClick={validateActive} disabled={isPending}
              className="justify-start"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Validar ativa
            </Button>
            <Button
              type="button" size="sm" variant="secondary"
              onClick={markInactive} disabled={isPending}
              className="justify-start"
            >
              <PauseCircle className="h-4 w-4 mr-1.5" />
              Inativa
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              onClick={markSold} disabled={isPending}
              className="justify-start"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" />
              Vendida
            </Button>
            <Button
              type="button" size="sm" variant="destructive"
              onClick={markScrapped} disabled={isPending}
              className="justify-start"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Sucateada
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
          {/* PUK removido da UI */}

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

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={saveOnly} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Salvar
            </Button>
            <Button type="button" onClick={saveAndValidate} disabled={isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Salvar e validar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
