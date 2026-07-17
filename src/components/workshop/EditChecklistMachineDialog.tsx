import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Wrench, Save, ListChecks, PencilLine, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useEquipmentByClient, ClientEquipment } from '@/hooks/useClientEquipment';
import { MACHINE_TYPES, MACHINE_STATUSES } from '@/components/equipment/equipmentConstants';
import { QUERY_KEYS } from '@/hooks/useTasksOptimized';
import { Task } from '@/types/task';

interface Props {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

interface ManualForm {
  tipo: string;
  modelo: string;
  chassi_serie: string;
  ano: string;
  horimetro: string;
  status: string;
  observacao: string;
}

const emptyForm: ManualForm = {
  tipo: '',
  modelo: '',
  chassi_serie: '',
  ano: '',
  horimetro: '',
  status: 'ativa',
  observacao: '',
};

const fromEquipment = (e: ClientEquipment): ManualForm => ({
  tipo: e.machine_type || '',
  modelo: e.model || '',
  chassi_serie: e.serial_chassis || '',
  ano: e.year ? String(e.year) : '',
  horimetro: e.hours != null ? String(e.hours) : '',
  status: e.machine_status || 'ativa',
  observacao: e.observation || '',
});

export const EditChecklistMachineDialog: React.FC<Props> = ({ task, isOpen, onClose }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const qc = useQueryClient();

  const { data: equipments = [], isLoading: loadingEq } = useEquipmentByClient(
    task.clientCode,
    task.client,
  );

  const [tab, setTab] = useState<'select' | 'manual'>('select');
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState<ManualForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const singleSuggestion = equipments.length === 1 ? equipments[0] : null;

  const selectedEquipment = useMemo(
    () => equipments.find((e) => e.id === selectedId) || null,
    [equipments, selectedId],
  );

  const handlePickExisting = (id: string) => {
    setSelectedId(id);
    const eq = equipments.find((e) => e.id === id);
    if (eq) setForm(fromEquipment(eq));
  };

  const patchForm = (k: keyof ManualForm, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const buildPayload = () => {
    const trim = (v: string) => v.trim() || undefined;
    const userLabel = profile?.name || user?.email || 'usuário';
    const auditNote = `Máquina informada manualmente por ${userLabel} em ${format(
      new Date(),
      "dd/MM/yyyy 'às' HH:mm",
    )}.`;
    const baseObs = trim(form.observacao);
    const observacao = baseObs ? `${baseObs}\n\n${auditNote}` : auditNote;

    const yearNum = form.ano ? Number(form.ano) : undefined;
    const hoursNum = form.horimetro ? Number(form.horimetro) : undefined;

    return {
      equipment_id: tab === 'select' ? selectedEquipment?.id : undefined,
      tipo: trim(form.tipo),
      modelo: trim(form.modelo),
      chassi_serie: trim(form.chassi_serie),
      ano: Number.isFinite(yearNum) ? yearNum : trim(form.ano),
      horimetro: Number.isFinite(hoursNum) ? hoursNum : trim(form.horimetro),
      status: trim(form.status),
      observacao,
    };
  };

  const canSave = useMemo(() => {
    if (tab === 'select') return !!selectedEquipment;
    return !!(form.tipo.trim() || form.modelo.trim() || form.chassi_serie.trim());
  }, [tab, selectedEquipment, form]);

  const handleSave = async () => {
    if (!canSave) {
      toast({
        title: 'Preencha ao menos um dado da máquina',
        description: 'Selecione uma máquina existente ou informe tipo, modelo ou chassi.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();

      const { error: updErr } = await supabase
        .from('tasks')
        .update({ checklist_machine: payload as any })
        .eq('id', task.id);
      if (updErr) throw updErr;

      // Auditoria (best-effort — não bloqueia salvamento).
      try {
        await supabase.from('audit_log' as any).insert({
          table_name: 'tasks',
          operation: 'UPDATE_CHECKLIST_MACHINE',
          user_id: user?.id ?? null,
          old_values: { checklist_machine: task.checklistMachine ?? null } as any,
          new_values: { checklist_machine: payload } as any,
        });
      } catch (auditErr) {
        console.warn('[EditChecklistMachine] audit_log falhou:', auditErr);
      }

      await qc.invalidateQueries({ queryKey: QUERY_KEYS.taskDetails(task.id) });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.tasks });

      toast({
        title: 'Máquina informada com sucesso',
        description: 'O checklist foi atualizado com os dados da máquina.',
      });
      onClose();
    } catch (e: any) {
      console.error('[EditChecklistMachine] erro:', e);
      toast({
        title: 'Não foi possível salvar',
        description: e?.message || 'Verifique sua permissão e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Informar máquina do checklist
          </DialogTitle>
          <DialogDescription>
            Preencha manualmente os dados da máquina inspecionada neste checklist.
            Apenas o campo <span className="font-mono">checklist_machine</span> desta tarefa será atualizado.
            Itens, fotos, observações e status permanecem inalterados.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground flex gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p><span className="font-semibold text-foreground">Cliente:</span> {task.client || '—'} {task.clientCode ? `(${task.clientCode})` : ''}</p>
            <p><span className="font-semibold text-foreground">Data do checklist:</span> {task.startDate ? format(new Date(task.startDate), 'dd/MM/yyyy') : '—'}</p>
          </div>
        </div>

        {singleSuggestion && tab === 'select' && !selectedId && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="font-semibold text-foreground mb-1">Sugestão (não selecionada automaticamente)</p>
            <p className="text-muted-foreground mb-2">
              Este cliente possui apenas uma máquina cadastrada. Confirme se é a máquina inspecionada:
            </p>
            <div className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {singleSuggestion.model || '—'}{' '}
                  <span className="text-muted-foreground">
                    · {singleSuggestion.machine_type || 'Tipo ?'}
                  </span>
                </p>
                <p className="text-xs font-mono text-muted-foreground truncate">
                  Chassi: {singleSuggestion.serial_chassis || '—'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePickExisting(singleSuggestion.id)}
              >
                Usar esta máquina
              </Button>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="select" className="flex items-center gap-1.5">
              <ListChecks className="w-4 h-4" /> Selecionar existente
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-1.5">
              <PencilLine className="w-4 h-4" /> Preencher manualmente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-3 mt-3">
            {loadingEq ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">
                Carregando máquinas do cliente…
              </p>
            ) : equipments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma máquina cadastrada para este cliente. Use a aba
                <span className="font-semibold text-foreground"> Preencher manualmente</span>.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {equipments.map((e) => {
                  const active = e.id === selectedId;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => handlePickExisting(e.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        active
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {e.model || 'Modelo ?'}{' '}
                            <span className="text-muted-foreground text-xs">
                              · {e.machine_type || 'Tipo ?'}
                            </span>
                          </p>
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            Chassi: {e.serial_chassis || '—'}
                            {e.year ? ` · Ano ${e.year}` : ''}
                            {e.hours != null ? ` · ${e.hours}h` : ''}
                          </p>
                        </div>
                        <Badge variant={active ? 'default' : 'outline'} className="text-[10px]">
                          {active ? 'Selecionada' : e.machine_status || 'ativa'}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => patchForm('tipo', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Modelo</Label>
                <Input value={form.modelo} onChange={(e) => patchForm('modelo', e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Chassi / Nº de Série</Label>
                <Input
                  value={form.chassi_serie}
                  onChange={(e) => patchForm('chassi_serie', e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label>Ano</Label>
                <Input
                  value={form.ano}
                  inputMode="numeric"
                  onChange={(e) => patchForm('ano', e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
              <div className="space-y-1">
                <Label>Horímetro</Label>
                <Input
                  value={form.horimetro}
                  inputMode="numeric"
                  onChange={(e) => patchForm('horimetro', e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => patchForm('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Observação</Label>
                <Textarea
                  rows={3}
                  value={form.observacao}
                  onChange={(e) => patchForm('observacao', e.target.value)}
                  placeholder="Observação técnica sobre a máquina (opcional)"
                />
                <p className="text-[11px] text-muted-foreground">
                  A auditoria com nome do usuário e data será anexada automaticamente.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Salvando…' : 'Salvar máquina'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
