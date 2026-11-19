import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon, ChevronLeft, ChevronRight, MapPin, Phone, Users as UsersIcon, X, Activity,
  ArrowLeft, Clock, CheckCircle2, AlertCircle, CalendarClock, ExternalLink,
} from 'lucide-react';
import { ClientFilter, matchesClient, type SelectedClient } from '@/components/ClientFilter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskEditModal } from '@/components/TaskEditModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { useActiveFilialFilter } from '@/hooks/useActiveFilialFilter';
import { WeeklyAgendaDay } from '@/hooks/useWeeklyAgenda';
import { clientRpcParams } from '@/components/ClientFilter';
import { FollowupRow } from '@/hooks/useFollowups';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { CRM_DIVISIONAIS, divisionalOfFilial } from '@/lib/crmDivisional';

const WEEK_DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEK_DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeekMon = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1); };
const isISO = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

type RangeMode = 'week' | 'month' | 'last30' | 'custom';
const FOLLOWUP_COLS =
  'id, task_id, client_name, client_code, activity_type, activity_date, next_return_date, return_notes, followup_status, priority, client_temperature, responsible_user_id, filial_id, notes, created_by, created_at, updated_at';

const TYPE_LABEL: Record<string, string> = {
  visita: 'Visita', ligacao: 'Ligação', checklist: 'Checklist', reuniao: 'Reunião', outro: 'Outro', visita_tecnica: 'Visita técnica',
};
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', concluido: 'Realizada', cancelado: 'Cancelada', reagendado: 'Reagendada',
};

const clientKey = (f: { client_code?: string | null; client_name?: string | null }) =>
  (f.client_code?.trim().toLowerCase() || f.client_name?.trim().toLowerCase() || '');

export const WeeklyAgenda: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [client, setClient] = useState<SelectedClient | null>(null);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)));
    setSp(next, { replace: true });
  };

  // Período (na URL, preservado entre visões)
  const mode = (['week', 'month', 'last30', 'custom'].includes(sp.get('periodo') ?? '') ? sp.get('periodo') : 'week') as RangeMode;
  const anchor = isISO(sp.get('semana')) ? startOfWeekMon(parseISO(sp.get('semana')!)) : startOfWeekMon(new Date());
  const customStart = isISO(sp.get('de')) ? parseISO(sp.get('de')!) : undefined;
  const customEnd = isISO(sp.get('ate')) ? parseISO(sp.get('ate')!) : undefined;
  const selectedDayISO = isISO(sp.get('dia')) ? sp.get('dia')! : null;
  const divisional = sp.get('div') ?? 'all';
  const seller = sp.get('vend') ?? 'all';

  const { startDate, endDate } = useMemo(() => {
    const today = startOfDay(new Date());
    if (mode === 'month') return { startDate: new Date(today.getFullYear(), today.getMonth(), 1), endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
    if (mode === 'last30') return { startDate: addDays(today, -29), endDate: today };
    if (mode === 'custom' && customStart && customEnd) {
      return customStart <= customEnd ? { startDate: customStart, endDate: customEnd } : { startDate: customEnd, endDate: customStart };
    }
    return { startDate: anchor, endDate: addDays(anchor, 6) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anchor.getTime(), customStart?.getTime(), customEnd?.getTime()]);
  const rangeDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;

  // Escopo de filial (servidor é a autoridade; aqui só restringimos)
  const { filial, setFilial, filialId: scopedFilialId, allowedFiliais, isGlobal, isScopeReady } = useActiveFilialFilter();
  const { data: allFiliais = [] } = useQuery({
    queryKey: ['filiais-options'],
    staleTime: 15 * 60 * 1000,
    enabled: isGlobal,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome').limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const visibleFiliais = (isGlobal ? allFiliais : allowedFiliais.map((f) => ({ id: f.id, nome: f.nome })))
    .map((f) => ({ ...f, div: divisionalOfFilial(f.nome) }));
  const availableDivs = CRM_DIVISIONAIS.filter((d) => visibleFiliais.some((f) => f.div === d));
  const filialOptions = divisional === 'all' ? visibleFiliais : visibleFiliais.filter((f) => f.div === divisional);

  // IDs efetivos: filial escolhida, ou filiais da divisional, ou null (todo o escopo)
  const filialIds: string[] | null = scopedFilialId
    ? [scopedFilialId]
    : divisional !== 'all' ? filialOptions.map((f) => f.id) : null;

  const { consultants } = useFilteredConsultants(scopedFilialId);
  const sellerOptions = filialIds ? consultants.filter((c) => !c.filial_id || filialIds.includes(c.filial_id)) : consultants;
  const consultantNameById = useMemo(() => new Map(consultants.map((c) => [c.id, c.name])), [consultants]);

  const responsible = seller !== 'all' ? seller : null;
  const startStr = toISO(startDate);
  const endStr = toISO(endDate);

  // Agenda por dia (soma por filial quando a divisional tem várias)
  const { data: days = [], isLoading } = useQuery({
    queryKey: ['weekly_followups_agenda', user?.id, startStr, endStr, responsible, filialIds, client ?? null],
    enabled: !!user?.id && isScopeReady && (filialIds === null || filialIds.length > 0),
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyAgendaDay[]> => {
      const targets = filialIds ?? [null];
      const results = await Promise.all(targets.map(async (fid) => {
        const { data, error } = await supabase.rpc('get_weekly_followups_agenda', {
          p_start_date: startStr, p_end_date: endStr, p_responsible_user_id: responsible, p_filial_id: fid,
          ...clientRpcParams(client),
        } as any);
        if (error) throw error;
        return (data ?? []) as any[];
      }));
      const byDay = new Map<string, WeeklyAgendaDay>();
      results.flat().forEach((r) => {
        const cur = byDay.get(r.day) ?? { day: r.day, total_activities: 0, visitas: 0, ligacoes: 0, checklists: 0, unique_clients: 0 };
        cur.total_activities += Number(r.total_activities) || 0;
        cur.visitas += Number(r.visitas) || 0;
        cur.ligacoes += Number(r.ligacoes) || 0;
        cur.checklists += Number(r.checklists) || 0;
        cur.unique_clients += Number(r.unique_clients) || 0;
        byDay.set(r.day, cur);
      });
      return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    },
  });

  const totals = useMemo(() => ({
    total: days.reduce((s, d) => s + d.total_activities, 0),
    visitas: days.reduce((s, d) => s + d.visitas, 0),
    ligacoes: days.reduce((s, d) => s + d.ligacoes, 0),
    clientes: days.reduce((s, d) => s + d.unique_clients, 0),
  }), [days]);
  const maxActivities = days.reduce((m, d) => Math.max(m, d.total_activities), 0);

  // Detalhe do dia
  const { data: dayItems = [], isLoading: loadingDay } = useQuery({
    queryKey: ['agenda-day-details', user?.id, selectedDayISO, responsible, filialIds, client],
    enabled: !!user?.id && !!selectedDayISO && isScopeReady && (filialIds === null || filialIds.length > 0),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FollowupRow[]> => {
      const [y, m, d] = selectedDayISO!.split('-').map(Number);
      const startUtc = new Date(Date.UTC(y, m - 1, d));
      const endUtc = new Date(startUtc.getTime() + 86_400_000);
      let q = supabase.from('task_followups').select(FOLLOWUP_COLS)
        .gte('activity_date', startUtc.toISOString()).lt('activity_date', endUtc.toISOString())
        .order('activity_date', { ascending: true }).limit(1000);
      if (responsible) q = q.eq('responsible_user_id', responsible);
      if (filialIds) q = q.in('filial_id', filialIds);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as FollowupRow[]).filter((f) => matchesClient(client, f.client_code, f.client_name));
    },
  });

  // Ações de filtro
  const goWeek = (d: Date) => setParams({ periodo: null, semana: toISO(startOfWeekMon(d)), de: null, ate: null, dia: null });
  const openDay = (iso: string) => setParams({ dia: iso });
  const clearFilters = () => {
    setFilial('all');
    setClient(null);
    setParams({ periodo: null, semana: null, de: null, ate: null, dia: null, div: null, vend: null });
  };
  const hasFilters = divisional !== 'all' || filial !== 'all' || seller !== 'all' || !!client || mode !== 'week'
    || !!selectedDayISO || toISO(anchor) !== toISO(startOfWeekMon(new Date()));

  const todayISO = toISO(new Date());

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card className="sticky top-0 z-10 shadow-sm">
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={selectedDayISO === todayISO ? 'default' : 'outline'} onClick={() => setParams({ dia: todayISO, periodo: null, semana: toISO(startOfWeekMon(new Date())) })}>Hoje</Button>
            <Button size="sm" variant={mode === 'week' && !selectedDayISO ? 'default' : 'outline'} onClick={() => goWeek(new Date())}>Esta semana</Button>
            <Button size="sm" variant={mode === 'month' ? 'default' : 'outline'} onClick={() => setParams({ periodo: 'month', dia: null })}>Este mês</Button>
            <Button size="sm" variant={mode === 'last30' ? 'default' : 'outline'} onClick={() => setParams({ periodo: 'last30', dia: null })}>Últimos 30 dias</Button>
            <DateField label="De" value={customStart} onChange={(d) => setParams({ de: d ? toISO(d) : null, periodo: d ? 'custom' : null, dia: null })} />
            <DateField label="Até" value={customEnd} onChange={(d) => setParams({ ate: d ? toISO(d) : null, periodo: d ? 'custom' : null, dia: null })} />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                <X className="mr-1 h-3 w-3" /> Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={divisional} onValueChange={(v) => { setFilial('all'); setParams({ div: v === 'all' ? null : v, vend: null }); }}>
              <SelectTrigger><SelectValue placeholder="Divisional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as divisionais</SelectItem>
                {availableDivs.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filial} onValueChange={(v) => { setFilial(v); setParams({ vend: null }); }}>
              <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{divisional === 'all' ? 'Todas as filiais' : `Todas de ${divisional}`}</SelectItem>
                {filialOptions.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={seller} onValueChange={(v) => setParams({ vend: v === 'all' ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {sellerOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <ClientFilter value={client} onChange={setClient} filialId={scopedFilialId} className="w-full" />
          </div>
        </CardContent>
      </Card>

      {selectedDayISO ? (
        <DayView
          dayISO={selectedDayISO}
          items={dayItems}
          loading={loadingDay}
          nameById={consultantNameById}
          onNavigate={(delta) => openDay(toISO(addDays(parseISO(selectedDayISO), delta)))}
          onBack={() => setParams({ dia: null, ...(mode === 'week' ? { semana: toISO(startOfWeekMon(parseISO(selectedDayISO))) } : {}) })}
          onOpenTask={setSelectedTaskId}
        />
      ) : (
        <>
          {/* Cabeçalho do período */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {mode === 'week' && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goWeek(addDays(anchor, -7))} aria-label="Semana anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="text-sm font-medium">
                {fmt(startDate)} a {fmt(endDate)}
                <span className="ml-2 text-muted-foreground">({rangeDays} {rangeDays === 1 ? 'dia' : 'dias'})</span>
              </span>
              {mode === 'week' && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goWeek(addDays(anchor, 7))} aria-label="Próxima semana">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <KpiRow
            loading={isLoading}
            items={[
              { label: 'Atividades', value: totals.total, icon: Activity, tone: 'activities' as const },
              { label: 'Visitas', value: totals.visitas, icon: MapPin, tone: 'visits' as const },
              { label: 'Ligações', value: totals.ligacoes, icon: Phone, tone: 'calls' as const },
              { label: 'Clientes únicos', value: totals.clientes, icon: UsersIcon, tone: 'clients' as const, hint: 'Soma dos clientes únicos de cada dia' },
            ]}
          />

          {isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-muted/50" />)}
            </div>
          ) : rangeDays > 7 ? (
            <ProductivityCalendar days={days} onSelectDay={openDay} />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {days.map((d) => <DayCell key={d.day} d={d} max={maxActivities} selected={d.day === selectedDayISO} onClick={() => openDay(d.day)} />)}
            </div>
          )}
        </>
      )}

      <TaskEditModal
        taskId={selectedTaskId}
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ['weekly_followups_agenda'] });
          queryClient.invalidateQueries({ queryKey: ['agenda-day-details'] });
          queryClient.invalidateQueries({ queryKey: ['task_followups'] });
          queryClient.invalidateQueries({ queryKey: ['followups'] });
        }}
      />
    </div>
  );
};

type KpiTone = 'activities' | 'visits' | 'calls' | 'clients' | 'success' | 'warning' | 'neutral';
type Kpi = { label: string; value: number; icon: React.ComponentType<{ className?: string }>; hint?: string; tone?: KpiTone };

/** Cores suaves por indicador: a cor aparece no ícone e no número, o cartão permanece neutro. */
const KPI_TONES: Record<KpiTone, { chip: string; number: string }> = {
  activities: { chip: 'bg-metric-activities-soft text-metric-activities', number: 'text-metric-activities' },
  visits: { chip: 'bg-metric-visits-soft text-metric-visits', number: 'text-metric-visits' },
  calls: { chip: 'bg-metric-calls-soft text-metric-calls', number: 'text-metric-calls' },
  clients: { chip: 'bg-metric-clients-soft text-metric-clients', number: 'text-metric-clients' },
  success: { chip: 'bg-success-soft text-success', number: 'text-success' },
  warning: { chip: 'bg-warning-soft text-warning', number: 'text-warning' },
  neutral: { chip: 'bg-muted text-muted-foreground', number: 'text-foreground' },
};

const KpiRow: React.FC<{ items: Kpi[]; loading?: boolean }> = ({ items, loading }) => (
  <div className={cn('grid gap-2', items.length > 4 ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7' : 'grid-cols-2 lg:grid-cols-4')}>
    {items.map(({ label, value, icon: Icon, hint, tone = 'neutral' }) => {
      const palette = KPI_TONES[tone];
      return (
        <Card key={label} title={hint}>
          <CardContent className="flex items-center gap-3 p-3">
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', palette.chip)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs leading-snug text-muted-foreground">{label}</div>
              <div className={cn('text-xl font-semibold leading-tight tabular-nums', palette.number)}>{loading ? '—' : value.toLocaleString('pt-BR')}</div>
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);

const DayCell: React.FC<{ d: WeeklyAgendaDay; max: number; selected?: boolean; onClick: () => void }> = ({ d, max, selected, onClick }) => {
  const date = parseISO(d.day);
  const isToday = d.day === toISO(new Date());
  const empty = d.total_activities === 0;
  const pct = max > 0 ? (d.total_activities / max) * 100 : 0;
  const highlighted = selected || isToday;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        highlighted
          ? 'border-day-selected-border bg-day-selected ring-1 ring-day-selected-border/25'
          : 'hover:border-primary/50',
        empty && !highlighted && 'border-muted-foreground/15 bg-muted/25',
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className={cn('font-semibold uppercase', highlighted ? 'text-metric-activities' : 'text-muted-foreground')}>{WEEK_DAYS_SHORT[date.getDay()]}</span>
        <span className={cn('tabular-nums', highlighted ? 'text-metric-activities/75' : 'text-muted-foreground')}>{fmt(date)}</span>
      </div>
      <div className={cn('mt-2 text-3xl font-bold leading-none tabular-nums', empty ? 'text-muted-foreground' : 'text-metric-activities')}>{d.total_activities}</div>
      <div className="text-[11px] text-muted-foreground">atividades</div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded bg-progress-track">
        <div className="h-full rounded bg-progress-fill" style={{ width: `${empty ? 0 : Math.max(pct, 6)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs tabular-nums">
        <span className={cn('flex items-center gap-1', d.visitas > 0 ? 'text-metric-visits' : 'text-muted-foreground')}><MapPin className="h-3 w-3" />{d.visitas}</span>
        <span className={cn('flex items-center gap-1', d.ligacoes > 0 ? 'text-metric-calls' : 'text-muted-foreground')}><Phone className="h-3 w-3" />{d.ligacoes}</span>
        <span className={cn('flex items-center gap-1', d.unique_clients > 0 ? 'text-metric-clients' : 'text-muted-foreground')}><UsersIcon className="h-3 w-3" />{d.unique_clients}</span>
      </div>
    </button>
  );
};

const CAL_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HEAT_LEVELS = [0.12, 0.28, 0.48, 0.7, 0.95];
const heatLevel = (n: number, max: number) => (n <= 0 || max <= 0 ? -1 : Math.min(4, Math.floor(((n - 1) / max) * 5)));

const ProductivityCalendar: React.FC<{ days: WeeklyAgendaDay[]; onSelectDay: (iso: string) => void }> = ({ days, onSelectDay }) => {
  const max = days.reduce((m, d) => Math.max(m, d.total_activities), 0);
  const months = useMemo(() => {
    const map = new Map<string, WeeklyAgendaDay[]>();
    days.forEach((d) => { const k = d.day.slice(0, 7); if (!map.has(k)) map.set(k, []); map.get(k)!.push(d); });
    return [...map.entries()].map(([key, list]) => {
      const first = parseISO(list[0].day);
      const lead = (first.getDay() + 6) % 7;
      const cells: (WeeklyAgendaDay | null)[] = [...Array(lead).fill(null), ...list];
      while (cells.length % 7) cells.push(null);
      const label = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1), cells };
    });
  }, [days]);
  const todayISO = toISO(new Date());
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 p-3 pb-1 space-y-0">
        <CardTitle className="text-sm font-medium">Calendário de produtividade <span className="font-normal text-muted-foreground">— clique em um dia para ver o detalhamento</span></CardTitle>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-label="Legenda">
          <span>Menos</span>
          <span className="h-3 w-3 rounded-sm border bg-muted" />
          {HEAT_LEVELS.map((o) => <span key={o} className="h-3 w-3 rounded-sm" style={{ background: `hsl(var(--metric-activities) / ${o})` }} />)}
          <span>Mais</span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((m) => (
          <div key={m.key} className="min-w-0">
            <div className="mb-1.5 text-xs font-semibold text-foreground">{m.label}</div>
            <div className="grid grid-cols-7 gap-1">
              {CAL_WEEKDAYS.map((w) => <div key={w} className="text-center text-[10px] uppercase text-muted-foreground">{w}</div>)}
              {m.cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="aspect-square" />;
                const lvl = heatLevel(d.total_activities, max);
                const dark = lvl >= 3;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => onSelectDay(d.day)}
                    title={`${parseISO(d.day).toLocaleDateString('pt-BR')}: ${d.total_activities} atividade(s)`}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center rounded-md border text-[11px] leading-tight transition hover:ring-2 hover:ring-[hsl(var(--metric-activities)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      lvl < 0 && 'bg-muted/60 text-muted-foreground border-transparent',
                      lvl >= 0 && 'border-transparent',
                      d.day === todayISO && 'border-[hsl(var(--metric-activities))]',
                    )}
                    style={lvl >= 0 ? { background: `hsl(var(--metric-activities) / ${HEAT_LEVELS[lvl]})`, color: dark ? 'white' : 'hsl(var(--foreground))' } : undefined}
                  >
                    <span className="opacity-80">{parseISO(d.day).getDate()}</span>
                    <span className="font-semibold">{d.total_activities}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

type Bucket = 'realizadas' | 'programadas' | 'pendentes' | 'outras';
const bucketOf = (f: FollowupRow): Bucket => {
  if (f.followup_status === 'concluido') return 'realizadas';
  if (f.followup_status === 'pendente') return new Date(f.activity_date) > new Date() ? 'programadas' : 'pendentes';
  return 'outras';
};
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'programadas', label: 'Programadas' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'realizadas', label: 'Realizadas' },
  { key: 'outras', label: 'Reagendadas / canceladas' },
];

const timeOf = (iso: string) => {
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const DayView: React.FC<{
  dayISO: string;
  items: FollowupRow[];
  loading: boolean;
  nameById: Map<string, string>;
  onNavigate: (delta: number) => void;
  onBack: () => void;
  onOpenTask: (id: string) => void;
}> = ({ dayISO, items, loading, nameById, onNavigate, onBack, onOpenTask }) => {
  const date = parseISO(dayISO);
  const [bucket, setBucket] = useState<Bucket | 'all'>('all');

  const stats = useMemo(() => {
    const clients = new Set(items.map(clientKey).filter(Boolean));
    const byBucket: Record<Bucket, number> = { realizadas: 0, programadas: 0, pendentes: 0, outras: 0 };
    const bySeller = new Map<string, { total: number; visitas: number; ligacoes: number; realizadas: number; clientes: Set<string> }>();
    items.forEach((f) => {
      byBucket[bucketOf(f)]++;
      const s = bySeller.get(f.responsible_user_id) ?? { total: 0, visitas: 0, ligacoes: 0, realizadas: 0, clientes: new Set<string>() };
      s.total++;
      if (f.activity_type === 'visita') s.visitas++;
      if (f.activity_type === 'ligacao') s.ligacoes++;
      if (f.followup_status === 'concluido') s.realizadas++;
      const k = clientKey(f); if (k) s.clientes.add(k);
      bySeller.set(f.responsible_user_id, s);
    });
    return {
      total: items.length,
      visitas: items.filter((f) => f.activity_type === 'visita').length,
      ligacoes: items.filter((f) => f.activity_type === 'ligacao').length,
      clientes: clients.size,
      byBucket,
      sellers: [...bySeller.entries()].sort((a, b) => b[1].total - a[1].total),
    };
  }, [items]);

  const shown = bucket === 'all' ? items : items.filter((f) => bucketOf(f) === bucket);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Visão semanal</Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate(-1)} aria-label="Dia anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium">
            {WEEK_DAYS_FULL[date.getDay()]}, {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate(1)} aria-label="Próximo dia"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <KpiRow
        loading={loading}
        items={[
          { label: 'Atividades', value: stats.total, icon: Activity, tone: 'activities' as const },
          { label: 'Visitas', value: stats.visitas, icon: MapPin, tone: 'visits' as const },
          { label: 'Ligações', value: stats.ligacoes, icon: Phone, tone: 'calls' as const },
          { label: 'Clientes atendidos', value: stats.clientes, icon: UsersIcon, tone: 'clients' as const },
          { label: 'Programadas', value: stats.byBucket.programadas, icon: CalendarClock, tone: 'neutral' as const },
          { label: 'Pendentes', value: stats.byBucket.pendentes, icon: AlertCircle, tone: 'warning' as const },
          { label: 'Realizadas', value: stats.byBucket.realizadas, icon: CheckCircle2, tone: 'success' as const },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Produtividade por vendedor</CardTitle></CardHeader>
          <CardContent className="p-0">
            {stats.sellers.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Sem atividades.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">Vendedor</th>
                      <th className="px-2 py-2 text-right font-medium">Ativ.</th>
                      <th className="px-2 py-2 text-right font-medium">Vis.</th>
                      <th className="px-2 py-2 text-right font-medium">Lig.</th>
                      <th className="px-3 py-2 text-right font-medium">Cli.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.sellers.map(([id, s]) => (
                      <tr key={id} className="border-b last:border-0">
                        <td className="max-w-[140px] truncate px-3 py-1.5">{nameById.get(id) ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{s.total}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{s.visitas}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{s.ligacoes}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.clientes.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="space-y-2 p-3 pb-1">
            <CardTitle className="text-sm">Atividades do dia</CardTitle>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={bucket === 'all' ? 'secondary' : 'ghost'} className="h-7" onClick={() => setBucket('all')}>Todas ({stats.total})</Button>
              {BUCKETS.map((b) => (
                <Button key={b.key} size="sm" variant={bucket === b.key ? 'secondary' : 'ghost'} className="h-7" onClick={() => setBucket(b.key)}>
                  {b.label} ({stats.byBucket[b.key]})
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />)}</div>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma atividade neste filtro.</p>
            ) : (
              <ul className="divide-y">
                {shown.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={!f.task_id}
                      onClick={() => f.task_id && onOpenTask(f.task_id)}
                      title={f.task_id ? 'Abrir registro da atividade' : 'Sem atividade vinculada'}
                      className="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{timeOf(f.activity_date)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{f.client_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {nameById.get(f.responsible_user_id) ?? '—'}{f.notes ? ` · ${f.notes}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="hidden sm:inline-flex">{TYPE_LABEL[f.activity_type] ?? f.activity_type}</Badge>
                        <Badge variant={f.followup_status === 'concluido' ? 'default' : 'secondary'}>{STATUS_LABEL[f.followup_status] ?? f.followup_status}</Badge>
                        {f.task_id && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const DateField: React.FC<{ label: string; value?: Date; onChange: (d?: Date) => void }> = ({ label, value, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className={cn('w-[120px] justify-start font-normal', !value && 'text-muted-foreground')}>
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? fmt(value) : label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
    </PopoverContent>
  </Popover>
);
