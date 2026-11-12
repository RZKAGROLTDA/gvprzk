import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserFiliais } from '@/hooks/useUserFiliais';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Download, Upload, Target } from 'lucide-react';
import { consolidate, consolidateByDivisional, isPending, normalizeRow, validateGoalImport, type ProjectionRow, type GoalImportResult } from '@/lib/projection';

const rpc = ((fn: string, args?: Record<string, unknown>) => (supabase.rpc as any).call(supabase, fn, args)) as (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
const brl = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
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
  const qc = useQueryClient();

  // Admin escolhe livremente; gerente/supervisor sempre a Filial Ativa (servidor revalida).
  const scopeFilial = realAdmin ? (adminFilial === 'all' ? null : adminFilial) : activeFilialId;
  const ready = !rolesLoading && !filLoading && canAccess && (realAdmin || !!activeFilialId);

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
  const refresh = () => { qc.invalidateQueries({ queryKey: ['projection-panel'] }); qc.invalidateQueries({ queryKey: ['projection-history'] }); qc.invalidateQueries({ queryKey: ['projection-filiais'] }); };

  const rows: ProjectionRow[] = useMemo(() => (panel.data ?? []).filter((r) => divFilter === 'all' || (r.divisional ?? 'none') === divFilter), [panel.data, divFilter]);
  const total = useMemo(() => consolidate(rows), [rows]);
  const byDiv = useMemo(() => consolidateByDivisional(rows), [rows]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => {
      const c = consolidate([r]);
      return {
        Divisional: r.divisional ?? '', Filial: r.filial_nome, Meta: r.meta ?? '',
        'S1 Sem risco': r.s1_sem ?? '', 'S1 Com risco': r.s1_com ?? '', 'S2 Sem risco': r.s2_sem ?? '', 'S2 Com risco': r.s2_com ?? '',
        'S3 Sem risco': r.s3_sem ?? '', 'S3 Com risco': r.s3_com ?? '', 'S4 Sem risco': r.s4_sem ?? '', 'S4 Com risco': r.s4_com ?? '',
        'Última semana': isPending(r) ? 'PENDENTE' : `S${r.ultima_semana}`,
        'Projeção sem risco': isPending(r) ? 'PENDENTE' : r.ultima_sem_risco, 'Projeção com risco': isPending(r) ? 'PENDENTE' : r.ultima_com_risco,
        '% Sem risco': isPending(r) || c.pctSem == null ? '' : Number(c.pctSem.toFixed(1)), '% Com risco': isPending(r) || c.pctCom == null ? '' : Number(c.pctCom.toFixed(1)),
        'GAP sem risco': isPending(r) ? '' : c.gapSem, 'GAP com risco': isPending(r) ? '' : c.gapCom,
        'Atualizado por': r.atualizado_por ?? '', 'Atualizado em': r.ultima_atualizacao ? new Date(r.ultima_atualizacao).toLocaleString('pt-BR') : '',
      };
    });
    const resumo = [...byDiv.map((d) => ({ Grupo: d.divisional, ...d })), { Grupo: 'TOTAL GERAL', ...total }].map((d: any) => ({
      Grupo: d.Grupo, Meta: d.meta, 'Projeção sem risco': d.semRisco, 'Projeção com risco': d.comRisco,
      '% Sem risco': d.pctSem == null ? '' : Number(d.pctSem.toFixed(1)), '% Com risco': d.pctCom == null ? '' : Number(d.pctCom.toFixed(1)),
      'GAP sem risco': d.gapSem, 'GAP com risco': d.gapCom, 'Filiais pendentes': d.pendentes,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Filiais');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Consolidado');
    XLSX.writeFile(wb, `projecao_${ano}-${String(mes).padStart(2, '0')}.xlsx`);
  };

  if (rolesLoading || filLoading) return <p className="text-muted-foreground p-4">Carregando…</p>;
  if (!canAccess) return <Card><CardContent className="p-6">Você não tem acesso à Projeção.</CardContent></Card>;

  const entryFiliais = realAdmin ? [...(adminFiliais.data ?? [])].sort((a, b) => (['MT','GO','PA'].indexOf(a.divisional ?? '') + 1 || 9) - (['MT','GO','PA'].indexOf(b.divisional ?? '') + 1 || 9) || a.filial_nome.localeCompare(b.filial_nome)).map((f) => ({ id: f.filial_id, nome: `${f.divisional ?? 'Sem divisional'} — ${f.filial_nome}` })) : userFiliais.filter((f) => f.id === activeFilialId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" />Projeção de Vendas</h1>
        <Button variant="outline" onClick={exportExcel} disabled={!rows.length}><Download className="h-4 w-4 mr-2" />Exportar Excel</Button>
      </div>

      <Card><CardContent className="p-4 grid gap-3 grid-cols-2 md:grid-cols-4">
        <div><Label>Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Ano</Label><Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value) || now.getFullYear())} /></div>
        <div><Label>Divisional</Label>
          <Select value={divFilter} onValueChange={setDivFilter}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="MT">MT</SelectItem><SelectItem value="GO">GO</SelectItem><SelectItem value="PA">PA</SelectItem><SelectItem value="none">Sem divisional</SelectItem></SelectContent></Select></div>
        <div><Label>Filial</Label>
          {realAdmin ? (
            <Select value={adminFilial} onValueChange={setAdminFilial}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{(adminFiliais.data ?? []).map((f) => <SelectItem key={f.filial_id} value={f.filial_id}>{f.filial_nome}</SelectItem>)}</SelectContent></Select>
          ) : <Input disabled value={userFiliais.find((f) => f.id === activeFilialId)?.nome ?? 'Filial Ativa'} />}
        </div>
      </CardContent></Card>

      {panel.error && <Card><CardContent className="p-4 text-destructive">Não foi possível carregar o painel: {errMsg(panel.error)}</CardContent></Card>}
      {history.error && <Card><CardContent className="p-4 text-destructive">Não foi possível carregar o histórico: {errMsg(history.error)}</CardContent></Card>}
      {adminFiliais.error && <Card><CardContent className="p-4 text-destructive">Não foi possível carregar as filiais: {errMsg(adminFiliais.error)}</CardContent></Card>}

      {panel.isLoading && <p className="text-muted-foreground">Carregando painel…</p>}
      {panel.isSuccess && <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi title="Meta" value={brl(total.meta)} />
        <Kpi title="Projeção sem risco" value={brl(total.semRisco)} sub={`${pct(total.pctSem)} · GAP ${brl(total.gapSem)}`} />
        <Kpi title="Projeção com risco" value={brl(total.comRisco)} sub={`${pct(total.pctCom)} · GAP ${brl(total.gapCom)}`} />
        <Kpi title="Filiais pendentes" value={`${total.pendentes} de ${total.filiais}`} />
      </div>

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

          <Card><CardHeader><CardTitle className="text-base">Por filial</CardTitle></CardHeader><CardContent className="overflow-x-auto">
            {panel.isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
            <Table><TableHeader><TableRow>
              <TableHead>Filial</TableHead><TableHead>Div.</TableHead><TableHead className="text-right">Meta</TableHead>
              {[1,2,3,4].map((s) => <TableHead key={s} className="text-right whitespace-nowrap">S{s} sem / com</TableHead>)}
              <TableHead className="text-right">Última</TableHead><TableHead className="text-right">% sem</TableHead><TableHead className="text-right">GAP com</TableHead><TableHead>Atualização</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((r) => { const c = consolidate([r]); const p = isPending(r); return (
              <TableRow key={r.filial_id}>
                <TableCell className="whitespace-nowrap font-medium">{r.filial_nome}</TableCell><TableCell>{r.divisional ?? '—'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{r.meta == null ? <Badge variant="outline">Sem meta</Badge> : brl(r.meta)}</TableCell>
                {[1,2,3,4].map((s) => <TableCell key={s} className="text-right whitespace-nowrap text-xs">{brl((r as any)[`s${s}_sem`])} / {brl((r as any)[`s${s}_com`])}</TableCell>)}
                <TableCell className="text-right">{p ? <Badge variant="destructive">PENDENTE</Badge> : `S${r.ultima_semana}`}</TableCell>
                <TableCell className="text-right">{p ? '—' : pct(c.pctSem)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{p ? '—' : brl(c.gapCom)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{r.ultima_atualizacao ? `${new Date(r.ultima_atualizacao).toLocaleDateString('pt-BR')} · ${r.atualizado_por ?? ''}` : '—'}</TableCell>
              </TableRow>); })}</TableBody></Table>)}
          </CardContent></Card>
        </TabsContent>

        {canEnter && <TabsContent value="lancar"><EntryForm filiais={entryFiliais} panel={panel.data ?? []} ano={ano} mes={mes} scopeFilial={scopeFilial} onSaved={refresh} /></TabsContent>}
        {realAdmin && <TabsContent value="metas"><GoalsAdmin filiais={adminFiliais.data ?? []} panel={panel.data ?? []} ano={ano} mes={mes} onSaved={refresh} /></TabsContent>}

        <TabsContent value="historico"><Card><CardContent className="p-4 overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Filial</TableHead><TableHead>Detalhe</TableHead><TableHead>Por</TableHead></TableRow></TableHeader>
            <TableBody>{(history.data ?? []).map((h, i) => (
              <TableRow key={i}><TableCell className="whitespace-nowrap text-xs">{new Date(h.changed_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{h.tipo === 'meta' ? `Meta (${h.acao})` : `S${h.semana} ${h.acao}`}</TableCell><TableCell>{h.filial_nome}</TableCell>
                <TableCell className="text-xs">{h.tipo === 'meta' ? `${brl(h.valor_anterior == null ? null : Number(h.valor_anterior))} → ${brl(Number(h.sem_risco))}` : `Sem risco ${brl(Number(h.sem_risco))} · Com risco ${brl(Number(h.com_risco))}${h.observacao ? ` · ${h.observacao}` : ''}`}</TableCell>
                <TableCell>{h.autor ?? '—'}</TableCell></TableRow>))}
              {!history.data?.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Sem alterações neste mês.</TableCell></TableRow>}</TableBody></Table>
        </CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="text-lg font-bold">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</CardContent></Card>;
}

function EntryForm({ filiais, panel, ano, mes, scopeFilial, onSaved }: { filiais: { id: string; nome: string }[]; panel: ProjectionRow[]; ano: number; mes: number; scopeFilial: string | null; onSaved: () => void }) {
  const [filial, setFilial] = useState(filiais[0]?.id ?? '');
  const [semana, setSemana] = useState('1');
  const [sem, setSem] = useState(''); const [com, setCom] = useState(''); const [obs, setObs] = useState('');
  const current = filial || filiais[0]?.id || '';
  const existing = panel.find((r) => r.filial_id === current);
  const save = useMutation({
    mutationFn: async () => {
      const s = parseMoney(sem), c = parseMoney(com);
      if (!current) throw new Error('Selecione a filial');
      if (!Number.isFinite(s) || !Number.isFinite(c) || s < 0 || c < 0) throw new Error('Informe as duas projeções com valores válidos');
      const { error } = await rpc('projection_save_entry', { p_active_filial: scopeFilial ?? current, p_filial: current, p_ano: ano, p_mes: mes, p_semana: Number(semana), p_sem_risco: s, p_com_risco: c, p_observacao: obs });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: `Semana ${semana} salva` }); setSem(''); setCom(''); setObs(''); onSaved(); },
    onError: (e) => toast({ title: 'Não foi salvo', description: errMsg(e), variant: 'destructive' }),
  });
  const prev = existing ? [(existing as any)[`s${semana}_sem`], (existing as any)[`s${semana}_com`]] : [null, null];
  return (
    <Card><CardContent className="p-4 grid gap-3 md:grid-cols-2">
      <div><Label>Filial</Label>
        <Select value={current} onValueChange={setFilial}><SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
          <SelectContent>{filiais.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Semana</Label>
        <Select value={semana} onValueChange={setSemana}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{[1,2,3,4].map((s) => <SelectItem key={s} value={String(s)}>Semana {s}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Projeção sem risco (R$)</Label><Input inputMode="decimal" value={sem} onChange={(e) => setSem(e.target.value)} placeholder={prev[0] != null ? `Atual: ${brl(prev[0])}` : ''} /></div>
      <div><Label>Projeção com risco (R$)</Label><Input inputMode="decimal" value={com} onChange={(e) => setCom(e.target.value)} placeholder={prev[1] != null ? `Atual: ${brl(prev[1])}` : ''} /></div>
      <div className="md:col-span-2"><Label>Observação (opcional)</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      <div className="md:col-span-2 flex justify-between items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Cada semana é guardada separadamente; o painel usa a última semana lançada.</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar semana'}</Button></div>
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
                <SelectContent><SelectItem value="none">—</SelectItem><SelectItem value="MT">MT</SelectItem><SelectItem value="GO">GO</SelectItem><SelectItem value="PA">PA</SelectItem></SelectContent></Select></TableCell>
              <TableCell className="text-right whitespace-nowrap">{brl(metaOf(f.filial_id))}</TableCell>
              <TableCell><Input className="w-40" inputMode="decimal" value={edits[f.filial_id] ?? ''} onChange={(e) => setEdits({ ...edits, [f.filial_id]: e.target.value })} /></TableCell></TableRow>))}</TableBody></Table>
        <div className="flex justify-end pt-3"><Button onClick={manual} disabled={saveGoals.isPending}>Salvar metas</Button></div>
      </CardContent></Card>
    </div>
  );
}
