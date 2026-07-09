import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TaskEditModal } from '@/components/TaskEditModal';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertTriangle, Building2, CalendarClock, CalendarIcon, ChevronLeft, ChevronRight,
  Clock, Flame, Search, Snowflake, Thermometer, User as UserIcon, X, ExternalLink,
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
  nextAction: string | null;
  daysOverdue: number;
  items: FollowupRow[];
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (d: Date) => d.toLocaleDateString('pt-BR');

const tempBadge = (t: FollowupRow['client_temperature']) => {
  if (t === 'quente') return { cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: <Flame className="h-3 w-3" />, label: 'Quente' };
  if (t === 'morno') return { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', icon: <Thermometer className="h-3 w-3" />, label: 'Morno' };
  if (t === 'frio') return { cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30', icon: <Snowflake className="h-3 w-3" />, label: 'Frio' };
  return { cls: 'bg-muted text-muted-foreground border-border', icon: null, label: 'n/d' };
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

const PAGE_SIZE_OPTIONS = [30, 50, 100, 200];

export const ClientPortfolio: React.FC = () => {
  const { data = [], isLoading } = useFollowups();
  const { consultants } = useFilteredConsultants();
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailClient, setDetailClient] = useState<ClientAggregate | null>(null);

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-options'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ============ Realtime: atualiza ao criar/atualizar/concluir/cancelar ============
  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['task_followups'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-agenda'] });
    };
    const ch = supabase
      .channel('portfolio-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_followups' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

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
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'inactive' | 'hot' | 'highPriority'>('overdue');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

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
      const latestWithReturnNotes = sorted.find((i) => !!i.return_notes) ?? null;

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
        nextAction: latestWithReturnNotes?.return_notes ?? null,
        daysOverdue: daysToReturn !== null && daysToReturn < 0 ? Math.abs(daysToReturn) : 0,
        items: sorted,
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
        if (temperature === 'none') { if (a.temperature) return false; }
        else if (a.temperature !== temperature) return false;
      }
      if (quickFilter === 'overdue') return a.daysToReturn !== null && a.daysToReturn < 0;
      if (quickFilter === 'inactive') return a.daysSinceContact > 30;
      if (quickFilter === 'hot') return a.temperature === 'quente';
      if (quickFilter === 'highPriority') return a.priority === 'alta';
      return true;
    }).sort((a, b) => {
      const priRank = (p: FollowupRow['priority']) => (p === 'alta' ? 3 : p === 'media' ? 2 : 1);
      const aOverdue = a.daysToReturn !== null && a.daysToReturn < 0 ? 1 : 0;
      const bOverdue = b.daysToReturn !== null && b.daysToReturn < 0 ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      if (aOverdue && bOverdue && a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
      if (priRank(b.priority) !== priRank(a.priority)) return priRank(b.priority) - priRank(a.priority);
      return b.daysSinceContact - a.daysSinceContact;
    });
  }, [aggregates, search, status, priority, temperature, quickFilter]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, seller, filial, status, priority, temperature, quickFilter, from, to, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const stats = useMemo(() => ({
    total: aggregates.length,
    overdue: aggregates.filter((a) => a.daysToReturn !== null && a.daysToReturn < 0).length,
    inactive: aggregates.filter((a) => a.daysSinceContact > 30).length,
    hot: aggregates.filter((a) => a.temperature === 'quente').length,
    highPriority: aggregates.filter((a) => a.priority === 'alta').length,
  }), [aggregates]);

  const clearFilters = () => {
    setSearch(''); setSeller('all'); setFilial('all'); setStatus('all');
    setPriority('all'); setTemperature('all'); setFrom(undefined); setTo(undefined);
    setQuickFilter('all');
  };
  const hasFilter =
    !!search || seller !== 'all' || filial !== 'all' || status !== 'all' ||
    priority !== 'all' || temperature !== 'all' || !!from || !!to || quickFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* KPIs / filtros rápidos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Todos" value={stats.total} active={quickFilter === 'all'} onClick={() => setQuickFilter('all')} />
        <StatTile label="Retorno vencido" value={stats.overdue} tone="destructive" active={quickFilter === 'overdue'} onClick={() => setQuickFilter('overdue')} />
        <StatTile label="Sem contato 30d+" value={stats.inactive} tone="warning" active={quickFilter === 'inactive'} onClick={() => setQuickFilter('inactive')} />
        <StatTile label="Quentes" value={stats.hot} tone="hot" active={quickFilter === 'hot'} onClick={() => setQuickFilter('hot')} />
        <StatTile label="Prioridade alta" value={stats.highPriority} tone="destructive" active={quickFilter === 'highPriority'} onClick={() => setQuickFilter('highPriority')} />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar nome ou código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Prio.</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-[100px]">Código</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Filial</TableHead>
                    <TableHead className="w-[130px]">Último contato</TableHead>
                    <TableHead className="w-[130px]">Próximo retorno</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[110px]">Tipo</TableHead>
                    <TableHead className="min-w-[180px]">Próxima ação</TableHead>
                    <TableHead className="w-[90px] text-right">Atraso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((c) => {
                    const isOverdueReturn = c.daysToReturn !== null && c.daysToReturn < 0;
                    const temp = tempBadge(c.temperature);
                    return (
                      <TableRow
                        key={c.key}
                        onClick={() => setDetailClient(c)}
                        className={cn(
                          'cursor-pointer',
                          isOverdueReturn && 'bg-destructive/5 hover:bg-destructive/10'
                        )}
                      >
                        <TableCell>
                          <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase', priorityStyle(c.priority))}>
                            {c.priority}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[220px]">{c.client_name}</span>
                            {c.temperature && (
                              <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase', temp.cls)}>
                                {temp.icon}{temp.label}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.client_code ?? '—'}</TableCell>
                        <TableCell className="text-sm">{consultantById.get(c.responsible_user_id) ?? '—'}</TableCell>
                        <TableCell className="text-sm">{c.filial_id ? (filialById.get(c.filial_id) ?? '—') : '—'}</TableCell>
                        <TableCell>
                          <div className="text-sm">{fmt(c.lastContact)}</div>
                          <div className={cn('text-[10px]', c.daysSinceContact > 30 ? 'text-destructive' : 'text-muted-foreground')}>
                            {c.daysSinceContact}d atrás
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.nextReturn ? (
                            <>
                              <div className="text-sm">{fmt(c.nextReturn)}</div>
                              <div className={cn('text-[10px]',
                                isOverdueReturn ? 'text-destructive font-medium' :
                                c.daysToReturn === 0 ? 'text-primary' : 'text-muted-foreground'
                              )}>
                                {c.daysToReturn === 0 ? 'hoje' : c.daysToReturn! < 0 ? `${Math.abs(c.daysToReturn!)}d vencido` : `em ${c.daysToReturn}d`}
                              </div>
                            </>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium uppercase', statusStyle(c.lastStatus))}>
                            {c.lastStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{c.lastActivityType}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <div className="truncate text-xs text-muted-foreground" title={c.nextAction ?? ''}>
                            {c.nextAction ?? '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {c.daysOverdue > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                              <AlertTriangle className="h-3 w-3" />{c.daysOverdue}d
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="text-xs text-muted-foreground">
            Exibindo {pageStart + 1}-{Math.min(pageStart + pageSize, filtered.length)} de {filtered.length} clientes
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Por página:</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs tabular-nums">{currentPage} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Painel lateral de detalhes */}
      <Sheet open={!!detailClient} onOpenChange={(o) => !o && setDetailClient(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailClient && (
            <>
              <SheetHeader>
                <SheetTitle>{detailClient.client_name}</SheetTitle>
                <SheetDescription>
                  {detailClient.client_code ? `Código: ${detailClient.client_code} · ` : ''}
                  {detailClient.total} atividade(s) registrada(s)
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <InfoBox icon={<UserIcon className="h-3 w-3" />} label="Vendedor" value={consultantById.get(detailClient.responsible_user_id) ?? '—'} />
                <InfoBox icon={<Building2 className="h-3 w-3" />} label="Filial" value={detailClient.filial_id ? (filialById.get(detailClient.filial_id) ?? '—') : '—'} />
                <InfoBox icon={<Clock className="h-3 w-3" />} label="Último contato" value={`${fmt(detailClient.lastContact)} (${detailClient.daysSinceContact}d)`} />
                <InfoBox icon={<CalendarClock className="h-3 w-3" />} label="Próximo retorno" value={detailClient.nextReturn ? `${fmt(detailClient.nextReturn)}` : '—'} />
              </div>

              {detailClient.nextAction && (
                <div className="mt-4 rounded-md border bg-muted/30 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Próxima ação</div>
                  <div className="text-sm">{detailClient.nextAction}</div>
                </div>
              )}

              {detailClient.latest_task_id && (
                <div className="mt-4">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedTaskId(detailClient.latest_task_id);
                      setDetailClient(null);
                    }}
                  >
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Abrir última atividade
                  </Button>
                </div>
              )}

              <div className="mt-6">
                <div className="text-sm font-semibold mb-2">Histórico</div>
                <div className="space-y-2">
                  {detailClient.items.map((it) => (
                    <div key={it.id} className="rounded-md border p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{it.activity_type}</Badge>
                          <span className={cn('rounded-md px-2 py-0.5 text-[9px] font-medium uppercase', statusStyle(it.followup_status))}>
                            {it.followup_status}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {fmt(new Date(it.activity_date))}
                        </div>
                      </div>
                      {it.return_notes && (
                        <div className="mt-1.5 text-muted-foreground">
                          <span className="font-medium text-foreground">Próxima ação: </span>{it.return_notes}
                        </div>
                      )}
                      {it.next_return_date && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Retorno em {fmt(new Date(it.next_return_date))}
                        </div>
                      )}
                      {it.notes && <div className="mt-1 text-muted-foreground italic">{it.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <TaskEditModal
        taskId={selectedTaskId}
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ['task_followups'] });
          queryClient.invalidateQueries({ queryKey: ['weekly-agenda'] });
        }}
      />
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

const InfoBox: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-md border bg-muted/30 p-2">
    <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">{icon}{label}</div>
    <div className="mt-0.5 text-sm font-medium truncate" title={value}>{value}</div>
  </div>
);

const DateField: React.FC<{ label: string; value?: Date; onChange: (d?: Date) => void }> = ({ label, value, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className={cn('w-full justify-start text-left font-normal sm:w-[140px]', !value && 'text-muted-foreground')}>
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? fmt(value) : label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
    </PopoverContent>
  </Popover>
);
