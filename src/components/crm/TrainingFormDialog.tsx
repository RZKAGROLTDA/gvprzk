import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  TrainingEmployeeOption,
  TrainingRow,
  TrainingStatus,
  useCreateTraining,
  useUpdateTraining,
} from '@/hooks/useTrainings';

interface TrainingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  training?: TrainingRow | null;
  canSelectEmployee: boolean;
  employees: TrainingEmployeeOption[];
  employeesLoading?: boolean;
  filialNames: Record<string, string>;
  selfUserId: string | null;
  selfName: string;
}

const STATUS_LABELS: Record<TrainingStatus, string> = {
  pendente: 'Pendente',
  realizado: 'Realizado',
  nao_realizado: 'Não realizado',
};

export const TrainingFormDialog: React.FC<TrainingFormDialogProps> = ({
  open,
  onOpenChange,
  training,
  canSelectEmployee,
  employees,
  employeesLoading,
  filialNames,
  selfUserId,
  selfName,
}) => {
  const isEdit = !!training;
  const createMutation = useCreateTraining();
  const updateMutation = useUpdateTraining();
  const saving = createMutation.isPending || updateMutation.isPending;

  const [userId, setUserId] = useState<string>('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [hours, setHours] = useState('');
  const [status, setStatus] = useState<TrainingStatus>('pendente');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUserId(training?.user_id ?? (canSelectEmployee ? '' : selfUserId ?? ''));
    setName(training?.name ?? '');
    setDate(training?.training_date ?? '');
    setTime((training?.training_time ?? '').slice(0, 5));
    setHours(training ? String(training.hours) : '');
    setStatus(training?.status ?? 'pendente');
    setPickerOpen(false);
  }, [open, training, canSelectEmployee, selfUserId]);

  const selectedLabel = useMemo(() => {
    if (!canSelectEmployee) return selfName || 'Você';
    const found = employees.find((e) => e.user_id === userId);
    if (found) {
      const filial = found.filial_id ? filialNames[found.filial_id] : null;
      return filial ? `${found.name} — ${filial}` : found.name;
    }
    return training?.user_name ?? '';
  }, [canSelectEmployee, employees, userId, filialNames, selfName, training]);

  const handleSubmit = async () => {
    const parsedHours = Number(String(hours).replace(',', '.'));

    if (!userId) return toast.error('Selecione o colaborador.');
    if (!name.trim()) return toast.error('Informe o nome do treinamento.');
    if (!date) return toast.error('Informe a data do treinamento.');
    if (!time) return toast.error('Informe o horário do treinamento.');
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      return toast.error('Quantidade de horas deve ser maior que zero.');
    }

    const payload = {
      name: name.trim(),
      training_date: date,
      training_time: time.length === 5 ? `${time}:00` : time,
      hours: parsedHours,
      user_id: userId,
    };

    try {
      if (isEdit && training) {
        await updateMutation.mutateAsync({ id: training.id, ...payload, status });
        toast.success('Treinamento atualizado.');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Treinamento agendado.');
      }
      onOpenChange(false);
    } catch (error: any) {
      const message = error?.message || error?.details || 'Falha ao salvar o treinamento.';
      console.error('❌ Treinamento: erro ao salvar', error);
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!saving ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Treinamento' : 'Agendar Treinamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Colaborador</Label>
            {canSelectEmployee ? (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
                      {selectedLabel || 'Selecione o colaborador'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar colaborador..." />
                    <CommandList>
                      <CommandEmpty>
                        {employeesLoading ? 'Carregando...' : 'Nenhum colaborador encontrado.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {employees.map((employee) => {
                          const filial = employee.filial_id ? filialNames[employee.filial_id] : null;
                          const label = filial ? `${employee.name} — ${filial}` : employee.name;
                          return (
                            <CommandItem
                              key={employee.user_id}
                              value={label}
                              onSelect={() => {
                                setUserId(employee.user_id);
                                setPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  userId === employee.user_id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Input value={selectedLabel} readOnly disabled />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="training-name">Nome do treinamento</Label>
            <Input
              id="training-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Treinamento de Colheitadeiras"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="training-date">Data</Label>
              <Input id="training-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-time">Horário</Label>
              <Input id="training-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="training-hours">Quantidade de horas</Label>
            <Input
              id="training-hours"
              type="number"
              min="0.5"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Ex: 4"
            />
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="training-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TrainingStatus)}>
                <SelectTrigger id="training-status">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="nao_realizado">Não realizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
