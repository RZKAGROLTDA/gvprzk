import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GraduationCap, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateDisplay } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { useFiliaisList } from '@/hooks/useVacations';
import {
  TrainingRow,
  useDeleteTraining,
  useTrainingEmployees,
  useTrainings,
} from '@/hooks/useTrainings';
import { TrainingFormDialog } from '@/components/crm/TrainingFormDialog';

const ALL = 'all';

export const TrainingsPanel: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isManager, isSupervisor } = useUserRole();

  const canSelectEmployee = isManager || isSupervisor;
  const scopeFilialId = isSupervisor && !isManager ? profile?.filial_id ?? null : null;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL);
  const [filialFilter, setFilialFilter] = useState<string>(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TrainingRow | null>(null);

  const { data: filiais = [] } = useFiliaisList();
  const filialNames = useMemo(() => {
    const map: Record<string, string> = {};
    filiais.forEach((f) => { map[f.id] = f.nome; });
    return map;
  }, [filiais]);

  const { data: employees = [], isLoading: employeesLoading } = useTrainingEmployees(
    scopeFilialId,
    canSelectEmployee
  );

  const { data: trainings = [], isLoading, error } = useTrainings({
    startDate: startDate || null,
    endDate: endDate || null,
    userId: canSelectEmployee && employeeFilter !== ALL ? employeeFilter : null,
    filialId: canSelectEmployee && filialFilter !== ALL ? filialFilter : null,
  });

  const rows = useMemo(
    () =>
      [...trainings].sort((a, b) => {
        const byDate = b.training_date.localeCompare(a.training_date);
        return byDate !== 0 ? byDate : a.training_time.localeCompare(b.training_time);
      }),
    [trainings]
  );

  const deleteMutation = useDeleteTraining();

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success('Treinamento excluído.');
      setPendingDelete(null);
    } catch (err: any) {
      console.error('❌ Treinamento: erro ao excluir', err);
      toast.error(err?.message || 'Não foi possível excluir o treinamento.');
    }
  };

  const totalHours = rows.reduce((sum, r) => sum + Number(r.hours || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" /> Treinamentos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {rows.length} registro(s) · {totalHours.toLocaleString('pt-BR')} hora(s)
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Agendar Treinamento
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="filter-start">Início do período</Label>
              <Input id="filter-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-end">Fim do período</Label>
              <Input id="filter-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {canSelectEmployee && (
              <>
                <div className="space-y-1">
                  <Label>Colaborador</Label>
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Filial</Label>
                  <Select value={filialFilter} onValueChange={setFilialFilter}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas</SelectItem>
                      {filiais
                        .filter((f) => !scopeFilialId || f.id === scopeFilialId)
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {(error as any)?.message || 'Não foi possível carregar os treinamentos.'}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Data</TableHead>
                  <TableHead className="whitespace-nowrap">Horário</TableHead>
                  <TableHead className="whitespace-nowrap">Colaborador</TableHead>
                  <TableHead className="whitespace-nowrap">Filial</TableHead>
                  <TableHead className="whitespace-nowrap">Treinamento</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Horas</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum treinamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatDateDisplay(row.training_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.training_time?.slice(0, 5)}</TableCell>
                      <TableCell>{row.user_name}</TableCell>
                      <TableCell>{row.filial_id ? filialNames[row.filial_id] ?? '—' : '—'}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {Number(row.hours).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar treinamento"
                            onClick={() => {
                              setEditing(row);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Excluir treinamento"
                            onClick={() => setPendingDelete(row)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TrainingFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
        training={editing}
        canSelectEmployee={canSelectEmployee}
        employees={employees}
        employeesLoading={employeesLoading}
        filialNames={filialNames}
        selfUserId={user?.id ?? null}
        selfName={profile?.name ?? ''}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir treinamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${pendingDelete.name}" de ${pendingDelete.user_name} será removido permanentemente.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleteMutation.isPending}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
