import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateVacation, useEmployeeOptions, useFiliaisList, VacationInput } from '@/hooks/useVacations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se supervisor/rac, força a filial. */
  lockedFilialId?: string | null;
  /** Admin/manager podem escolher qualquer filial. */
  allowAnyFilial: boolean;
  /** Mensagem custom exibida após criar (ex.: supervisor/RAC). */
  successMessage?: string;
}

const roleLabels: Record<string, string> = {
  manager: 'Gerente',
  supervisor: 'Supervisor',
  rac: 'RAC',
  sales_consultant: 'Consultor de Vendas',
  technical_consultant: 'Consultor Técnico',
  consultant: 'Consultor',
};

export const VacationFormDialog: React.FC<Props> = ({ open, onOpenChange, lockedFilialId, allowAnyFilial }) => {
  const { data: filiais = [] } = useFiliaisList();
  const [filialId, setFilialId] = useState<string>(lockedFilialId || '');
  const { data: employees = [] } = useEmployeeOptions(filialId || null);
  const [employeeUserId, setEmployeeUserId] = useState<string>('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [observation, setObservation] = useState('');

  const create = useCreateVacation();

  useEffect(() => {
    if (open) {
      setFilialId(lockedFilialId || '');
      setEmployeeUserId('');
      setEmployeeName('');
      setEmployeeRole('');
      setStartDate('');
      setEndDate('');
      setObservation('');
    }
  }, [open, lockedFilialId]);

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const diff = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  const handleEmployeeChange = (userId: string) => {
    setEmployeeUserId(userId);
    if (userId === '__manual__') {
      setEmployeeName('');
      setEmployeeRole('');
      return;
    }
    const emp = employees.find((e) => e.user_id === userId);
    if (emp) {
      setEmployeeName(emp.name);
      setEmployeeRole(emp.role || '');
    }
  };

  const canSubmit =
    filialId &&
    employeeName.trim().length > 1 &&
    startDate &&
    endDate &&
    endDate >= startDate &&
    !create.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const payload: VacationInput = {
      employee_user_id: employeeUserId && employeeUserId !== '__manual__' ? employeeUserId : null,
      employee_name: employeeName,
      employee_role: employeeRole || null,
      filial_id: filialId,
      start_date: startDate,
      end_date: endDate,
      observation: observation || null,
    };
    try {
      await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      /* toast já exibido no hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Férias</DialogTitle>
          <DialogDescription>
            Cadastre um novo período de férias. Períodos sobrepostos para o mesmo colaborador serão bloqueados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="filial">Filial</Label>
            <Select
              value={filialId}
              onValueChange={setFilialId}
              disabled={!allowAnyFilial}
            >
              <SelectTrigger id="filial">
                <SelectValue placeholder="Selecione a filial" />
              </SelectTrigger>
              <SelectContent>
                {filiais.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="employee">Colaborador</Label>
            <Select value={employeeUserId} onValueChange={handleEmployeeChange} disabled={!filialId}>
              <SelectTrigger id="employee">
                <SelectValue placeholder={filialId ? 'Selecione o colaborador' : 'Selecione a filial primeiro'} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>
                    {e.name} {e.role ? `— ${roleLabels[e.role] || e.role}` : ''}
                  </SelectItem>
                ))}
                <SelectItem value="__manual__">➕ Outro colaborador (digitar nome)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {employeeUserId === '__manual__' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ename">Nome</Label>
                <Input id="ename" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="erole">Cargo</Label>
                <Input id="erole" value={employeeRole} onChange={(e) => setEmployeeRole(e.target.value)} placeholder="Ex.: Consultor" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start">Início</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">Fim</Label>
              <Input id="end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {totalDays > 0 && (
            <p className="text-sm text-muted-foreground">
              Total: <strong>{totalDays}</strong> dia(s)
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="obs">Observação</Label>
            <Textarea id="obs" rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? 'Salvando...' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
