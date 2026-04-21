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
  Pencil,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useCampaignRules,
  useCampaignClients,
  useSearchCampaignClients,
  useCreateCampaignRule,
  useUpdateCampaignRule,
  useDeleteCampaignRule,
  useCreateCampaignClient,
  useUpdateCampaignClient,
  useDeleteCampaignClient,
  useEnsureClientMaster,
  type CampaignRule,
  type CampaignClient,
} from '@/hooks/useCampaigns';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatPct = (v: number) => `${(v ?? 0).toFixed(2)}%`;

const Campaigns: React.FC = () => {
  const { profile } = useProfile();
  const canManageRules =
    profile?.role === 'manager' || profile?.role === 'admin' || profile?.role === 'supervisor';
  const canDeleteRules = profile?.role === 'manager' || profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Gestão e acompanhamento de campanhas comerciais</p>
        </div>
      </div>

      <Tabs defaultValue="entries" className="w-full">
        <TabsList>
          <TabsTrigger value="entries">Lançamentos</TabsTrigger>
          <TabsTrigger value="summary">Resumo Vendedor</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-6">
          <EntriesTab />
        </TabsContent>

        <TabsContent value="summary" className="mt-6">
          <SellerSummaryTab />
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <RulesTab canManage={canManageRules} canDelete={canDeleteRules} />
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
  const { user } = useAuth();
  const { data: entries, isLoading } = useCampaignClients();
  const { data: rules } = useCampaignRules();
  const del = useDeleteCampaignClient();

  const [filiais, setFiliais] = useState<{ id: string; nome: string }[]>([]);
  const [sellers, setSellers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    supabase
      .from('filiais')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setFiliais(data || []));
  }, []);

  // Buscar nomes dos vendedores presentes nos lançamentos
  useEffect(() => {
    const ids = Array.from(
      new Set((entries || []).map((e) => e.seller_id).filter(Boolean))
    );
    if (ids.length === 0) return;
    supabase
      .from('profiles')
      .select('user_id, name')
      .in('user_id', ids)
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data || []).forEach((p: any) => m.set(p.user_id, p.name));
        setSellers(m);
      });
  }, [entries]);

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

  const list = entries || [];

  const totals = useMemo(() => {
    const count = list.length;
    const totalTrigger = list.reduce((s, e) => s + Number(e.campaign_trigger_value || 0), 0);
    const totalCommitment = list.reduce((s, e) => s + Number(e.commitment_value || 0), 0);
    return { count, totalTrigger, totalCommitment };
  }, [list]);

  const currentSellerName =
    (user?.id && sellers.get(user.id)) || profile?.name || '—';

  return (
    <div className="space-y-6">
      {/* Totalizadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes"
          value={String(totals.count)}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Soma Gatilho"
          value={formatCurrency(totals.totalTrigger)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Soma Compromisso"
          value={formatCurrency(totals.totalCommitment)}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Lançamentos de Clientes</CardTitle>
          <CardDescription>
            Adicione na primeira linha. Clique em uma linha para editar o gatilho.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[120px]">Código</TableHead>
                  <TableHead className="min-w-[220px]">Cliente</TableHead>
                  <TableHead className="min-w-[160px]">Vendedor</TableHead>
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
                  sellerName={currentSellerName}
                />

                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : list.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum lançamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  list.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      rules={rules || []}
                      ruleMap={ruleMap}
                      filiais={filiais}
                      filialMap={filialMap}
                      sellerName={sellers.get(e.seller_id) || '—'}
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
  <Card className="border-border/60 shadow-sm">
    <CardContent className="p-5 flex items-center gap-4">
      <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-semibold truncate leading-tight mt-0.5">{value}</p>
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
  sellerName: string;
}> = ({ rules, filiais, defaultFilialId, sellerName }) => {
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
    <TableRow className="bg-primary/5 hover:bg-primary/5 align-middle">
      {/* Código + Nome compartilham o autocomplete (colspan 2) */}
      <TableCell colSpan={2} className="py-2">
        {client ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground shrink-0 w-[100px] truncate">
              {client.code}
            </span>
            <span className="text-sm font-medium truncate flex-1">{client.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setClient(null)}
              aria-label="Limpar cliente"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <ClientAutocomplete value={client} onChange={setClient} />
        )}
      </TableCell>
      <TableCell className="py-2">
        <span className="text-sm text-muted-foreground truncate">{sellerName}</span>
      </TableCell>
      <TableCell className="py-2">
        <Select value={ruleId || undefined} onValueChange={(v) => setRuleId(v)}>
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
        <Button
          type="button"
          size="icon"
          className="h-9 w-9"
          onClick={handleAdd}
          disabled={!canAdd}
          aria-label="Adicionar lançamento"
        >
          <Plus className="h-4 w-4" />
        </Button>
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
  sellerName: string;
  onDelete: () => void;
}> = ({ entry, rules, ruleMap, filiais, filialMap, sellerName, onDelete }) => {
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
      className={cn('align-middle cursor-pointer', editing && 'bg-muted/30')}
      onClick={() => !editing && setEditing(true)}
    >
      <TableCell className="py-2 font-mono text-xs text-muted-foreground">
        {entry.client_code}
      </TableCell>
      <TableCell className="py-2 font-medium text-sm">{entry.client_name}</TableCell>
      <TableCell className="py-2 text-sm text-muted-foreground">{sellerName}</TableCell>
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
// RESUMO VENDEDOR — agregação por seller_id com lógica combinada
// para definição do tipo (Televendas pela filial > RAC pelo cargo > cargo padrão)
// ============================================================
const ROLE_LABELS: Record<string, string> = {
  manager: 'Gerente',
  admin: 'Admin',
  supervisor: 'Supervisor',
  sales_consultant: 'Consultor',
  consultant: 'Consultor',
  rac: 'RAC',
  user: 'Usuário',
};

const formatRoleLabel = (role?: string | null) => {
  if (!role) return '—';
  return ROLE_LABELS[role.toLowerCase()] || role;
};

const isTelevendasFilial = (nome?: string | null) =>
  !!nome && /televendas/i.test(nome);

const isRacRole = (role?: string | null) =>
  !!role && /rac/i.test(role);

interface SellerInfo {
  name: string;
  role: string | null;
  filial_id: string | null;
}

const SellerSummaryTab: React.FC = () => {
  const { data: entries, isLoading } = useCampaignClients();
  const [filiais, setFiliais] = useState<{ id: string; nome: string }[]>([]);
  const [sellers, setSellers] = useState<Map<string, SellerInfo>>(new Map());
  const [userRoles, setUserRoles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    supabase
      .from('filiais')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setFiliais(data || []));
  }, []);

  useEffect(() => {
    const ids = Array.from(
      new Set((entries || []).map((e) => e.seller_id).filter(Boolean))
    );
    if (ids.length === 0) {
      setSellers(new Map());
      setUserRoles(new Map());
      return;
    }
    // profiles: name, role, filial_id
    supabase
      .from('profiles')
      .select('user_id, name, role, filial_id')
      .in('user_id', ids)
      .then(({ data }) => {
        const m = new Map<string, SellerInfo>();
        (data || []).forEach((p: any) =>
          m.set(p.user_id, { name: p.name, role: p.role, filial_id: p.filial_id })
        );
        setSellers(m);
      });
    // user_roles: pode conter 'rac' como app_role
    supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', ids)
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data || []).forEach((r: any) => {
          // Prioriza rac se houver
          const existing = m.get(r.user_id);
          if (!existing || isRacRole(r.role)) m.set(r.user_id, r.role);
        });
        setUserRoles(m);
      });
  }, [entries]);

  const filialMap = useMemo(() => {
    const m = new Map<string, string>();
    filiais.forEach((f) => m.set(f.id, f.nome));
    return m;
  }, [filiais]);

  const rows = useMemo(() => {
    const valid = (entries || []).filter(
      (e) => e.client_code && Number(e.campaign_trigger_value) > 0
    );

    // Agrupar por seller_id
    const byseller = new Map<
      string,
      {
        seller_id: string;
        clientes: number;
        somaGatilho: number;
        somaCompromisso: number;
        // Contagem de filiais usadas nos lançamentos para definir o tipo "Televendas"
        filialCounts: Map<string, number>;
      }
    >();

    valid.forEach((e) => {
      const cur =
        byseller.get(e.seller_id) || {
          seller_id: e.seller_id,
          clientes: 0,
          somaGatilho: 0,
          somaCompromisso: 0,
          filialCounts: new Map<string, number>(),
        };
      cur.clientes += 1;
      cur.somaGatilho += Number(e.campaign_trigger_value || 0);
      cur.somaCompromisso += Number(e.commitment_value || 0);
      if (e.filial_id) {
        cur.filialCounts.set(
          e.filial_id,
          (cur.filialCounts.get(e.filial_id) || 0) + 1
        );
      }
      byseller.set(e.seller_id, cur);
    });

    return Array.from(byseller.values())
      .map((row) => {
        const info = sellers.get(row.seller_id);
        const profileFilialNome = info?.filial_id
          ? filialMap.get(info.filial_id) || null
          : null;

        // Filial predominante dos lançamentos
        let topFilialId: string | null = null;
        let topCount = 0;
        row.filialCounts.forEach((c, id) => {
          if (c > topCount) {
            topCount = c;
            topFilialId = id;
          }
        });
        const launchFilialNome = topFilialId ? filialMap.get(topFilialId) || null : null;

        // Filial exibida: a do lançamento (predominante) ou, na ausência, a do perfil
        const filialNome = launchFilialNome || profileFilialNome || '—';

        // Lógica combinada para o tipo:
        // 1) Televendas vence se a filial do lançamento for de Televendas
        // 2) Senão, RAC se cargo do vendedor for RAC (em user_roles ou em profile.role)
        // 3) Senão, cargo padrão do perfil
        const racRole = userRoles.get(row.seller_id);
        let tipo: string;
        if (isTelevendasFilial(launchFilialNome)) {
          tipo = 'Televendas';
        } else if (isRacRole(racRole) || isRacRole(info?.role)) {
          tipo = 'RAC';
        } else {
          tipo = formatRoleLabel(info?.role);
        }

        return {
          seller_id: row.seller_id,
          nome: info?.name || '—',
          filial: filialNome,
          tipo,
          clientes: row.clientes,
          somaGatilho: row.somaGatilho,
          somaCompromisso: row.somaCompromisso,
        };
      })
      .sort((a, b) => b.somaCompromisso - a.somaCompromisso);
  }, [entries, sellers, userRoles, filialMap]);

  const totals = useMemo(
    () => ({
      vendedores: rows.length,
      clientes: rows.reduce((s, r) => s + r.clientes, 0),
      somaGatilho: rows.reduce((s, r) => s + r.somaGatilho, 0),
      somaCompromisso: rows.reduce((s, r) => s + r.somaCompromisso, 0),
    }),
    [rows]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Vendedores"
          value={String(totals.vendedores)}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes"
          value={String(totals.clientes)}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Soma Gatilho"
          value={formatCurrency(totals.somaGatilho)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Soma Compromisso"
          value={formatCurrency(totals.somaCompromisso)}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Resumo por Vendedor</CardTitle>
          <CardDescription>
            Performance por vendedor, ordenado pela soma de compromisso
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[200px]">Vendedor</TableHead>
                  <TableHead className="min-w-[160px]">Filial</TableHead>
                  <TableHead className="min-w-[120px]">Tipo</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Soma Gatilho</TableHead>
                  <TableHead className="text-right">Soma Compromisso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum lançamento válido encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.seller_id} className="align-middle">
                      <TableCell className="py-2 font-medium">{r.nome}</TableCell>
                      <TableCell className="py-2 text-sm">{r.filial}</TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={r.tipo === 'Televendas' ? 'default' : 'secondary'}
                        >
                          {r.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right">{r.clientes}</TableCell>
                      <TableCell className="py-2 text-right">
                        {formatCurrency(r.somaGatilho)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-semibold">
                        {formatCurrency(r.somaCompromisso)}
                      </TableCell>
                    </TableRow>
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

// ============================================================
// REGRAS
// ============================================================
const RulesTab: React.FC<{ canManage: boolean; canDelete: boolean }> = ({
  canManage,
  canDelete,
}) => {
  const { data: rules, isLoading } = useCampaignRules();
  const { data: entries } = useCampaignClients();
  const [open, setOpen] = useState(false);

  // Mapa rule_id -> contagem de lançamentos vinculados
  const usageMap = useMemo(() => {
    const m = new Map<string, number>();
    (entries || []).forEach((e) => {
      if (e.campaign_rule_id) {
        m.set(e.campaign_rule_id, (m.get(e.campaign_rule_id) || 0) + 1);
      }
    });
    return m;
  }, [entries]);

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
                  <TableHead className="min-w-[180px]">Campanha</TableHead>
                  <TableHead className="text-right">Gatilho Mín</TableHead>
                  <TableHead className="text-right">Gatilho Máx</TableHead>
                  <TableHead className="text-right">Abr %</TableHead>
                  <TableHead className="text-right">Mai %</TableHead>
                  <TableHead className="text-right">Compromisso</TableHead>
                  <TableHead>Ativa</TableHead>
                  {canManage && (
                    <TableHead className="text-right w-32">Ações</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    usageCount={usageMap.get(r.id) || 0}
                    canManage={canManage}
                    canDelete={canDelete}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// --- Linha de regra com edição inline e exclusão protegida ---
const RuleRow: React.FC<{
  rule: CampaignRule;
  usageCount: number;
  canManage: boolean;
  canDelete: boolean;
}> = ({ rule, usageCount, canManage, canDelete }) => {
  const update = useUpdateCampaignRule();
  const del = useDeleteCampaignRule();
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(rule.campaign_name);
  const [tMin, setTMin] = useState(String(rule.trigger_min ?? ''));
  const [tMax, setTMax] = useState(rule.trigger_max == null ? '' : String(rule.trigger_max));
  const [april, setApril] = useState(String(rule.gained_april ?? ''));
  const [may, setMay] = useState(String(rule.gained_may ?? ''));
  const [commitment, setCommitment] = useState(String(rule.commitment_value ?? ''));
  const [active, setActive] = useState(rule.active);

  const resetFromRule = () => {
    setName(rule.campaign_name);
    setTMin(String(rule.trigger_min ?? ''));
    setTMax(rule.trigger_max == null ? '' : String(rule.trigger_max));
    setApril(String(rule.gained_april ?? ''));
    setMay(String(rule.gained_may ?? ''));
    setCommitment(String(rule.commitment_value ?? ''));
    setActive(rule.active);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await update.mutateAsync({
      id: rule.id,
      patch: {
        campaign_name: name.trim(),
        trigger_min: parseFloat(tMin) || 0,
        trigger_max: tMax.trim() === '' ? null : parseFloat(tMax),
        gained_april: parseFloat(april) || 0,
        gained_may: parseFloat(may) || 0,
        commitment_value: parseFloat(commitment) || 0,
        active,
      },
    });
    setEditing(false);
  };

  const handleCancel = () => {
    resetFromRule();
    setEditing(false);
  };

  const handleToggleActive = async (next: boolean) => {
    if (editing) {
      setActive(next);
      return;
    }
    await update.mutateAsync({ id: rule.id, patch: { active: next } });
  };

  const isLocked = usageCount > 0;

  if (editing) {
    return (
      <TableRow className="bg-muted/30 align-top">
        <TableCell className="py-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </TableCell>
        <TableCell className="py-2 text-right">
          <Input
            type="number"
            step="0.01"
            value={tMin}
            onChange={(e) => setTMin(e.target.value)}
            className="h-8 text-right"
          />
        </TableCell>
        <TableCell className="py-2 text-right">
          <Input
            type="number"
            step="0.01"
            value={tMax}
            onChange={(e) => setTMax(e.target.value)}
            placeholder="sem teto"
            className="h-8 text-right"
          />
        </TableCell>
        <TableCell className="py-2 text-right">
          <Input
            type="number"
            step="0.01"
            value={april}
            onChange={(e) => setApril(e.target.value)}
            className="h-8 text-right"
          />
        </TableCell>
        <TableCell className="py-2 text-right">
          <Input
            type="number"
            step="0.01"
            value={may}
            onChange={(e) => setMay(e.target.value)}
            className="h-8 text-right"
          />
        </TableCell>
        <TableCell className="py-2 text-right">
          <Input
            type="number"
            step="0.01"
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
            className="h-8 text-right"
          />
        </TableCell>
        <TableCell className="py-2">
          <Switch checked={active} onCheckedChange={setActive} />
        </TableCell>
        <TableCell className="py-2 text-right">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleCancel}
              aria-label="Cancelar"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-8 w-8"
              onClick={handleSave}
              disabled={!name.trim() || update.isPending}
              aria-label="Salvar"
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>{rule.campaign_name}</div>
        {usageCount > 0 && (
          <div className="text-xs text-muted-foreground">
            {usageCount} lançamento{usageCount > 1 ? 's' : ''} vinculado{usageCount > 1 ? 's' : ''}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">{formatCurrency(Number(rule.trigger_min))}</TableCell>
      <TableCell className="text-right">
        {rule.trigger_max == null ? (
          <span className="text-muted-foreground">— sem teto</span>
        ) : (
          formatCurrency(Number(rule.trigger_max))
        )}
      </TableCell>
      <TableCell className="text-right">{formatPct(Number(rule.gained_april))}</TableCell>
      <TableCell className="text-right">{formatPct(Number(rule.gained_may))}</TableCell>
      <TableCell className="text-right">{formatCurrency(Number(rule.commitment_value))}</TableCell>
      <TableCell>
        {canManage ? (
          <Switch
            checked={rule.active}
            onCheckedChange={handleToggleActive}
            disabled={update.isPending}
          />
        ) : (
          <Badge variant={rule.active ? 'default' : 'secondary'}>
            {rule.active ? 'Sim' : 'Não'}
          </Badge>
        )}
      </TableCell>
      {canManage && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
              aria-label="Editar regra"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Excluir regra"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {isLocked ? 'Não é possível excluir' : 'Excluir regra?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {isLocked ? (
                        <>
                          A regra <strong>{rule.campaign_name}</strong> possui{' '}
                          <strong>{usageCount}</strong> lançamento(s) vinculado(s) e não pode ser
                          excluída para preservar o histórico. Você pode <strong>inativá-la</strong>{' '}
                          usando o botão de status na linha.
                        </>
                      ) : (
                        <>
                          Excluir a regra <strong>{rule.campaign_name}</strong>? Esta ação não pode
                          ser desfeita.
                        </>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Fechar</AlertDialogCancel>
                    {!isLocked && (
                      <AlertDialogAction
                        onClick={() => del.mutate(rule.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    )}
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
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
