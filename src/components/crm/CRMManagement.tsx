import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Activity, AlertTriangle, Building2, CalendarIcon, CheckSquare, ClipboardList,
  Phone, Trophy, UserCheck, Users, UserX, X,
} from 'lucide-react';
import { useFollowups, FollowupRow, getClientKey } from '@/hooks/useFollowups';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
const daysDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);

type SellerStat = {
  user_id: string;
  name: string;
  filial_id: string | null;
  total: number;
  visitas: number;
  ligacoes: number;
  checklists: number;
  uniqueClients: number;
  overdueReturns: number;
  inactive30d: number;
};

type FilialStat = {
  filial_id: string;
  name: string;
  total: number;
  uniqueClients: number;
  activeSellers: number;
  overdueReturns: number;
  inactive30d: number;
};

export const CRMManagement: React.FC = () => {
  const { data: all = [], isLoading } = useFollowups();
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
  const [from, setFrom] = useState<Date | undefined>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return startOfDay(d);
  });
  const [to, setTo] = useState<Date | undefined>(() => startOfDay(new Date()));
  const [filial, setFilial] = useState('all');
  const [seller, setSeller] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [priorityF, setPriorityF] = useState('all');
  const [tempF, setTempF] = useState('all');

  // Atalhos
  const setRange = (days: number) => {
    const end = startOfDay(new Date());
    const start = new Date(end); start.setDate(end.getDate() - days);
    setFrom(start); setTo(end);
  };

  const filtered = useMemo(() => {
    return all.filter((f) => {
      const d = startOfDay(new Date(f.activity_date)).getTime();
      if (from && d < startOfDay(from).getTime()) return false;
      if (to && d > startOfDay(to).getTime()) return false;
      if (filial !== 'all' && f.filial_id !== filial) return false;
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      if (statusF !== 'all' && f.followup_status !== statusF) return false;
      if (priorityF !== 'all' && f.priority !== priorityF) return false;
      if (tempF !== 'all' && (f.client_temperature ?? '') !== tempF) return false;
      return true;
    });
  }, [all, from, to, filial, seller, statusF, priorityF, tempF]);

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date();
    const visitas = filtered.filter((f) => f.activity_type === 'visita').length;
    const ligacoes = filtered.filter((f) => f.activity_type === 'ligacao').length;
    const checklists = filtered.filter((f) => f.activity_type === 'checklist').length;
    const uniqueClients = new Set(filtered.map(getClientKey)).size;
    const activeSellers = new Set(filtered.map((f) => f.responsible_user_id)).size;

    // Vencidos: considera todos (não apenas filtrado), respeitando filial/seller filters
    const baseForReturns = all.filter((f) => {
      if (filial !== 'all' && f.filial_id !== filial) return false;
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      return true;
    });
    const overdueReturns = baseForReturns.filter((f) =>
      f.next_return_date
      && f.followup_status !== 'concluido'
      && f.followup_status !== 'cancelado'
      && startOfDay(new Date(f.next_return_date)).getTime() < startOfDay(today).getTime()
    ).length;

    // Inatividade 30d+: agrupar por cliente, último contato > 30 dias
    const lastByClient = new Map<string, Date>();
    for (const f of baseForReturns) {
      const k = getClientKey(f);
      const d = new Date(f.activity_date);
      const prev = lastByClient.get(k);
      if (!prev || d > prev) lastByClient.set(k, d);
    }
    let inactive30d = 0;
    lastByClient.forEach((d) => { if (daysDiff(today, d) >= 30) inactive30d += 1; });

    return {
      total: filtered.length, visitas, ligacoes, checklists,
      uniqueClients, activeSellers, overdueReturns, inactive30d,
    };
  }, [filtered, all, filial, seller]);

  // Resumo por vendedor
  const sellerStats = useMemo<SellerStat[]>(() => {
    const today = new Date();
    const map = new Map<string, SellerStat>();

    for (const f of filtered) {
      const id = f.responsible_user_id;
      let s = map.get(id);
      if (!s) {
        s = {
          user_id: id, name: consultantById.get(id) ?? 'Vendedor',
          filial_id: f.filial_id,
          total: 0, visitas: 0, ligacoes: 0, checklists: 0,
          uniqueClients: 0, overdueReturns: 0, inactive30d: 0,
        };
        map.set(id, s);
      }
      s.total += 1;
      if (f.activity_type === 'visita') s.visitas += 1;
      if (f.activity_type === 'ligacao') s.ligacoes += 1;
      if (f.activity_type === 'checklist') s.checklists += 1;
    }

    // unique clients por vendedor (no período filtrado)
    const uniquePerSeller = new Map<string, Set<string>>();
    for (const f of filtered) {
      const set = uniquePerSeller.get(f.responsible_user_id) ?? new Set<string>();
      set.add(getClientKey(f));
      uniquePerSeller.set(f.responsible_user_id, set);
    }
    uniquePerSeller.forEach((set, id) => {
      const s = map.get(id); if (s) s.uniqueClients = set.size;
    });

    // overdue & inactive (sobre toda a base - respeitando filtros estruturais filial/seller)
    const base = all.filter((f) => {
      if (filial !== 'all' && f.filial_id !== filial) return false;
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      return true;
    });

    // overdue por vendedor
    for (const f of base) {
      if (
        f.next_return_date
        && f.followup_status !== 'concluido'
        && f.followup_status !== 'cancelado'
        && startOfDay(new Date(f.next_return_date)).getTime() < startOfDay(today).getTime()
      ) {
        const s = map.get(f.responsible_user_id);
        if (s) s.overdueReturns += 1;
      }
    }

    // inactive 30d+ por vendedor
    const lastByClientBySeller = new Map<string, Map<string, Date>>();
    for (const f of base) {
      const sellerMap = lastByClientBySeller.get(f.responsible_user_id) ?? new Map<string, Date>();
      const k = getClientKey(f);
      const d = new Date(f.activity_date);
      const prev = sellerMap.get(k);
      if (!prev || d > prev) sellerMap.set(k, d);
      lastByClientBySeller.set(f.responsible_user_id, sellerMap);
    }
    lastByClientBySeller.forEach((cmap, id) => {
      const s = map.get(id); if (!s) return;
      cmap.forEach((d) => { if (daysDiff(today, d) >= 30) s.inactive30d += 1; });
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, all, consultantById, filial, seller]);

  // Resumo por filial
  const filialStats = useMemo<FilialStat[]>(() => {
    const today = new Date();
    const map = new Map<string, FilialStat>();

    const ensure = (id: string | null) => {
      const key = id ?? '__none';
      let s = map.get(key);
      if (!s) {
        s = {
          filial_id: key,
          name: id ? (filialById.get(id) ?? 'Filial') : 'Sem filial',
          total: 0, uniqueClients: 0, activeSellers: 0, overdueReturns: 0, inactive30d: 0,
        };
        map.set(key, s);
      }
      return s;
    };

    const uniquePerFilial = new Map<string, Set<string>>();
    const sellersPerFilial = new Map<string, Set<string>>();

    for (const f of filtered) {
      const s = ensure(f.filial_id);
      s.total += 1;
      const k = f.filial_id ?? '__none';
      const cset = uniquePerFilial.get(k) ?? new Set<string>(); cset.add(getClientKey(f)); uniquePerFilial.set(k, cset);
      const sset = sellersPerFilial.get(k) ?? new Set<string>(); sset.add(f.responsible_user_id); sellersPerFilial.set(k, sset);
    }
    uniquePerFilial.forEach((set, k) => { const s = map.get(k); if (s) s.uniqueClients = set.size; });
    sellersPerFilial.forEach((set, k) => { const s = map.get(k); if (s) s.activeSellers = set.size; });

    const base = all.filter((f) => {
      if (filial !== 'all' && f.filial_id !== filial) return false;
      if (seller !== 'all' && f.responsible_user_id !== seller) return false;
      return true;
    });

    for (const f of base) {
      if (
        f.next_return_date
        && f.followup_status !== 'concluido'
        && f.followup_status !== 'cancelado'
        && startOfDay(new Date(f.next_return_date)).getTime() < startOfDay(today).getTime()
      ) {
        const s = ensure(f.filial_id); s.overdueReturns += 1;
      }
    }

    const lastByClientByFilial = new Map<string, Map<string, Date>>();
    for (const f of base) {
      const k = f.filial_id ?? '__none';
      const fm = lastByClientByFilial.get(k) ?? new Map<string, Date>();
      const ck = getClientKey(f);
      const d = new Date(f.activity_date);
      const prev = fm.get(ck);
      if (!prev || d > prev) fm.set(ck, d);
      lastByClientByFilial.set(k, fm);
    }
    lastByClientByFilial.forEach((cmap, k) => {
      const s = map.get(k); if (!s) return;
      cmap.forEach((d) => { if (daysDiff(today, d) >= 30) s.inactive30d += 1; });
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered, all, filialById, filial, seller]);

  const rankActivities = useMemo(() => [...sellerStats].sort((a, b) => b.total - a.total).slice(0, 5), [sellerStats]);
  const rankClients = useMemo(() => [...sellerStats].sort((a, b) => b.uniqueClients - a.uniqueClients).slice(0, 5), [sellerStats]);
  const rankOverdue = useMemo(() => [...sellerStats].filter((s) => s.overdueReturns > 0).sort((a, b) => b.overdueReturns - a.overdueReturns).slice(0, 5), [sellerStats]);

  const clearFilters = () => {
    setFilial('all'); setSeller('all'); setStatusF('all'); setPriorityF('all'); setTempF('all');
  };
  const hasFilter = filial !== 'all' || seller !== 'all' || statusF !== 'all' || priorityF !== 'all' || tempF !== 'all';

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <DateField label="De" value={from} onChange={setFrom} />
          <DateField label="Até" value={to} onChange={setTo} />
          <div className="flex flex-wrap gap-1 sm:col-span-2">
            <Button size="sm" variant="outline" onClick={() => setRange(7)}>Últimos 7d</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(30)}>Últimos 30d</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(90)}>Últimos 90d</Button>
          </div>

          <Select value={filial} onValueChange={setFilial}>
            <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas filiais</SelectItem>
              {filiais.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi icon={<Activity className="h-4 w-4" />} label="Atividades" value={kpis.total} tone="primary" />
            <Kpi icon={<Building2 className="h-4 w-4" />} label="Visitas" value={kpis.visitas} tone="muted" />
            <Kpi icon={<Phone className="h-4 w-4" />} label="Ligações" value={kpis.ligacoes} tone="muted" />
            <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Checklists" value={kpis.checklists} tone="muted" />
            <Kpi icon={<Users className="h-4 w-4" />} label="Clientes únicos" value={kpis.uniqueClients} tone="primary" />
            <Kpi icon={<UserCheck className="h-4 w-4" />} label="Vendedores ativos" value={kpis.activeSellers} tone="muted" />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Retornos vencidos" value={kpis.overdueReturns} tone="destructive" />
            <Kpi icon={<UserX className="h-4 w-4" />} label="Sem contato 30d+" value={kpis.inactive30d} tone="warning" />
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <RankingCard title="Mais atividades" items={rankActivities.map((s) => ({ name: s.name, value: s.total }))} icon={<Trophy className="h-4 w-4" />} />
            <RankingCard title="Mais clientes únicos" items={rankClients.map((s) => ({ name: s.name, value: s.uniqueClients }))} icon={<Users className="h-4 w-4" />} />
            <RankingCard title="Mais retornos vencidos" items={rankOverdue.map((s) => ({ name: s.name, value: s.overdueReturns }))} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
          </div>

          {/* Resumo por vendedor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumo por vendedor</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Atividades</TableHead>
                    <TableHead className="text-right">Clientes únicos</TableHead>
                    <TableHead className="text-right">Visitas</TableHead>
                    <TableHead className="text-right">Ligações</TableHead>
                    <TableHead className="text-right">Checklists</TableHead>
                    <TableHead className="text-right">Vencidos</TableHead>
                    <TableHead className="text-right">Inativos 30d+</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellerStats.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                  )}
                  {sellerStats.map((s) => (
                    <TableRow key={s.user_id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.total}</TableCell>
                      <TableCell className="text-right">{s.uniqueClients}</TableCell>
                      <TableCell className="text-right">{s.visitas}</TableCell>
                      <TableCell className="text-right">{s.ligacoes}</TableCell>
                      <TableCell className="text-right">{s.checklists}</TableCell>
                      <TableCell className="text-right">
                        {s.overdueReturns > 0
                          ? <Badge variant="destructive">{s.overdueReturns}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.inactive30d > 0
                          ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">{s.inactive30d}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Resumo por filial */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumo por filial</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filial</TableHead>
                    <TableHead className="text-right">Atividades</TableHead>
                    <TableHead className="text-right">Clientes únicos</TableHead>
                    <TableHead className="text-right">Vendedores ativos</TableHead>
                    <TableHead className="text-right">Vencidos</TableHead>
                    <TableHead className="text-right">Inativos 30d+</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filialStats.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                  )}
                  {filialStats.map((f) => (
                    <TableRow key={f.filial_id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell className="text-right">{f.total}</TableCell>
                      <TableCell className="text-right">{f.uniqueClients}</TableCell>
                      <TableCell className="text-right">{f.activeSellers}</TableCell>
                      <TableCell className="text-right">
                        {f.overdueReturns > 0
                          ? <Badge variant="destructive">{f.overdueReturns}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {f.inactive30d > 0
                          ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">{f.inactive30d}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{
  icon: React.ReactNode; label: string; value: number;
  tone: 'primary' | 'muted' | 'destructive' | 'warning';
}> = ({ icon, label, value, tone }) => {
  const cls = {
    primary: 'text-primary',
    muted: 'text-muted-foreground',
    destructive: 'text-destructive',
    warning: 'text-amber-600 dark:text-amber-400',
  }[tone];
  return (
    <Card>
      <CardContent className="p-3">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', cls)}>
          {icon}{label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value.toLocaleString('pt-BR')}</div>
      </CardContent>
    </Card>
  );
};

const RankingCard: React.FC<{
  title: string; icon: React.ReactNode;
  items: { name: string; value: number }[];
  tone?: 'destructive';
}> = ({ title, icon, items, tone }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={cn('flex items-center gap-2 text-sm', tone === 'destructive' && 'text-destructive')}>
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        {items.map((it, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between text-xs">
              <span className="truncate">{idx + 1}. {it.name}</span>
              <span className="font-medium">{it.value}</span>
            </div>
            <Progress value={(it.value / max) * 100} className="mt-1 h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
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
