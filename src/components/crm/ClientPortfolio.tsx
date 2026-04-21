import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertTriangle, CalendarClock, Clock, Flame, Search, Snowflake, Thermometer } from 'lucide-react';
import { useFollowups, FollowupRow, getClientKey } from '@/hooks/useFollowups';
import { cn } from '@/lib/utils';

type ClientAggregate = {
  key: string;
  client_name: string;
  client_code: string | null;
  lastContact: Date;
  lastActivityType: FollowupRow['activity_type'];
  daysSinceContact: number;
  nextReturn: Date | null;
  daysToReturn: number | null;
  lastStatus: FollowupRow['followup_status'];
  priority: FollowupRow['priority'];
  temperature: FollowupRow['client_temperature'];
  total: number;
};

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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'inactive' | 'hot'>('all');

  const aggregates = useMemo<ClientAggregate[]>(() => {
    const map = new Map<string, FollowupRow[]>();
    for (const f of data) {
      const k = getClientKey(f);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result: ClientAggregate[] = [];
    map.forEach((items, key) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()
      );
      const last = sorted[0];
      const lastContact = new Date(last.activity_date);
      const futureReturns = items
        .map((i) => i.next_return_date)
        .filter(Boolean)
        .map((d) => new Date(d as string))
        .sort((a, b) => a.getTime() - b.getTime());
      const nextReturn = futureReturns[0] ?? null;
      const daysToReturn = nextReturn
        ? Math.floor((startOfDay(nextReturn).getTime() - today.getTime()) / 86400000)
        : null;
      result.push({
        key,
        client_name: last.client_name,
        client_code: last.client_code,
        lastContact,
        lastActivityType: last.activity_type,
        daysSinceContact: Math.floor((now - lastContact.getTime()) / 86400000),
        nextReturn,
        daysToReturn,
        lastStatus: last.followup_status,
        priority: last.priority,
        temperature: last.client_temperature,
        total: items.length,
      });
    });
    return result.sort((a, b) => b.lastContact.getTime() - a.lastContact.getTime());
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aggregates.filter((a) => {
      if (q && !a.client_name.toLowerCase().includes(q) && !(a.client_code ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (filter === 'overdue') return a.daysToReturn !== null && a.daysToReturn < 0;
      if (filter === 'inactive') return a.daysSinceContact > 30;
      if (filter === 'hot') return a.temperature === 'quente';
      return true;
    });
  }, [aggregates, search, filter]);

  const stats = useMemo(() => ({
    total: aggregates.length,
    overdue: aggregates.filter((a) => a.daysToReturn !== null && a.daysToReturn < 0).length,
    inactive: aggregates.filter((a) => a.daysSinceContact > 30).length,
    hot: aggregates.filter((a) => a.temperature === 'quente').length,
  }), [aggregates]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Clientes" value={stats.total} active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatTile label="Retorno vencido" value={stats.overdue} tone="destructive" active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
        <StatTile label="Sem contato 30d+" value={stats.inactive} tone="warning" active={filter === 'inactive'} onClick={() => setFilter('inactive')} />
        <StatTile label="Quentes" value={stats.hot} tone="hot" active={filter === 'hot'} onClick={() => setFilter('hot')} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="overdue">Retorno vencido</SelectItem>
              <SelectItem value="inactive">Sem contato 30d+</SelectItem>
              <SelectItem value="hot">Temperatura quente</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} cliente(s)</span>
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const temp = tempStyle(c.temperature);
            const isOverdueReturn = c.daysToReturn !== null && c.daysToReturn < 0;
            const isInactive = c.daysSinceContact > 30;
            const highlight = isOverdueReturn || isInactive;
            return (
              <Card
                key={c.key}
                className={cn(
                  'transition-shadow hover:shadow-md',
                  highlight && 'border-destructive/40'
                )}
              >
                <CardContent className="space-y-3 p-4">
                  {/* Header */}
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

                  {/* Métricas */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Metric
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Último contato"
                      value={c.lastContact.toLocaleDateString('pt-BR')}
                      hint={`${c.daysSinceContact}d atrás`}
                      hintTone={isInactive ? 'destructive' : 'muted'}
                    />
                    <Metric
                      icon={<CalendarClock className="h-3.5 w-3.5" />}
                      label="Próximo retorno"
                      value={c.nextReturn ? c.nextReturn.toLocaleDateString('pt-BR') : '—'}
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
                    <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {isOverdueReturn ? 'Retorno vencido' : 'Cliente inativo (30+ dias)'}
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

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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
