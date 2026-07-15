import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarDays, Plus, Download, Ban, Trash2, Building2, Users, PlaneTakeoff, Lock } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, addMonths, subMonths, startOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useVacations, useCancelVacation, useDeleteVacation, VacationRow, VacationStatus } from '@/hooks/useVacations';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { VacationFormDialog } from '@/components/vacations/VacationFormDialog';

const statusMeta: Record<VacationStatus, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  in_progress: { label: 'Em andamento', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelada', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const fmt = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy');

const VacationsPage: React.FC = () => {
  const { profile } = useProfile();
  const { isAdmin, isManager, isSupervisor, rawRoles, isLoading: rolesLoading } = useUserRole();
  const isRac = rawRoles.includes('rac' as any);
  const canView = isAdmin || isManager;
  const canInsert = canView || isSupervisor || isRac;
  const canManage = isAdmin || isManager;

  const [formOpen, setFormOpen] = useState(false);
  const [filialFilter, setFilialFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());

  const { data: vacations = [], isLoading } = useVacations(canView);
  const cancel = useCancelVacation();
  const del = useDeleteVacation();

  const filiaisFromData = useMemo(() => {
    const map = new Map<string, string>();
    vacations.forEach((v) => v.filial_id && map.set(v.filial_id, v.filial_name || v.filial_id));
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [vacations]);

  const filtered = useMemo(() => {
    return vacations.filter((v) => {
      if (filialFilter !== 'all' && v.filial_id !== filialFilter) return false;
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (search && !v.employee_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [vacations, filialFilter, statusFilter, search]);

  const kpis = useMemo(() => {
    const now = new Date();
    let active = 0, scheduled = 0, monthDays = 0, uniqueEmployees = new Set<string>();
    const mStart = startOfMonth(monthCursor);
    const mEnd = endOfMonth(monthCursor);
    filtered.forEach((v) => {
      if (v.status === 'cancelled') return;
      uniqueEmployees.add(v.employee_user_id || v.employee_name.toLowerCase().trim());
      if (v.status === 'in_progress') active++;
      if (v.status === 'scheduled') scheduled++;
      const s = parseISO(v.start_date);
      const e = parseISO(v.end_date);
      const overlapStart = s > mStart ? s : mStart;
      const overlapEnd = e < mEnd ? e : mEnd;
      if (overlapStart <= overlapEnd) {
        monthDays += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
      }
    });
    return { active, scheduled, monthDays, employees: uniqueEmployees.size };
  }, [filtered, monthCursor]);

  const byFilial = useMemo(() => {
    const map = new Map<string, { name: string; total: number; active: number; scheduled: number }>();
    filtered.forEach((v) => {
      if (v.status === 'cancelled') return;
      const key = v.filial_id;
      const prev = map.get(key) || { name: v.filial_name || 'Sem filial', total: 0, active: 0, scheduled: 0 };
      prev.total += 1;
      if (v.status === 'in_progress') prev.active += 1;
      if (v.status === 'scheduled') prev.scheduled += 1;
      map.set(key, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const calendarDays = useMemo(() => {
    const mStart = startOfMonth(monthCursor);
    const mEnd = endOfMonth(monthCursor);
    const gridStart = startOfWeek(mStart, { weekStartsOn: 0 });
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const items = filtered.filter(
        (v) => v.status !== 'cancelled' && isWithinInterval(d, { start: parseISO(v.start_date), end: parseISO(v.end_date) })
      );
      days.push({ date: d, inMonth: d >= mStart && d <= mEnd, items });
    }
    return days;
  }, [filtered, monthCursor]);

  const handleExport = () => {
    const rows = filtered.map((v) => ({
      Colaborador: v.employee_name,
      Cargo: v.employee_role || '',
      Filial: v.filial_name || '',
      Início: fmt(v.start_date),
      Fim: fmt(v.end_date),
      Dias: v.total_days,
      Status: statusMeta[v.status].label,
      Observação: v.observation || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Férias');
    XLSX.writeFile(wb, `agenda-ferias-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  // Supervisor / RAC: só podem cadastrar. Sem listagem.
  if (!canView && canInsert) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PlaneTakeoff className="h-6 w-6" /> Agenda de Férias
          </h1>
          <p className="text-muted-foreground">
            Cadastre férias dos colaboradores da sua filial. A visualização completa é restrita a administradores e gerentes.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Lock className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Você pode cadastrar novos períodos, mas não visualizar ou editar registros existentes. Períodos sobrepostos para o mesmo colaborador serão bloqueados automaticamente.
              </div>
            </div>
            <Button onClick={() => setFormOpen(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Cadastrar novo período
            </Button>
          </CardContent>
        </Card>
        <VacationFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          lockedFilialId={profile?.filial_id || null}
          allowAnyFilial={false}
        />
      </div>
    );
  }

  if (!canView && !canInsert) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Você não tem acesso à Agenda de Férias.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PlaneTakeoff className="h-6 w-6" /> Agenda de Férias
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de férias do time por filial, semana e mês.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
          )}
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Férias
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Em andamento" value={kpis.active} icon={PlaneTakeoff} tone="amber" />
        <KpiCard label="Agendadas" value={kpis.scheduled} icon={CalendarDays} tone="blue" />
        <KpiCard label={`Dias em ${format(monthCursor, 'MMM/yy', { locale: ptBR })}`} value={kpis.monthDays} icon={CalendarDays} tone="emerald" />
        <KpiCard label="Colaboradores" value={kpis.employees} icon={Users} tone="violet" />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input placeholder="Buscar colaborador..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filialFilter} onValueChange={setFilialFilter}>
            <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
              {filiaisFromData.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="scheduled">Agendada</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="calendar">Calendário</TabsTrigger>
          <TabsTrigger value="filial">Resumo por Filial</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhum registro encontrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-center">Dias</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>
                            <div className="font-medium">{v.employee_name}</div>
                            {v.employee_role && <div className="text-xs text-muted-foreground">{v.employee_role}</div>}
                          </TableCell>
                          <TableCell className="text-sm">{v.filial_name || '—'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {fmt(v.start_date)} → {fmt(v.end_date)}
                          </TableCell>
                          <TableCell className="text-center">{v.total_days}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusMeta[v.status].className}>
                              {statusMeta[v.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {canManage && v.status !== 'cancelled' && v.status !== 'completed' && (
                              <ConfirmButton
                                icon={Ban}
                                label="Cancelar"
                                title="Cancelar férias?"
                                description={`As férias de ${v.employee_name} serão marcadas como canceladas.`}
                                onConfirm={() => cancel.mutate(v.id)}
                              />
                            )}
                            {canManage && (
                              <ConfirmButton
                                icon={Trash2}
                                label="Excluir"
                                variant="destructive"
                                title="Excluir registro?"
                                description="Esta ação não pode ser desfeita."
                                onConfirm={() => del.mutate(v.id)}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {format(monthCursor, "MMMM 'de' yyyy", { locale: ptBR })}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMonthCursor((d) => subMonths(d, 1))}>Anterior</Button>
                <Button size="sm" variant="outline" onClick={() => setMonthCursor(new Date())}>Hoje</Button>
                <Button size="sm" variant="outline" onClick={() => setMonthCursor((d) => addMonths(d, 1))}>Próximo</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-xs">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                  <div key={d} className="text-center font-semibold text-muted-foreground py-1">{d}</div>
                ))}
                {calendarDays.map((c, i) => (
                  <div
                    key={i}
                    className={`min-h-[80px] rounded border p-1 ${c.inMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'}`}
                  >
                    <div className="text-[10px] font-medium">{format(c.date, 'd')}</div>
                    <div className="space-y-0.5 mt-1">
                      {c.items.slice(0, 3).map((it) => (
                        <div
                          key={it.id}
                          className={`truncate text-[10px] rounded px-1 py-0.5 ${statusMeta[it.status].className}`}
                          title={`${it.employee_name} — ${it.filial_name || ''}`}
                        >
                          {it.employee_name.split(' ')[0]}
                        </div>
                      ))}
                      {c.items.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{c.items.length - 3}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filial">
          <Card>
            <CardContent className="p-0">
              {byFilial.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhum registro para resumir.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Em andamento</TableHead>
                      <TableHead className="text-center">Agendadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byFilial.map((f) => (
                      <TableRow key={f.name}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" /> {f.name}
                        </TableCell>
                        <TableCell className="text-center">{f.total}</TableCell>
                        <TableCell className="text-center">{f.active}</TableCell>
                        <TableCell className="text-center">{f.scheduled}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <VacationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lockedFilialId={canManage ? null : profile?.filial_id || null}
        allowAnyFilial={canManage}
      />
    </div>
  );
};

const KpiCard: React.FC<{ label: string; value: number; icon: React.ComponentType<any>; tone: 'amber' | 'blue' | 'emerald' | 'violet' }> = ({ label, value, icon: Icon, tone }) => {
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <Card className={`border ${tones[tone]}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
          </div>
          <Icon className="h-6 w-6 opacity-60" />
        </div>
      </CardContent>
    </Card>
  );
};

const ConfirmButton: React.FC<{
  icon: React.ComponentType<any>;
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive' | 'outline';
}> = ({ icon: Icon, label, title, description, onConfirm, variant = 'outline' }) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button size="icon" variant={variant} title={label} className="h-8 w-8">
        <Icon className="h-4 w-4" />
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Confirmar</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default VacationsPage;
