import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, CheckCircle2, Clock, Percent, Pencil, Trash2, RotateCcw, XCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import {
  useVisitSchedules,
  VisitSchedule,
  VisitScheduleStatus,
  useUpdateVisitScheduleStatus,
  useDeleteVisitSchedule,
} from '@/hooks/useVisitSchedules';
import { VisitScheduleForm } from './VisitScheduleForm';
import { cn } from '@/lib/utils';

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeekMon = (d: Date) => {
  const x = startOfDay(d);
  const dow = x.getDay();
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1); };

const STATUS_LABELS: Record<VisitScheduleStatus, string> = {
  planejado: 'Planejado',
  realizado: 'Realizado',
  nao_realizado: 'Não realizado',
  reagendado: 'Reagendado',
};

const STATUS_CARD_CLASS: Record<VisitScheduleStatus, string> = {
  planejado: 'border-l-4 border-l-muted-foreground/40 bg-card',
  realizado: 'border-l-4 border-l-green-500 bg-green-500/5',
  nao_realizado: 'border-l-4 border-l-destructive bg-destructive/5',
  reagendado: 'border-l-4 border-l-amber-500 bg-amber-500/5',
};

export const VisitSchedulePanel: React.FC = () => {
  const { user } = useAuth();
  const { isManager, isAdmin, isSupervisor } = useUserRole() as any;
  const isPrivileged = !!(isManager || isAdmin || isSupervisor);
  const { consultants } = useFilteredConsultants();

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-options-vsp'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const [weekStart, setWeekStart] = useState<Date>(startOfWeekMon(new Date()));
  const weekEnd = addDays(weekStart, 6);

  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [filialFilter, setFilialFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientSearch, setClientSearch] = useState('');

  const { data: schedules = [], isLoading } = useVisitSchedules({
    startDate: toISO(weekStart),
    endDate: toISO(weekEnd),
    sellerId: sellerFilter !== 'all' ? sellerFilter : undefined,
    filialId: filialFilter !== 'all' ? filialFilter : undefined,
    status: statusFilter !== 'all' ? (statusFilter as VisitScheduleStatus) : undefined,
    clientSearch: clientSearch || undefined,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisitSchedule | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  const updateStatus = useUpdateVisitScheduleStatus();
  const deleteSchedule = useDeleteVisitSchedule();
  const [toDelete, setToDelete] = useState<VisitSchedule | null>(null);

  const canDelete = (s: VisitSchedule) => {
    if (isManager || isAdmin) return true;
    if (isSupervisor) return true; // RLS restringe pela filial
    return s.seller_id === user?.id && s.status !== 'realizado';
  };

  const kpis = useMemo(() => {
    const today = startOfDay(new Date());
    const total = schedules.length;
    const realizadas = schedules.filter((s) => s.status === 'realizado').length;
    const naoRealizadas = schedules.filter((s) => s.status === 'nao_realizado').length;
    const reagendadas = schedules.filter((s) => s.status === 'reagendado').length;
    const pendentes = schedules.filter(
      (s) => s.status === 'planejado' && parseISO(s.planned_date) >= today,
    ).length;
    const denom = schedules.filter(
      (s) =>
        s.status === 'realizado' ||
        s.status === 'nao_realizado' ||
        (s.status === 'planejado' && parseISO(s.planned_date) < today),
    ).length;
    const exec = denom > 0 ? Math.round((realizadas / denom) * 100) : 0;
    return { total, realizadas, naoRealizadas, reagendadas, pendentes, exec };
  }, [schedules]);

  const byDay = useMemo(() => {
    const map = new Map<string, VisitSchedule[]>();
    for (let i = 0; i < 7; i++) map.set(toISO(addDays(weekStart, i)), []);
    for (const s of schedules) {
      const arr = map.get(s.planned_date);
      if (arr) arr.push(s);
    }
    return map;
  }, [schedules, weekStart]);

  const openNew = (date?: string) => {
    setEditing(null);
    setDefaultDate(date);
    setFormOpen(true);
  };

  const openEdit = (s: VisitSchedule) => {
    setEditing(s);
    setDefaultDate(undefined);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Resumo da semana */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<CalendarDays className="h-5 w-5" />} label="Programadas" value={kpis.total} />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} label="Realizadas" value={kpis.realizadas} />
        <KpiCard icon={<Clock className="h-5 w-5 text-amber-600" />} label="Pendentes" value={kpis.pendentes} />
        <KpiCard icon={<XCircle className="h-5 w-5 text-destructive" />} label="Não realizadas" value={kpis.naoRealizadas} />
        <KpiCard icon={<RotateCcw className="h-5 w-5 text-amber-500" />} label="Reagendadas" value={kpis.reagendadas} />
        <KpiCard icon={<Percent className="h-5 w-5 text-primary" />} label="% Execução" value={`${kpis.exec}%`} />
      </div>

      {/* Filtros + nav semanal */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium px-2">
                {weekStart.toLocaleDateString('pt-BR')} – {weekEnd.toLocaleDateString('pt-BR')}
              </div>
              <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeekMon(new Date()))}>
                Hoje
              </Button>
            </div>
            <Button onClick={() => openNew()}>
              <Plus className="h-4 w-4 mr-1" /> Nova Programação
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Input
              placeholder="Buscar cliente (nome ou código)"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            {isPrivileged && (
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {consultants.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(isManager || isAdmin) && (
              <Select value={filialFilter} onValueChange={setFilialFilter}>
                <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas filiais</SelectItem>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="planejado">Planejado</SelectItem>
                <SelectItem value="realizado">Realizado</SelectItem>
                <SelectItem value="nao_realizado">Não realizado</SelectItem>
                <SelectItem value="reagendado">Reagendado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Visão semanal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = addDays(weekStart, i);
          const iso = toISO(day);
          const items = byDay.get(iso) ?? [];
          const isToday = toISO(new Date()) === iso;
          return (
            <Card key={iso} className={cn('min-h-[160px]', isToday && 'ring-2 ring-primary')}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase">{WEEK_DAYS[i]}</div>
                    <div className="text-sm font-semibold">{day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openNew(iso)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {items.length === 0 && (
                  <div className="text-xs text-muted-foreground italic py-4 text-center">Sem programação</div>
                )}
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={cn('rounded-md p-2 text-xs space-y-1 cursor-pointer hover:opacity-90', STATUS_CARD_CLASS[s.status])}
                    onClick={() => openEdit(s)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-medium leading-tight truncate">{s.client_name}</div>
                      <Pencil className="h-3 w-3 shrink-0 mt-0.5 opacity-50" />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.client_code && `Cód. ${s.client_code} • `}{s.seller_name}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px] py-0 h-4">{STATUS_LABELS[s.status]}</Badge>
                      <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                        {s.status === 'planejado' && (
                          <>
                            <button
                              type="button"
                              title="Marcar realizado"
                              className="text-green-600 text-[10px] hover:underline"
                              onClick={() => updateStatus.mutate({ id: s.id, status: 'realizado' })}
                            >✓</button>
                            <button
                              type="button"
                              title="Não realizado"
                              className="text-destructive text-[10px] hover:underline"
                              onClick={() => updateStatus.mutate({ id: s.id, status: 'nao_realizado' })}
                            >✗</button>
                          </>
                        )}
                        {canDelete(s) && (
                          <button
                            type="button"
                            title="Excluir programação"
                            className="text-destructive hover:opacity-80"
                            onClick={() => setToDelete(s)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}

      {formOpen && (
        <VisitScheduleForm
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editing}
          defaultDate={defaultDate}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir programação?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && (
                <>
                  Cliente <strong>{toDelete.client_name}</strong> em{' '}
                  <strong>{parseISO(toDelete.planned_date).toLocaleDateString('pt-BR')}</strong>.
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteSchedule.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-md bg-muted p-2">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </CardContent>
  </Card>
);
