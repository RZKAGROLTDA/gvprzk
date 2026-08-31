/**
 * Regularização de Máquinas — criação do lote e geração do documento.
 *
 * REGRAS (não alterar sem validação):
 *  - Criar o lote NÃO regulariza: nada é alterado em client_equipment.
 *  - Gerar/baixar o PDF NÃO regulariza.
 *  - O lote permanece em "Aguardando envio" e as máquinas continuam pendentes.
 *  - A situação exibida vem do snapshot gravado no item do lote.
 *  - O envio por e-mail será plugado depois (etapa futura), e só então o lote
 *    poderá ser concluído via equipment_regularization_finalize.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, Loader2, Wrench } from 'lucide-react';
import {
  useCreateRegularizationBatch,
  useMarkPdfGenerated,
  useRegularizationBatch,
  type RegMachine,
  type RegSituation,
} from '@/hooks/useEquipmentRegularization';
import { buildRegularizationPdf } from '@/lib/equipmentRegularizationPdf';

const SITUATION_LABEL: Record<RegSituation, string> = {
  vendida: 'Vendida',
  inativa: 'Inativa',
  sucata: 'Sucata',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: RegMachine[];
  onDone: () => void;
}

export const RegularizationBatchDialog: React.FC<Props> = ({
  open, onOpenChange, machines, onDone,
}) => {
  const createBatch = useCreateRegularizationBatch();
  const markPdf = useMarkPdfGenerated();
  const [batchId, setBatchId] = useState<string | null>(null);
  const batch = useRegularizationBatch(batchId);

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pmp, setPmp] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('Gerente Corporativo de Serviços');
  const [notes, setNotes] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const clients = useMemo(() => {
    const seen = new Map<string, { code: string; name: string }>();
    machines.forEach((m) => {
      const key = `${m.client_code ?? ''}|${m.client_name ?? ''}`;
      if (!seen.has(key)) seen.set(key, { code: m.client_code ?? '—', name: m.client_name ?? '—' });
    });
    return [...seen.values()];
  }, [machines]);

  const reset = () => {
    setBatchId(null);
    setCity(''); setState(''); setPmp(''); setNotes('');
    setSignerName(''); setSignerRole('Gerente Corporativo de Serviços');
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  };

  const handleClose = (v: boolean) => {
    if (createBatch.isPending) return;
    onOpenChange(v);
    if (!v) {
      const created = !!batchId;
      reset();
      if (created) onDone();
    }
  };

  const handleCreate = () => {
    createBatch.mutate(
      {
        equipmentIds: machines.map((m) => m.equipment_id),
        headerCity: city.trim() || null,
        headerState: state.trim() || null,
        pmpNumber: pmp.trim() || null,
        signerName: signerName.trim() || null,
        signerRole: signerRole.trim() || null,
        notes: notes.trim() || null,
      },
      { onSuccess: (d) => setBatchId(d.batch_id) },
    );
  };

  const makePdf = () => {
    if (!batch.data) return null;
    const { blob, fileName } = buildRegularizationPdf(batch.data);
    if (batchId) markPdf.mutate(batchId);
    return { blob, fileName };
  };

  const handleDownload = () => {
    const out = makePdf();
    if (!out) return;
    const url = URL.createObjectURL(out.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = out.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = () => {
    const out = makePdf();
    if (!out) return;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    const url = URL.createObjectURL(out.blob);
    setPdfUrl(url);
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            {batchId ? 'Lote de regularização criado' : 'Criar lote de regularização'}
          </DialogTitle>
          <DialogDescription>
            {batchId
              ? 'Gere o documento do lote. As máquinas continuam pendentes até o envio ao cliente.'
              : 'Revise as máquinas selecionadas. A situação vem do Parque e não é alterada aqui.'}
          </DialogDescription>
        </DialogHeader>

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

        {!batchId ? (
          <>
            {/* Dados do documento */}
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Cidade do documento</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Rio Verde" />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Ex.: GO" maxLength={2} />
              </div>
              <div>
                <Label className="text-xs">Nº PMP (opcional)</Label>
                <Input value={pmp} onChange={(e) => setPmp(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Responsável RZK</Label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Nome do responsável" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Cargo do responsável</Label>
                <Input value={signerRole} onChange={(e) => setSignerRole(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Observações (opcional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            {/* Revisão do snapshot */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 font-medium whitespace-nowrap">Chassi/Série</th>
                    <th className="p-2 font-medium whitespace-nowrap">Modelo</th>
                    <th className="p-2 font-medium whitespace-nowrap">Ano</th>
                    <th className="p-2 font-medium whitespace-nowrap">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m) => (
                    <tr key={m.equipment_id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{m.serial_chassis || '—'}</td>
                      <td className="p-2">{m.model || '—'}</td>
                      <td className="p-2 whitespace-nowrap">{m.year ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">
                        <Badge variant="outline">{SITUATION_LABEL[m.machine_situation]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              Criar o lote não regulariza as máquinas: nada é alterado no Parque e elas continuam
              na lista de pendências até o documento ser enviado ao cliente.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button disabled={machines.length === 0 || createBatch.isPending} onClick={handleCreate}>
                {createBatch.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando lote...</>
                ) : (
                  'Criar lote'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="font-medium">Lote {batchId.slice(0, 8)}</span>
              <Badge variant="secondary">Aguardando envio</Badge>
              <span className="text-muted-foreground">
                {batch.data?.items.length ?? machines.length} máquina(s) no documento
              </span>
            </div>

            {batch.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando o lote...
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button disabled={!batch.data} onClick={handlePreview} variant="outline">
                <Eye className="mr-2 h-4 w-4" /> Visualizar PDF
              </Button>
              <Button disabled={!batch.data} onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" /> Baixar PDF
              </Button>
            </div>

            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" />
              O documento usa exatamente o snapshot gravado no lote. Enquanto o envio ao cliente não
              for confirmado, as máquinas permanecem pendentes e o Parque não é alterado.
            </p>

            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Concluir</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
