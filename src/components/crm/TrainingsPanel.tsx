import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, BadgeProps } from '@/components/ui/badge';
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
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  GraduationCap,
  Hourglass,
  Loader2,
  Pencil,
  Plus,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateDisplay } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { useFiliaisList } from '@/hooks/useVacations';
import {
  TrainingRow,
  TrainingStatus,
  fetchTrainingCreatorNames,
  useDeleteTraining,
  useTrainingEmployees,
  useTrainingGoal,
  useTrainingStats,
  useTrainings,
} from '@/hooks/useTrainings';
import { TrainingFormDialog } from '@/components/crm/TrainingFormDialog';

const ALL = 'all';

const formatHours = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const STATUS_LABELS: Record<TrainingStatus, string> = {
  pendente: 'Pendente',
  realizado: 'Realizado',
  nao_realizado: 'Não realizado',
};

const STATUS_BADGE_VARIANT: Record<TrainingStatus, BadgeProps['variant']> = {
  pendente: 'outline',
  realizado: 'default',
  nao_realizado: 'destructive',
};

const STATUS_BADGE_CLASS: Record<TrainingStatus, string> = {
  pendente: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  realizado: 'bg-emerald-600 hover:bg-emerald-700',
  nao_realizado: '',
};

const StatusBadge: React.FC<{ status: TrainingStatus }> = ({ status }) => {
  const variant = STATUS_BADGE_VARIANT[status];
  const className = STATUS_BADGE_CLASS[status];
  return (
    <Badge variant={variant} className={cn('whitespace-nowrap', className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
};

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
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TrainingRow | null>(null);

  const filters = useMemo(() => ({
    startDate: startDate || null,
    endDate: endDate || null,
    userId: canSelectEmployee && employeeFilter !== ALL ? employeeFilter : null,
    filialId: canSelectEmployee && filialFilter !== ALL ? filialFilter : null,
    status: statusFilter !== ALL ? (statusFilter as TrainingStatus) : null,
  }), [canSelectEmployee, employeeFilter, endDate, filialFilter, startDate, statusFilter]);

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

  const { data: trainings = [], isLoading, error } = useTrainings(filters);
  const { data: stats } = useTrainingStats(filters);
  const { data: goal } = useTrainingGoal();

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

  const handleExport = async () => {
    try {
      const creatorIds = rows.map((r) => r.created_by);
      const names = await fetchTrainingCreatorNames(creatorIds);

      const sheet = rows.map((r) => ({
        Data: formatDateDisplay(r.training_date),
        Horário: r.training_time?.slice(0, 5) ?? '',
        Colaborador: r.user_name,
        Filial: r.filial_id ? filialNames[r.filial_id] ?? '—' : '—',
        Treinamento: r.name,
        Origem: r.training_catalog_id ? 'Catálogo' : 'Personalizado',
        Horas: Number(r.hours),
        Status: STATUS_LABELS[r.status],
        'Criado por': names[r.created_by] ?? r.created_by,
        'Criado em': new Date(r.created_at).toLocaleString('pt-BR'),
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Treinamentos');
      XLSX.writeFile(wb, `Treinamentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel exportado com sucesso.');
    } catch (err: any) {
      console.error('❌ Treinamento: erro ao exportar', err);
      toast.error('Não foi possível exportar o Excel.');
    }
  };

  return (
    <div className="space-y-4">
      {goal && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Meta até {formatDateDisplay(goal.deadline)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Carga horária oficial do catálogo de treinamentos (independente dos filtros).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <GoalStat label="Meta Total" value={`${formatHours(goal.total_hours)} h`} />
              <GoalStat label="Realizadas" value={`${formatHours(goal.realized_hours)} h`} tone="success" />
              <GoalStat label="Pendentes" value={`${formatHours(goal.pending_hours)} h`} tone="warning" />
              <GoalStat label="% Execução" value={`${formatHours(goal.execution_percent)}%`} tone="primary" />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, Number(goal.execution_percent) || 0))}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExport} disabled={rows.length === 0 || isLoading}>
              <Download className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Agendar Treinamento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="nao_realizado">Não realizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {stats && (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <Kpi icon={<CalendarDays className="h-4 w-4" />} label="Programados" value={stats.scheduled_count} tone="primary" />
              <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Realizados" value={stats.done_count} tone="primary" />
              <Kpi icon={<Clock className="h-4 w-4" />} label="Pendentes" value={stats.pending_count} tone="warning" />
              <Kpi icon={<XCircle className="h-4 w-4" />} label="Não realizados" value={stats.not_done_count} tone="destructive" />
              <Kpi icon={<Timer className="h-4 w-4" />} label="Horas Programadas" value={stats.scheduled_hours} tone="primary" />
              <Kpi icon={<Hourglass className="h-4 w-4" />} label="Horas Realizadas" value={stats.done_hours} tone="primary" />
              <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Horas Pendentes" value={stats.pending_hours} tone="warning" />
              <Kpi icon={<Users className="h-4 w-4" />} label="Colaboradores Treinados" value={stats.trained_users} tone="primary" />
              <Kpi icon={<TrendingUp className="h-4 w-4" />} label="% Execução" value={stats.execution_rate} tone="primary" />
            </div>
          )}

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
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
                      <TableCell><StatusBadge status={row.status} /></TableCell>
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

const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'muted' | 'destructive' | 'warning';
}> = ({ icon, label, value, tone }) => {
  const cls = {
    primary: 'text-primary',
    muted: 'text-muted-foreground',
    destructive: 'text-destructive',
    warning: 'text-amber-600 dark:text-amber-400',
  }[tone];
  return (
    <Card>
      <CardContent className="p-3">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', cls)}>
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value.toLocaleString('pt-BR')}</div>
      </CardContent>
    </Card>
  );
};

const GoalStat: React.FC<{
  label: string;
  value: string;
  tone?: 'primary' | 'success' | 'warning';
}> = ({ label, value, tone }) => {
  const cls = tone
    ? {
        primary: 'text-primary',
        success: 'text-emerald-600 dark:text-emerald-400',
        warning: 'text-amber-600 dark:text-amber-400',
      }[tone]
    : 'text-muted-foreground';
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={cn('text-xs font-medium', cls)}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
};
