import { Fragment, useMemo, useState } from 'react';
import { NumericFormat } from 'react-number-format';
import { parseProjectionMoney } from '@/lib/projectionMoney';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserFiliais } from '@/hooks/useUserFiliais';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Download, Upload, Target, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { consolidate, consolidateByDivisional, DIVISIONAIS, filterRows, isPending, normalizeRow, projectionPanelMetrics, sortByDivisional, rowsForWeek, defaultProjectionWeek, resolveProjectionScopeFilial, type ProjectionWeek, validateGoalImport, type ProjectionRow, type GoalImportResult } from '@/lib/projection';

// Chamada direta como método do cliente: mantém o vínculo interno do Supabase (causa do erro "reading 'rest'").
const rpc = (fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> => (supabase as any).rpc(fn, args ?? {});
const brl = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
// Formato compacto para a tabela por filial: R$ 1,2 mi / R$ 850 mil.
const brlCompact = (v: number | null | undefined) => {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return brl(v);
};
const pct = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const parseMoney = (s: string) => { const t = s.replace(/[R$\s.]/g, '').replace(',', '.'); return t === '' ? NaN : Number(t); };
const errMsg = (e: any) => e?.message ?? 'Erro inesperado';

export default function Projecao() {
  const { isAdmin, isManager, isSupervisor, isLoading: rolesLoading } = useUserRole();
  const { activeFilialId, filiais: userFiliais, isLoading: filLoading } = useUserFiliais();
  const realAdmin = isAdmin;
  const canAccess = realAdmin || isManager || isSupervisor;
  const canEnter = realAdmin || isSupervisor;
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [adminFilial, setAdminFilial] = useState<string>('all');
  const [divFilter, setDivFilter] = useState<string>('all');
  const [week, setWeek] = useState<ProjectionWeek>(() => defaultProjectionWeek(now, now.getFullYear(), now.getMonth() + 1));
  const changePeriod = (a: number, m: number) => { setAno(a); setMes(m); setWeek(defaultProjectionWeek(new Date(), a, m)); };
  const qc = useQueryClient();

  // Admin escolhe livremente; gerente/supervisor sempre a Filial Ativa (servidor revalida).
  // Gerente com uma única filial elegível usa-a automaticamente, só nesta tela.
  const scopeFilial = resolveProjectionScopeFilial({ isAdmin: realAdmin, isManager, activeFilialId, filiais: userFiliais });
  const ready = !rolesLoading && !filLoading && canAccess && (realAdmin || !!scopeFilial);

  const panel = useQuery({
    queryKey: ['projection-panel', scopeFilial, ano, mes],
    enabled: ready,
    staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await rpc('get_projection_panel', { p_active_filial: scopeFilial, p_ano: ano, p_mes: mes });
      if (error) throw error;
      return ((data ?? []) as any[]).map(normalizeRow);
    },
  });
  const history = useQuery({
    queryKey: ['projection-history', scopeFilial, ano, mes],
    enabled: ready,
    staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await rpc('get_projection_history', { p_active_filial: scopeFilial, p_ano: ano, p_mes: mes });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const adminFiliais = useQuery({
    queryKey: ['projection-filiais'],
    enabled: ready && realAdmin,
    staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await rpc('get_projection_filiais');
      if (error) throw error;
      return (data ?? []) as { filial_id: string; filial_nome: string; divisional: string | null }[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['projection-panel'] }); qc.invalidateQueries({ queryKey: ['projection-history'] }); qc.invalidateQueries({ queryKey: ['projection-filiais'] }); qc.invalidateQueries({ queryKey: ['projection-entries'] }); };

  const rows: ProjectionRow[] = useMemo(() => rowsForWeek(filterRows(sortByDivisional(panel.data ?? []), divFilter, adminFilial), week), [panel.data, divFilter, adminFilial, week]);
  const total = useMemo(() => consolidate(rows), [rows]);
  const byDiv = useMemo(() => consolidateByDivisional(rows, realAdmin && divFilter === 'all' && adminFilial === 'all'), [rows, realAdmin, divFilter, adminFilial]);
  const filialOptions = useMemo(() => sortByDivisional(adminFiliais.data ?? []).filter((f) => divFilter === 'all' || (f.divisional ?? 'none') === divFilter), [adminFiliais.data, divFilter]);
  const onDivChange = (d: string) => { setDivFilter(d); setAdminFilial('all'); };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => {
      const c = consolidate([r]);
      return {
        Divisional: r.divisional ?? '', Filial: r.filial_nome, Meta: r.meta ?? '',
        Semana: `S${week}`, Situação: isPending(r) ? 'PENDENTE' : 'Lançada',
        'S1 Sem risco': r.s1_sem ?? '', 'S1 Com risco': r.s1_com ?? '', 'S2 Sem risco': r.s2_sem ?? '', 'S2 Com risco': r.s2_com ?? '',
        'S3 Sem risco': r.s3_sem ?? '', 'S3 Com risco': r.s3_com ?? '', 'S4 Sem risco': r.s4_sem ?? '', 'S4 Com risco': r.s4_com ?? '',
        [`Projeção sem risco S${week}`]: isPending(r) ? 'PENDENTE' : r.ultima_sem_risco, [`Projeção com risco S${week}`]: isPending(r) ? 'PENDENTE' : r.ultima_com_risco,
        '% Sem risco': isPending(r) || c.pctSem == null ? '' : Number(c.pctSem.toFixed(1)), '% Com risco': isPending(r) || c.pctCom == null ? '' : Number(c.pctCom.toFixed(1)),
        'GAP sem risco': isPending(r) ? '' : c.gapSem, 'GAP com risco': isPending(r) ? '' : c.gapCom,
        'Atualizado por': r.atualizado_por ?? '', 'Atualizado em': r.ultima_atualizacao ? new Date(r.ultima_atualizacao).toLocaleString('pt-BR') : '',
      };
    });
    const resumo = [...byDiv.map((d) => ({ Grupo: d.divisional, ...d })), { Grupo: 'TOTAL GERAL', ...total }].map((d: any) => ({
      Grupo: d.Grupo, Semana: `S${week}`, Meta: d.meta, 'Projeção sem risco': d.semRisco, 'Projeção com risco': d.comRisco,
      '% Sem risco': d.pctSem == null ? '' : Number(d.pctSem.toFixed(1)), '% Com risco': d.pctCom == null ? '' : Number(d.pctCom.toFixed(1)),
      'GAP sem risco': d.gapSem, 'GAP com risco': d.gapCom, 'Filiais pendentes': d.pendentes,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Filiais');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Consolidado');
    XLSX.writeFile(wb, `projecao_${ano}-${String(mes).padStart(2, '0')}_S${week}.xlsx`);
  };

  if (rolesLoading || filLoading) return <p className="text-muted-foreground p-4">Carregando…</p>;
  if (!canAccess) return <Card><CardContent className="p-6">Você não tem acesso à Projeção.</CardContent></Card>;
  if (!realAdmin && !scopeFilial) return <Card><CardContent className="p-6">Selecione a Filial Ativa no topo para visualizar a Projeção.</CardContent></Card>;

  const entryFiliais = realAdmin ? sortByDivisional(adminFiliais.data ?? []).map((f) => ({ id: f.filial_id, nome: `${f.divisional ?? 'Sem divisional'} — ${f.filial_nome}` })) : userFiliais.filter((f) => f.id === scopeFilial);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" />Projeção de Vendas</h1>
        <Button variant="outline" onClick={exportExcel} disabled={!rows.length}><Download className="h-4 w-4 mr-2" />Exportar Excel</Button>
      </div>

      <Card><CardContent className="p-4 grid gap-3 grid-cols-2 md:grid-cols-4">
        <div><Label>Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => changePeriod(ano, Number(v))}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Ano</Label><Input type="number" value={ano} onChange={(e) => changePeriod(Number(e.target.value) || now.getFullYear(), mes)} /></div>
        <div><Label>Divisional</Label>
          <Select value={divFilter} onValueChange={onDivChange}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas</SelectItem>{DIVISIONAIS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Filial</Label>
          {realAdmin ? (
            <Select value={adminFilial} onValueChange={setAdminFilial}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{filialOptions.map((f) => <SelectItem key={f.filial_id} value={f.filial_id}>{f.filial_nome}</SelectItem>)}</SelectContent></Select>
          ) : <Input disabled value={userFiliais.find((f) => f.id === scopeFilial)?.nome ?? 'Filial Ativa'} />}
        </div>
      </CardContent></Card>

      {panel.error && <Card><CardContent className="p-4 text-destructive">Não foi possível carregar o painel: {errMsg(panel.error)}</CardContent></Card>}
      {history.error && <Card><CardContent className="p-4 text-destructive">Não foi possível carregar o histórico: {errMsg(history.error)}</CardContent></Card>}
      {adminFiliais.error && <Card><CardContent className="p-4 text-destructive">Não foi possível carregar as filiais: {errMsg(adminFiliais.error)}</CardContent></Card>}

      <div role="radiogroup" aria-label="Semana do painel" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Semana:</span>
        {([1, 2, 3, 4] as const).map((w) => <Button key={w} size="sm" role="radio" aria-checked={week === w} variant={week === w ? 'default' : 'outline'} onClick={() => setWeek(w)}>Semana {w}</Button>)}
        <span className="text-xs text-muted-foreground">Indicadores usam só os lançamentos ativos da Semana {week}; sem lançamento = pendente.</span>
      </div>

      {panel.isLoading && <p className="text-muted-foreground">Carregando painel…</p>}
      {panel.isSuccess && <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi title="Meta" value={brl(total.meta)} />
        <Kpi title="Projeção sem risco" value={brl(total.semRisco)} sub={`${pct(total.pctSem)} · GAP ${brl(total.gapSem)}`} />
        <Kpi title="Projeção com risco" value={brl(total.comRisco)} sub={`${pct(total.pctCom)} · GAP ${brl(total.gapCom)}`} />
        <Kpi title="Filiais pendentes" value={`${total.pendentes} de ${total.filiais}`} />
      </div>}

      <Tabs defaultValue="painel">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          {canEnter && <TabsTrigger value="lancar">Lançar semana</TabsTrigger>}
          {realAdmin && <TabsTrigger value="metas">Metas e divisionais</TabsTrigger>}
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Consolidado por divisional</CardTitle></CardHeader><CardContent className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Divisional</TableHead><TableHead className="text-right">Meta</TableHead><TableHead className="text-right">Sem risco</TableHead><TableHead className="text-right">%</TableHead><TableHead className="text-right">Com risco</TableHead><TableHead className="text-right">%</TableHead><TableHead className="text-right">Pendentes</TableHead></TableRow></TableHeader>
              <TableBody>{[...byDiv, { divisional: 'TOTAL GERAL', ...total }].map((d) => (
                <TableRow key={d.divisional} className={d.divisional === 'TOTAL GERAL' ? 'font-semibold' : ''}>
                  <TableCell>{d.divisional}</TableCell><TableCell className="text-right whitespace-nowrap">{brl(d.meta)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{brl(d.semRisco)}</TableCell><TableCell className="text-right">{pct(d.pctSem)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{brl(d.comRisco)}</TableCell><TableCell className="text-right">{pct(d.pctCom)}</TableCell>
                  <TableCell className="text-right">{d.pendentes}</TableCell></TableRow>))}</TableBody></Table>
          </CardContent></Card>

          <Card><CardHeader className="px-3 py-2"><CardTitle className="text-base">Por filial</CardTitle></CardHeader><CardContent className="px-1 pb-2">
            {panel.isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
            <Table className="table-fixed min-w-[860px] text-xs tabular-nums [&_th]:h-7 [&_th]:px-1 [&_th]:py-1 [&_td]:px-1 [&_td]:py-1"><TableHeader><TableRow>
              <TableHead className="w-1/5">Filial</TableHead>
              {['Meta', 'S1', 'S2', 'S3', 'S4', `Com risco S${week}`, '% Meta', 'GAP', 'Var. %'].map((label) => <TableHead key={label} className={`text-right whitespace-nowrap ${label === `S${week}` ? 'bg-primary/10 text-foreground font-bold' : ''}`}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {byDiv.map((d) => { const divRows = rows.filter((r) => (r.divisional ?? 'Sem divisional') === d.divisional); return (
                <Fragment key={d.divisional}>
                  <TableRow className="bg-muted/50"><TableCell colSpan={10} className="font-semibold">{d.divisional}</TableCell></TableRow>
                  {divRows.map((r) => { const metrics = projectionPanelMetrics([r]); return (
                    <TableRow key={r.filial_id}>
                      <TableCell className="font-medium break-words leading-tight">{r.filial_nome}{isPending(r) && <span className="ml-1 text-[10px] font-semibold text-destructive">PENDENTE</span>}</TableCell>
                      <MoneyCell value={r.meta} />
                      {metrics.weeks.map((value, i) => <MoneyCell key={i} value={value} highlight={i + 1 === week} />)}
                      <MoneyCell value={isPending(r) ? null : r.ultima_com_risco} />
                      <TableCell className="text-right whitespace-nowrap">{pct(metrics.pctMeta)}</TableCell>
                      <MoneyCell value={metrics.gap} />
                      <VariationCell value={metrics.variation} />
                    </TableRow>); })}
                  <SummaryRow label={`Subtotal ${d.divisional}`} rows={divRows} week={week} />
                </Fragment>); })}
              {rows.length > 0 && <SummaryRow label="TOTAL GERAL" rows={rows} week={week} strong />}
              {!rows.length && panel.isSuccess && <TableRow><TableCell colSpan={10} className="text-muted-foreground">Nenhuma filial neste filtro.</TableCell></TableRow>}
            </TableBody></Table>)}
          </CardContent></Card>
        </TabsContent>

        {canEnter && <TabsContent value="lancar"><EntryForm filiais={entryFiliais} panel={panel.data ?? []} ano={ano} mes={mes} scopeFilial={scopeFilial} onSaved={refresh} /></TabsContent>}
        {realAdmin && <TabsContent value="metas"><GoalsAdmin filiais={sortByDivisional(adminFiliais.data ?? [])} panel={panel.data ?? []} ano={ano} mes={mes} onSaved={refresh} /></TabsContent>}

        <TabsContent value="historico"><Card><CardContent className="p-4 overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Filial</TableHead><TableHead>Detalhe</TableHead><TableHead>Por</TableHead></TableRow></TableHeader>
            <TableBody>{(history.data ?? []).map((h, i) => (
              <TableRow key={i}><TableCell className="whitespace-nowrap text-xs">{new Date(h.changed_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{h.tipo === 'meta' ? `Meta (${h.acao})` : h.acao === 'excluido' ? <span className="font-semibold text-destructive">S{h.semana} Excluído</span> : `S${h.semana} ${h.acao}`}</TableCell><TableCell>{h.filial_nome}</TableCell>
                <TableCell className="text-xs">{h.tipo === 'meta' ? `${brl(h.valor_anterior == null ? null : Number(h.valor_anterior))} → ${brl(Number(h.sem_risco))}` : `Sem risco ${brl(Number(h.sem_risco))} · Com risco ${brl(Number(h.com_risco))}${h.observacao ? ` · ${h.observacao}` : ''}`}</TableCell>
                <TableCell>{h.autor ?? '—'}</TableCell></TableRow>))}
              {!history.data?.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Sem alterações neste mês.</TableCell></TableRow>}</TableBody></Table>
        </CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryRow({ label, rows, strong, week }: { label: string; rows: ProjectionRow[]; strong?: boolean; week: number }) {
  const metrics = projectionPanelMetrics(rows);
  return (
    <TableRow className={strong ? 'font-bold bg-muted' : 'font-semibold bg-muted/50'}>
      <TableCell className="leading-tight">{label}</TableCell>
      <MoneyCell value={metrics.meta} />
      {metrics.weeks.map((value, i) => <MoneyCell key={i} value={value} highlight={i + 1 === week} />)}
      <MoneyCell value={metrics.filiais === metrics.pendentes ? null : metrics.comRisco} />
      <TableCell className="text-right whitespace-nowrap">{pct(metrics.pctMeta)}</TableCell>
      <MoneyCell value={metrics.gap} />
      <VariationCell value={metrics.variation} />
    </TableRow>
  );
}

function MoneyCell({ value, highlight }: { value: number | null; highlight?: boolean }) {
  return <TableCell className={`text-right whitespace-nowrap ${highlight ? 'bg-primary/10 font-semibold' : ''}`} title={value == null ? undefined : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}>{brlCompact(value)}</TableCell>;
}

function VariationCell({ value }: { value: number | null }) {
  const direction = value == null ? '' : value > 0 ? 'Crescimento' : value < 0 ? 'Queda' : 'Estável';
  return <TableCell className={`text-right whitespace-nowrap ${value != null && value > 0 ? 'text-success' : value != null && value < 0 ? 'text-destructive' : 'text-muted-foreground'}`} title={direction}>
    {value == null ? '—' : <span aria-label={`${direction}: ${pct(value)}`}>{value > 0 ? '↑ +' : value < 0 ? '↓ ' : '= '}{pct(value)}</span>}
  </TableCell>;
}

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="text-lg font-bold">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</CardContent></Card>;
}

const normalizeSearch = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function FilialCombobox({ options, value, onChange }: { options: { id: string; nome: string }[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label="Filial" className="w-full justify-between font-normal">
          <span className="truncate">{selected?.nome ?? 'Selecione a filial'}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(itemValue, search) => (normalizeSearch(itemValue).includes(normalizeSearch(search.trim())) ? 1 : 0)}>
          <CommandInput placeholder="Pesquisar filial..." />
          <CommandList>
            <CommandEmpty>Nenhuma filial encontrada.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.nome} ${o.id}`} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', o.id === value ? 'opacity-100' : 'opacity-0')} />{o.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function EntryForm({ filiais, panel, ano, mes, scopeFilial, onSaved }: { filiais: { id: string; nome: string }[]; panel: ProjectionRow[]; ano: number; mes: number; scopeFilial: string | null; onSaved: () => void }) {
  const [filial, setFilial] = useState(filiais[0]?.id ?? '');
  const [semana, setSemana] = useState('1');
  const [sem, setSem] = useState(''); const [com, setCom] = useState(''); const [obs, setObs] = useState('');
  const current = filial || filiais[0]?.id || '';
  const existing = panel.find((r) => r.filial_id === current);
  // Versão carregada na tela: enviada nas edições para recusar sobrescrita de alterações simultâneas.
  const entries = useQuery({
    queryKey: ['projection-entries', scopeFilial ?? current, ano, mes],
    enabled: !!current,
    staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await rpc('get_projection_entries', { p_active_filial: scopeFilial ?? current, p_ano: ano, p_mes: mes });
      if (error) throw error;
      return (data ?? []) as { entry_id: string; filial_id: string; filial_nome: string; semana: number; sem_risco: number; com_risco: number; version: number }[];
    },
  });
  const loadedEntry = entries.data?.find((e) => e.filial_id === current && e.semana === Number(semana)) ?? null;
  const save = useMutation({
    mutationFn: async () => {
      const s = parseProjectionMoney(sem), c = parseProjectionMoney(com);
      if (!current) throw new Error('Selecione a filial');
      if (s == null || c == null) throw new Error('Informe as duas projeções com valores válidos e até duas casas decimais');
      if (!entries.isSuccess) throw new Error('Não foi possível carregar os lançamentos atuais. Atualize a tela e tente novamente.');
      const { error } = await rpc('projection_save_entry', { p_active_filial: scopeFilial ?? current, p_filial: current, p_ano: ano, p_mes: mes, p_semana: Number(semana), p_sem_risco: s, p_com_risco: c, p_observacao: obs, p_expected_version: loadedEntry ? loadedEntry.version : null });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: `Semana ${semana} salva` }); setSem(''); setCom(''); setObs(''); entries.refetch(); onSaved(); },
    onError: (e: any) => {
      if (e?.code === '40001') entries.refetch();
      toast({ title: 'Não foi salvo', description: e?.code === '40001' ? 'Este lançamento foi alterado ou excluído por outro usuário. Os dados foram atualizados; confira e salve novamente.' : errMsg(e), variant: 'destructive' });
    },
  });
  const [toDelete, setToDelete] = useState<{ entry_id: string; filial_nome: string; semana: number; version: number } | null>(null);
  const [reason, setReason] = useState('');
  const del = useMutation({
    mutationFn: async () => {
      if (!toDelete) return;
      if (!reason.trim()) throw new Error('Informe o motivo da exclusão');
      const { error } = await rpc('projection_delete_entry', { p_active_filial: scopeFilial ?? current, p_entry_id: toDelete.entry_id, p_expected_version: toDelete.version, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: `Semana ${toDelete?.semana} excluída` }); setToDelete(null); setReason(''); entries.refetch(); onSaved(); },
    onError: (e: any) => {
      if (e?.code === '40001') { entries.refetch(); setToDelete(null); }
      toast({ title: 'Não foi excluído', description: e?.code === '40001' ? 'Este lançamento foi alterado ou já excluído por outro usuário. A lista foi atualizada.' : errMsg(e), variant: 'destructive' });
    },
  });
  const filialEntries = (entries.data ?? []).filter((e) => e.filial_id === current);
  const prev = existing ? [(existing as any)[`s${semana}_sem`], (existing as any)[`s${semana}_com`]] : [null, null];
  return (
    <Card><CardContent className="p-4 grid gap-3 md:grid-cols-2">
      <div><Label>Filial</Label>
        <FilialCombobox options={filiais.map((f) => { const d = panel.find((r) => r.filial_id === f.id)?.divisional; return { id: f.id, nome: !f.nome.includes(' — ') && d ? `${d} — ${f.nome}` : f.nome }; })} value={current} onChange={setFilial} /></div>
      <div><Label>Semana</Label>
        <Select value={semana} onValueChange={setSemana}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{[1,2,3,4].map((s) => <SelectItem key={s} value={String(s)}>Semana {s}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="projection-sem">Projeção sem risco (R$)</Label><NumericFormat id="projection-sem" customInput={Input} inputMode="decimal" value={sem} valueIsNumericString thousandSeparator="." decimalSeparator="," allowedDecimalSeparators={[',']} prefix="R$ " decimalScale={2} allowNegative={false} onValueChange={({ value }) => setSem(value)} placeholder={prev[0] != null ? `Atual: ${Number(prev[0]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'R$'} /></div>
      <div><Label htmlFor="projection-com">Projeção com risco (R$)</Label><NumericFormat id="projection-com" customInput={Input} inputMode="decimal" value={com} valueIsNumericString thousandSeparator="." decimalSeparator="," allowedDecimalSeparators={[',']} prefix="R$ " decimalScale={2} allowNegative={false} onValueChange={({ value }) => setCom(value)} placeholder={prev[1] != null ? `Atual: ${Number(prev[1]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'R$'} /></div>
      <div className="md:col-span-2"><Label>Observação (opcional)</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      <div className="md:col-span-2 flex justify-between items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Cada semana é guardada separadamente; o painel usa a última semana lançada.</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending || entries.isLoading}>{save.isPending ? 'Salvando…' : 'Salvar semana'}</Button></div>
      <div className="md:col-span-2">
        <Label>Lançamentos registrados — {MESES[mes - 1]}/{ano}</Label>
        {entries.error && <p className="text-sm text-destructive">Não foi possível carregar os lançamentos: {errMsg(entries.error)}</p>}
        {entries.isSuccess && !filialEntries.length && <p className="text-sm text-muted-foreground">Nenhum lançamento ativo para esta filial.</p>}
        {filialEntries.length > 0 && <Table className="text-[13px]"><TableHeader><TableRow><TableHead className="h-8 px-2">Semana</TableHead><TableHead className="h-8 px-2 text-right">Sem risco</TableHead><TableHead className="h-8 px-2 text-right">Com risco</TableHead><TableHead className="h-8 px-2 w-24" /></TableRow></TableHeader>
          <TableBody>{filialEntries.map((e) => <TableRow key={e.entry_id}><TableCell className="py-1 px-2">Semana {e.semana}</TableCell><TableCell className="py-1 px-2 text-right">{brl(Number(e.sem_risco))}</TableCell><TableCell className="py-1 px-2 text-right">{brl(Number(e.com_risco))}</TableCell>
            <TableCell className="py-1 px-2 text-right"><Button size="sm" variant="ghost" className="text-destructive h-7" aria-label={`Excluir semana ${e.semana}`} onClick={() => { setReason(''); setToDelete(e); }}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button></TableCell></TableRow>)}</TableBody></Table>}
      </div>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !del.isPending) setToDelete(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
          <AlertDialogDescription>Filial: <b>{toDelete?.filial_nome}</b> · Mês: <b>{MESES[mes - 1]}</b> · Ano: <b>{ano}</b> · Semana: <b>{toDelete?.semana}</b>. O lançamento deixa de contar nos resultados e fica registrado no Histórico como "Excluído".</AlertDialogDescription></AlertDialogHeader>
          <div><Label htmlFor="delete-reason">Motivo da exclusão (obrigatório)</Label><Textarea id="delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div>
          <AlertDialogFooter><AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!reason.trim() || del.isPending} onClick={(ev) => { ev.preventDefault(); del.mutate(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{del.isPending ? 'Excluindo…' : 'Excluir'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent></AlertDialog>
    </CardContent></Card>
  );
}

function GoalsAdmin({ filiais, panel, ano, mes, onSaved }: { filiais: { filial_id: string; filial_nome: string; divisional: string | null }[]; panel: ProjectionRow[]; ano: number; mes: number; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<GoalImportResult | null>(null);
  const metaOf = (id: string) => panel.find((r) => r.filial_id === id)?.meta ?? null;
  const saveGoals = useMutation({
    mutationFn: async ({ rows, origem }: { rows: { filial_id: string; ano: number; mes: number; meta: number }[]; origem: string }) => {
      const { data, error } = await rpc('projection_upsert_goals', { p_rows: rows, p_origem: origem });
      if (error) throw error; return data as number;
    },
    onSuccess: (n) => { toast({ title: `Metas salvas (${n} alteração(ões))` }); setEdits({}); setPreview(null); onSaved(); },
    onError: (e) => toast({ title: 'Metas não salvas', description: errMsg(e), variant: 'destructive' }),
  });
  const setDiv = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: string }) => { const { error } = await rpc('projection_set_divisional', { p_filial: id, p_divisional: d === 'none' ? null : d, p_incluida: true }); if (error) throw error; },
    onSuccess: () => { toast({ title: 'Divisional atualizada' }); onSaved(); },
    onError: (e) => toast({ title: 'Erro', description: errMsg(e), variant: 'destructive' }),
  });
  const manual = () => {
    const rows = Object.entries(edits).filter(([, v]) => v.trim() !== '').map(([id, v]) => ({ filial_id: id, ano, mes, meta: parseMoney(v) }));
    if (rows.some((r) => !Number.isFinite(r.meta) || r.meta < 0)) return toast({ title: 'Meta inválida', variant: 'destructive' });
    if (!rows.length) return toast({ title: 'Nenhuma meta alterada' });
    saveGoals.mutate({ rows, origem: 'manual' });
  };
  const onFile = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    setPreview(validateGoalImport(raw, filiais));
  };
  const template = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filiais.map((f) => ({ Filial: f.filial_nome, Mês: mes, Ano: ano, Meta: metaOf(f.filial_id) ?? '' }))), 'Metas');
    XLSX.writeFile(wb, `modelo_metas_${ano}-${String(mes).padStart(2, '0')}.xlsx`);
  };
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle className="text-base">Importar metas por Excel (Filial, Mês, Ano, Meta)</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={template}><Download className="h-4 w-4 mr-2" />Baixar modelo</Button>
          <Label className="inline-flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2 text-sm"><Upload className="h-4 w-4" />Escolher planilha
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} /></Label>
        </div>
        {preview && (<div className="space-y-2">
          <p className="text-sm">{preview.valid.length} linha(s) válida(s){preview.errors.length ? `, ${preview.errors.length} com erro (não serão importadas)` : ''}.</p>
          {preview.errors.length > 0 && <ul className="text-xs text-destructive list-disc pl-5">{preview.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>Filial</TableHead><TableHead>Mês/Ano</TableHead><TableHead className="text-right">Meta</TableHead></TableRow></TableHeader>
            <TableBody>{preview.valid.map((v) => <TableRow key={`${v.filial_id}${v.ano}${v.mes}`}><TableCell>{v.filial_nome}</TableCell><TableCell>{v.mes}/{v.ano}</TableCell><TableCell className="text-right">{brl(v.meta)}</TableCell></TableRow>)}</TableBody></Table></div>
          <div className="flex gap-2"><Button disabled={!preview.valid.length || saveGoals.isPending} onClick={() => saveGoals.mutate({ rows: preview.valid.map(({ filial_nome, ...r }) => r), origem: 'importacao' })}>Confirmar importação</Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancelar</Button></div>
        </div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Metas de {MESES[mes - 1]}/{ano} e divisional</CardTitle></CardHeader><CardContent className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Filial</TableHead><TableHead>Divisional</TableHead><TableHead className="text-right">Meta atual</TableHead><TableHead>Nova meta (R$)</TableHead></TableRow></TableHeader>
          <TableBody>{filiais.map((f) => (
            <TableRow key={f.filial_id}><TableCell className="whitespace-nowrap">{f.filial_nome}</TableCell>
              <TableCell><Select value={f.divisional ?? 'none'} onValueChange={(d) => setDiv.mutate({ id: f.filial_id, d })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{DIVISIONAIS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></TableCell>
              <TableCell className="text-right whitespace-nowrap">{brl(metaOf(f.filial_id))}</TableCell>
              <TableCell><Input className="w-40" inputMode="decimal" value={edits[f.filial_id] ?? ''} onChange={(e) => setEdits({ ...edits, [f.filial_id]: e.target.value })} /></TableCell></TableRow>))}</TableBody></Table>
        <div className="flex justify-end pt-3"><Button onClick={manual} disabled={saveGoals.isPending}>Salvar metas</Button></div>
      </CardContent></Card>
    </div>
  );
}
