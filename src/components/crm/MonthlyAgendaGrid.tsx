import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { MapPin, Phone, ClipboardList, Users as UsersIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WeeklyAgendaDay } from '@/hooks/useWeeklyAgenda';

const WEEK_DAYS_MON = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeekMon = (d: Date) => {
  const x = startOfDay(d);
  const dow = x.getDay();
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
};
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

  const weeks = useMemo(() => {
    const gridStart = startOfWeekMon(startDate);
    const rangeEnd = startOfDay(endDate);
    // Cobrir até o final da última semana que contém endDate
    const lastWeekStart = startOfWeekMon(rangeEnd);
    const gridEnd = addDays(lastWeekStart, 6);
    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
    const out: Date[][] = [];
    for (let i = 0; i < totalDays; i += 7) {
      const week: Date[] = [];
      for (let j = 0; j < 7; j++) week.push(addDays(gridStart, i + j));
      out.push(week);
    }
    return out;
  }, [startDate, endDate]);

  const rangeStart = startOfDay(startDate);
  const rangeEnd = startOfDay(endDate);
  const today = startOfDay(new Date());

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEK_DAYS_MON.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((date) => {
          const iso = toISODate(date);
          const inRange = date >= rangeStart && date <= rangeEnd;
          const data = dayMap.get(iso);
          const total = data?.total_activities ?? 0;
          const isToday = date.getTime() === today.getTime();
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const empty = total === 0;

          return (
            <Card
              key={iso}
              onClick={() => inRange && onDayClick(parseISODate(iso))}
              className={cn(
                'min-h-[88px] p-2 transition-all',
                inRange ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'opacity-40 pointer-events-none',
                isToday && 'border-primary ring-1 ring-primary/40',
                isWeekend && inRange && !isToday && 'bg-muted/30',
                inRange && empty && 'opacity-70',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    isToday ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {date.getDate()}
                </span>
                {inRange && total > 0 && (
                  <span className="text-sm font-bold leading-none">{total}</span>
                )}
              </div>

              {inRange && total > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-0.5 text-[10px]">
                  {data!.visitas > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5" />{data!.visitas}
                    </span>
                  )}
                  {data!.ligacoes > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground">
                      <Phone className="h-2.5 w-2.5" />{data!.ligacoes}
                    </span>
                  )}
                  {data!.checklists > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground">
                      <ClipboardList className="h-2.5 w-2.5" />{data!.checklists}
                    </span>
                  )}
                  {data!.unique_clients > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-primary">
                      <UsersIcon className="h-2.5 w-2.5" />{data!.unique_clients}
                    </span>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
