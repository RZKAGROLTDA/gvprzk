import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFollowups, FollowupRow, getClientKey } from '@/hooks/useFollowups';

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
      return { day, items, visitas, ligacoes, checklists, uniqueClients };
    });
  }, [data, days]);

  const dayItems = selectedDay
    ? data.filter((f) => sameDay(new Date(f.activity_date), selectedDay))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Semana de <strong>{fmt(weekStart)}</strong> a <strong>{fmt(addDays(weekStart, 6))}</strong>
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

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {byDay.map(({ day, visitas, ligacoes, checklists, uniqueClients, items }, idx) => {
          const isToday = sameDay(day, new Date());
          return (
            <Card
              key={idx}
              className={`cursor-pointer transition-colors hover:bg-accent ${
                isToday ? 'border-primary' : ''
              }`}
              onClick={() => setSelectedDay(day)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{WEEK_DAYS[day.getDay()]}</span>
                  <span className="text-xs text-muted-foreground">{fmt(day)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Visitas</span><strong>{visitas}</strong></div>
                <div className="flex justify-between"><span>Ligações</span><strong>{ligacoes}</strong></div>
                <div className="flex justify-between"><span>Checklists</span><strong>{checklists}</strong></div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-muted-foreground">Clientes</span>
                  <strong>{uniqueClients}</strong>
                </div>
                <div className="text-xs text-muted-foreground">{items.length} atividades</div>
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
              Atividades de {selectedDay && selectedDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </DialogTitle>
          </DialogHeader>
          {dayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma atividade neste dia.</p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
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
