import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Download, Printer, Mail, Loader2,
  Target, TrendingUp, DollarSign, Percent, User, Building2,
  Calendar, Clock, MapPin, Phone, AtSign, Package, MessageSquare,
  Tractor, Image as ImageIcon, Activity, Navigation, Camera,
  CheckCircle2, X, History, Sparkles, UserCheck, Wrench,
  AlertTriangle, ClipboardCheck, Award, Lightbulb, ShieldCheck, XCircle,
} from 'lucide-react';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionCard } from '@/components/task-form/sections/SectionCard';
import { Task } from '@/types/task';
import { useToast } from '@/hooks/use-toast';
import { useFiliais, useTaskDetails } from '@/hooks/useTasksOptimized';
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { mapSalesStatus, getStatusLabel, getStatusColor, getFilialNameRobust } from '@/lib/taskStandardization';
import { getTaskTypeLabel, calculateTaskTotalValue } from './TaskFormCore';
import { generateTaskPDF } from './TaskPDFGenerator';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { formatDateDisplay } from '@/lib/utils';

interface Props {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

const formatCurrency = (v: number) =>
  `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const formatDuration = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return '—';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return '—';
  let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const TaskFormVisualization: React.FC<Props> = ({ task: taskProp, isOpen, onClose }) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { data: filiais = [] } = useFiliais();

  // Fresh full task (photos, checkInLocation, equipmentList, products)
  const { data: taskDetails, isLoading: loadingDetails } = useTaskDetails(
    isOpen && taskProp ? taskProp.id : null,
  );

  // Extra fields (technical visit, contact, nextAction) via edit-data hook
  const { data: editData, loading: loadingEdit } = useTaskEditData(
    isOpen ? taskProp?.id || null : null,
  );

  const currentTask = useMemo<Task | null>(() => {
    if (!taskProp) return null;
    const base: Task = { ...taskProp, ...(taskDetails || {}) } as Task;
    if (editData) {
      (base as any).contactName = base.contactName ?? editData.contactName;
      (base as any).contactFunction = base.contactFunction ?? editData.contactFunction;
      (base as any).nextAction = base.nextAction ?? (editData as any).next_action;
      (base as any).nextActionDate = base.nextActionDate ?? (editData as any).next_action_date;
      (base as any).technicalCategory = base.technicalCategory ?? editData.technical_category ?? undefined;
      (base as any).technicalFunnelStage = base.technicalFunnelStage ?? editData.technical_funnel_stage ?? undefined;
      (base as any).opportunityInterest = base.opportunityInterest ?? (editData.opportunity_interest as any);
      (base as any).opportunityUrgency = base.opportunityUrgency ?? (editData.opportunity_urgency as any);
      (base as any).opportunityImpact = base.opportunityImpact ?? (editData.opportunity_impact as any);
      (base as any).opportunityClosing = base.opportunityClosing ?? (editData.opportunity_closing as any);
      (base as any).salesEstimate = base.salesEstimate ?? (editData as any).sales_estimate;
      (base as any).prospectNotesJustification =
        (base as any).prospectNotesJustification ?? (editData as any).prospect_notes_justification;
    }
    return base;
  }, [taskProp, taskDetails, editData]);

  const salesStatus = currentTask ? mapSalesStatus(currentTask) : 'prospect';

  const values = useMemo(() => {
    if (!currentTask) return { total: 0, closed: 0, partial: 0, products: 0 };
    const total = getSalesValueAsNumber(currentTask.salesValue) || 0;
    const partial = currentTask.partialSalesValue || 0;
    let productsTotal = 0;
    let productsSelected = 0;
    (currentTask.checklist || []).forEach((i) => {
      const t = (i.price || 0) * (i.quantity || 1);
      productsTotal += t;
      if (i.selected) productsSelected += t;
    });
    const closed =
      salesStatus === 'ganho' ? (total || productsTotal)
      : salesStatus === 'parcial' ? (partial || productsSelected)
      : 0;
    return { total: total || productsTotal, closed, partial: partial || productsSelected, products: productsTotal };
  }, [currentTask, salesStatus]);

  if (!isOpen) return null;
  if (!taskProp) return null;

  const isWaiting = (loadingDetails && !taskDetails) || (loadingEdit && !editData);
  if (isWaiting) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl">
          <div className="flex flex-col items-center justify-center py-14 space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Carregando relatório da visita…</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!currentTask) return null;

  const itemsCount = currentTask.checklist?.length || 0;
  const selectedItemsCount = currentTask.checklist?.filter(i => i.selected).length || 0;
  const equipmentCount = currentTask.equipmentList?.length || 0;
  const equipmentTotalUnits = (currentTask.equipmentList || []).reduce((s, e: any) => s + (Number(e.quantity) || 0), 0);
  const photoCount = currentTask.photos?.length || 0;
  const hasLocation = !!(currentTask.checkInLocation?.lat && currentTask.checkInLocation?.lng);
  const duration = formatDuration(currentTask.startTime, currentTask.endTime);
  const conversionRate = values.total > 0 ? (values.closed / values.total) * 100 : 0;

  const validatedEqCount = (currentTask.equipmentList || []).filter((eq: any) => {
    const v = eq.validated ?? eq.validado ?? eq.is_validated;
    return v === true || v === 'true';
  }).length;
  const newMachineCount = (currentTask.equipmentList || []).filter((eq: any) =>
    eq.isNew === true || eq.novo === true || eq.is_new === true || eq.new === true
  ).length;
  const hasContact = !!(currentTask.contactName || currentTask.contactFunction || currentTask.email || currentTask.phone);
  const hasObservations = !!(currentTask.observations || currentTask.prospectNotes);
  const hasNextAction = !!(currentTask.nextAction || currentTask.nextActionDate);
  const hasCheckIn = !!currentTask.checkInLocation?.timestamp;

  // === CHECKLIST DA OFICINA — métricas específicas ===
  const isChecklist = currentTask.taskType === 'checklist';
  const machine: any = (currentTask as any).checklistMachine || {};
  const checklistItems = (currentTask.checklist || []) as any[];
  const cCount = {
    total: checklistItems.length,
    conforme: checklistItems.filter(i => i.responseStatus === 'conforme').length,
    atencao: checklistItems.filter(i => i.responseStatus === 'atencao').length,
    naoConforme: checklistItems.filter(i => i.responseStatus === 'nao_conforme').length,
    na: checklistItems.filter(i => i.responseStatus === 'na').length,
    semStatus: checklistItems.filter(i => !i.responseStatus).length,
  };
  const checklistConclusion =
    cCount.total === 0
      ? 'Nenhum item avaliado no checklist.'
      : cCount.naoConforme > 0
        ? `Foram identificadas ${cCount.naoConforme} não conformidade${cCount.naoConforme > 1 ? 's' : ''} que ${cCount.naoConforme > 1 ? 'precisam' : 'precisa'} de correção.`
        : cCount.atencao > 0
          ? `Foram identificados ${cCount.atencao} item${cCount.atencao > 1 ? 'ns' : ''} que exige${cCount.atencao > 1 ? 'm' : ''} atenção.`
          : 'Máquina aprovada no checklist, sem não conformidades.';
  const recommendations = checklistItems
    .filter(i => i.responseStatus === 'atencao' || i.responseStatus === 'nao_conforme')
    .map(i => ({
      name: i.name as string,
      status: i.responseStatus as 'atencao' | 'nao_conforme',
      note: (i.responseNotes || i.observations || '') as string,
    }));

  // Resumo executivo dinâmico
  const summarySentences: string[] = [];
  if (currentTask.startDate) {
    const dateStr = formatDateDisplay(currentTask.startDate);
    summarySentences.push(
      currentTask.property
        ? `Visita realizada em ${dateStr} na ${currentTask.property}.`
        : `Visita realizada em ${dateStr}.`
    );
  }
  if (equipmentCount > 0) {
    summarySentences.push(
      validatedEqCount > 0
        ? `Foram vistoriados ${equipmentCount} equipamento${equipmentCount > 1 ? 's' : ''}, sendo ${validatedEqCount} validado${validatedEqCount > 1 ? 's' : ''}.`
        : `Foram vistoriados ${equipmentCount} equipamento${equipmentCount > 1 ? 's' : ''}.`
    );
  }
  if (photoCount > 0) summarySentences.push(`Foram registradas ${photoCount} foto${photoCount > 1 ? 's' : ''}.`);
  if (newMachineCount > 0) summarySentences.push(`Foi cadastrada${newMachineCount > 1 ? 's' : ''} ${newMachineCount} nova${newMachineCount > 1 ? 's' : ''} máquina${newMachineCount > 1 ? 's' : ''}.`);
  if (selectedItemsCount > 0) summarySentences.push(`Foram vendidos ${selectedItemsCount} de ${itemsCount} itens ofertados.`);
  if (values.total > 0) summarySentences.push(`Existe potencial estimado de R$ ${values.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`);
  if (values.closed > 0) summarySentences.push(`Valor fechado de R$ ${values.closed.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`);
  if (currentTask.nextActionDate) summarySentences.push(`Próxima ação programada para ${formatDateDisplay(currentTask.nextActionDate as any)}.`);
  if (summarySentences.length === 0) summarySentences.push('Ainda não há dados suficientes para gerar um resumo desta visita.');

  // Indicadores
  const indicators: Array<{ label: string; ok: boolean }> = [
    { label: 'Check-in realizado', ok: hasCheckIn || hasLocation },
    { label: 'Fotos anexadas', ok: photoCount > 0 },
    { label: 'Equipamentos validados', ok: validatedEqCount > 0 },
    { label: 'Contato da visita informado', ok: hasContact },
    { label: 'Observações preenchidas', ok: hasObservations },
    { label: 'Próxima ação definida', ok: hasNextAction },
    { label: 'Produtos registrados', ok: itemsCount > 0 },
    { label: 'Nova máquina cadastrada', ok: newMachineCount > 0 },
  ];

  // Alertas priorizados: 🔴 Crítico > 🟡 Atenção > 🔵 Informativo
  type AlertSeverity = 'critical' | 'warning' | 'info';
  type PrioritizedAlert = { message: string; severity: AlertSeverity };
  const alertsPrioritized: PrioritizedAlert[] = [];
  // Críticos — comprometem a validade da visita
  if (!hasLocation) alertsPrioritized.push({ message: 'Visita sem localização registrada', severity: 'critical' });
  if (!hasContact) alertsPrioritized.push({ message: 'Contato da visita não informado', severity: 'critical' });
  if (values.total > 0 && !hasNextAction) alertsPrioritized.push({ message: 'Oportunidade identificada sem próxima ação definida', severity: 'critical' });
  // Atenção — dados operacionais incompletos
  if (photoCount === 0) alertsPrioritized.push({ message: 'Nenhuma foto registrada durante a visita', severity: 'warning' });
  if (equipmentCount > 0 && validatedEqCount === 0) alertsPrioritized.push({ message: 'Nenhum equipamento validado', severity: 'warning' });
  if (values.total === 0 && !hasNextAction) alertsPrioritized.push({ message: 'Próxima ação não definida', severity: 'warning' });
  // Informativo — ausências não bloqueantes
  if (itemsCount === 0) alertsPrioritized.push({ message: 'Nenhum produto registrado', severity: 'info' });
  if (!hasObservations) alertsPrioritized.push({ message: 'Nenhuma observação registrada', severity: 'info' });

  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alertsPrioritized.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const alertsCount = alertsPrioritized.length;
  const criticalCount = alertsPrioritized.filter(a => a.severity === 'critical').length;

  // Conclusão — integrada ao Resumo Executivo (evita duplicação)
  const completedItems: string[] = [];
  if (hasLocation) completedItems.push('registro de localização');
  if (photoCount > 0) completedItems.push('fotos');
  if (validatedEqCount > 0) completedItems.push('validação de equipamentos');
  if (completedItems.length > 0) {
    const list = completedItems.length === 1
      ? completedItems[0]
      : `${completedItems.slice(0, -1).join(', ')} e ${completedItems.slice(-1)}`;
    summarySentences.push(`A visita foi concluída com ${list}.`);
  }
  summarySentences.push(
    alertsCount === 0
      ? 'A documentação da visita está completa.'
      : `Ainda existe${alertsCount > 1 ? 'm' : ''} ${alertsCount} ponto${alertsCount > 1 ? 's' : ''} de atenção a ser tratado${alertsCount > 1 ? 's' : ''}${criticalCount > 0 ? ` (${criticalCount} crítico${criticalCount > 1 ? 's' : ''})` : ''}.`
  );


  const mapEmbedUrl = hasLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${currentTask.checkInLocation!.lng - 0.005}%2C${currentTask.checkInLocation!.lat - 0.003}%2C${currentTask.checkInLocation!.lng + 0.005}%2C${currentTask.checkInLocation!.lat + 0.003}&layer=mapnik&marker=${currentTask.checkInLocation!.lat}%2C${currentTask.checkInLocation!.lng}`
    : null;

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateTaskPDF(currentTask, calculateTaskTotalValue, getTaskTypeLabel, filiais);
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
    const subject = `Relatório de Visita - ${currentTask.client} - ${getStatusLabel(salesStatus)}`;
    const body = [
      `Cliente: ${currentTask.client || '—'}`,
      `Código: ${currentTask.clientCode || '—'}`,
      `Propriedade: ${currentTask.property || '—'}`,
      `Data: ${currentTask.startDate ? formatDateDisplay(currentTask.startDate) : '—'}`,
      `Duração: ${duration}`,
      `Responsável: ${currentTask.responsible || '—'}`,
      `Filial: ${getFilialNameRobust(currentTask.filial, filiais)}`,
      `Status: ${getStatusLabel(salesStatus)}`,
      '',
      `Valor potencial: ${formatCurrency(values.total)}`,
      `Valor fechado:   ${formatCurrency(values.closed)}`,
      `Equipamentos: ${equipmentCount}`,
      `Fotos: ${photoCount}`,
      `Localização: ${hasLocation ? `${currentTask.checkInLocation!.lat}, ${currentTask.checkInLocation!.lng}` : '—'}`,
      '',
      'Observações:',
      currentTask.observations || currentTask.prospectNotes || '—',
    ].join('\n');
    window.open(`mailto:${currentTask.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[95vh] overflow-y-auto overflow-x-hidden p-0 w-[96vw] max-w-[96vw] sm:w-full sm:max-w-6xl">
          <div className="print:p-4">
            {/* 1. CABEÇALHO EXECUTIVO */}
            <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/15 via-primary/5 to-background">
              <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <div className="relative p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                          {getTaskTypeLabel(currentTask.taskType)}
                        </Badge>
                        <Badge className={`${getStatusColor(salesStatus)} text-[10px] uppercase tracking-wider`}>
                          {getStatusLabel(salesStatus)}
                        </Badge>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight tracking-tight">
                        {currentTask.client || 'Cliente'}
                      </h2>
                      {currentTask.property && (
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />{currentTask.property}
                        </p>
                      )}
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

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 rounded-xl border bg-background/60 backdrop-blur-sm p-4">
                  <HeaderMeta icon={FileText} label="Código" value={currentTask.clientCode} mono />
                  <HeaderMeta icon={Calendar} label="Data" value={currentTask.startDate ? formatDateDisplay(currentTask.startDate) : undefined} />
                  <HeaderMeta icon={Clock} label="Início" value={currentTask.startTime} />
                  <HeaderMeta icon={Clock} label="Fim" value={currentTask.endTime} />
                  <HeaderMeta icon={Activity} label="Duração" value={duration} highlight />
                  <HeaderMeta icon={User} label="Responsável" value={currentTask.responsible} />
                  <HeaderMeta icon={Building2} label="Filial" value={getFilialNameRobust(currentTask.filial, filiais)} />
                </div>
              </div>
            </div>

            {/* 2. RESUMO */}
            <div className="px-5 sm:px-7 pt-5">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Indicadores Operacionais
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard icon={Tractor} label="Equipamentos" value={String(equipmentCount)} sub={equipmentTotalUnits ? `${equipmentTotalUnits} un.` : undefined} tone={equipmentCount > 0 ? 'success' : 'muted'} />
                <SummaryCard icon={Camera} label="Fotos" value={String(photoCount)} tone={photoCount > 0 ? 'success' : 'warning'} />
                <SummaryCard icon={Navigation} label="Localização" value={hasLocation ? 'Sim' : '—'} tone={hasLocation ? 'success' : 'destructive'} />
                <SummaryCard icon={Package} label="Itens Vendidos" value={`${selectedItemsCount}/${itemsCount}`} tone={itemsCount === 0 ? 'muted' : selectedItemsCount > 0 ? 'success' : 'warning'} />
              </div>
            </div>


            {/* 2.1 RESUMO EXECUTIVO */}
            <div className="px-5 sm:px-7 pt-5">
              <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6 shadow-sm">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="relative flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                    <Lightbulb className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-primary mb-2">Resumo Executivo</p>
                    <div className="space-y-1.5">
                      {summarySentences.map((s, i) => (
                        <p key={i} className="text-sm sm:text-[15px] leading-relaxed text-foreground">{s}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2.2 INDICADORES + ALERTAS */}
            <div className="px-5 sm:px-7 pt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard icon={ClipboardCheck} title="Indicadores da Visita" tone="success">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {indicators.map((ind) => (
                      <div
                        key={ind.label}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          ind.ok
                            ? 'bg-success/5 border-success/20 text-foreground'
                            : 'bg-muted/30 border-border text-muted-foreground'
                        }`}
                      >
                        {ind.ok
                          ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                          : <XCircle className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
                        }
                        <span className={ind.ok ? 'font-medium' : ''}>{ind.label}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  icon={alertsCount ? AlertTriangle : ShieldCheck}
                  title="Pontos de Atenção"
                  tone={criticalCount ? 'destructive' : alertsCount ? 'warning' : 'success'}
                  description={alertsCount ? `${alertsCount} pendência${alertsCount > 1 ? 's' : ''}${criticalCount ? ` • ${criticalCount} crítica${criticalCount > 1 ? 's' : ''}` : ''}` : undefined}
                >
                  {alertsCount === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-4 text-sm text-foreground">
                      <ShieldCheck className="w-5 h-5 text-success" />
                      Não há pendências nesta visita.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {alertsPrioritized.map((a) => {
                        const cfg = a.severity === 'critical'
                          ? { icon: AlertTriangle, tag: '🔴 Crítico', wrap: 'border-destructive/40 bg-destructive/5', iconColor: 'text-destructive', badge: 'bg-destructive/10 text-destructive border-destructive/30' }
                          : a.severity === 'warning'
                          ? { icon: AlertTriangle, tag: '🟡 Atenção', wrap: 'border-warning/30 bg-warning/5', iconColor: 'text-warning', badge: 'bg-warning/10 text-warning border-warning/30' }
                          : { icon: Lightbulb, tag: '🔵 Informativo', wrap: 'border-primary/20 bg-primary/5', iconColor: 'text-primary', badge: 'bg-primary/10 text-primary border-primary/30' };
                        const Ic = cfg.icon;
                        return (
                          <li key={a.message} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cfg.wrap}`}>
                            <Ic className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cfg.iconColor}`} />
                            <div className="flex-1 min-w-0">
                              <span className={`inline-block text-[10px] font-bold uppercase tracking-wider mb-0.5 px-1.5 py-0.5 rounded border ${cfg.badge}`}>{cfg.tag}</span>
                              <p className="text-foreground">{a.message}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </SectionCard>
              </div>
            </div>


            {/* 2.3 OPORTUNIDADE */}
            <div className="px-5 sm:px-7 pt-4">
              <SectionCard icon={Target} title="Oportunidade" tone="primary">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <OppMetric label="Valor Potencial" value={values.total > 0 ? formatCurrency(values.total) : '—'} tone="primary" />
                  <OppMetric label="Valor Fechado" value={values.closed > 0 ? formatCurrency(values.closed) : '—'} tone="success" />
                  <OppMetric label="Valor Parcial" value={values.partial > 0 ? formatCurrency(values.partial) : '—'} tone="warning" />
                  <OppMetric label="Taxa de Conversão" value={values.total > 0 && values.closed > 0 ? `${conversionRate.toFixed(1)}%` : '—'} tone="warning" />
                  <OppMetric label="Classificação" value={getStatusLabel(salesStatus)} tone="primary" />
                </div>
                {(currentTask.opportunityInterest || currentTask.opportunityUrgency || currentTask.opportunityImpact || currentTask.opportunityClosing) && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <OppMetric label="Interesse" value={currentTask.opportunityInterest || '—'} tone="muted" capitalize />
                    <OppMetric label="Urgência" value={currentTask.opportunityUrgency || '—'} tone="muted" capitalize />
                    <OppMetric label="Impacto" value={currentTask.opportunityImpact || '—'} tone="muted" capitalize />
                    <OppMetric label="Fechamento" value={currentTask.opportunityClosing || '—'} tone="muted" capitalize />
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="p-5 sm:p-7 space-y-4">

              {/* 3. CLIENTE + 4. CONTATO */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <SectionCard icon={User} title="Dados do Cliente" tone="primary" className="lg:col-span-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <Field label="Cliente" value={currentTask.client} />
                    <Field label="Código" value={currentTask.clientCode} mono />
                    <Field label="Telefone" value={currentTask.phone} icon={Phone} />
                    <Field label="Email" value={currentTask.email} icon={AtSign} />
                    <Field label="Propriedade" value={currentTask.property} />
                    <Field label="Hectares" value={currentTask.propertyHectares ? `${currentTask.propertyHectares} ha` : undefined} />
                    <Field label="Filial Atendida" value={currentTask.filialAtendida ? getFilialNameRobust(currentTask.filialAtendida, filiais) : undefined} />

                    <Field label="Filial Atendida" value={currentTask.filialAtendida ? getFilialNameRobust(currentTask.filialAtendida, filiais) : undefined} />
                  </div>
                </SectionCard>

                <SectionCard icon={UserCheck} title="Contato da Visita" tone={hasContact ? 'success' : 'muted'}>
                  <div className="grid grid-cols-1 gap-4 text-sm">
                    <Field
                      label="Nome"
                      value={currentTask.contactName || currentTask.responsible}
                    />
                    <Field
                      label="Função"
                      value={currentTask.contactFunction || currentTask.function}
                    />
                    <Field label="Email" value={currentTask.email} icon={AtSign} />
                    <Field label="Telefone" value={currentTask.phone} icon={Phone} />
                    {!hasContact && (
                      <p className="text-xs text-muted-foreground italic">Não informado</p>
                    )}
                  </div>
                </SectionCard>
              </div>

              {/* 5+6. LOCALIZAÇÃO + FOTOS — 2 colunas em xl */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {hasLocation && mapEmbedUrl ? (
                  <SectionCard
                    icon={MapPin}
                    title="Localização da Visita"
                    tone="success"
                    description={`${currentTask.checkInLocation!.lat.toFixed(6)}, ${currentTask.checkInLocation!.lng.toFixed(6)}`}
                    headerRight={
                      <Button
                        variant="outline" size="sm" className="print:hidden"
                        onClick={() => window.open(`https://www.google.com/maps?q=${currentTask.checkInLocation!.lat},${currentTask.checkInLocation!.lng}`, '_blank')}
                      >
                        <Navigation className="w-3.5 h-3.5 mr-1" /> Google Maps
                      </Button>
                    }
                  >
                    <div className="rounded-lg overflow-hidden border bg-muted">
                      <iframe title="Mapa da Localização" src={mapEmbedUrl} className="w-full h-64 sm:h-80" loading="lazy" />
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <MiniStat label="Latitude" value={currentTask.checkInLocation!.lat.toFixed(6)} mono />
                      <MiniStat label="Longitude" value={currentTask.checkInLocation!.lng.toFixed(6)} mono />
                      <MiniStat
                        label="Horário do check-in"
                        value={currentTask.checkInLocation!.timestamp
                          ? format(new Date(currentTask.checkInLocation!.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : '—'}
                        icon={Clock}
                      />
                    </div>
                  </SectionCard>
                ) : (
                  <SectionCard icon={MapPin} title="Localização da Visita" tone="muted">
                    <div className="text-center py-6 text-sm text-muted-foreground italic">
                      <Navigation className="w-8 h-8 mx-auto opacity-30 mb-2" />
                      Localização não registrada
                    </div>
                  </SectionCard>
                )}

                {photoCount > 0 ? (
                  <SectionCard
                    icon={ImageIcon}
                    title="Registro Fotográfico"
                    tone="warning"
                    description={`${photoCount} foto${photoCount > 1 ? 's' : ''} capturada${photoCount > 1 ? 's' : ''} durante a visita`}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-3">
                      {currentTask.photos!.map((photo, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightboxIndex(i)}
                          className="group relative aspect-square border rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                        >
                          <img src={photo} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="absolute bottom-1 right-1.5 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            {i + 1}/{photoCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  </SectionCard>
                ) : (
                  <SectionCard icon={ImageIcon} title="Registro Fotográfico" tone="muted">
                    <div className="text-center py-6 text-sm text-muted-foreground italic">
                      <ImageIcon className="w-8 h-8 mx-auto opacity-30 mb-2" />
                      Nenhuma foto registrada
                    </div>
                  </SectionCard>
                )}
              </div>


              {/* 7. EQUIPAMENTOS */}
              {currentTask.equipmentList && currentTask.equipmentList.length > 0 && (
                <SectionCard
                  icon={Tractor}
                  title="Parque de Máquinas Registrado"
                  tone="muted"
                  description={`${equipmentCount} item${equipmentCount > 1 ? 'ns' : ''} • ${equipmentTotalUnits} unidade${equipmentTotalUnits !== 1 ? 's' : ''}`}
                >
                  {(() => {
                    const validatedCount = (currentTask.equipmentList || []).filter((eq: any) => {
                      const v = eq.validated ?? eq.validado ?? eq.is_validated;
                      return v === true || v === 'true';
                    }).length;
                    const pendingCount = equipmentCount - validatedCount;
                    return (
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <MiniStat label="Total" value={String(equipmentCount)} />
                        <div className="rounded-lg border bg-success/10 p-3">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Validados</p>
                          <p className="font-semibold text-success tabular-nums">{validatedCount}</p>
                        </div>
                        <div className="rounded-lg border bg-warning/10 p-3">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Pendentes</p>
                          <p className="font-semibold text-warning tabular-nums">{pendingCount}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-10">#</TableHead>
                          <TableHead className="whitespace-nowrap">Prioridade</TableHead>
                          <TableHead className="whitespace-nowrap">Modelo / Família</TableHead>
                          <TableHead className="whitespace-nowrap">Tipo</TableHead>
                          <TableHead className="whitespace-nowrap">Nº de Série</TableHead>
                          <TableHead className="whitespace-nowrap text-center">Ano</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Horas</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Qtd</TableHead>
                          <TableHead className="whitespace-nowrap text-center">Status</TableHead>
                          <TableHead className="whitespace-nowrap text-center">Validado</TableHead>
                          <TableHead className="whitespace-nowrap">Validado em</TableHead>
                          <TableHead className="min-w-[160px]">Observação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentTask.equipmentList.map((eq: any, idx: number) => {
                          const pr = eq.priority || eq.prioridade;
                          const prColors: Record<string, string> = {
                            alta: 'destructive', high: 'destructive',
                            media: 'warning', média: 'warning', medium: 'warning',
                            baixa: 'secondary', low: 'secondary',
                          };
                          const validated = eq.validated ?? eq.validado ?? eq.is_validated;
                          const validatedAtRaw = eq.validatedAt ?? eq.validated_at ?? eq.validadoEm ?? eq.validado_em;
                          let validatedAtStr: string | null = null;
                          if (validatedAtRaw) {
                            try {
                              validatedAtStr = format(new Date(validatedAtRaw), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                            } catch { validatedAtStr = String(validatedAtRaw); }
                          }
                          return (
                            <TableRow key={eq.id || idx} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                              <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                              <TableCell>
                                {pr ? (
                                  <Badge variant={(prColors[String(pr).toLowerCase()] as any) || 'outline'} className="text-[10px] uppercase">
                                    {String(pr)}
                                  </Badge>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell className="text-sm font-medium">{eq.model || eq.modelo || eq.familyProduct || '—'}</TableCell>
                              <TableCell className="text-sm">{eq.type || eq.tipo || eq.equipmentType || '—'}</TableCell>
                              <TableCell className="text-xs font-mono">{eq.serialNumber || eq.serial_number || eq.numeroSerie || '—'}</TableCell>
                              <TableCell className="text-center tabular-nums text-sm">{eq.year || eq.ano || '—'}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {eq.hours ?? eq.horas ?? eq.workHours
                                  ? Number(eq.hours ?? eq.horas ?? eq.workHours).toLocaleString('pt-BR')
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{eq.quantity || 0}</TableCell>
                              <TableCell className="text-center">
                                {eq.status ? (
                                  <Badge variant="outline" className="text-[10px] capitalize">{String(eq.status)}</Badge>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                {validated === true || validated === 'true' ? (
                                  <Badge variant="success" className="text-[10px] inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Sim
                                  </Badge>
                                ) : validated === false || validated === 'false' ? (
                                  <Badge variant="secondary" className="text-[10px]">Não</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums whitespace-nowrap">
                                {validatedAtStr ? validatedAtStr : <span className="text-muted-foreground italic">—</span>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                                {eq.observation || eq.observations || eq.observacao || eq.notes || <span className="italic">—</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </SectionCard>
              )}

              {/* 8. PRODUTOS E SERVIÇOS ou CHECKLIST DA OFICINA */}
              {currentTask.taskType === 'checklist' ? (
                <SectionCard
                  icon={ClipboardCheck}
                  title="Checklist da Oficina"
                  tone="primary"
                  description={itemsCount > 0 ? `${itemsCount} item(ns) avaliado(s)` : undefined}
                >
                  {/* Máquina do Checklist (snapshot) */}
                  {currentTask.checklistMachine ? (
                    <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Máquina do Checklist
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{currentTask.checklistMachine.tipo || '—'}</span></div>
                        <div><span className="text-muted-foreground">Modelo:</span> <span className="font-medium">{currentTask.checklistMachine.modelo || '—'}</span></div>
                        <div><span className="text-muted-foreground">Chassi/Série:</span> <span className="font-medium">{currentTask.checklistMachine.chassi_serie || '—'}</span></div>
                        <div><span className="text-muted-foreground">Ano:</span> <span className="font-medium">{currentTask.checklistMachine.ano || '—'}</span></div>
                        <div><span className="text-muted-foreground">Horímetro:</span> <span className="font-medium">{currentTask.checklistMachine.horimetro || '—'}</span></div>
                        <div><span className="text-muted-foreground">Status:</span> <span className="font-medium capitalize">{currentTask.checklistMachine.status || '—'}</span></div>
                      </div>
                      {currentTask.checklistMachine.observacao && (
                        <div className="mt-2 text-xs italic text-muted-foreground">
                          Obs: {currentTask.checklistMachine.observacao}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mb-4 text-xs text-muted-foreground italic">
                      Máquina não informada (registro anterior à padronização do checklist).
                    </div>
                  )}

                  {currentTask.checklist && currentTask.checklist.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Item</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead>Observação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentTask.checklist.map((item, idx) => {
                            const status = (item as any).responseStatus as string | null | undefined;
                            const statusMap: Record<string, { label: string; variant: any }> = {
                              conforme: { label: 'Conforme', variant: 'success' },
                              atencao: { label: 'Atenção', variant: 'warning' },
                              nao_conforme: { label: 'Não conforme', variant: 'destructive' },
                              na: { label: 'N/A', variant: 'secondary' },
                            };
                            const s = status ? statusMap[status] : null;
                            return (
                              <TableRow key={item.id} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                                <TableCell className="text-sm font-medium">{item.name}</TableCell>
                                <TableCell className="text-center">
                                  {s ? (
                                    <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {(item as any).responseNotes || item.observations || '—'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      Nenhum item avaliado
                    </div>
                  )}
                </SectionCard>
              ) : (
              <SectionCard
                icon={Package}
                title="Produtos e Serviços"
                tone="primary"
                description={itemsCount > 0 ? `${selectedItemsCount} vendido${selectedItemsCount !== 1 ? 's' : ''} de ${itemsCount}` : undefined}
              >
                {currentTask.checklist && currentTask.checklist.length > 0 ? (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Unit.</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentTask.checklist.map((item, idx) => {
                            const qty = item.quantity || 1;
                            const subtotal = (item.price || 0) * qty;
                            return (
                              <React.Fragment key={item.id}>
                                <TableRow className={item.selected ? 'bg-success/5' : idx % 2 === 1 ? 'bg-muted/20' : ''}>
                                  <TableCell>
                                    <div className="font-medium text-sm">{item.name}</div>
                                    <div className="text-xs text-muted-foreground capitalize">{item.category}</div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{qty}</TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">{formatCurrency(item.price || 0)}</TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold text-primary">{formatCurrency(subtotal)}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant={item.selected ? 'success' : 'secondary'} className="text-xs">
                                      {item.selected ? 'Vendido' : 'Ofertado'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                                {item.observations && (
                                  <TableRow className="bg-muted/30">
                                    <TableCell colSpan={5} className="text-xs italic text-muted-foreground py-2">
                                      Obs: {item.observations}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-between items-end pt-1">
                      <p className="text-xs text-muted-foreground">{currentTask.checklist.length} item(ns)</p>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total da Oportunidade</p>
                        <p className="text-xl font-bold text-primary tabular-nums">{formatCurrency(values.total)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Nenhum produto oferecido
                  </div>
                )}
              </SectionCard>
              )}

              {/* 9. VISITA TÉCNICA (quando aplicável) */}
              {currentTask.taskType === 'technical_visit' && (
                <SectionCard icon={Wrench} title="Dados da Visita Técnica" tone="primary">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <Field label="Categoria Técnica" value={currentTask.technicalCategory} />
                    <Field label="Etapa Funil Técnico" value={currentTask.technicalFunnelStage} />
                    {currentTask.salesEstimate && typeof currentTask.salesEstimate === 'object' && Object.entries(currentTask.salesEstimate)
                      .filter(([k]) => k !== 'puk')
                      .map(([k, v]) => (
                        <Field key={k} label={`Estimativa ${k}`} value={formatCurrency(Number(v || 0))} />
                      ))}
                    {currentTask.salesEstimate && typeof currentTask.salesEstimate === 'object' && (
                      <Field
                        label="Total Estimativa"
                        value={formatCurrency(
                          Object.entries(currentTask.salesEstimate)
                            .filter(([k]) => k !== 'puk')
                            .reduce((s, [, v]) => s + Number(v || 0), 0)
                        )}
                      />
                    )}
                  </div>
                </SectionCard>
              )}

              {/* 10. PRÓXIMA AÇÃO */}
              {(currentTask.nextAction || currentTask.nextActionDate) && (
                <div className="relative overflow-hidden rounded-2xl border-2 border-warning/40 bg-gradient-to-br from-warning/15 via-warning/5 to-background p-5 sm:p-6 shadow-sm">
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-warning/10 blur-3xl pointer-events-none" />
                  <div className="relative flex items-start gap-4">
                    <div className="w-12 h-12 bg-warning text-warning-foreground rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-[11px] uppercase tracking-wider font-bold text-warning">Próxima Ação</p>
                        {(() => {
                          if (!currentTask.nextActionDate) return null;
                          const d = new Date(currentTask.nextActionDate as any);
                          const today = new Date(); today.setHours(0,0,0,0);
                          const dd = new Date(d); dd.setHours(0,0,0,0);
                          const diff = (dd.getTime() - today.getTime()) / 86400000;
                          const [label, variant]: [string, any] =
                            diff < 0 ? ['Atrasada', 'destructive'] :
                            diff === 0 ? ['Hoje', 'warning'] :
                            ['Prevista', 'success'];
                          return <Badge variant={variant} className="text-[10px] uppercase tracking-wider">{label}</Badge>;
                        })()}
                      </div>
                      {currentTask.nextAction && (
                        <p className="text-base sm:text-lg font-semibold text-foreground whitespace-pre-wrap leading-snug">
                          {String(currentTask.nextAction)}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {currentTask.nextActionDate && (
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-warning" />
                            <span className="font-medium text-foreground">{formatDateDisplay(currentTask.nextActionDate as any)}</span>
                          </span>
                        )}
                        {currentTask.responsible && (
                          <span className="inline-flex items-center gap-1.5">
                            <User className="w-4 h-4 text-warning" />
                            <span className="font-medium text-foreground">{currentTask.responsible}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 11+12. OBSERVAÇÕES + TIMELINE — 2 colunas em xl */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {(currentTask.observations || currentTask.prospectNotes || currentTask.prospectNotesJustification) ? (
                  <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-bold text-primary">Observações da Visita</p>
                        <p className="text-sm text-muted-foreground">Anotações registradas em campo</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {currentTask.observations && (
                        <div className="rounded-xl bg-background/70 border border-primary/20 p-4">
                          <p className="text-[10px] text-muted-foreground mb-1.5 font-bold uppercase tracking-wider">Observações da atividade</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{currentTask.observations}</p>
                        </div>
                      )}
                      {currentTask.prospectNotes && (
                        <div className="rounded-xl bg-background/70 border border-primary/20 p-4">
                          <p className="text-[10px] text-muted-foreground mb-1.5 font-bold uppercase tracking-wider">Notas do prospect</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{currentTask.prospectNotes}</p>
                        </div>
                      )}
                      {currentTask.prospectNotesJustification && (
                        <div className="rounded-xl bg-warning/10 border border-warning/30 p-4">
                          <p className="text-[10px] text-muted-foreground mb-1.5 font-bold uppercase tracking-wider">Justificativa</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{currentTask.prospectNotesJustification}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-muted bg-muted/20 p-6 flex flex-col items-center justify-center text-center">
                    <MessageSquare className="w-6 h-6 mx-auto text-muted-foreground/60 mb-2" />
                    <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada</p>
                  </div>
                )}

                <SectionCard icon={History} title="Timeline da Visita" tone="muted">
                  <ol className="relative border-l-2 border-border ml-4 space-y-5 py-1">
                    <TimelineItem icon={FileText} color="bg-primary" title="Visita criada" date={currentTask.createdAt} detail={currentTask.responsible ? `por ${currentTask.responsible}` : undefined} />
                    <TimelineItem icon={Calendar} color="bg-warning" title="Visita agendada" date={currentTask.startDate}
                      detail={currentTask.startTime ? `${currentTask.startTime}${currentTask.endTime ? ` – ${currentTask.endTime}` : ''}` : undefined} />
                    {currentTask.checkInLocation?.timestamp && (
                      <TimelineItem icon={MapPin} color="bg-success" title="Check-in realizado" date={currentTask.checkInLocation.timestamp}
                        detail={hasLocation ? `${currentTask.checkInLocation.lat.toFixed(4)}, ${currentTask.checkInLocation.lng.toFixed(4)}` : undefined} />
                    )}
                    {currentTask.updatedAt && (
                      <TimelineItem icon={Activity} color="bg-muted-foreground" title="Última atualização" date={currentTask.updatedAt} detail={getStatusLabel(salesStatus)} />
                    )}
                    {currentTask.nextActionDate && (
                      <TimelineItem icon={Sparkles} color="bg-primary" title="Próxima ação prevista" date={currentTask.nextActionDate as any} detail={currentTask.nextAction as any} future />
                    )}
                  </ol>
                </SectionCard>
              </div>

              {/* Conclusão foi integrada ao Resumo Executivo para evitar duplicação */}


            </div>

          </div>
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && currentTask.photos && currentTask.photos[lightboxIndex] && (
        <Dialog open={lightboxIndex !== null} onOpenChange={() => setLightboxIndex(null)}>
          <DialogContent className="max-w-5xl w-[95vw] p-2 bg-background">
            <div className="relative">
              <button
                onClick={() => setLightboxIndex(null)}
                className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background rounded-full p-2 border shadow"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
              {photoCount > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIndex((idx) => (idx === null ? 0 : (idx - 1 + photoCount) % photoCount))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background rounded-full px-3 py-2 border shadow text-sm font-semibold"
                    aria-label="Anterior"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setLightboxIndex((idx) => (idx === null ? 0 : (idx + 1) % photoCount))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background rounded-full px-3 py-2 border shadow text-sm font-semibold"
                    aria-label="Próxima"
                  >
                    ›
                  </button>
                </>
              )}
              <img src={currentTask.photos[lightboxIndex]} alt={`Foto ${lightboxIndex + 1}`} className="w-full max-h-[85vh] object-contain rounded" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 border rounded-full px-3 py-1 text-xs font-mono">
                {lightboxIndex + 1} / {photoCount}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

// ================= Subcomponents =================

const SummaryCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
  tone: 'primary' | 'success' | 'warning' | 'muted' | 'destructive';
}> = ({ icon: Icon, label, value, sub, tone }) => {
  const toneMap = {
    primary:     'from-primary/10 to-transparent text-primary border-primary/20',
    success:     'from-success/10 to-transparent text-success border-success/20',
    warning:     'from-warning/10 to-transparent text-warning border-warning/20',
    destructive: 'from-destructive/10 to-transparent text-destructive border-destructive/20',
    muted:       'from-muted to-transparent text-muted-foreground border-border',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${toneMap[tone]} p-3.5 min-h-[92px] flex flex-col justify-between`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <div>
        <p className="text-lg font-bold text-foreground tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string; value?: string | number | null;
  icon?: React.ComponentType<{ className?: string }>; mono?: boolean;
}> = ({ label, value, icon: Icon, mono }) => (
  <div>
    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{label}</p>
    <p className={`font-medium text-sm flex items-center gap-1.5 ${mono ? 'font-mono' : ''}`}>
      {Icon && value ? <Icon className="w-3.5 h-3.5 text-muted-foreground" /> : null}
      {value ? String(value) : <span className="text-muted-foreground italic font-normal">—</span>}
    </p>
  </div>
);

const HeaderMeta: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; value?: string | number | null;
  mono?: boolean; highlight?: boolean;
}> = ({ icon: Icon, label, value, mono, highlight }) => (
  <div className="min-w-0">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
      <Icon className="w-3 h-3" /> {label}
    </p>
    <p className={`text-sm font-semibold truncate ${mono ? 'font-mono' : ''} ${highlight ? 'text-primary' : 'text-foreground'}`}>
      {value ? String(value) : <span className="text-muted-foreground italic font-normal">—</span>}
    </p>
  </div>
);

const MiniStat: React.FC<{
  label: string; value: string; mono?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ label, value, mono, icon: Icon }) => (
  <div className="rounded-lg border bg-muted/30 p-3">
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
    <p className={`font-semibold inline-flex items-center gap-1.5 ${mono ? 'font-mono tabular-nums' : ''}`}>
      {Icon && <Icon className="w-3.5 h-3.5 text-success" />}{value}
    </p>
  </div>
);

const TimelineItem: React.FC<{
  color: string; title: string; date?: Date | string; detail?: string; future?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ color, title, date, detail, future, icon: Icon }) => {
  let dateStr = '—';
  if (date) {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      dateStr = format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch { dateStr = String(date); }
  }
  return (
    <li className="ml-6 relative">
      <span className={`absolute -left-[30px] top-0 w-6 h-6 rounded-full ${color} ring-4 ring-background flex items-center justify-center text-white shadow`}>
        {Icon ? <Icon className="w-3 h-3" /> : null}
      </span>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className={`text-sm font-semibold ${future ? 'text-primary' : 'text-foreground'}`}>{title}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{dateStr}</p>
      </div>
      {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
    </li>
  );
};

const OppMetric: React.FC<{
  label: string; value: string;
  tone: 'primary' | 'success' | 'warning' | 'muted';
  capitalize?: boolean;
}> = ({ label, value, tone, capitalize }) => {
  const toneMap = {
    primary: 'border-primary/20 bg-primary/5 text-primary',
    success: 'border-success/20 bg-success/5 text-success',
    warning: 'border-warning/20 bg-warning/5 text-warning',
    muted: 'border-border bg-muted/30 text-foreground',
  };
  return (
    <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-bold tabular-nums leading-tight ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
};
