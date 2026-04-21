import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MapPin, Phone, ClipboardList, Users as UsersIcon, CalendarRange } from 'lucide-react';
import { useFollowups, FollowupRow, getClientKey } from '@/hooks/useFollowups';
import { cn } from '@/lib/utils';

const WEEK_DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEK_DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmt = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export const WeeklyAgenda: React.FC = () => {
  const { data = [], isLoading } = useFollowups();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    return days.map((day) => {
      const items = data.filter((f) => sameDay(new Date(f.activity_date), day));
      const visitas = items.filter((i) => i.activity_type === 'visita').length;
      const ligacoes = items.filter((i) => i.activity_type === 'ligacao').length;
      const checklists = items.filter((i) => i.activity_type === 'checklist').length;
      const uniqueClients = new Set(items.map(getClientKey)).size;
      return { day, items, visitas, ligacoes, checklists, uniqueClients, total: items.length };
    });
  }, [data, days]);

  const weekTotals = useMemo(() => {
    const all = data.filter((f) => {
      const t = new Date(f.activity_date).getTime();
      return t >= weekStart.getTime() && t < addDays(weekStart, 7).getTime();
    });
    return {
      total: all.length,
      visitas: all.filter((i) => i.activity_type === 'visita').length,
      ligacoes: all.filter((i) => i.activity_type === 'ligacao').length,
      checklists: all.filter((i) => i.activity_type === 'checklist').length,
      uniqueClients: new Set(all.map(getClientKey)).size,
    };
  }, [data, weekStart]);

  const dayItems = selectedDay
    ? data.filter((f) => sameDay(new Date(f.activity_date), selectedDay))
    : [];

  return (
    <div className="space-y-4">
      {/* Header: navegação + resumo da semana */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Semana de</span>
          <strong>{fmt(weekStart)}</strong>
          <span className="text-muted-foreground">a</span>
          <strong>{fmt(addDays(weekStart, 6))}</strong>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resumo semanal */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryTile label="Atividades" value={weekTotals.total} />
        <SummaryTile label="Visitas" value={weekTotals.visitas} icon={<MapPin className="h-3.5 w-3.5" />} />
        <SummaryTile label="Ligações" value={weekTotals.ligacoes} icon={<Phone className="h-3.5 w-3.5" />} />
        <SummaryTile label="Checklists" value={weekTotals.checklists} icon={<ClipboardList className="h-3.5 w-3.5" />} />
        <SummaryTile label="Clientes únicos" value={weekTotals.uniqueClients} icon={<UsersIcon className="h-3.5 w-3.5" />} />
      </div>

      {/* Calendário semanal em colunas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {byDay.map(({ day, visitas, ligacoes, checklists, uniqueClients, total }, idx) => {
          const isToday = sameDay(day, new Date());
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <Card
              key={idx}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5',
                isToday && 'border-primary ring-1 ring-primary/30',
                isWeekend && !isToday && 'bg-muted/30'
              )}
              onClick={() => setSelectedDay(day)}
            >
              {/* Cabeçalho do dia */}
              <div
                className={cn(
                  'flex items-center justify-between rounded-t-lg px-3 py-2 text-xs font-medium',
                  isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                <span>{WEEK_DAYS_SHORT[day.getDay()]}</span>
                <span>{fmt(day)}</span>
              </div>

              <CardContent className="space-y-2 p-3">
                {/* Total destacado */}
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Atividades</span>
                  <span className="text-2xl font-semibold leading-none">{total}</span>
                </div>

                <div className="space-y-1 border-t pt-2 text-xs">
                  <Row icon={<MapPin className="h-3 w-3" />} label="Visitas" value={visitas} />
                  <Row icon={<Phone className="h-3 w-3" />} label="Ligações" value={ligacoes} />
                  <Row icon={<ClipboardList className="h-3 w-3" />} label="Checklists" value={checklists} />
                  <div className="mt-1 flex items-center justify-between border-t pt-1">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <UsersIcon className="h-3 w-3" /> Clientes
                    </span>
                    <strong>{uniqueClients}</strong>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && (
                <>
                  Atividades de {WEEK_DAYS_FULL[selectedDay.getDay()]},{' '}
                  {selectedDay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {dayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma atividade neste dia.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Próx. retorno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayItems.map((f: FollowupRow) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <div className="font-medium">{f.client_name}</div>
                        {f.client_code && <div className="text-xs text-muted-foreground">{f.client_code}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{f.activity_type}</Badge></TableCell>
                      <TableCell><Badge>{f.followup_status}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {f.next_return_date ? new Date(f.next_return_date).toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SummaryTile: React.FC<{ label: string; value: number; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </CardContent>
  </Card>
);

const Row: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1 text-muted-foreground">
      {icon} {label}
    </span>
    <strong>{value}</strong>
  </div>
);
