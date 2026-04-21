import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TaskEditModal } from '@/components/TaskEditModal';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  AlertTriangle, Building2, CalendarClock, CalendarIcon, Clock, Flame, Search,
  Snowflake, Thermometer, User as UserIcon, X,
} from 'lucide-react';
import { useFollowups, FollowupRow, getClientKey } from '@/hooks/useFollowups';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type ClientAggregate = {
  key: string;
  client_name: string;
  client_code: string | null;
  responsible_user_id: string;
  filial_id: string | null;
  lastContact: Date;
  lastActivityType: FollowupRow['activity_type'];
  daysSinceContact: number;
  nextReturn: Date | null;
  daysToReturn: number | null;
  lastStatus: FollowupRow['followup_status'];
  priority: FollowupRow['priority'];
  temperature: FollowupRow['client_temperature'];
  total: number;
  latest_task_id: string | null;
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (d: Date) => d.toLocaleDateString('pt-BR');

const tempStyle = (t: FollowupRow['client_temperature']) => {
  if (t === 'quente') return { cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: <Flame className="h-3 w-3" /> };
  if (t === 'morno') return { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', icon: <Thermometer className="h-3 w-3" /> };
  if (t === 'frio') return { cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30', icon: <Snowflake className="h-3 w-3" /> };
  return { cls: 'bg-muted text-muted-foreground border-border', icon: null };
};

const priorityStyle = (p: FollowupRow['priority']) => {
  if (p === 'alta') return 'bg-destructive/15 text-destructive border-destructive/30';
  if (p === 'media') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const statusStyle = (s: FollowupRow['followup_status']) => {
  if (s === 'pendente') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  if (s === 'concluido') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (s === 'reagendado') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  return 'bg-muted text-muted-foreground';
};

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export const ClientPortfolio: React.FC = () => {
  const { data = [], isLoading } = useFollowups();
  const { consultants } = useFilteredConsultants();
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-options'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const consultantById = useMemo(() => {
    const m = new Map<string, string>();
    consultants.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [consultants]);
  const filialById = useMemo(() => {
    const m = new Map<string, string>();
    filiais.forEach((f) => m.set(f.id, f.nome));
    return m;
  }, [filiais]);

  // Filtros
  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState<string>('all');
  const [filial, setFilial] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [priority, setPriority] = useState<string>('all');
  const [temperature, setTemperature] = useState<string>('all');
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'inactive' | 'hot' | 'highPriority'>('all');

  // Aplica filtros básicos no nível das atividades antes de agregar
  const filteredFollowups = useMemo(() => {
    return data.filter((f) => {
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      if (filial !== 'all' && f.filial_id !== filial) return false;
      if (from || to) {
        const ad = startOfDay(new Date(f.activity_date)).getTime();
        if (from && ad < startOfDay(from).getTime()) return false;
        if (to && ad > startOfDay(to).getTime()) return false;
      }
      return true;
    });
  }, [data, seller, filial, from, to]);

  const aggregates = useMemo<ClientAggregate[]>(() => {
    const map = new Map<string, FollowupRow[]>();
    for (const f of filteredFollowups) {
      const k = getClientKey(f);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    const now = Date.now();
    const today = startOfDay(new Date()).getTime();
    const result: ClientAggregate[] = [];
    map.forEach((items, key) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()
      );
      const last = sorted[0];
      const lastContact = new Date(last.activity_date);

      // Próximo retorno (>= hoje); senão o mais recente vencido
      const allReturns = items
        .map((i) => i.next_return_date)
        .filter(Boolean)
        .map((d) => new Date(d as string));
      const futureReturns = allReturns
        .filter((d) => startOfDay(d).getTime() >= today)
        .sort((a, b) => a.getTime() - b.getTime());
      const overdueReturns = allReturns
        .filter((d) => startOfDay(d).getTime() < today)
        .sort((a, b) => b.getTime() - a.getTime());
      const nextReturn = futureReturns[0] ?? overdueReturns[0] ?? null;
      const daysToReturn = nextReturn
        ? Math.floor((startOfDay(nextReturn).getTime() - today) / 86400000)
        : null;

      const latestWithTask = sorted.find((i) => !!i.task_id) ?? null;

      result.push({
        key,
        client_name: last.client_name,
        client_code: last.client_code,
        responsible_user_id: last.responsible_user_id,
        filial_id: last.filial_id,
        lastContact,
        lastActivityType: last.activity_type,
        daysSinceContact: Math.floor((now - lastContact.getTime()) / 86400000),
        nextReturn,
        daysToReturn,
        lastStatus: last.followup_status,
        priority: last.priority,
        temperature: last.client_temperature,
        total: items.length,
        latest_task_id: latestWithTask?.task_id ?? null,
      });
    });
    return result;
  }, [filteredFollowups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aggregates.filter((a) => {
      if (q && !a.client_name.toLowerCase().includes(q) && !(a.client_code ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (status !== 'all' && a.lastStatus !== status) return false;
      if (priority !== 'all' && a.priority !== priority) return false;
      if (temperature !== 'all') {
        if (temperature === 'none') {
          if (a.temperature) return false;
        } else if (a.temperature !== temperature) return false;
      }
      if (quickFilter === 'overdue') return a.daysToReturn !== null && a.daysToReturn < 0;
      if (quickFilter === 'inactive') return a.daysSinceContact > 30;
      if (quickFilter === 'hot') return a.temperature === 'quente';
      if (quickFilter === 'highPriority') return a.priority === 'alta';
      return true;
    }).sort((a, b) => {
      // Prioriza vencidos, depois quentes/alta prioridade, depois mais inativos
      const aOverdue = a.daysToReturn !== null && a.daysToReturn < 0 ? 1 : 0;
      const bOverdue = b.daysToReturn !== null && b.daysToReturn < 0 ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      const aHot = (a.temperature === 'quente' || a.priority === 'alta') ? 1 : 0;
      const bHot = (b.temperature === 'quente' || b.priority === 'alta') ? 1 : 0;
      if (aHot !== bHot) return bHot - aHot;
      return b.daysSinceContact - a.daysSinceContact;
    });
  }, [aggregates, search, status, priority, temperature, quickFilter]);

  const stats = useMemo(() => ({
    total: aggregates.length,
    overdue: aggregates.filter((a) => a.daysToReturn !== null && a.daysToReturn < 0).length,
    inactive: aggregates.filter((a) => a.daysSinceContact > 30).length,
    hot: aggregates.filter((a) => a.temperature === 'quente').length,
    highPriority: aggregates.filter((a) => a.priority === 'alta').length,
  }), [aggregates]);

  const clearFilters = () => {
    setSearch('');
    setSeller('all');
    setFilial('all');
    setStatus('all');
    setPriority('all');
    setTemperature('all');
    setFrom(undefined);
    setTo(undefined);
    setQuickFilter('all');
  };
  const hasFilter =
    !!search || seller !== 'all' || filial !== 'all' || status !== 'all' ||
    priority !== 'all' || temperature !== 'all' || !!from || !!to || quickFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* Quick stats / filtros rápidos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Clientes" value={stats.total} active={quickFilter === 'all'} onClick={() => setQuickFilter('all')} />
        <StatTile label="Retorno vencido" value={stats.overdue} tone="destructive" active={quickFilter === 'overdue'} onClick={() => setQuickFilter('overdue')} />
        <StatTile label="Sem contato 30d+" value={stats.inactive} tone="warning" active={quickFilter === 'inactive'} onClick={() => setQuickFilter('inactive')} />
        <StatTile label="Quentes" value={stats.hot} tone="hot" active={quickFilter === 'hot'} onClick={() => setQuickFilter('hot')} />
        <StatTile label="Prioridade alta" value={stats.highPriority} tone="destructive" active={quickFilter === 'highPriority'} onClick={() => setQuickFilter('highPriority')} />
      </div>

      {/* Filtros avançados */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {consultants.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>

          <Select value={filial} onValueChange={setFilial}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Filial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
              {filiais.map((f) => (<SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="reagendado">Reagendado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>

          <Select value={temperature} onValueChange={setTemperature}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Temperatura" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas temperaturas</SelectItem>
              <SelectItem value="quente">Quente</SelectItem>
              <SelectItem value="morno">Morno</SelectItem>
              <SelectItem value="frio">Frio</SelectItem>
              <SelectItem value="none">Sem definição</SelectItem>
            </SelectContent>
          </Select>

          <DateField label="De" value={from} onChange={setFrom} />
          <DateField label="Até" value={to} onChange={setTo} />

          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="lg:ml-auto">
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {filtered.length} cliente(s)
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const temp = tempStyle(c.temperature);
            const isOverdueReturn = c.daysToReturn !== null && c.daysToReturn < 0;
            const isInactive = c.daysSinceContact > 30;
            const isHot = c.temperature === 'quente';
            const isHighPriority = c.priority === 'alta';
            const highlight = isOverdueReturn || isInactive || isHot || isHighPriority;
            const sellerName = consultantById.get(c.responsible_user_id) ?? '—';
            const filialName = c.filial_id ? (filialById.get(c.filial_id) ?? '—') : '—';
            return (
              <Card
                key={c.key}
                className={cn(
                  'transition-shadow hover:shadow-md',
                  isOverdueReturn && 'border-destructive/50',
                  !isOverdueReturn && (isHot || isHighPriority) && 'border-amber-500/50',
                  !isOverdueReturn && !isHot && !isHighPriority && isInactive && 'border-sky-500/40'
                )}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {initials(c.client_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.client_name}</div>
                      {c.client_code && (
                        <div className="truncate text-xs text-muted-foreground">Cód: {c.client_code}</div>
                      )}
                    </div>
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase', temp.cls)}>
                      {temp.icon}
                      {c.temperature ?? 'n/d'}
                    </span>
                  </div>

                  {/* Responsável + filial */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> {sellerName}</span>
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {filialName}</span>
                  </div>

                  {/* Métricas */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Metric
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Último contato"
                      value={fmt(c.lastContact)}
                      hint={`${c.daysSinceContact}d atrás`}
                      hintTone={isInactive ? 'destructive' : 'muted'}
                    />
                    <Metric
                      icon={<CalendarClock className="h-3.5 w-3.5" />}
                      label="Próximo retorno"
                      value={c.nextReturn ? fmt(c.nextReturn) : '—'}
                      hint={
                        c.daysToReturn === null
                          ? 'sem retorno'
                          : c.daysToReturn < 0
                            ? `${Math.abs(c.daysToReturn)}d vencido`
                            : c.daysToReturn === 0
                              ? 'hoje'
                              : `em ${c.daysToReturn}d`
                      }
                      hintTone={isOverdueReturn ? 'destructive' : c.daysToReturn === 0 ? 'primary' : 'muted'}
                    />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase', priorityStyle(c.priority))}>
                      Prio: {c.priority}
                    </span>
                    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium uppercase', statusStyle(c.lastStatus))}>
                      {c.lastStatus}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {c.lastActivityType}
                    </Badge>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {c.total} ativ.
                    </span>
                  </div>

                  {highlight && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
                        isOverdueReturn
                          ? 'border-destructive/30 bg-destructive/5 text-destructive'
                          : isHot || isHighPriority
                            ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                            : 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300'
                      )}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {isOverdueReturn
                        ? 'Retorno vencido'
                        : isHot
                          ? 'Cliente quente — priorizar contato'
                          : isHighPriority
                            ? 'Prioridade alta'
                            : 'Cliente inativo (30+ dias)'}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StatTile: React.FC<{
  label: string;
  value: number;
  tone?: 'default' | 'destructive' | 'warning' | 'hot';
  active?: boolean;
  onClick?: () => void;
}> = ({ label, value, tone = 'default', active, onClick }) => {
  const toneCls = {
    default: 'text-foreground',
    destructive: 'text-destructive',
    warning: 'text-amber-600 dark:text-amber-400',
    hot: 'text-destructive',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-3 text-left transition-all hover:shadow-sm',
        active && 'ring-2 ring-primary/40 border-primary/40'
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold', toneCls)}>{value}</div>
    </button>
  );
};

const Metric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  hintTone?: 'muted' | 'destructive' | 'primary';
}> = ({ icon, label, value, hint, hintTone = 'muted' }) => {
  const hintCls = {
    muted: 'text-muted-foreground',
    destructive: 'text-destructive',
    primary: 'text-primary',
  }[hintTone];
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
      {hint && <div className={cn('text-[10px]', hintCls)}>{hint}</div>}
    </div>
  );
};

const DateField: React.FC<{ label: string; value?: Date; onChange: (d?: Date) => void }> = ({ label, value, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        className={cn('w-full justify-start text-left font-normal sm:w-[140px]', !value && 'text-muted-foreground')}
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
