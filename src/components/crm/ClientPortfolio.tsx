import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFollowups, FollowupRow, getClientKey } from '@/hooks/useFollowups';

type ClientAggregate = {
  key: string;
  client_name: string;
  client_code: string | null;
  lastContact: Date;
  daysSinceContact: number;
  nextReturn: Date | null;
  lastStatus: FollowupRow['followup_status'];
  temperature: FollowupRow['client_temperature'];
  total: number;
};

const tempColor = (t: FollowupRow['client_temperature']) => {
  if (t === 'quente') return 'bg-red-500/15 text-red-700 dark:text-red-300';
  if (t === 'morno') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  if (t === 'frio') return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
  return 'bg-muted text-muted-foreground';
};

export const ClientPortfolio: React.FC = () => {
  const { data = [], isLoading } = useFollowups();
  const [search, setSearch] = useState('');

  const aggregates = useMemo<ClientAggregate[]>(() => {
    const map = new Map<string, FollowupRow[]>();
    for (const f of data) {
      const k = getClientKey(f);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    const now = Date.now();
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
      result.push({
        key,
        client_name: last.client_name,
        client_code: last.client_code,
        lastContact,
        daysSinceContact: Math.floor((now - lastContact.getTime()) / 86400000),
        nextReturn: futureReturns[0] ?? null,
        lastStatus: last.followup_status,
        temperature: last.client_temperature,
        total: items.length,
      });
    });
    return result.sort((a, b) => b.lastContact.getTime() - a.lastContact.getTime());
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aggregates;
    return aggregates.filter(
      (a) =>
        a.client_name.toLowerCase().includes(q) ||
        (a.client_code ?? '').toLowerCase().includes(q)
    );
  }, [aggregates, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Buscar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-sm text-muted-foreground">
          {filtered.length} cliente(s) único(s)
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Último contato</TableHead>
                <TableHead>Dias sem contato</TableHead>
                <TableHead>Próximo retorno</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Temperatura</TableHead>
                <TableHead className="text-right">Atividades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell>
                      <div className="font-medium">{c.client_name}</div>
                      {c.client_code && <div className="text-xs text-muted-foreground">{c.client_code}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{c.lastContact.toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Badge variant={c.daysSinceContact > 30 ? 'destructive' : c.daysSinceContact > 14 ? 'secondary' : 'outline'}>
                        {c.daysSinceContact}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.nextReturn ? c.nextReturn.toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell><Badge>{c.lastStatus}</Badge></TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${tempColor(c.temperature)}`}>
                        {c.temperature ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{c.total}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
