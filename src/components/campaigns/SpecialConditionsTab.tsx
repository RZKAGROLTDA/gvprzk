import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Download,
  Search,
  ShieldCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClientAutocomplete } from '@/pages/Campaigns';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import {
  useSpecialConditions,
  useCreateSpecialCondition,
  useUpdateSpecialCondition,
  useDeleteSpecialCondition,
  useApproveSpecialCondition,
  type SpecialCondition,
  type SpecialConditionStatus,
} from '@/hooks/useSpecialConditions';
import { cn } from '@/lib/utils';
import { formatDateDisplay, parseLocalDate } from '@/lib/utils';

const PAYMENT_CONDITIONS = [
  'À vista',
  '7 dias',
  '14 dias',
  '21 dias',
  '28 dias',
  '30 dias',
  '30/60',
  '30/60/90',
  '45 dias',
  '60 dias',
  '90 dias',
  'Boleto',
  'Cartão',
  'PIX',
];

const INSTALLMENT_OPTIONS = ['1x', '2x', '3x', '4x', '5x', '6x'];
const PAYMENT_TYPE_OPTIONS = ['RZKPay', 'Cartão de Crédito', 'Limite RZK'] as const;
type PaymentType = typeof PAYMENT_TYPE_OPTIONS[number];

const paymentTypeBadge = (pt?: string | null) => {
  if (!pt) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    'RZKPay':
      'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
    'Cartão de Crédito':
      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    'Limite RZK':
      'bg-green-100 text-green-800 border-green-300 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  };
  return <Badge variant="outline" className={cn('font-medium', map[pt] || '')}>{pt}</Badge>;
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const formatPct = (v: number) => `${(v ?? 0).toFixed(2)}%`;

const statusBadge = (status: SpecialConditionStatus) => {
  const map: Record<SpecialConditionStatus, string> = {
    pendente:
      'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30',
    aprovado:
      'bg-green-100 text-green-800 border-green-300 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
    rejeitado:
      'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant="outline" className={cn('font-medium', map[status])}>{label}</Badge>;
};

const safeDate = (s: string | null | undefined) =>
  s ? formatDateDisplay(parseLocalDate(s) || new Date(s)) : '—';

export const SpecialConditionsTab: React.FC = () => {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { data: items, isLoading } = useSpecialConditions();
  const del = useDeleteSpecialCondition();
  const approve = useApproveSpecialCondition();

  const role = profile?.role;
  const isManager = role === 'manager' || role === 'admin';
  const isSupervisor = role === 'supervisor';
  const canApproveAny = isManager;
  const canApproveOwnFilial = isSupervisor;

  const [filiais, setFiliais] = useState<{ id: string; nome: string }[]>([]);
  const [sellers, setSellers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    supabase
      .from('filiais')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setFiliais(data || []));
  }, []);

  useEffect(() => {
    const ids = Array.from(
      new Set((items || []).flatMap((e) => [e.seller_id, e.approved_by]).filter(Boolean) as string[])
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
  }, [items]);

  // Filtros
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fFilial, setFFilial] = useState('all');
  const [fSeller, setFSeller] = useState('all');
  const [fClient, setFClient] = useState('');
  const [fNF, setFNF] = useState('');
  const [fStatus, setFStatus] = useState<'all' | SpecialConditionStatus>('all');
  const [fPay, setFPay] = useState('all');
  const [fInstall, setFInstall] = useState('all');
  const [fPayType, setFPayType] = useState('all');

  const all = items || [];

  const sellerOptions = useMemo(() => {
    const ids = Array.from(new Set(all.map((e) => e.seller_id).filter(Boolean)));
    return ids
      .map((id) => ({ id, name: sellers.get(id) || '—' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, sellers]);

  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    PAYMENT_CONDITIONS.forEach((p) => set.add(p));
    all.forEach((e) => e.payment_condition && set.add(e.payment_condition));
    return Array.from(set).sort();
  }, [all]);

  const list = useMemo(() => {
    const term = fClient.trim().toLowerCase();
    const nfTerm = fNF.trim().toLowerCase();
    return all.filter((e) => {
      if (fFilial !== 'all' && (e.filial_id || '') !== fFilial) return false;
      if (fSeller !== 'all' && e.seller_id !== fSeller) return false;
      if (fStatus !== 'all' && e.status !== fStatus) return false;
      if (fPay !== 'all' && (e.payment_condition || '') !== fPay) return false;
      if (term) {
        const hay = `${e.client_name || ''} ${e.client_code || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (nfTerm && !(e.invoice_number || '').toLowerCase().includes(nfTerm)) return false;
      if (fStart && (e.sale_date || '') < fStart) return false;
      if (fEnd && (e.sale_date || '') > fEnd) return false;
      return true;
    });
  }, [all, fFilial, fSeller, fStatus, fPay, fClient, fNF, fStart, fEnd]);

  const kpis = useMemo(() => {
    const count = list.length;
    const totalSold = list.reduce((s, e) => s + Number(e.sale_value || 0), 0);
    const totalDiscount = list.reduce(
      (s, e) => s + Number(e.total_discount_value ?? (Number(e.sale_value || 0) * Number(e.discount_percent || 0)) / 100),
      0
    );
    const avgDiscountPct =
      count > 0 ? list.reduce((s, e) => s + Number(e.discount_percent || 0), 0) / count : 0;
    const ticket = count > 0 ? totalSold / count : 0;
    return { count, totalSold, totalDiscount, avgDiscountPct, ticket };
  }, [list]);

  // Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialCondition | null>(null);

  const canEditRow = (e: SpecialCondition) => {
    if (isManager) return true;
    if (e.status !== 'pendente') return false;
    if (isSupervisor) return e.filial_id === profile?.filial_id;
    return e.seller_id === user?.id;
  };
  const canDeleteRow = (e: SpecialCondition) => {
    if (isManager) return true;
    if (isSupervisor) return e.filial_id === profile?.filial_id;
    return e.seller_id === user?.id && e.status === 'pendente';
  };
  const canApproveRow = (e: SpecialCondition) => {
    if (e.status !== 'pendente') return false;
    if (canApproveAny) return true;
    if (canApproveOwnFilial) return e.filial_id === profile?.filial_id;
    return false;
  };

  const handleExport = () => {
    if (!list.length) {
      toast.info('Nenhum dado para exportar');
      return;
    }
    const rows = list.map((e) => ({
      'Código Cliente': e.client_code,
      'Cliente': e.client_name,
      'Filial': e.filial_name || '',
      'Vendedor': e.seller_name || sellers.get(e.seller_id) || '',
      'Valor Venda': Number(e.sale_value || 0),
      'Desconto %': Number(e.discount_percent || 0),
      'Desconto Total': Number(e.total_discount_value || 0),
      'NF': e.invoice_number || '',
      'Cond. Pagamento': e.payment_condition || '',
      'Data Venda': e.sale_date || '',
      'Data Pagamento': (e as any).payment_date || '',
      'Status': e.status,
      'Aprovado por': e.approved_by ? sellers.get(e.approved_by) || '' : '',
      'Aprovado em': e.approved_at ? new Date(e.approved_at).toLocaleString('pt-BR') : '',
      'Observação': e.observation || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Condições Especiais');
    XLSX.writeFile(wb, `condicoes_especiais_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Arquivo Excel gerado');
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Qtd. Condições" value={String(kpis.count)} />
        <KpiCard label="Valor Total Vendido" value={formatCurrency(kpis.totalSold)} />
        <KpiCard label="Desconto Médio" value={formatPct(kpis.avgDiscountPct)} />
        <KpiCard label="Desconto Total" value={formatCurrency(kpis.totalDiscount)} />
        <KpiCard label="Ticket Médio" value={formatCurrency(kpis.ticket)} />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Início</Label>
              <Input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fim</Label>
              <Input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Filial</Label>
              <Select value={fFilial} onValueChange={setFFilial}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vendedor</Label>
              <Select value={fSeller} onValueChange={setFSeller}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {sellerOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={fClient}
                  onChange={(e) => setFClient(e.target.value)}
                  placeholder="Nome ou código"
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">NF</Label>
              <Input value={fNF} onChange={(e) => setFNF(e.target.value)} className="h-9" placeholder="Nº NF" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="rejeitado">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cond. Pagamento</Label>
              <Select value={fPay} onValueChange={setFPay}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {paymentOptions.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>Mostrando {list.length} de {all.length} registros</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                setFStart(''); setFEnd(''); setFFilial('all'); setFSeller('all');
                setFClient(''); setFNF(''); setFStatus('all'); setFPay('all');
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle>Condições Especiais</CardTitle>
              <CardDescription>
                Vendedor cria e edita enquanto pendente. Supervisor/Gerente aprovam.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" /> Exportar Excel
              </Button>
              <Button type="button" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Nova
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[120px]">Código</TableHead>
                  <TableHead className="min-w-[200px]">Cliente</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Valor Venda</TableHead>
                  <TableHead className="text-right">Desc %</TableHead>
                  <TableHead className="text-right">Desc Total</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead>Cond. Pgto</TableHead>
                  <TableHead>Data Venda</TableHead>
                  <TableHead>Data Pgto</TableHead>
                  <TableHead className="text-right w-44">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : list.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-6">
                      Nenhuma condição encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  list.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{statusBadge(e.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.client_code}</TableCell>
                      <TableCell className="font-medium">{e.client_name}</TableCell>
                      <TableCell>{e.filial_name || '—'}</TableCell>
                      <TableCell>{e.seller_name || sellers.get(e.seller_id) || '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(e.sale_value || 0))}</TableCell>
                      <TableCell className="text-right">{formatPct(Number(e.discount_percent || 0))}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(e.total_discount_value || 0))}
                      </TableCell>
                      <TableCell>{e.invoice_number || '—'}</TableCell>
                      <TableCell>{e.payment_condition || '—'}</TableCell>
                      <TableCell>{safeDate(e.sale_date)}</TableCell>
                      <TableCell>{safeDate((e as any).payment_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canApproveRow(e) && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700"
                                title="Aprovar"
                                onClick={() => approve.mutate({ id: e.id, approve: true })}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700"
                                title="Rejeitar"
                                onClick={() => approve.mutate({ id: e.id, approve: false })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            disabled={!canEditRow(e)}
                            onClick={() => { setEditing(e); setDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DeleteButton
                            disabled={!canDeleteRow(e)}
                            onConfirm={() => del.mutate(e.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SpecialConditionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        filiais={filiais}
        defaultFilialId={profile?.filial_id || null}
        defaultFilialName={profile?.filial_nome || null}
      />
    </div>
  );
};

const KpiCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Card className="border-border/60 shadow-sm">
    <CardContent className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </CardContent>
  </Card>
);

const DeleteButton: React.FC<{ disabled?: boolean; onConfirm: () => void }> = ({ disabled, onConfirm }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        title="Excluir"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir condição especial?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ============================================================
// DIALOG: criar / editar
// ============================================================
const SpecialConditionDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SpecialCondition | null;
  filiais: { id: string; nome: string }[];
  defaultFilialId: string | null;
  defaultFilialName: string | null;
}> = ({ open, onOpenChange, editing, filiais, defaultFilialId, defaultFilialName }) => {
  const create = useCreateSpecialCondition();
  const update = useUpdateSpecialCondition();

  const [client, setClient] = useState<{ code: string; name: string } | null>(null);
  const [filialId, setFilialId] = useState<string>('');
  const [saleValue, setSaleValue] = useState<string>('');
  const [discountPct, setDiscountPct] = useState<string>('');
  const [invoice, setInvoice] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClient({ code: editing.client_code, name: editing.client_name });
      setFilialId(editing.filial_id || '');
      setSaleValue(String(editing.sale_value ?? ''));
      setDiscountPct(String(editing.discount_percent ?? ''));
      setInvoice(editing.invoice_number || '');
      setSaleDate(editing.sale_date || '');
      setPaymentDate((editing as any).payment_date || '');
      setObservation(editing.observation || '');
    } else {
      setClient(null);
      setFilialId(defaultFilialId || '');
      setSaleValue('');
      setDiscountPct('');
      setInvoice('');
      setSaleDate('');
      setPaymentDate('');
      setObservation('');
    }
  }, [open, editing, defaultFilialId]);

  const paymentDays = useMemo(() => {
    if (!saleDate || !paymentDate) return null;
    const s = parseLocalDate(saleDate);
    const p = parseLocalDate(paymentDate);
    if (!s || !p) return null;
    const diff = Math.round((p.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [saleDate, paymentDate]);
  const paymentConditionLabel = paymentDays === null ? '' : `${paymentDays} dias`;

  const totalDiscount = useMemo(() => {
    const sv = parseFloat(saleValue) || 0;
    const dp = parseFloat(discountPct) || 0;
    return (sv * dp) / 100;
  }, [saleValue, discountPct]);

  const handleSubmit = async () => {
    if (!client) { toast.error('Selecione um cliente'); return; }
    const sv = parseFloat(saleValue);
    const dp = parseFloat(discountPct);
    if (isNaN(sv) || sv < 0) { toast.error('Valor de venda inválido'); return; }
    if (isNaN(dp) || dp < 0 || dp > 100) { toast.error('Desconto deve estar entre 0 e 100'); return; }

    const filialName = filiais.find((f) => f.id === filialId)?.nome || defaultFilialName || null;

    const payload = {
      client_code: client.code,
      client_name: client.name,
      filial_id: filialId || null,
      filial_name: filialName,
      sale_value: sv,
      discount_percent: dp,
      invoice_number: invoice.trim() || null,
      payment_condition: paymentConditionLabel || null,
      sale_date: saleDate || null,
      nf_date: null,
      payment_date: paymentDate || null,
      observation: observation.trim() || null,
      attachments: [] as string[],
    };

    if (editing) {
      await update.mutateAsync({ id: editing.id, patch: payload as any });
    } else {
      await create.mutateAsync(payload as any);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {editing ? 'Editar Condição Especial' : 'Nova Condição Especial'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? `Status atual: ${editing.status}`
              : 'Será criada com status "pendente" aguardando aprovação.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <ClientAutocomplete value={client} onChange={setClient} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Filial</Label>
              <Select value={filialId} onValueChange={setFilialId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nº NF</Label>
              <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Valor Venda *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={saleValue}
                onChange={(e) => setSaleValue(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Desconto % *</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Desconto Total</Label>
              <Input
                value={formatCurrency(totalDiscount)}
                readOnly
                className="h-9 bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Data Venda</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Data Pagamento</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Condição Pagamento</Label>
              <Input
                value={paymentConditionLabel}
                readOnly
                placeholder="Calculado automaticamente"
                className="h-9 bg-muted"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              placeholder="Justificativa, contexto comercial..."
            />
          </div>

          {editing && editing.status !== 'pendente' && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Aprovado por:</span>{' '}
                <span className="font-medium">{editing.approved_by || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Aprovado em:</span>{' '}
                <span className="font-medium">
                  {editing.approved_at ? new Date(editing.approved_at).toLocaleString('pt-BR') : '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
            {editing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
