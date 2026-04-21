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
import { Plus, Megaphone, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useCampaignRules,
  useCampaignClients,
  useSearchCampaignClients,
  useCreateCampaignRule,
  useCreateCampaignClient,
  useDeleteCampaignClient,
  useEnsureClientMaster,
  type CampaignRule,
} from '@/hooks/useCampaigns';
import { useProfile } from '@/hooks/useProfile';

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

// ============= LANÇAMENTOS =============
const EntriesTab: React.FC = () => {
  const { data: entries, isLoading } = useCampaignClients();
  const { data: rules } = useCampaignRules();
  const del = useDeleteCampaignClient();
  const [open, setOpen] = useState(false);

  const ruleMap = useMemo(() => {
    const m = new Map<string, string>();
    (rules || []).forEach((r) => m.set(r.id, r.campaign_name));
    return m;
  }, [rules]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Lançamentos de Clientes</CardTitle>
          <CardDescription>Clientes vinculados às campanhas comerciais</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Novo Lançamento
            </Button>
          </DialogTrigger>
          <NewEntryDialog onClose={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Gatilho</TableHead>
                  <TableHead className="text-right">Abr</TableHead>
                  <TableHead className="text-right">Mai</TableHead>
                  <TableHead className="text-right">Compromisso</TableHead>
                  <TableHead className="text-right w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.client_name}</TableCell>
                    <TableCell>{e.client_code}</TableCell>
                    <TableCell>
                      {e.campaign_rule_id ? ruleMap.get(e.campaign_rule_id) || '—' : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(e.campaign_trigger_value)}</TableCell>
                    <TableCell className="text-right">{formatPct(e.gained_april)}</TableCell>
                    <TableCell className="text-right">{formatPct(e.gained_may)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(e.commitment_value)}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
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
                              Tem certeza que deseja remover o lançamento de{' '}
                              <strong>{e.client_name}</strong>? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => del.mutate(e.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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

// ============= NOVO LANÇAMENTO =============
const NewEntryDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { profile } = useProfile();
  const { data: rules } = useCampaignRules();
  const create = useCreateCampaignClient();
  const ensureMaster = useEnsureClientMaster();

  const [filiais, setFiliais] = useState<{ id: string; nome: string }[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data: results } = useSearchCampaignClients(debounced);

  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [filialId, setFilialId] = useState<string>('');
  const [campaignRuleId, setCampaignRuleId] = useState<string>('');
  const [manualMode, setManualMode] = useState(false);

  const activeRules = useMemo<CampaignRule[]>(
    () =>
      (rules || [])
        .filter((r) => r.active)
        .sort((a, b) => Number(a.trigger_min) - Number(b.trigger_min)),
    [rules]
  );

  const selectedRule = useMemo(
    () => activeRules.find((r) => r.id === campaignRuleId) || null,
    [activeRules, campaignRuleId]
  );

  // Defaults derived from rule (locked fields)
  const triggerValue = selectedRule ? Number(selectedRule.trigger_min) : 0;
  const aprilPct = selectedRule ? Number(selectedRule.gained_april) : 0;
  const mayPct = selectedRule ? Number(selectedRule.gained_may) : 0;
  const commitment = selectedRule ? Number(selectedRule.commitment_value) : 0;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    supabase
      .from('filiais')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setFiliais(data || []));
  }, []);

  // Set default filial from profile when available
  useEffect(() => {
    if (profile?.filial_id && !filialId) {
      setFilialId(profile.filial_id);
    }
  }, [profile?.filial_id, filialId]);

  const profileFilialName = useMemo(
    () => filiais.find((f) => f.id === profile?.filial_id)?.nome,
    [filiais, profile?.filial_id]
  );
  const hasDefaultFilial = !!profile?.filial_id;

  const selectClient = (c: { client_code: string; client_name: string }) => {
    setClientCode(c.client_code);
    setClientName(c.client_name);
    setSearch(c.client_name);
    setManualMode(false);
  };

  const handleSubmit = async () => {
    if (!clientCode.trim() || !clientName.trim()) return;
    if (!selectedRule) return;
    // Always ensure client exists in master table for future autocomplete
    await ensureMaster.mutateAsync({
      client_code: clientCode.trim(),
      client_name: clientName.trim(),
    });
    await create.mutateAsync({
      campaign_rule_id: selectedRule.id,
      client_code: clientCode.trim(),
      client_name: clientName.trim(),
      filial_id: filialId || null,
      campaign_trigger_value: triggerValue,
      gained_april: aprilPct,
      gained_may: mayPct,
      gained_june: 0,
      commitment_value: commitment,
    });
    onClose();
  };

  const showResults = !manualMode && search.length > 0 && (results?.length || 0) > 0;
  const noResults = !manualMode && debounced.length > 1 && (results?.length || 0) === 0;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Novo Lançamento de Campanha</DialogTitle>
        <DialogDescription>
          Busque o cliente, escolha o gatilho e o restante é preenchido pela regra.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Vendedor (auto) */}
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          Vendedor:{' '}
          <span className="font-medium text-foreground">
            {profile?.name || 'Usuário logado'}
          </span>
        </div>

        {!manualMode && (
          <div className="space-y-2">
            <Label>Buscar Cliente</Label>
            <Input
              placeholder="Digite nome ou código do cliente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {showResults && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {results!.map((r) => (
                  <button
                    type="button"
                    key={`${r.client_code}-${r.source}`}
                    onClick={() => selectClient(r)}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
                  >
                    <div className="font-medium">{r.client_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.client_code} ·{' '}
                      {r.source === 'tasks'
                        ? 'Histórico'
                        : r.source === 'campaign'
                        ? 'Campanha'
                        : 'Mestre'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {noResults && (
              <p className="text-xs text-muted-foreground">
                Cliente não encontrado.{' '}
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => {
                    setManualMode(true);
                    setClientName(search);
                  }}
                >
                  Cadastrar manualmente
                </button>
              </p>
            )}
            {clientCode && !manualMode && (
              <Badge variant="secondary">
                Selecionado: {clientName} ({clientCode})
              </Badge>
            )}
          </div>
        )}

        {manualMode && (
          <div className="border border-dashed rounded-md p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Cadastro manual de cliente</Label>
              <Button variant="ghost" size="sm" onClick={() => setManualMode(false)}>
                Voltar à busca
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={clientCode} onChange={(e) => setClientCode(e.target.value)} />
              </div>
              <div>
                <Label>Nome *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Será gravado na base mestre para futuras buscas.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Filial</Label>
            {hasDefaultFilial ? (
              <Input value={profileFilialName || 'Filial padrão'} disabled className="bg-muted" />
            ) : (
              <Select value={filialId} onValueChange={setFilialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Gatilho / Comprou *</Label>
            <Select value={campaignRuleId} onValueChange={setCampaignRuleId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o gatilho" />
              </SelectTrigger>
              <SelectContent>
                {activeRules.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma regra ativa cadastrada
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
          </div>
        </div>

        {/* Auto-filled, read-only fields from selected rule */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Ganho Abril (%)</Label>
            <Input value={selectedRule ? aprilPct.toFixed(2) : ''} disabled className="bg-muted" />
          </div>
          <div>
            <Label>Ganho Maio (%)</Label>
            <Input value={selectedRule ? mayPct.toFixed(2) : ''} disabled className="bg-muted" />
          </div>
          <div>
            <Label>Compromisso (R$)</Label>
            <Input
              value={selectedRule ? formatCurrency(commitment) : ''}
              disabled
              className="bg-muted"
            />
          </div>
        </div>
        {selectedRule && (
          <p className="text-xs text-muted-foreground">
            Valores preenchidos automaticamente pela regra selecionada.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            !clientCode.trim() ||
            !clientName.trim() ||
            !selectedRule ||
            create.isPending ||
            ensureMaster.isPending
          }
        >
          {create.isPending ? 'Salvando...' : 'Lançar'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

// ============= REGRAS =============
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

// ============= NOVA REGRA =============
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
