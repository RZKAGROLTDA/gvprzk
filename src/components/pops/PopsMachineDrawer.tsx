import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useCompletePopsMachine, usePopsServices, type PopsMachineRow } from '@/hooks/usePops';
import { PopsStatusBadge } from '@/components/pops/PopsStatusBadge';

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type Props = {
  machine: PopsMachineRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canComplete: boolean;
};

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium text-foreground break-words">{value || '—'}</p>
  </div>
);

export const PopsMachineDrawer: React.FC<Props> = ({ machine, open, onOpenChange, canComplete }) => {
  const { data: services = [], isLoading: loadingServices } = usePopsServices();
  const complete = useCompletePopsMachine();
  const [serviceId, setServiceId] = useState<string>('');
  const [osNumber, setOsNumber] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rpcError, setRpcError] = useState<string | null>(null);

  useEffect(() => {
    setServiceId('');
    setOsNumber('');
    setRpcError(null);
  }, [machine?.pops_machine_id]);

  if (!machine) return null;

  const isServiced = machine.status === 'servicada';
  const showForm = !isServiced && canComplete;
  const selectedService = services.find((s) => s.id === serviceId);

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setRpcError(null);
    try {
      await complete.mutateAsync({
        machineId: machine.pops_machine_id,
        serviceId,
        osNumber: osNumber.trim(),
      });
      toast.success('Máquina concluída com sucesso.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível concluir a máquina.';
      setRpcError(msg);
      toast.error(msg);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex flex-wrap items-center gap-2">
              <span className="break-all">{machine.pops_serial || 'Sem serial'}</span>
              <PopsStatusBadge status={machine.status} />
            </SheetTitle>
            <SheetDescription>
              {machine.pops_client_name || 'Cliente não informado'}
              {machine.pops_model ? ` · ${machine.pops_model}` : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Modelo" value={machine.pops_model} />
            <Field label="Série do produto" value={machine.pops_product_series} />
            <Field label="Ano" value={machine.pops_manufacture_year} />
            <Field label="Plataforma" value={machine.pops_platform} />
            <Field label="Localização" value={machine.pops_dealer_location} />
            <Field label="Filial" value={machine.filial_nome} />
          </div>

          {machine.equipment_id && (
            <p className="mt-3 text-xs text-muted-foreground">Vinculada ao Parque de Máquinas</p>
          )}

          <Separator className="my-4" />

          {isServiced ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold uppercase tracking-wide">Serviçada</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Serviço" value={machine.final_service_name} />
                <Field label="OS" value={machine.os_number} />
                <Field label="Executado por" value={machine.executed_by_name} />
                <Field label="Data" value={formatDateTime(machine.executed_at)} />
              </div>
            </div>
          ) : showForm ? (
            <div className="space-y-5">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Serviço</Label>
                {loadingServices ? (
                  <p className="mt-2 text-sm text-muted-foreground">Carregando serviços…</p>
                ) : services.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nenhum serviço ativo disponível.</p>
                ) : (
                  <RadioGroup value={serviceId} onValueChange={setServiceId} className="mt-2 space-y-2">
                    {services.map((s) => (
                      <label
                        key={s.id}
                        htmlFor={`svc-${s.id}`}
                        className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
                      >
                        <RadioGroupItem value={s.id} id={`svc-${s.id}`} />
                        <span className="text-sm font-medium">{s.name}</span>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </div>

              <div>
                <Label htmlFor="pops-os" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Número da OS
                </Label>
                <Input
                  id="pops-os"
                  value={osNumber}
                  onChange={(e) => setOsNumber(e.target.value)}
                  placeholder="Ex.: 123456 ou OS-2026/117"
                  className="mt-2"
                  autoComplete="off"
                />
              </div>

              {rpcError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{rpcError}</AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full h-12 text-base"
                disabled={!serviceId || !osNumber.trim() || complete.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {complete.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Wrench className="mr-2 h-5 w-5" />
                    CONCLUIR SERVIÇO
                  </>
                )}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Seu perfil tem acesso de acompanhamento: a conclusão de máquinas não está disponível.
            </p>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar conclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmar conclusão desta máquina com o serviço {selectedService?.name ?? '—'} e OS{' '}
              {osNumber.trim() || '—'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
