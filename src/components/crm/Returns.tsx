import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, Building2, CalendarCheck, CalendarClock, CalendarDays, CalendarIcon,
  CheckCircle2, Flame, History, Search, Snowflake, Thermometer, User as UserIcon, X, XCircle,
} from 'lucide-react';
import { useFollowups, FollowupRow } from '@/hooks/useFollowups';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
const daysDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);

type Bucket = 'overdue' | 'today' | 'future' | 'concluido' | 'cancelado';

const tempStyle = (t: FollowupRow['client_temperature']) => {
  if (t === 'quente') return { cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: <Flame className="h-3 w-3" /> };
  if (t === 'morno') return { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', icon: <Thermometer className="h-3 w-3" /> };
  if (t === 'frio') return { cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30', icon: <Snowflake className="h-3 w-3" /> };
  return null;
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
  if (s === 'cancelado') return 'bg-muted text-muted-foreground';
  return 'bg-muted text-muted-foreground';
};

export const Returns: React.FC = () => {
  const { data = [], isLoading } = useFollowups();
  const { consultants } = useFilteredConsultants();
  const qc = useQueryClient();

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
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [statusF, setStatusF] = useState<string>('all');
  const [priorityF, setPriorityF] = useState<string>('all');
  const [tempF, setTempF] = useState<string>('all');

  // Ações state
  const [historyClient, setHistoryClient] = useState<{ name: string; code: string | null } | null>(null);
  const [rescheduleRow, setRescheduleRow] = useState<FollowupRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>();
  const [rescheduleNotes, setRescheduleNotes] = useState('');

  // Mutations
  const completeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('task_followups')
        .update({ followup_status: 'concluido' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Retorno concluído' });
      qc.invalidateQueries({ queryKey: ['task_followups'] });
    },
    onError: (e: Error) => toast({ title: 'Erro ao concluir', description: e.message, variant: 'destructive' }),
  });

  const rescheduleMut = useMutation({
    mutationFn: async (payload: { id: string; date: string; notes: string | null }) => {
      const { error } = await supabase
        .from('task_followups')
        .update({
          next_return_date: payload.date,
          followup_status: 'reagendado',
          return_notes: payload.notes,
        })
        .eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Retorno reagendado' });
      qc.invalidateQueries({ queryKey: ['task_followups'] });
      setRescheduleRow(null);
      setRescheduleDate(undefined);
      setRescheduleNotes('');
    },
    onError: (e: Error) => toast({ title: 'Erro ao reagendar', description: e.message, variant: 'destructive' }),
  });

  // Aplicar filtros
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.filter((f) => {
      if (s) {
        const hay = `${f.client_name} ${f.client_code ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      if (filial !== 'all' && f.filial_id !== filial) return false;
      if (statusF !== 'all' && f.followup_status !== statusF) return false;
      if (priorityF !== 'all' && f.priority !== priorityF) return false;
      if (tempF !== 'all' && (f.client_temperature ?? '') !== tempF) return false;
      // período: aplicado sobre next_return_date quando existir, senão activity_date
      const ref = f.next_return_date ? new Date(f.next_return_date) : new Date(f.activity_date);
      const t = startOfDay(ref).getTime();
      if (from && t < startOfDay(from).getTime()) return false;
      if (to && t > startOfDay(to).getTime()) return false;
      return true;
    });
  }, [data, search, seller, filial, statusF, priorityF, tempF, from, to]);

  const buckets = useMemo(() => {
    const today = new Date();
    const groups: Record<Bucket, FollowupRow[]> = {
      overdue: [], today: [], future: [], concluido: [], cancelado: [],
    };
    for (const f of filtered) {
      if (f.followup_status === 'concluido') { groups.concluido.push(f); continue; }
      if (f.followup_status === 'cancelado') { groups.cancelado.push(f); continue; }
      if (!f.next_return_date) continue; // pendentes sem data não entram nos blocos de tempo
      const d = startOfDay(new Date(f.next_return_date)).getTime();
      const t = startOfDay(today).getTime();
      if (d < t) groups.overdue.push(f);
      else if (d === t) groups.today.push(f);
      else groups.future.push(f);
    }
    const sortAsc = (a: FollowupRow, b: FollowupRow) =>
      new Date(a.next_return_date ?? a.activity_date).getTime() - new Date(b.next_return_date ?? b.activity_date).getTime();
    const sortDesc = (a: FollowupRow, b: FollowupRow) =>
      new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime();
    groups.overdue.sort(sortAsc);
    groups.today.sort(sortAsc);
    groups.future.sort(sortAsc);
    groups.concluido.sort(sortDesc);
    groups.cancelado.sort(sortDesc);
    return groups;
  }, [filtered]);

  const clearFilters = () => {
    setSearch(''); setSeller('all'); setFilial('all');
    setFrom(undefined); setTo(undefined);
    setStatusF('all'); setPriorityF('all'); setTempF('all');
  };
  const hasFilter = !!search || seller !== 'all' || filial !== 'all' || !!from || !!to
    || statusF !== 'all' || priorityF !== 'all' || tempF !== 'all';

  const handleComplete = (id: string) => completeMut.mutate(id);
  const openReschedule = (row: FollowupRow) => {
    setRescheduleRow(row);
    setRescheduleDate(row.next_return_date ? new Date(row.next_return_date) : new Date());
    setRescheduleNotes(row.return_notes ?? '');
  };
  const confirmReschedule = () => {
    if (!rescheduleRow || !rescheduleDate) return;
    const iso = rescheduleDate.toISOString().split('T')[0];
    rescheduleMut.mutate({ id: rescheduleRow.id, date: iso, notes: rescheduleNotes.trim() || null });
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou código..." className="pl-8" />
          </div>

          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filial} onValueChange={setFilial}>
            <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas filiais</SelectItem>
              {filiais.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="reagendado">Reagendado</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityF} onValueChange={setPriorityF}>
            <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>

          <Select value={tempF} onValueChange={setTempF}>
            <SelectTrigger><SelectValue placeholder="Temperatura" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas temperaturas</SelectItem>
              <SelectItem value="quente">Quente</SelectItem>
              <SelectItem value="morno">Morno</SelectItem>
              <SelectItem value="frio">Frio</SelectItem>
            </SelectContent>
          </Select>

          <DateField label="De" value={from} onChange={setFrom} />
          <DateField label="Até" value={to} onChange={setTo} />

          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="lg:col-start-4">
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
          )}
          <p className="col-span-full text-[11px] text-muted-foreground">
            O período filtra pela data do retorno (ou pelo último contato, quando não há retorno agendado).
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Section
            title="Vencidos" tone="destructive" icon={<AlertTriangle className="h-4 w-4" />}
            items={buckets.overdue} emptyText="Nenhum retorno vencido."
            consultantById={consultantById} filialById={filialById}
            onComplete={handleComplete} onReschedule={openReschedule} onHistory={setHistoryClient}
          />
          <Section
            title="Hoje" tone="primary" icon={<CalendarClock className="h-4 w-4" />}
            items={buckets.today} emptyText="Nenhum retorno para hoje."
            consultantById={consultantById} filialById={filialById}
            onComplete={handleComplete} onReschedule={openReschedule} onHistory={setHistoryClient}
          />
          <Section
            title="Próximos dias" tone="muted" icon={<CalendarDays className="h-4 w-4" />}
            items={buckets.future} emptyText="Nenhum retorno futuro agendado."
            consultantById={consultantById} filialById={filialById}
            onComplete={handleComplete} onReschedule={openReschedule} onHistory={setHistoryClient}
          />
          <Section
            title="Concluídos" tone="success" icon={<CheckCircle2 className="h-4 w-4" />}
            items={buckets.concluido} emptyText="Nenhum retorno concluído no período."
            consultantById={consultantById} filialById={filialById}
            onComplete={handleComplete} onReschedule={openReschedule} onHistory={setHistoryClient}
            collapsedDefault
          />
          <Section
            title="Cancelados" tone="muted" icon={<XCircle className="h-4 w-4" />}
            items={buckets.cancelado} emptyText="Nenhum retorno cancelado no período."
            consultantById={consultantById} filialById={filialById}
            onComplete={handleComplete} onReschedule={openReschedule} onHistory={setHistoryClient}
            collapsedDefault
          />
        </div>
      )}

      {/* Histórico do cliente */}
      <Sheet open={!!historyClient} onOpenChange={(open) => !open && setHistoryClient(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico do cliente</SheetTitle>
            <SheetDescription>
              {historyClient?.name}
              {historyClient?.code && <span className="text-muted-foreground"> · {historyClient.code}</span>}
            </SheetDescription>
          </SheetHeader>
          {historyClient && (
            <ClientHistory client={historyClient} all={data} consultantById={consultantById} />
          )}
        </SheetContent>
      </Sheet>

      {/* Reagendamento */}
      <Dialog open={!!rescheduleRow} onOpenChange={(open) => !open && setRescheduleRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar retorno</DialogTitle>
          </DialogHeader>
          {rescheduleRow && (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">{rescheduleRow.client_name}</span>
                {rescheduleRow.client_code && (
                  <span className="text-muted-foreground"> · {rescheduleRow.client_code}</span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Nova data de retorno</Label>
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={setRescheduleDate}
                  className={cn('rounded-md border p-3 pointer-events-auto')}
                />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  placeholder="Motivo do reagendamento, próximos passos..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleRow(null)}>Cancelar</Button>
            <Button onClick={confirmReschedule} disabled={!rescheduleDate || rescheduleMut.isPending}>
              <CalendarCheck className="mr-1 h-4 w-4" /> Reagendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DateField: React.FC<{ label: string; value?: Date; onChange: (d?: Date) => void }> = ({ label, value, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className={cn('justify-start text-left font-normal', !value && 'text-muted-foreground')}>
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? fmt(value) : label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
    </PopoverContent>
  </Popover>
);

type SectionProps = {
  title: string;
  tone: 'destructive' | 'primary' | 'muted' | 'success';
  icon: React.ReactNode;
  items: FollowupRow[];
  emptyText: string;
  consultantById: Map<string, string>;
  filialById: Map<string, string>;
  onComplete: (id: string) => void;
  onReschedule: (row: FollowupRow) => void;
  onHistory: (c: { name: string; code: string | null }) => void;
  collapsedDefault?: boolean;
};

const Section: React.FC<SectionProps> = ({
  title, tone, icon, items, emptyText,
  consultantById, filialById, onComplete, onReschedule, onHistory, collapsedDefault,
}) => {
  const [open, setOpen] = useState(!collapsedDefault);
  const headerCls = {
    destructive: 'text-destructive',
    primary: 'text-primary',
    muted: 'text-muted-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
  }[tone];
  const badgeVariant = tone === 'destructive' ? 'destructive' : tone === 'primary' ? 'default' : 'outline';

  return (
    <Card>
      <CardHeader className="cursor-pointer pb-2" onClick={() => setOpen((v) => !v)}>
        <CardTitle className={cn('flex items-center gap-2 text-base', headerCls)}>
          {icon}
          {title}
          <Badge variant={badgeVariant as 'default' | 'destructive' | 'outline'} className="ml-auto">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2 p-3 pt-0">
          {items.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            items.map((f) => (
              <ReturnCard
                key={f.id}
                row={f}
                consultantById={consultantById}
                filialById={filialById}
                onComplete={onComplete}
                onReschedule={onReschedule}
                onHistory={onHistory}
              />
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
};

const ReturnCard: React.FC<{
  row: FollowupRow;
  consultantById: Map<string, string>;
  filialById: Map<string, string>;
  onComplete: (id: string) => void;
  onReschedule: (row: FollowupRow) => void;
  onHistory: (c: { name: string; code: string | null }) => void;
}> = ({ row, consultantById, filialById, onComplete, onReschedule, onHistory }) => {
  const today = new Date();
  const nextDate = row.next_return_date ? new Date(row.next_return_date) : null;
  const diff = nextDate ? daysDiff(nextDate, today) : null;
  const isOverdue = diff !== null && diff < 0 && row.followup_status !== 'concluido' && row.followup_status !== 'cancelado';
  const isToday = diff === 0 && row.followup_status !== 'concluido' && row.followup_status !== 'cancelado';
  const dueLabel =
    diff === null ? '—'
      : diff < 0 ? `Vencido há ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'dia' : 'dias'}`
      : diff === 0 ? 'Vence hoje'
      : `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`;

  const temp = tempStyle(row.client_temperature);
  const isClosed = row.followup_status === 'concluido' || row.followup_status === 'cancelado';

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors',
        isOverdue && 'border-destructive/40 bg-destructive/5',
        isToday && 'border-primary/40 bg-primary/5',
        row.client_temperature === 'quente' && !isClosed && 'ring-1 ring-destructive/20',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate font-medium">{row.client_name}</h4>
            {row.client_code && (
              <span className="text-xs text-muted-foreground">#{row.client_code}</span>
            )}
            {temp && (
              <Badge variant="outline" className={cn('gap-1 text-[10px]', temp.cls)}>
                {temp.icon}{row.client_temperature}
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-[10px]', priorityStyle(row.priority))}>
              {row.priority}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px]', statusStyle(row.followup_status))}>
              {row.followup_status}
            </Badge>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              {consultantById.get(row.responsible_user_id) ?? 'Vendedor'}
            </span>
            {row.filial_id && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {filialById.get(row.filial_id) ?? 'Filial'}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              Último: {fmt(new Date(row.activity_date))} ({row.activity_type})
            </span>
            {nextDate && (
              <span className={cn(
                'inline-flex items-center gap-1 font-medium',
                isOverdue && 'text-destructive',
                isToday && 'text-primary',
              )}>
                <CalendarDays className="h-3 w-3" />
                Retorno: {fmt(nextDate)} · {dueLabel}
              </span>
            )}
          </div>

          {row.return_notes && (
            <p className="mt-2 line-clamp-2 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
              {row.return_notes}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-1">
          <Button
            size="sm" variant="outline"
            onClick={() => onHistory({ name: row.client_name, code: row.client_code })}
          >
            <History className="mr-1 h-3 w-3" /> Histórico
          </Button>
          {!isClosed && (
            <>
              <Button size="sm" variant="outline" onClick={() => onReschedule(row)}>
                <CalendarCheck className="mr-1 h-3 w-3" /> Reagendar
              </Button>
              <Button size="sm" onClick={() => onComplete(row.id)}>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Concluir
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ClientHistory: React.FC<{
  client: { name: string; code: string | null };
  all: FollowupRow[];
  consultantById: Map<string, string>;
}> = ({ client, all, consultantById }) => {
  const items = useMemo(() => {
    const code = (client.code ?? '').trim().toLowerCase();
    const name = client.name.trim().toLowerCase();
    return all
      .filter((f) => {
        const fc = (f.client_code ?? '').trim().toLowerCase();
        if (code && fc) return fc === code;
        return f.client_name.trim().toLowerCase() === name;
      })
      .sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime());
  }, [all, client]);

  if (items.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">Sem histórico encontrado.</p>;
  }
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-muted-foreground">{items.length} interações registradas</p>
      {items.map((f) => (
        <div key={f.id} className="rounded-md border p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{f.activity_type}</Badge>
            <Badge variant="outline" className={cn('text-[10px]', statusStyle(f.followup_status))}>
              {f.followup_status}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">{fmt(new Date(f.activity_date))}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span>Resp.: {consultantById.get(f.responsible_user_id) ?? '—'}</span>
            {f.next_return_date && <span> · Retorno: {fmt(new Date(f.next_return_date))}</span>}
          </div>
          {(f.notes || f.return_notes) && (
            <p className="mt-1 text-xs">{f.return_notes ?? f.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
};
