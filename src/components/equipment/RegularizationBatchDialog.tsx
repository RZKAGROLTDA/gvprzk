/**
 * Regularização de máquinas selecionadas — modal de decisão, revisão e confirmação.
 * Grava via RPC equipment_regularization_apply (lote + histórico + efeito no Parque).
 */
import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { useApplyRegularization, type RegMachine, type RegSituation } from '@/hooks/useEquipmentRegularization';

export type RegDecision = 'permanece' | RegSituation;

const DECISION_LABEL: Record<RegDecision, string> = {
  permanece: 'Permanece com o cliente',
  vendida: 'Vendida',
  inativa: 'Inativa',
  sucata: 'Sucata',
};

const SITUATION_LABEL: Record<RegSituation, string> = {
  vendida: 'Vendida',
  inativa: 'Inativa',
  sucata: 'Sucata',
};

interface ItemState {
  decision: RegDecision | null;
  destination_code: string;
  destination_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: RegMachine[];
  onDone: () => void;
}

export const RegularizationBatchDialog: React.FC<Props> = ({
  open, onOpenChange, machines, onDone,
}) => {
  const apply = useApplyRegularization();
  const [step, setStep] = useState<'decisions' | 'review'>('decisions');
  const [bulkDecision, setBulkDecision] = useState<RegDecision | null>(null);
  const [items, setItems] = useState<Record<string, ItemState>>({});

  const clients = useMemo(() => {
    const seen = new Map<string, { code: string; name: string }>();
    machines.forEach((m) => {
      const key = `${m.client_code ?? ''}|${m.client_name ?? ''}`;
      if (!seen.has(key)) {
        seen.set(key, { code: m.client_code ?? '—', name: m.client_name ?? '—' });
      }
    });
    return [...seen.values()];
  }, [machines]);

  const getItem = (id: string): ItemState =>
    items[id] ?? { decision: null, destination_code: '', destination_name: '' };

  const setItem = (id: string, patch: Partial<ItemState>) =>
    setItems((prev) => ({
      ...prev,
      [id]: { ...getItem(id), ...prev[id], ...patch },
    }));

  const applyBulk = () => {
    if (!bulkDecision) return;
    setItems((prev) => {
      const next = { ...prev };
      machines.forEach((m) => {
        next[m.equipment_id] = {
          decision: bulkDecision,
          destination_code: bulkDecision === 'vendida' ? getItem(m.equipment_id).destination_code : '',
          destination_name: bulkDecision === 'vendida' ? getItem(m.equipment_id).destination_name : '',
        };
      });
      return next;
    });
  };

  const missing = machines.filter((m) => !getItem(m.equipment_id).decision);
  const partialTransfer = machines.filter((m) => {
    const it = getItem(m.equipment_id);
    if (it.decision !== 'vendida') return false;
    const hasCode = !!it.destination_code.trim();
    const hasName = !!it.destination_name.trim();
    return hasCode !== hasName;
  });

  const canReview = machines.length > 0 && missing.length === 0 && partialTransfer.length === 0;

  const handleConfirm = () => {
    apply.mutate(
      {
        items: machines.map((m) => {
          const it = getItem(m.equipment_id);
          return {
            equipment_id: m.equipment_id,
            new_situation: it.decision!,
            destination_client_code: it.decision === 'vendida' ? it.destination_code.trim() || null : null,
            destination_client_name: it.decision === 'vendida' ? it.destination_name.trim() || null : null,
          };
        }),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setItems({});
          setBulkDecision(null);
          setStep('decisions');
          onDone();
        },
      },
    );
  };

  const handleClose = (open: boolean) => {
    if (apply.isPending) return;
    onOpenChange(open);
    if (!open) {
      setItems({});
      setBulkDecision(null);
      setStep('decisions');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Regularizar máquinas selecionadas
          </DialogTitle>
          <DialogDescription>
            Defina o resultado da regularização para cada máquina e revise antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo do topo */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {clients.length === 1 ? clients[0].name : `${clients.length} clientes`}
          </p>
          <p className="text-muted-foreground">
            {clients.length === 1
              ? `Código: ${clients[0].code}`
              : clients.map((c) => `${c.name} (${c.code})`).join(' · ')}
          </p>
          <p className="mt-1">
            <Badge variant="default">{machines.length} máquina(s) selecionada(s)</Badge>
          </p>
        </div>

        {step === 'decisions' ? (
          <>
            {/* Aplicação em massa */}
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="min-w-[220px] flex-1">
                <Label className="text-xs">Aplicar a mesma decisão a todas</Label>
                <Select
                  value={bulkDecision ?? ''}
                  onValueChange={(v) => setBulkDecision(v as RegDecision)}
                >
                  <SelectTrigger><SelectValue placeholder="Escolher resultado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanece">Permanece com o cliente</SelectItem>
                    <SelectItem value="vendida">Vendida</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                    <SelectItem value="sucata">Sucata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" disabled={!bulkDecision} onClick={applyBulk}>
                Aplicar a todas
              </Button>
            </div>

            {/* Lista de máquinas */}
            <div className="space-y-3">
              {machines.map((m) => {
                const it = getItem(m.equipment_id);
                const isVendida = it.decision === 'vendida';
                return (
                  <div key={m.equipment_id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{m.serial_chassis || 'Sem chassi/série'}</p>
                        <p className="text-xs text-muted-foreground">
                          Modelo: {m.model || '—'} · Ano: {m.year ?? '—'} · Situação atual:{' '}
                          {SITUATION_LABEL[m.machine_situation]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cliente: {m.client_name || '—'} ({m.client_code || '—'})
                        </p>
                      </div>
                      <Badge variant="outline">{SITUATION_LABEL[m.machine_situation]}</Badge>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Resultado da regularização</Label>
                        <Select
                          value={it.decision ?? ''}
                          onValueChange={(v) => {
                            const d = v as RegDecision;
                            setItem(m.equipment_id, {
                              decision: d,
                              destination_code: d === 'vendida' ? it.destination_code : '',
                              destination_name: d === 'vendida' ? it.destination_name : '',
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Definir resultado" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="permanece">Permanece com o cliente</SelectItem>
                            <SelectItem value="vendida">Vendida</SelectItem>
                            <SelectItem value="inativa">Inativa</SelectItem>
                            <SelectItem value="sucata">Sucata</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {isVendida ? (
                        <>
                          <div>
                            <Label className="text-xs">Código do cliente destino (opcional)</Label>
                            <Input
                              value={it.destination_code}
                              onChange={(e) =>
                                setItem(m.equipment_id, { destination_code: e.target.value })
                              }
                              placeholder="Ex.: 051445"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-xs">Nome do cliente destino (opcional)</Label>
                            <Input
                              value={it.destination_name}
                              onChange={(e) =>
                                setItem(m.equipment_id, { destination_name: e.target.value })
                              }
                              placeholder="Nome do novo proprietário"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Informe código e nome juntos para transferir a máquina; deixe ambos
                              vazios para manter no cliente atual.
                            </p>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {missing.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {missing.length} máquina(s) ainda sem resultado definido.
              </p>
            ) : null}
            {partialTransfer.length > 0 ? (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Para transferir a máquina, informe um cliente destino válido (código e nome juntos).
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button disabled={!canReview} onClick={() => setStep('review')}>
                Revisar regularização
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Revisão */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 font-medium whitespace-nowrap">Chassi/Série</th>
                    <th className="p-2 font-medium whitespace-nowrap">Situação anterior</th>
                    <th className="p-2 font-medium whitespace-nowrap">Nova situação</th>
                    <th className="p-2 font-medium whitespace-nowrap">Cliente destino</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m) => {
                    const it = getItem(m.equipment_id);
                    const dest = it.destination_code.trim()
                      ? `${it.destination_name.trim()} (${it.destination_code.trim()})`
                      : '—';
                    return (
                      <tr key={m.equipment_id} className="border-t">
                        <td className="p-2 whitespace-nowrap">{m.serial_chassis || '—'}</td>
                        <td className="p-2 whitespace-nowrap">{SITUATION_LABEL[m.machine_situation]}</td>
                        <td className="p-2 whitespace-nowrap">
                          <Badge variant="secondary">{DECISION_LABEL[it.decision!]}</Badge>
                        </td>
                        <td className="p-2">{it.decision === 'vendida' ? dest : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {machines.length} máquina(s) serão regularizadas. Ao confirmar, elas saem da lista de
              pendentes e o resultado é gravado no Parque com histórico.
            </p>

            {apply.isError ? (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Erro ao regularizar: {(apply.error as Error)?.message}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={apply.isPending} onClick={() => setStep('decisions')}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <Button disabled={apply.isPending} onClick={handleConfirm}>
                {apply.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Regularizando...
                  </>
                ) : (
                  'Confirmar regularização'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
