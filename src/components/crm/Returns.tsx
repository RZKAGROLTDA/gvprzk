import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertTriangle, CalendarClock, CalendarDays, CalendarIcon, X } from 'lucide-react';
import { useFollowups, FollowupRow } from '@/hooks/useFollowups';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

type Bucket = 'overdue' | 'today' | 'future';

const classify = (date: Date, today: Date): Bucket => {
  const d = startOfDay(date).getTime();
  const t = startOfDay(today).getTime();
  if (d < t) return 'overdue';
  if (d === t) return 'today';
  return 'future';
};

const fmt = (d: Date) => d.toLocaleDateString('pt-BR');

export const Returns: React.FC = () => {
  const { data = [], isLoading } = useFollowups();
  const { consultants } = useFilteredConsultants();

  // Filiais (para gerentes/admins; supervisores normalmente terão a sua via RLS)
  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-options'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const [seller, setSeller] = useState<string>('all');
  const [filial, setFilial] = useState<string>('all');
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();

  const filtered = useMemo(() => {
    return data.filter((f) => {
      if (!f.next_return_date) return false;
      if (f.followup_status === 'concluido' || f.followup_status === 'cancelado') return false;
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      if (filial !== 'all' && f.filial_id !== filial) return false;
      const d = startOfDay(new Date(f.next_return_date)).getTime();
      if (from && d < startOfDay(from).getTime()) return false;
      if (to && d > startOfDay(to).getTime()) return false;
      return true;
    });
  }, [data, seller, filial, from, to]);

  const { overdue, today, future } = useMemo(() => {
    const now = new Date();
    const groups: Record<Bucket, FollowupRow[]> = { overdue: [], today: [], future: [] };
    for (const f of filtered) {
      const bucket = classify(new Date(f.next_return_date!), now);
      groups[bucket].push(f);
    }
    const sortAsc = (a: FollowupRow, b: FollowupRow) =>
      new Date(a.next_return_date!).getTime() - new Date(b.next_return_date!).getTime();
    groups.overdue.sort(sortAsc);
    groups.today.sort(sortAsc);
    groups.future.sort(sortAsc);
    return groups;
  }, [filtered]);

  const clearFilters = () => {
    setSeller('all');
    setFilial('all');
    setFrom(undefined);
    setTo(undefined);
  };
  const hasFilter = seller !== 'all' || filial !== 'all' || !!from || !!to;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
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

          <DateField label="De" value={from} onChange={setFrom} />
          <DateField label="Até" value={to} onChange={setTo} />

          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-4">
          <Section
            title="Vencidos"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="destructive"
            items={overdue}
            emptyText="Nenhum retorno vencido."
          />
          <Section
            title="Hoje"
            icon={<CalendarClock className="h-4 w-4" />}
            tone="primary"
            items={today}
            emptyText="Nenhum retorno para hoje."
          />
          <Section
            title="Próximos dias"
            icon={<CalendarDays className="h-4 w-4" />}
            tone="muted"
            items={future}
            emptyText="Nenhum retorno futuro agendado."
          />
        </div>
      )}
    </div>
  );
};

const DateField: React.FC<{ label: string; value?: Date; onChange: (d?: Date) => void }> = ({ label, value, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className={cn('w-full justify-start text-left font-normal sm:w-[160px]', !value && 'text-muted-foreground')}>
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? fmt(value) : label}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
    </PopoverContent>
  </Popover>
);

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  tone: 'destructive' | 'primary' | 'muted';
  items: FollowupRow[];
  emptyText: string;
}> = ({ title, icon, tone, items, emptyText }) => {
  const headerCls = {
    destructive: 'text-destructive',
    primary: 'text-primary',
    muted: 'text-muted-foreground',
  }[tone];
  const badgeVariant = tone === 'destructive' ? 'destructive' : tone === 'primary' ? 'default' : 'outline';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={cn('flex items-center gap-2 text-base', headerCls)}>
          {icon}
          {title}
          <Badge variant={badgeVariant as 'default' | 'destructive' | 'outline'} className="ml-auto">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Retorno</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="font-medium">{f.client_name}</div>
                    {f.client_code && <div className="text-xs text-muted-foreground">{f.client_code}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {f.next_return_date && fmt(new Date(f.next_return_date))}
                  </TableCell>
                  <TableCell><Badge variant="outline">{f.activity_type}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{f.priority}</Badge></TableCell>
                  <TableCell><Badge>{f.followup_status}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {f.return_notes ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
