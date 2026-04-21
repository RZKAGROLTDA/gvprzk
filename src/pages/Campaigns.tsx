import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Megaphone,
  Trash2,
  Lock,
  Search,
  X,
  Check,
  Users,
  Target,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useCampaignRules,
  useCampaignClients,
  useSearchCampaignClients,
  useCreateCampaignRule,
  useCreateCampaignClient,
  useUpdateCampaignClient,
  useDeleteCampaignClient,
  useEnsureClientMaster,
  type CampaignRule,
  type CampaignClient,
} from '@/hooks/useCampaigns';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatPct = (v: number) => `${(v ?? 0).toFixed(2)}%`;

const Campaigns: React.FC = () => {
  const { profile } = useProfile();
  const canManageRules =
    profile?.role === 'manager' || profile?.role === 'admin' || profile?.role === 'supervisor';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Campanhas</h1>
      </div>

      <Tabs defaultValue="entries" className="w-full">
        <TabsList>
          <TabsTrigger value="entries">Lançamentos</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-4">
          <EntriesTab />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <RulesTab canManage={canManageRules} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================================
// LANÇAMENTOS — visão de operação comercial
// ============================================================
const EntriesTab: React.FC = () => {
  const { profile } = useProfile();
  const { data: entries, isLoading } = useCampaignClients();
  const { data: rules } = useCampaignRules();
  const del = useDeleteCampaignClient();

  const [filiais, setFiliais] = useState<{ id: string; nome: string }[]>([]);
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [filialFilter, setFilialFilter] = useState<string>('all');

  useEffect(() => {
    supabase
      .from('filiais')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setFiliais(data || []));
  }, []);

  const ruleMap = useMemo(() => {
    const m = new Map<string, CampaignRule>();
    (rules || []).forEach((r) => m.set(r.id, r));
    return m;
  }, [rules]);

  const filialMap = useMemo(() => {
    const m = new Map<string, string>();
    filiais.forEach((f) => m.set(f.id, f.nome));
    return m;
  }, [filiais]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries || []).filter((e) => {
      if (q && !`${e.client_name} ${e.client_code}`.toLowerCase().includes(q)) return false;
      if (campaignFilter !== 'all' && e.campaign_rule_id !== campaignFilter) return false;
      if (filialFilter !== 'all' && e.filial_id !== filialFilter) return false;
      return true;
    });
  }, [entries, search, campaignFilter, filialFilter]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const totalCommitment = filtered.reduce((s, e) => s + Number(e.commitment_value || 0), 0);
    const totalTrigger = filtered.reduce((s, e) => s + Number(e.campaign_trigger_value || 0), 0);
    const avgTrigger = count > 0 ? totalTrigger / count : 0;
    return { count, totalCommitment, avgTrigger };
  }, [filtered]);

  const showFilialFilter =
    profile?.role === 'manager' || profile?.role === 'admin' || profile?.role === 'supervisor';

  return (
    <div className="space-y-4">
      {/* Totalizadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes lançados"
          value={String(totals.count)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Compromisso total"
          value={formatCurrency(totals.totalCommitment)}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Gatilho médio"
          value={formatCurrency(totals.avgTrigger)}
        />
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle>Lançamentos de Clientes</CardTitle>
              <CardDescription>
                Adicione na primeira linha. Clique em uma linha para editar o gatilho.
              </CardDescription>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente ou código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="h-9 w-full sm:w-56">
                <SelectValue placeholder="Campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as campanhas</SelectItem>
                {(rules || []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.campaign_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showFilialFilter && (
              <Select value={filialFilter} onValueChange={setFilialFilter}>
                <SelectTrigger className="h-9 w-full sm:w-48">
                  <SelectValue placeholder="Filial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[260px]">Cliente</TableHead>
                  <TableHead className="min-w-[240px]">Gatilho / Comprou</TableHead>
                  <TableHead className="text-right">Abr %</TableHead>
                  <TableHead className="text-right">Mai %</TableHead>
                  <TableHead className="text-right">Compromisso</TableHead>
                  <TableHead className="min-w-[140px]">Filial</TableHead>
                  <TableHead className="text-right w-28">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Linha de entrada rápida */}
                <NewEntryRow
                  rules={rules || []}
                  filiais={filiais}
                  defaultFilialId={profile?.filial_id || ''}
                />

                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum lançamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      rules={rules || []}
                      ruleMap={ruleMap}
                      filiais={filiais}
                      filialMap={filialMap}
                      onDelete={() => del.mutate(e.id)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// --- StatCard ---
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold truncate">{value}</p>
      </div>
    </CardContent>
  </Card>
);

// --- Autocomplete inline de cliente ---
const ClientAutocomplete: React.FC<{
  value: { code: string; name: string } | null;
  onChange: (v: { code: string; name: string } | null) => void;
}> = ({ value, onChange }) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');
  const ensureMaster = useEnsureClientMaster();
  const { data: results } = useSearchCampaignClients(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-accent/40 px-2 py-1.5">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{value.name}</div>
          <div className="text-xs text-muted-foreground">{value.code}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => {
            onChange(null);
            setSearch('');
          }}
          aria-label="Limpar cliente"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (manualMode) {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed p-2 bg-muted/30">
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Código *"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="h-8"
          />
          <Input
            placeholder="Nome *"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setManualMode(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7"
            disabled={!manualCode.trim() || !manualName.trim() || ensureMaster.isPending}
            onClick={async () => {
              const code = manualCode.trim();
              const name = manualName.trim();
              await ensureMaster.mutateAsync({ client_code: code, client_name: name });
              onChange({ code, name });
              setManualMode(false);
              setManualCode('');
              setManualName('');
            }}
          >
            Usar
          </Button>
        </div>
      </div>
    );
  }

  const handleSelect = (r: { client_code: string; client_name: string }) => {
    setOpen(false);
    setSearch('');
    setDebounced('');
    onChange({ code: r.client_code, name: r.client_name });
  };

  return (
    <div className="relative">
      <Input
        placeholder="Buscar cliente ou código..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-9"
      />
      {open && search.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-y-auto">
          {(results?.length || 0) > 0 ? (
            results!.map((r) => (
              <button
                type="button"
                key={`${r.client_code}-${r.source}`}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  handleSelect(r);
                }}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
              >
                <div className="font-medium">{r.client_name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.client_code} ·{' '}
                  {r.source === 'tasks' ? 'Histórico' : r.source === 'campaign' ? 'Campanha' : 'Mestre'}
                </div>
              </button>
            ))
          ) : debounced.length > 1 ? (
            <button
              type="button"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                setManualName(search);
                setManualMode(true);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
            >
              <div className="font-medium text-primary">+ Cadastrar manualmente</div>
              <div className="text-xs text-muted-foreground">Cliente não encontrado</div>
            </button>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">Continue digitando...</div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Linha de entrada rápida ---
const NewEntryRow: React.FC<{
  rules: CampaignRule[];
  filiais: { id: string; nome: string }[];
  defaultFilialId: string;
}> = ({ rules, filiais, defaultFilialId }) => {
  const create = useCreateCampaignClient();
  const ensureMaster = useEnsureClientMaster();

  const [client, setClient] = useState<{ code: string; name: string } | null>(null);
  const [ruleId, setRuleId] = useState('');
  const [filialId, setFilialId] = useState(defaultFilialId);

  useEffect(() => {
    if (defaultFilialId && !filialId) setFilialId(defaultFilialId);
  }, [defaultFilialId, filialId]);

  const activeRules = useMemo(
    () =>
      rules
        .filter((r) => r.active)
        .sort((a, b) => Number(a.trigger_min) - Number(b.trigger_min)),
    [rules]
  );

  const selectedRule = activeRules.find((r) => r.id === ruleId) || null;

  const reset = () => {
    setClient(null);
    setRuleId('');
    setFilialId(defaultFilialId);
  };

  const handleAdd = async () => {
    if (!client || !selectedRule) return;
    await ensureMaster.mutateAsync({ client_code: client.code, client_name: client.name });
    await create.mutateAsync({
      campaign_rule_id: selectedRule.id,
      client_code: client.code,
      client_name: client.name,
      filial_id: filialId || null,
      campaign_trigger_value: Number(selectedRule.trigger_min),
      gained_april: Number(selectedRule.gained_april),
      gained_may: Number(selectedRule.gained_may),
      gained_june: 0,
      commitment_value: Number(selectedRule.commitment_value),
    });
    reset();
  };

  const canAdd = !!client && !!selectedRule && !create.isPending;

  return (
    <TableRow className="bg-accent/30 hover:bg-accent/30 align-top">
      <TableCell className="py-2">
        <ClientAutocomplete value={client} onChange={setClient} />
      </TableCell>
      <TableCell className="py-2">
        <Select
          value={ruleId || undefined}
          onValueChange={(v) => setRuleId(v)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecione o gatilho" />
          </SelectTrigger>
          <SelectContent>
            {activeRules.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma regra ativa
              </div>
            ) : (
              activeRules.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {formatCurrency(Number(r.trigger_min))} — Abr {formatPct(Number(r.gained_april))} / Mai{' '}
                  {formatPct(Number(r.gained_may))} / Comp.{' '}
                  {formatCurrency(Number(r.commitment_value))}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </TableCell>
      <AutoCell value={selectedRule ? formatPct(Number(selectedRule.gained_april)) : '—'} />
      <AutoCell value={selectedRule ? formatPct(Number(selectedRule.gained_may)) : '—'} />
      <AutoCell value={selectedRule ? formatCurrency(Number(selectedRule.commitment_value)) : '—'} />
      <TableCell className="py-2">
        <Select value={filialId || undefined} onValueChange={setFilialId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Filial" />
          </SelectTrigger>
          <SelectContent>
            {filiais.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-2 text-right">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

// --- Célula de campo automático (somente leitura) ---
const AutoCell: React.FC<{ value: string }> = ({ value }) => (
  <TableCell className="py-2 text-right bg-muted/40">
    <span className="inline-flex items-center gap-1 text-sm">
      <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span>{value}</span>
    </span>
  </TableCell>
);

// --- Linha existente com edição inline do gatilho ---
const EntryRow: React.FC<{
  entry: CampaignClient;
  rules: CampaignRule[];
  ruleMap: Map<string, CampaignRule>;
  filiais: { id: string; nome: string }[];
  filialMap: Map<string, string>;
  onDelete: () => void;
}> = ({ entry, rules, ruleMap, filiais, filialMap, onDelete }) => {
  const update = useUpdateCampaignClient();
  const [editing, setEditing] = useState(false);
  const [ruleId, setRuleId] = useState(entry.campaign_rule_id || '');
  const [filialId, setFilialId] = useState(entry.filial_id || '');

  const activeRules = useMemo(
    () =>
      rules
        .filter((r) => r.active || r.id === entry.campaign_rule_id)
        .sort((a, b) => Number(a.trigger_min) - Number(b.trigger_min)),
    [rules, entry.campaign_rule_id]
  );

  const currentRule = ruleMap.get(ruleId) || null;
  const dirty =
    ruleId !== (entry.campaign_rule_id || '') || filialId !== (entry.filial_id || '');

  const displayApril = currentRule ? Number(currentRule.gained_april) : Number(entry.gained_april);
  const displayMay = currentRule ? Number(currentRule.gained_may) : Number(entry.gained_may);
  const displayCommitment = currentRule
    ? Number(currentRule.commitment_value)
    : Number(entry.commitment_value);
  const displayTrigger = currentRule
    ? Number(currentRule.trigger_min)
    : Number(entry.campaign_trigger_value);

  const handleSave = async () => {
    if (!currentRule) return;
    await update.mutateAsync({
      id: entry.id,
      patch: {
        campaign_rule_id: currentRule.id,
        campaign_trigger_value: Number(currentRule.trigger_min),
        gained_april: Number(currentRule.gained_april),
        gained_may: Number(currentRule.gained_may),
        gained_june: 0,
        commitment_value: Number(currentRule.commitment_value),
        filial_id: filialId || null,
      },
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setRuleId(entry.campaign_rule_id || '');
    setFilialId(entry.filial_id || '');
    setEditing(false);
  };

  return (
    <TableRow
      className={cn('align-top cursor-pointer', editing && 'bg-muted/30')}
      onClick={() => !editing && setEditing(true)}
    >
      <TableCell className="py-2">
        <div className="font-medium text-sm">{entry.client_name}</div>
        <div className="text-xs text-muted-foreground">{entry.client_code}</div>
      </TableCell>
      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <Select value={ruleId || undefined} onValueChange={setRuleId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {activeRules.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {formatCurrency(Number(r.trigger_min))} — Abr {formatPct(Number(r.gained_april))} / Mai{' '}
                  {formatPct(Number(r.gained_may))} / Comp.{' '}
                  {formatCurrency(Number(r.commitment_value))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-sm">
            <span className="font-medium">{formatCurrency(displayTrigger)}</span>
            {ruleMap.get(entry.campaign_rule_id || '') && (
              <span className="ml-2 text-xs text-muted-foreground">
                {ruleMap.get(entry.campaign_rule_id || '')!.campaign_name}
              </span>
            )}
          </div>
        )}
      </TableCell>
      <AutoCell value={formatPct(displayApril)} />
      <AutoCell value={formatPct(displayMay)} />
      <AutoCell value={formatCurrency(displayCommitment)} />
      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <Select value={filialId || undefined} onValueChange={setFilialId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              {filiais.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm">
            {entry.filial_id ? filialMap.get(entry.filial_id) || '—' : '—'}
          </span>
        )}
      </TableCell>
      <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleCancel}
                aria-label="Cancelar edição"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                onClick={handleSave}
                disabled={!dirty || update.isPending}
                aria-label="Salvar"
              >
                <Check className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label="Remover lançamento"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover lançamento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remover o lançamento de <strong>{entry.client_name}</strong>? Esta ação não pode
                    ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

// ============================================================
// REGRAS
// ============================================================
const RulesTab: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const { data: rules, isLoading } = useCampaignRules();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Regras de Campanha</CardTitle>
          <CardDescription>
            Faixas de gatilho, percentuais ganhos e compromissos
          </CardDescription>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Nova Regra
              </Button>
            </DialogTrigger>
            <NewRuleDialog onClose={() => setOpen(false)} />
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !rules || rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Gatilho Mín</TableHead>
                  <TableHead className="text-right">Gatilho Máx</TableHead>
                  <TableHead className="text-right">Abr</TableHead>
                  <TableHead className="text-right">Mai</TableHead>
                  <TableHead className="text-right">Compromisso</TableHead>
                  <TableHead>Ativa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.campaign_name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.trigger_min)}</TableCell>
                    <TableCell className="text-right">
                      {r.trigger_max == null ? <span className="text-muted-foreground">— sem teto</span> : formatCurrency(r.trigger_max)}
                    </TableCell>
                    <TableCell className="text-right">{formatPct(r.gained_april)}</TableCell>
                    <TableCell className="text-right">{formatPct(r.gained_may)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.commitment_value)}</TableCell>
                    <TableCell>
                      <Badge variant={r.active ? 'default' : 'secondary'}>
                        {r.active ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// --- Nova regra ---
const NewRuleDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const create = useCreateCampaignRule();
  const [name, setName] = useState('');
  const [tMin, setTMin] = useState('');
  const [tMax, setTMax] = useState('');
  const [april, setApril] = useState('');
  const [may, setMay] = useState('');
  const [commitment, setCommitment] = useState('');
  const [active, setActive] = useState(true);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      campaign_name: name.trim(),
      trigger_min: parseFloat(tMin) || 0,
      trigger_max: tMax.trim() === '' ? null : parseFloat(tMax),
      gained_april: parseFloat(april) || 0,
      gained_may: parseFloat(may) || 0,
      gained_june: 0,
      commitment_value: parseFloat(commitment) || 0,
      active,
    });
    onClose();
  };

  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nova Regra de Campanha</DialogTitle>
        <DialogDescription>
          Os percentuais (Abr/Mai) são em %. Deixe o gatilho máximo vazio para faixa aberta.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label>Nome da Campanha *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Gatilho Mínimo (R$)</Label>
            <Input type="number" step="0.01" value={tMin} onChange={(e) => setTMin(e.target.value)} />
          </div>
          <div>
            <Label>Gatilho Máximo (R$) — vazio = sem teto</Label>
            <Input
              type="number"
              step="0.01"
              value={tMax}
              onChange={(e) => setTMax(e.target.value)}
              placeholder="Faixa aberta"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ganho Abril (%)</Label>
            <Input type="number" step="0.01" value={april} onChange={(e) => setApril(e.target.value)} />
          </div>
          <div>
            <Label>Ganho Maio (%)</Label>
            <Input type="number" step="0.01" value={may} onChange={(e) => setMay(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Compromisso (R$)</Label>
          <Input type="number" step="0.01" value={commitment} onChange={(e) => setCommitment(e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} id="active" />
          <Label htmlFor="active">Campanha ativa</Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={!name.trim() || create.isPending}>
          {create.isPending ? 'Salvando...' : 'Criar Regra'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default Campaigns;
