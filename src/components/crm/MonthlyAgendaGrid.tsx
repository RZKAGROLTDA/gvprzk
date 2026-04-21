import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Phone, ClipboardList, Users as UsersIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WeeklyAgendaDay } from '@/hooks/useWeeklyAgenda';

const WEEK_DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HEADER_DAYS_MON = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeekMon = (d: Date) => {
  const x = startOfDay(d);
  const dow = x.getDay();
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
};
const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const parseISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

interface MonthlyAgendaGridProps {
  startDate: Date;
  endDate: Date;
  days: WeeklyAgendaDay[];
  onDayClick: (date: Date) => void;
}

export const MonthlyAgendaGrid: React.FC<MonthlyAgendaGridProps> = ({
  startDate,
  endDate,
  days,
  onDayClick,
}) => {
  const dayMap = useMemo(() => {
    const m = new Map<string, WeeklyAgendaDay>();
    days.forEach((d) => m.set(d.day, d));
    return m;
  }, [days]);

  const maxActivities = useMemo(
    () => days.reduce((m, d) => Math.max(m, d.total_activities), 0),
    [days]
  );

  const cells = useMemo(() => {
    const gridStart = startOfWeekMon(startDate);
    const rangeEnd = startOfDay(endDate);
    const lastWeekStart = startOfWeekMon(rangeEnd);
    const gridEnd = addDays(lastWeekStart, 6);
    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
    const out: Date[] = [];
    for (let i = 0; i < totalDays; i++) out.push(addDays(gridStart, i));
    return out;
  }, [startDate, endDate]);

  const rangeStart = startOfDay(startDate);
  const rangeEnd = startOfDay(endDate);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
        {HEADER_DAYS_MON.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((date) => {
          const iso = toISODate(date);
          const inRange = date >= rangeStart && date <= rangeEnd;
          const data = dayMap.get(iso) ?? {
            day: iso,
            total_activities: 0,
            visitas: 0,
            ligacoes: 0,
            checklists: 0,
            unique_clients: 0,
          };
          return (
            <CompactDayCell
              key={iso}
              date={date}
              d={data}
              inRange={inRange}
              maxActivities={maxActivities}
              onClick={() => inRange && onDayClick(parseISODate(iso))}
            />
          );
        })}
      </div>
    </div>
  );
};

const CompactDayCell: React.FC<{
  date: Date;
  d: WeeklyAgendaDay;
  inRange: boolean;
  maxActivities: number;
  onClick: () => void;
}> = ({ date, d, inRange, maxActivities, onClick }) => {
  const isToday = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const empty = d.total_activities === 0;
  const intensity = maxActivities > 0 ? d.total_activities / maxActivities : 0;
  const high = intensity >= 0.66 && d.total_activities > 0;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'overflow-hidden transition-all',
        inRange
          ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
          : 'opacity-40 pointer-events-none',
        isToday && 'border-primary ring-1 ring-primary/40',
        isWeekend && inRange && !isToday && 'bg-muted/30',
        inRange && empty && 'opacity-70'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between px-2 py-1 text-[10px] font-medium',
          isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        <span>{WEEK_DAYS_SHORT[date.getDay()]}</span>
        <span>{fmt(date)}</span>
      </div>
      <CardContent className="space-y-1.5 p-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-muted-foreground">Atividades</span>
          <span className={cn(
            'text-lg font-semibold leading-none',
            high && 'text-primary'
          )}>
            {d.total_activities}
          </span>
        </div>

        <div className="h-0.5 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn('h-full', empty ? 'bg-muted' : 'bg-primary')}
            style={{ width: `${Math.max(intensity * 100, empty ? 0 : 6)}%` }}
          />
        </div>

        <div className="space-y-0.5 border-t pt-1.5 text-[10px]">
          <CompactRow icon={<MapPin className="h-2.5 w-2.5" />} label="Visitas" value={d.visitas} />
          <CompactRow icon={<Phone className="h-2.5 w-2.5" />} label="Ligações" value={d.ligacoes} />
          <CompactRow icon={<ClipboardList className="h-2.5 w-2.5" />} label="Checklists" value={d.checklists} />
          <div className="mt-0.5 flex items-center justify-between border-t pt-0.5">
            <span className="flex items-center gap-1 text-muted-foreground">
              <UsersIcon className="h-2.5 w-2.5" /> Clientes
            </span>
            <strong>{d.unique_clients}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CompactRow: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1 text-muted-foreground">{icon} {label}</span>
    <strong>{value}</strong>
  </div>
);
