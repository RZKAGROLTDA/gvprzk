import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFollowups, FollowupRow } from '@/hooks/useFollowups';
import { AlertTriangle, CalendarClock, CalendarDays } from 'lucide-react';

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

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: FollowupRow[];
  emptyText: string;
  badgeVariant?: 'default' | 'destructive' | 'secondary' | 'outline';
}> = ({ title, icon, items, emptyText, badgeVariant = 'outline' }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base flex items-center gap-2">
        {icon}
        {title}
        <Badge variant={badgeVariant} className="ml-auto">{items.length}</Badge>
      </CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">{emptyText}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Tipo</TableHead>
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
                  {f.next_return_date && new Date(f.next_return_date).toLocaleDateString('pt-BR')}
                </TableCell>
                <TableCell><Badge variant="outline">{f.activity_type}</Badge></TableCell>
                <TableCell><Badge>{f.followup_status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
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

export const Returns: React.FC = () => {
  const { data = [], isLoading } = useFollowups();

  const { overdue, today, future } = useMemo(() => {
    const now = new Date();
    const groups: Record<Bucket, FollowupRow[]> = { overdue: [], today: [], future: [] };
    for (const f of data) {
      if (!f.next_return_date) continue;
      if (f.followup_status === 'concluido' || f.followup_status === 'cancelado') continue;
      const bucket = classify(new Date(f.next_return_date), now);
      groups[bucket].push(f);
    }
    const sortAsc = (a: FollowupRow, b: FollowupRow) =>
      new Date(a.next_return_date!).getTime() - new Date(b.next_return_date!).getTime();
    groups.overdue.sort(sortAsc);
    groups.today.sort(sortAsc);
    groups.future.sort(sortAsc);
    return groups;
  }, [data]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <Section
        title="Vencidos"
        icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        items={overdue}
        emptyText="Nenhum retorno vencido."
        badgeVariant="destructive"
      />
      <Section
        title="Hoje"
        icon={<CalendarClock className="h-4 w-4 text-primary" />}
        items={today}
        emptyText="Nenhum retorno para hoje."
      />
      <Section
        title="Futuros"
        icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
        items={future}
        emptyText="Nenhum retorno futuro agendado."
      />
    </div>
  );
};
