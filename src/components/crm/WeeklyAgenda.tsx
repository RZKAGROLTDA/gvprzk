import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  CalendarIcon, ChevronLeft, ChevronRight, MapPin, Phone, ClipboardList,
  Users as UsersIcon, X, CalendarRange,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { useWeeklyAgenda, WeeklyAgendaDay } from '@/hooks/useWeeklyAgenda';
import { FollowupRow } from '@/hooks/useFollowups';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const WEEK_DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEK_DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeekMon = (d: Date) => {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Dom
  const diff = (dow + 6) % 7; // dias desde segunda
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

type RangeMode = 'week' | 'today' | 'last7' | 'custom';

export const WeeklyAgenda: React.FC = () => {
  const { user } = useAuth();
  const { consultants } = useFilteredConsultants();

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-options'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const [mode, setMode] = useState<RangeMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => startOfWeekMon(new Date()));
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [seller, setSeller] = useState<string>('all');
  const [filial, setFilial] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { startDate, endDate } = useMemo(() => {
    if (mode === 'today') {
      const t = startOfDay(new Date());
      return { startDate: t, endDate: t };
    }
    if (mode === 'last7') {
      const end = startOfDay(new Date());
      return { startDate: addDays(end, -6), endDate: end };
    }
    if (mode === 'custom' && customStart && customEnd) {
      const s = startOfDay(customStart);
      const e = startOfDay(customEnd);
      return s <= e ? { startDate: s, endDate: e } : { startDate: e, endDate: s };
    }
    // week
    return { startDate: anchor, endDate: addDays(anchor, 6) };
  }, [mode, anchor, customStart, customEnd]);

  const { data: days = [], isLoading } = useWeeklyAgenda({
    startDate,
    endDate,
    responsibleUserId: seller !== 'all' ? seller : null,
    filialId: filial !== 'all' ? filial : null,
  });

  const maxActivities = useMemo(
    () => days.reduce((m, d) => Math.max(m, d.total_activities), 0),
    [days]
  );

  const totals = useMemo(() => ({
    total: days.reduce((s, d) => s + d.total_activities, 0),
    visitas: days.reduce((s, d) => s + d.visitas, 0),
    ligacoes: days.reduce((s, d) => s + d.ligacoes, 0),
    checklists: days.reduce((s, d) => s + d.checklists, 0),
  }), [days]);

  const goPrevWeek = () => { setMode('week'); setAnchor(addDays(anchor, -7)); };
  const goNextWeek = () => { setMode('week'); setAnchor(addDays(anchor, 7)); };
  const goThisWeek = () => { setMode('week'); setAnchor(startOfWeekMon(new Date())); };

  const clearFilters = () => {
    setSeller('all');
    setFilial('all');
    goThisWeek();
    setCustomStart(undefined);
    setCustomEnd(undefined);
  };

  // Detalhe do dia selecionado
  const selectedDayISO = selectedDay ? toISODate(selectedDay) : null;
  const { data: dayItems = [], isLoading: loadingDay } = useQuery({
    queryKey: ['agenda-day-details', user?.id, selectedDayISO, seller, filial],
    enabled: !!user?.id && !!selectedDayISO,
    staleTime: 30_000,
    queryFn: async (): Promise<FollowupRow[]> => {
      // Janela do dia local convertida para limites ISO seguros para timestamptz
      const start = parseISODate(selectedDayISO!);
      const end = addDays(start, 1);
      let q = supabase
        .from('task_followups')
        .select('*')
        .gte('activity_date', start.toISOString())
        .lt('activity_date', end.toISOString())
        .order('activity_date', { ascending: true });
      if (seller !== 'all') q = q.eq('responsible_user_id', seller);
      if (filial !== 'all') q = q.eq('filial_id', filial);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FollowupRow[];
    },
  });

  const consultantNameById = useMemo(() => {
    const map = new Map<string, string>();
    consultants.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [consultants]);

  return (
    <div className="space-y-4">
      {/* Filtros + atalhos */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={mode === 'today' ? 'default' : 'outline'} onClick={() => setMode('today')}>
              Hoje
            </Button>
            <Button size="sm" variant={mode === 'last7' ? 'default' : 'outline'} onClick={() => setMode('last7')}>
              Últimos 7 dias
            </Button>
            <Button size="sm" variant={mode === 'week' ? 'default' : 'outline'} onClick={goThisWeek}>
              Esta semana
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={goPrevWeek} aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goNextWeek} aria-label="Próxima semana">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <DateField label="De" value={customStart} onChange={(d) => { setCustomStart(d); if (d) setMode('custom'); }} />
          <DateField label="Até" value={customEnd} onChange={(d) => { setCustomEnd(d); if (d) setMode('custom'); }} />

          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {consultants.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filial} onValueChange={setFilial}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={clearFilters} className="lg:ml-auto">
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        </CardContent>
      </Card>

      {/* Header período + totais */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Período:</span>
          <strong>{fmt(startDate)}</strong>
          <span className="text-muted-foreground">a</span>
          <strong>{fmt(endDate)}</strong>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Total: {totals.total}</Badge>
          <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {totals.visitas}</Badge>
          <Badge variant="outline" className="gap-1"><Phone className="h-3 w-3" /> {totals.ligacoes}</Badge>
          <Badge variant="outline" className="gap-1"><ClipboardList className="h-3 w-3" /> {totals.checklists}</Badge>
        </div>
      </div>

      {/* Grade do calendário */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-3',
            days.length <= 1
              ? 'grid-cols-1'
              : days.length <= 4
              ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7'
          )}
        >
          {days.map((d) => (
            <DayCell
              key={d.day}
              d={d}
              maxActivities={maxActivities}
              onClick={() => setSelectedDay(parseISODate(d.day))}
            />
          ))}
        </div>
      )}

      {/* Painel lateral com detalhes do dia */}
      <Sheet open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDay && (
                <>
                  {WEEK_DAYS_FULL[selectedDay.getDay()]},{' '}
                  {selectedDay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </>
              )}
            </SheetTitle>
            <SheetDescription>
              Atividades registradas neste dia.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            {loadingDay ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-md bg-muted/50" />
                ))}
              </div>
            ) : dayItems.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma atividade registrada neste dia.
              </div>
            ) : (
              dayItems.map((f) => (
                <Card key={f.id}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{f.client_name}</div>
                        {f.client_code && (
                          <div className="truncate text-xs text-muted-foreground">Cód: {f.client_code}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 capitalize">{f.activity_type}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary" className="capitalize">{f.followup_status}</Badge>
                      <Badge variant="outline" className="capitalize">Prio: {f.priority}</Badge>
                      <span className="text-muted-foreground">
                        Resp.: {consultantNameById.get(f.responsible_user_id) ?? '—'}
                      </span>
                    </div>
                    {f.notes && (
                      <p className="text-sm text-muted-foreground">{f.notes}</p>
                    )}
                    {f.next_return_date && (
                      <p className="text-xs text-muted-foreground">
                        Próx. retorno: {new Date(f.next_return_date).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

const DayCell: React.FC<{
  d: WeeklyAgendaDay;
  maxActivities: number;
  onClick: () => void;
}> = ({ d, maxActivities, onClick }) => {
  const date = parseISODate(d.day);
  const isToday = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const empty = d.total_activities === 0;
  const intensity = maxActivities > 0 ? d.total_activities / maxActivities : 0;
  const high = intensity >= 0.66 && d.total_activities > 0;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5',
        isToday && 'border-primary ring-1 ring-primary/40',
        isWeekend && !isToday && 'bg-muted/30',
        empty && 'opacity-70'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between rounded-t-lg px-3 py-2 text-xs font-medium',
          isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        <span>{WEEK_DAYS_SHORT[date.getDay()]}</span>
        <span>{fmt(date)}</span>
      </div>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Atividades</span>
          <span className={cn(
            'text-2xl font-semibold leading-none',
            high && 'text-primary'
          )}>
            {d.total_activities}
          </span>
        </div>

        {/* Barra de intensidade */}
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn('h-full', empty ? 'bg-muted' : 'bg-primary')}
            style={{ width: `${Math.max(intensity * 100, empty ? 0 : 6)}%` }}
          />
        </div>

        <div className="space-y-1 border-t pt-2 text-xs">
          <Row icon={<MapPin className="h-3 w-3" />} label="Visitas" value={d.visitas} />
          <Row icon={<Phone className="h-3 w-3" />} label="Ligações" value={d.ligacoes} />
          <Row icon={<ClipboardList className="h-3 w-3" />} label="Checklists" value={d.checklists} />
          <div className="mt-1 flex items-center justify-between border-t pt-1">
            <span className="flex items-center gap-1 text-muted-foreground">
              <UsersIcon className="h-3 w-3" /> Clientes
            </span>
            <strong>{d.unique_clients}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Row: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1 text-muted-foreground">{icon} {label}</span>
    <strong>{value}</strong>
  </div>
);

const DateField: React.FC<{ label: string; value?: Date; onChange: (d?: Date) => void }> = ({ label, value, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        className={cn('w-full justify-start text-left font-normal sm:w-[150px]', !value && 'text-muted-foreground')}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? fmt(value) : label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
    </PopoverContent>
  </Popover>
);
