/**
 * Regularização — lotes por etapa (Aguardando envio → Aguardando retorno →
 * Em validação → Regularizados; Cancelados separado) e detalhe do lote.
 * Todas as ações passam por RPCs no banco (Filial Ativa validada lá).
 */
import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, Eye, FolderOpen, Loader2, Mail, Send,
  ClipboardCheck, CheckCircle2, XCircle, MinusCircle,
} from 'lucide-react';
import { formatDateDisplay } from '@/lib/utils';
import { buildRegularizationPdf, SITUATION_PDF_LABEL } from '@/lib/equipmentRegularizationPdf';
import {
  useRegularizationBatches, useRegularizationBatch, useMarkPdfGenerated, useRegisterSend,
  useStartValidation, useConcludeBatch, useCancelBatch, useRemoveBatchItem,
  type RegStage, type RegBatchRow,
} from '@/hooks/useEquipmentRegularization';

export const STAGE_LABEL: Record<RegStage, string> = {
  aguardando_envio: 'Aguardando envio',
  aguardando_retorno: 'Aguardando retorno',
  em_validacao: 'Em validação',
  regularizados: 'Regularizados',
  cancelado: 'Cancelados',
};

const STATUS_LABEL: Record<string, string> = {
  gerado: 'Aguardando envio', aguardando_envio: 'Aguardando envio', erro_envio: 'Aguardando envio (erro)',
  aguardando_retorno: 'Aguardando retorno', em_validacao: 'Em validação',
  enviado: 'Regularizado', concluido: 'Regularizado', cancelado: 'Cancelado',
};

const EVENT_LABEL: Record<string, string> = {
  criacao: 'Lote criado', envio: 'Envio registrado', reenvio: 'Reenvio registrado',
  inicio_validacao: 'Validação iniciada', retirada_maquina: 'Máquina retirada',
  conclusao: 'Lote concluído', cancelamento: 'Lote cancelado',
};

const OPEN = ['gerado', 'aguardando_envio', 'erro_envio', 'aguardando_retorno', 'em_validacao'];
const dt = (v?: string | null) => (v ? formatDateDisplay(v) : '—');
const dtt = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : '—');
const PAGE = 20;

/* ------------------------------ Lista por etapa ------------------------------ */
export const RegularizationBatchList: React.FC<{
  stage: RegStage; filialId: string | null; client: string | null;
}> = ({ stage, filialId, client }) => {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useRegularizationBatches(stage, filialId, client, page, PAGE);
  const rows = q.data?.batches ?? [];
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE));

  const dateCol = (b: RegBatchRow) =>
    stage === 'aguardando_envio' ? `Criado em ${dt(b.created_at)}`
      : stage === 'aguardando_retorno' ? `Enviado em ${dt(b.sent_at)}`
      : stage === 'em_validacao' ? `Validação desde ${dt(b.validation_started_at)}`
      : stage === 'regularizados' ? `Concluído em ${dt(b.applied_at)}`
      : `Cancelado em ${dt(b.cancelled_at)}`;

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        {q.isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando lotes...
          </p>
        ) : q.isError ? (
          <p className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {(q.error as Error)?.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum lote nesta etapa.</p>
        ) : rows.map((b) => (
          <div key={b.id} className="flex flex-col gap-2 border-t p-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">{b.clients || '—'}</p>
              <p className="text-xs text-muted-foreground">
                Lote {b.id.slice(0, 8)} · Código: {b.client_codes || '—'} · Filial: {b.filial_nome || 'Não informada'} · {dateCol(b)}
              </p>
              {stage === 'aguardando_retorno' && b.recipients?.length ? (
                <p className="text-xs text-muted-foreground">Para: {b.recipients.join(', ')} · {b.send_attempts} envio(s)</p>
              ) : null}
              {stage === 'cancelado' && b.cancel_reason ? (
                <p className="text-xs text-muted-foreground">Motivo: {b.cancel_reason}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{b.active_items} máquina(s)</Badge>
              {b.removed_items > 0 ? <Badge variant="outline">{b.removed_items} retirada(s)</Badge> : null}
              {b.status === 'erro_envio' ? <Badge variant="destructive">Erro no envio</Badge> : null}
              <Button size="sm" variant="outline" onClick={() => setOpenId(b.id)}>
                <FolderOpen className="mr-1 h-4 w-4" /> Abrir
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Página {page} de {pages}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <RegularizationBatchDetail batchId={openId} filialId={filialId} onClose={() => setOpenId(null)} />
    </div>
  );
};

/* ------------------------------ Detalhe do lote ------------------------------ */
type Prompt = null | { kind: 'cancel' } | { kind: 'remove'; itemId: string; label: string };

export const RegularizationBatchDetail: React.FC<{
  batchId: string | null; filialId: string | null; onClose: () => void;
}> = ({ batchId, filialId, onClose }) => {
  const batch = useRegularizationBatch(batchId, filialId);
  const markPdf = useMarkPdfGenerated();
  const send = useRegisterSend();
  const startVal = useStartValidation();
  const conclude = useConcludeBatch();
  const cancel = useCancelBatch();
  const remove = useRemoveBatchItem();
  const [recipients, setRecipients] = useState('');
  const [notes, setNotes] = useState('');
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [reason, setReason] = useState('');

  const b = batch.data;
  const isOpen = !!b && OPEN.includes(b.status);
  const busy = send.isPending || startVal.isPending || conclude.isPending || cancel.isPending || remove.isPending;
  const canSend = !!b && ['gerado', 'aguardando_envio', 'erro_envio', 'aguardando_retorno'].includes(b.status);
  const isResend = b?.status === 'aguardando_retorno';

  const close = () => { setRecipients(''); setNotes(''); setPrompt(null); setReason(''); onClose(); };

  const makePdf = async () => {
    if (!b) return null;
    const out = await buildRegularizationPdf(b);
    if (batchId && isOpen) markPdf.mutate({ batchId, filialId });
    return out;
  };
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const onDownload = async () => { const o = await makePdf(); if (o) download(o.blob, o.fileName); };
  const onPreview = async () => {
    const o = await makePdf(); if (!o) return;
    const url = URL.createObjectURL(o.blob);
    const w = window.open(url, '_blank'); if (!w) window.location.href = url;
  };
  const recipientList = () => recipients.split(/[;,\s]+/).map((s) => s.trim()).filter(Boolean);
  const onEmail = async () => {
    const o = await makePdf(); if (!o || !b) return;
    download(o.blob, o.fileName);
    const names = [...new Set(b.items.map((i) => `${i.client_name ?? '—'} (${i.client_code ?? '—'})`))];
    const subject = `Regularização de Máquinas — ${names.length === 1 ? names[0] : `${names.length} clientes`}`;
    const body = ['Prezado(a),', '', 'Segue em anexo o documento de Regularização de Máquinas referente ao seu Parque de Máquinas.', '',
      `Máquinas no documento: ${b.items.length}`, `Lote: ${b.id}`, '',
      'Solicitamos a conferência das informações e, caso haja divergência, o retorno a esta concessionária para atualização cadastral.', '',
      'Atenciosamente,', b.signer_name ?? '', b.signer_role ?? ''].join('\n');
    window.location.href = `mailto:${recipientList().join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const confirmPrompt = () => {
    if (!batchId || !prompt || !reason.trim()) return;
    if (prompt.kind === 'cancel') {
      cancel.mutate({ batchId, reason: reason.trim(), filialId }, { onSuccess: () => { setPrompt(null); setReason(''); } });
    } else {
      remove.mutate({ itemId: prompt.itemId, reason: reason.trim(), filialId }, { onSuccess: () => { setPrompt(null); setReason(''); } });
    }
  };

  return (
    <Dialog open={!!batchId} onOpenChange={(v) => { if (!v && !busy) close(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Lote {batchId?.slice(0, 8)}
            {b ? <Badge variant="secondary">{STATUS_LABEL[b.status] ?? b.status}</Badge> : null}
          </DialogTitle>
          <DialogDescription>
            {b ? `Criado em ${dtt(b.created_at ?? b.generated_at)}${b.created_by_name ? ` por ${b.created_by_name}` : ''}` : 'Carregando...'}
          </DialogDescription>
        </DialogHeader>

        {batch.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o lote...</p>
        ) : batch.isError ? (
          <p className="text-sm text-destructive">{(batch.error as Error)?.message}</p>
        ) : b ? (
          <div className="space-y-4">
            {/* Resumo de envio */}
            {b.sent_at ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p>Último envio: <span className="font-medium">{dtt(b.sent_at)}</span>{b.sent_by_name ? ` por ${b.sent_by_name}` : ''} · {b.send_attempts} envio(s)</p>
                <p className="text-muted-foreground">Destinatários: {b.recipients?.join(', ') || '—'}</p>
                {b.validation_started_at ? <p>Validação iniciada em {dtt(b.validation_started_at)}</p> : null}
                {b.applied_at ? <p>Concluído em {dtt(b.applied_at)}</p> : null}
              </div>
            ) : null}
            {b.status === 'cancelado' ? (
              <p className="rounded-md border p-3 text-sm">Cancelado em {dtt(b.cancelled_at)} · Motivo: {b.cancel_reason || '—'}</p>
            ) : null}

            {/* Documento */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onPreview} disabled={b.items.length === 0}><Eye className="mr-1 h-4 w-4" /> Visualizar PDF</Button>
              <Button size="sm" variant="outline" onClick={onDownload} disabled={b.items.length === 0}><Download className="mr-1 h-4 w-4" /> Baixar PDF</Button>
            </div>

            {/* Envio / reenvio */}
            {canSend ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs">Destinatários (separe por vírgula)</Label>
                <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="cliente@empresa.com.br" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={onEmail} disabled={b.items.length === 0}>
                    <Mail className="mr-1 h-4 w-4" /> Abrir e-mail com PDF
                  </Button>
                  <Button size="sm" disabled={busy || recipientList().length === 0 || b.items.length === 0}
                    onClick={() => send.mutate({ batchId: b.id, recipients: recipientList(), filialId }, { onSuccess: () => setRecipients('') })}>
                    <Send className="mr-1 h-4 w-4" /> {isResend ? 'Registrar reenvio' : 'Registrar envio'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  "Abrir e-mail" baixa o PDF e abre seu e-mail; anexe o arquivo e envie. Depois de enviar de verdade, clique em
                  "{isResend ? 'Registrar reenvio' : 'Registrar envio'}" para gravar data, usuário e destinatários.
                </p>
              </div>
            ) : null}

            {/* Validação / conclusão */}
            {b.status === 'aguardando_retorno' || b.status === 'em_validacao' ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                {b.status === 'aguardando_retorno' ? (
                  <Button size="sm" disabled={busy} onClick={() => startVal.mutate({ batchId: b.id, notes, filialId }, { onSuccess: () => setNotes('') })}>
                    <ClipboardCheck className="mr-1 h-4 w-4" /> Iniciar validação (cliente respondeu)
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy || b.items.length === 0} onClick={() => conclude.mutate({ batchId: b.id, notes, filialId }, { onSuccess: () => setNotes('') })}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Concluir e regularizar {b.items.length} máquina(s)
                  </Button>
                )}
                {b.status === 'em_validacao' && b.items.length === 0 ? (
                  <p className="text-xs text-destructive">Todas as máquinas foram retiradas: cancele o lote.</p>
                ) : null}
              </div>
            ) : null}

            {/* Máquinas */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 font-medium">Cliente</th>
                    <th className="p-2 font-medium whitespace-nowrap">Chassi/Série</th>
                    <th className="p-2 font-medium">Modelo</th>
                    <th className="p-2 font-medium">Situação</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {b.items.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="p-2">{i.client_name || '—'} <span className="text-xs text-muted-foreground">({i.client_code || '—'})</span></td>
                      <td className="p-2 whitespace-nowrap">{i.serial_chassis || '—'}</td>
                      <td className="p-2">{i.model || '—'}</td>
                      <td className="p-2"><Badge variant="outline">{SITUATION_PDF_LABEL[i.machine_situation] ?? i.machine_situation}</Badge></td>
                      <td className="p-2 text-right">
                        {isOpen ? (
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={() => { setReason(''); setPrompt({ kind: 'remove', itemId: i.id, label: i.serial_chassis || i.model || 'máquina' }); }}>
                            <MinusCircle className="mr-1 h-4 w-4" /> Retirar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {b.items.length === 0 ? (
                    <tr><td colSpan={5} className="p-3 text-sm text-muted-foreground">Nenhuma máquina ativa no lote.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {b.removed_items?.length ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-1 font-medium">Máquinas retiradas (não entram no PDF nem na conclusão)</p>
                {b.removed_items.map((r) => (
                  <p key={r.id} className="text-muted-foreground">
                    {r.serial_chassis || '—'} · {r.client_name || '—'} — {r.removed_reason} ({dtt(r.removed_at)}{r.removed_by_name ? `, ${r.removed_by_name}` : ''})
                  </p>
                ))}
              </div>
            ) : null}

            {b.history?.length ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-1 font-medium">Histórico</p>
                {b.history.map((h, idx) => (
                  <p key={idx} className="text-muted-foreground">
                    {dtt(h.at)} — {EVENT_LABEL[h.event] ?? h.event}{h.by_name ? ` · ${h.by_name}` : ''}
                    {h.recipients?.length ? ` · ${h.recipients.join(', ')}` : ''}
                    {h.serial_chassis ? ` · ${h.serial_chassis}` : ''}
                    {h.reason ? ` · Motivo: ${h.reason}` : ''}
                    {h.notes ? ` · ${h.notes}` : ''}
                  </p>
                ))}
              </div>
            ) : null}

            {/* Motivo (cancelar / retirar) */}
            {prompt ? (
              <div className="space-y-2 rounded-md border border-destructive/50 p-3">
                <Label className="text-xs">
                  {prompt.kind === 'cancel' ? 'Motivo do cancelamento (obrigatório)' : `Motivo da retirada de ${prompt.label} (obrigatório)`}
                </Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPrompt(null)}>Voltar</Button>
                  <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={confirmPrompt}>Confirmar</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          {isOpen && !prompt ? (
            <Button variant="destructive" disabled={busy} onClick={() => { setReason(''); setPrompt({ kind: 'cancel' }); }}>
              <XCircle className="mr-1 h-4 w-4" /> Cancelar lote
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={close}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
