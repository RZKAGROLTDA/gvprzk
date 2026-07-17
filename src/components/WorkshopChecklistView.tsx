import React, { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Wrench, FileText, Download, Printer, Mail, User, Building2, Calendar,
  MapPin, Navigation, Clock, ClipboardCheck, AlertTriangle, CheckCircle2,
  XCircle, Camera, Phone, AtSign, Image as ImageIcon, ShieldCheck, X,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionCard } from '@/components/task-form/sections/SectionCard';
import { Task } from '@/types/task';
import { useToast } from '@/hooks/use-toast';
import { formatDateDisplay } from '@/lib/utils';
import { getFilialNameRobust } from '@/lib/taskStandardization';
import { buildWorkshopChecklistReport, STATUS_META, ChecklistStatus, LEGACY_TRANSITION_NOTE } from '@/lib/workshopChecklistReport';
import { generateTaskPDF } from './TaskPDFGenerator';
import { getTaskTypeLabel, calculateTaskTotalValue } from './TaskFormCore';
import { useUserRole } from '@/hooks/useUserRole';
import { EditChecklistMachineDialog } from './workshop/EditChecklistMachineDialog';
import { PencilLine, Info } from 'lucide-react';

interface Props {
  task: Task;
  filiais: any[];
  isOpen: boolean;
  onClose: () => void;
}

const statusVariant = (s: ChecklistStatus): any =>
  s === 'conforme' ? 'success'
  : s === 'atencao' ? 'warning'
  : s === 'nao_conforme' ? 'destructive'
  : s === 'na' ? 'secondary'
  : 'outline';

const statusLabel = (s: ChecklistStatus) => {
  if (s === null) return STATUS_META.none;
  return STATUS_META[s];
};

const Field: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
    <p className={`text-sm text-foreground break-words ${mono ? 'font-mono' : ''}`}>
      {value ? value : <span className="text-muted-foreground italic">Não informado</span>}
    </p>
  </div>
);

const HeaderMeta: React.FC<{ label: string; value?: string; mono?: boolean; highlight?: boolean }> = ({
  label, value, mono, highlight,
}) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
    <p className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${highlight ? 'text-primary' : 'text-foreground'}`}>
      {value || <span className="text-muted-foreground italic font-normal">—</span>}
    </p>
  </div>
);

const SummaryCard: React.FC<{ label: string; value: string; tone: 'primary' | 'success' | 'warning' | 'destructive' | 'muted' }> = ({
  label, value, tone,
}) => {
  const tones: Record<string, string> = {
    primary: 'border-primary/30 bg-primary/5 text-primary',
    success: 'border-success/30 bg-success/5 text-success',
    warning: 'border-warning/30 bg-warning/5 text-warning',
    destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
    muted: 'border-border bg-muted/30 text-muted-foreground',
  };
  return (
    <div className={`rounded-xl border-2 p-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold mb-1 opacity-80">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
    </div>
  );
};

export const WorkshopChecklistView: React.FC<Props> = ({ task, filiais, isOpen, onClose }) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [editMachineOpen, setEditMachineOpen] = useState(false);
  const { isAdmin, isManager } = useUserRole();

  const report = buildWorkshopChecklistReport(task);
  // Registros legados NUNCA permitem edição posterior da máquina — evita informação incorreta no histórico.
  const canEditMachine = (isAdmin || isManager) && !report.isLegacy;

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateTaskPDF(task, calculateTaskTotalValue, getTaskTypeLabel, filiais);
      toast({ title: 'PDF gerado com sucesso!', description: 'O arquivo foi baixado automaticamente.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro ao gerar PDF', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => window.print();

  const handleEmail = () => {
    const subject = `Relatório de Checklist da Oficina - ${task.client || 'Cliente'}`;
    const body = [
      `Cliente: ${task.client || '—'}`,
      `Máquina: ${report.machine.modelo || '—'} · Chassi: ${report.machine.chassi_serie || '—'}`,
      `Responsável técnico: ${task.responsible || '—'}`,
      `Data: ${task.startDate ? formatDateDisplay(task.startDate) : '—'}`,
      '',
      `Itens avaliados: ${report.counts.total}`,
      `Conformes: ${report.counts.conforme} · Atenção: ${report.counts.atencao} · Não conformes: ${report.counts.naoConforme} · N/A: ${report.counts.na}`,
      '',
      `Conclusão: ${report.conclusion}`,
    ].join('\n');
    window.open(`mailto:${task.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const conclusionTone =
    report.counts.naoConforme > 0 ? 'destructive'
    : report.counts.atencao > 0 ? 'warning'
    : report.counts.naoPreenchido > 0 ? 'warning'
    : 'success';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[95vh] overflow-y-auto overflow-x-hidden p-0 w-[96vw] max-w-[96vw] sm:w-full sm:max-w-6xl">
          <div className="print:p-4">
            {/* CABEÇALHO TÉCNICO */}
            <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/15 via-primary/5 to-background">
              <div className="relative p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
                      <Wrench className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                        Checklist da Oficina
                      </Badge>
                      <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight tracking-tight">
                        Relatório de Checklist da Oficina
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.client || 'Cliente não informado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 print:hidden">
                    <Button variant="default" size="sm" onClick={handleGeneratePDF} disabled={isGeneratingPDF}>
                      <Download className="w-4 h-4 mr-1" /> {isGeneratingPDF ? 'Gerando…' : 'PDF'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Printer className="w-4 h-4 mr-1" /> Imprimir
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleEmail}>
                      <Mail className="w-4 h-4 mr-1" /> Email
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 rounded-xl border bg-background/60 backdrop-blur-sm p-4">
                  <HeaderMeta label="Nº do Relatório" value={task.id?.slice(0, 8).toUpperCase()} mono />
                  <HeaderMeta label="Data" value={task.startDate ? formatDateDisplay(task.startDate) : undefined} />
                  <HeaderMeta label="Responsável técnico" value={task.responsible} />
                  <HeaderMeta label="Filial" value={getFilialNameRobust(task.filial, filiais)} />
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-7 space-y-4">
              {/* CLIENTE */}
              <SectionCard icon={User} title="Cliente" tone="primary">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <Field label="Nome" value={task.client} />
                  <Field label="Código" value={task.clientCode} mono />
                  <Field label="Propriedade" value={task.property} />
                  <Field label="Contato" value={task.contactName || task.responsible} />
                  <Field label="Telefone" value={task.phone} />
                  <Field label="E-mail" value={task.email} />
                </div>
                {!report.hasContact && (
                  <p className="mt-3 text-xs italic text-muted-foreground">Contato do cliente não informado.</p>
                )}
              </SectionCard>

              {/* MÁQUINA */}
              <SectionCard
                icon={Wrench}
                title="Máquina"
                tone="primary"
                description={report.machine.modelo || report.machine.tipo || undefined}
                headerRight={
                  canEditMachine && report.machine.hasAny ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="print:hidden"
                      onClick={() => setEditMachineOpen(true)}
                    >
                      <PencilLine className="w-3.5 h-3.5 mr-1" /> Editar máquina
                    </Button>
                  ) : undefined
                }
              >
                {report.machine.hasAny ? (
                  <>
                    <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-primary mb-1">Chassi / Nº de Série</p>
                      <p className="text-2xl font-bold font-mono text-foreground break-all">
                        {report.machine.chassi_serie || (
                          <span className="text-muted-foreground italic text-base font-normal">Não informado</span>
                        )}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <Field label="Tipo" value={report.machine.tipo} />
                      <Field label="Modelo" value={report.machine.modelo} />
                      <Field label="Ano" value={report.machine.ano} />
                      <Field label="Horímetro" value={report.machine.horimetro} />
                      <Field
                        label="Status"
                        value={report.machine.status ? report.machine.status.charAt(0).toUpperCase() + report.machine.status.slice(1) : undefined}
                      />
                    </div>
                    {report.machine.observacao && (
                      <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Observação da máquina</p>
                        <p className="text-sm whitespace-pre-wrap">{report.machine.observacao}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm italic text-muted-foreground">
                      Máquina não informada.
                    </p>
                    {canEditMachine ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="print:hidden"
                        onClick={() => setEditMachineOpen(true)}
                      >
                        <PencilLine className="w-4 h-4 mr-1" /> Informar máquina
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Solicite a um gerente ou administrador para complementar os dados da máquina deste checklist.
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* LOCALIZAÇÃO */}
              {report.location.hasLocation ? (
                <SectionCard
                  icon={MapPin}
                  title="Localização do Checklist"
                  tone="success"
                  description={`${report.location.lat!.toFixed(6)}, ${report.location.lng!.toFixed(6)}`}
                  headerRight={
                    <Button
                      variant="outline"
                      size="sm"
                      className="print:hidden"
                      onClick={() => window.open(report.location.googleMapsUrl!, '_blank')}
                    >
                      <Navigation className="w-3.5 h-3.5 mr-1" /> Google Maps
                    </Button>
                  }
                >
                  <div className="rounded-lg overflow-hidden border bg-muted">
                    <iframe
                      title="Mapa do check-in"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${report.location.lng! - 0.005}%2C${report.location.lat! - 0.003}%2C${report.location.lng! + 0.005}%2C${report.location.lat! + 0.003}&layer=mapnik&marker=${report.location.lat}%2C${report.location.lng}`}
                      className="w-full h-56 sm:h-72"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <Field label="Latitude" value={report.location.lat!.toFixed(6)} mono />
                    <Field label="Longitude" value={report.location.lng!.toFixed(6)} mono />
                    <Field
                      label="Horário do check-in"
                      value={report.location.timestamp ? format(report.location.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : undefined}
                    />
                  </div>
                </SectionCard>
              ) : (
                <SectionCard icon={MapPin} title="Localização do Checklist" tone="muted">
                  <div className="text-center py-6 text-sm text-muted-foreground italic">
                    <Navigation className="w-8 h-8 mx-auto opacity-30 mb-2" />
                    Localização não registrada
                  </div>
                </SectionCard>
              )}

              {/* RESUMO */}
              <SectionCard icon={ClipboardCheck} title="Resumo" tone="primary">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <SummaryCard label="Total" value={String(report.counts.total)} tone="primary" />
                  <SummaryCard label="Conformes" value={String(report.counts.conforme)} tone={report.counts.conforme > 0 ? 'success' : 'muted'} />
                  <SummaryCard label="Atenção" value={String(report.counts.atencao)} tone={report.counts.atencao > 0 ? 'warning' : 'muted'} />
                  <SummaryCard label="Não conformes" value={String(report.counts.naoConforme)} tone={report.counts.naoConforme > 0 ? 'destructive' : 'muted'} />
                  <SummaryCard label="N/A" value={String(report.counts.na)} tone="muted" />
                  <SummaryCard label="Não preenchidos" value={String(report.counts.naoPreenchido)} tone={report.counts.naoPreenchido > 0 ? 'warning' : 'muted'} />
                </div>
              </SectionCard>

              {/* SERVIÇOS VERIFICADOS */}
              <SectionCard
                icon={ClipboardCheck}
                title="Serviços verificados"
                tone={conclusionTone as any}
                description={`${report.counts.total} item(ns)`}
              >
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Serviço verificado</TableHead>
                        <TableHead className="text-center whitespace-nowrap">Resultado</TableHead>
                        <TableHead className="min-w-[240px]">Observação / Fotos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.items.map((it, idx) => {
                        const meta = statusLabel(it.status);
                        return (
                          <TableRow key={`${it.name}-${idx}`} className={idx % 2 === 1 ? 'bg-muted/20 align-top' : 'align-top'}>
                            <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                            <TableCell className="text-sm font-medium">{it.name}</TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              <Badge variant={statusVariant(it.status)} className="text-xs inline-flex items-center gap-1">
                                <span className="font-mono font-bold">{meta.sym}</span> {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {it.notes ? (
                                <p className="text-foreground whitespace-pre-wrap mb-2">{it.notes}</p>
                              ) : (
                                <p className="text-muted-foreground italic mb-2">Sem observação</p>
                              )}
                              {it.photos.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {it.photos.map((ph, pi) => (
                                    <button
                                      key={pi}
                                      type="button"
                                      onClick={() => setLightboxPhoto(ph)}
                                      className="focus:outline-none focus:ring-2 focus:ring-primary rounded"
                                    >
                                      <img
                                        src={ph}
                                        alt={`${it.name} — foto ${pi + 1}`}
                                        className="w-16 h-16 object-cover rounded border hover:opacity-80 transition-opacity"
                                        loading="lazy"
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>

              {/* OBSERVAÇÃO GERAL — apenas quando preenchida */}
              {report.hasGeneralObservations && (
                <SectionCard icon={FileText} title="Observação geral" tone="primary">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                    {report.generalObservations}
                  </p>
                </SectionCard>
              )}

              {/* RECOMENDAÇÕES TÉCNICAS */}
              <SectionCard
                icon={AlertTriangle}
                title="Recomendações técnicas"
                tone={report.recommendations.length > 0 ? 'warning' : 'success'}
                description={report.recommendations.length > 0 ? `${report.recommendations.length} recomendação(ões)` : undefined}
              >
                {report.recommendations.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-4 text-sm text-foreground">
                    <ShieldCheck className="w-5 h-5 text-success" />
                    Nenhuma recomendação técnica registrada.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {report.recommendations.map((r, i) => (
                      <li
                        key={i}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          r.status === 'nao_conforme'
                            ? 'border-destructive/30 bg-destructive/5'
                            : 'border-warning/30 bg-warning/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant={r.status === 'nao_conforme' ? 'destructive' : 'warning'} className="text-[10px] uppercase">
                            {r.status === 'nao_conforme' ? 'Não conforme' : 'Atenção'}
                          </Badge>
                          <span className="font-semibold text-foreground">{r.name}</span>
                        </div>
                        {r.note ? (
                          <p className="text-xs text-muted-foreground pl-1">{r.note}</p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground pl-1">Sem observação registrada.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              {/* CONCLUSÃO TÉCNICA */}
              <div
                className={`rounded-2xl border-2 p-5 sm:p-6 shadow-sm ${
                  conclusionTone === 'destructive'
                    ? 'border-destructive/40 bg-destructive/5'
                    : conclusionTone === 'warning'
                    ? 'border-warning/40 bg-warning/5'
                    : 'border-success/40 bg-success/5'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                      conclusionTone === 'destructive'
                        ? 'bg-destructive text-destructive-foreground'
                        : conclusionTone === 'warning'
                        ? 'bg-warning text-warning-foreground'
                        : 'bg-success text-success-foreground'
                    }`}
                  >
                    {conclusionTone === 'destructive' ? (
                      <XCircle className="w-6 h-6" />
                    ) : conclusionTone === 'warning' ? (
                      <AlertTriangle className="w-6 h-6" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Conclusão técnica</p>
                    <p className="text-base sm:text-lg font-semibold text-foreground leading-snug">{report.conclusion}</p>
                  </div>
                </div>
              </div>

              {/* REGISTRO FOTOGRÁFICO GERAL — apenas se houver */}
              {report.generalPhotos.length > 0 && (
                <SectionCard
                  icon={ImageIcon}
                  title="Registro Fotográfico Geral"
                  tone="warning"
                  description={`${report.generalPhotos.length} foto(s) da atividade`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {report.generalPhotos.map((photo, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightboxPhoto(photo)}
                        className="group relative aspect-square border rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                      >
                        <img src={photo} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </button>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* ASSINATURAS */}
              <SectionCard icon={FileText} title="Assinaturas" tone="muted">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                  <div>
                    <div className="border-b-2 border-foreground/40 h-10" />
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-2">Responsável técnico</p>
                    <p className="text-sm font-medium">{task.responsible || 'Nome:'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Data: {format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  <div>
                    <div className="border-b-2 border-foreground/40 h-10" />
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-2">Cliente</p>
                    <p className="text-sm font-medium">{task.contactName || task.client || 'Nome:'}</p>
                    <p className="text-xs text-muted-foreground mt-1">Data: ____/____/________</p>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editMachineOpen && (
        <EditChecklistMachineDialog
          task={task}
          isOpen={editMachineOpen}
          onClose={() => setEditMachineOpen(false)}
        />
      )}



      {lightboxPhoto && (
        <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
          <DialogContent className="max-w-5xl w-[95vw] p-2 bg-background">
            <div className="relative">
              <button
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-2 right-2 z-10 bg-background/80 rounded-full p-1 hover:bg-background"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={lightboxPhoto} alt="Foto ampliada" className="w-full max-h-[85vh] object-contain rounded" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
