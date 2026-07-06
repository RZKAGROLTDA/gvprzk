import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, Download, Printer, Mail, Loader2,
  Target, TrendingUp, DollarSign, Percent, User, Building2,
  Calendar, Clock, MapPin, Phone, AtSign, Package, MessageSquare,
  Tractor, Image as ImageIcon, Activity, Navigation, Camera,
  CheckCircle2, X, History, Sparkles, UserCheck, Wrench,
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
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
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
                <Sparkles className="w-3.5 h-3.5" /> Resumo da Visita
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <SummaryCard icon={Tractor} label="Equip. registrados" value={String(equipmentCount)} tone="primary" />
                <SummaryCard icon={CheckCircle2} label="Unidades" value={String(equipmentTotalUnits)} tone="success" />
                <SummaryCard icon={Camera} label="Fotos" value={String(photoCount)} tone="warning" />
                <SummaryCard icon={Navigation} label="Localização" value={hasLocation ? 'Sim' : '—'} tone={hasLocation ? 'success' : 'muted'} />
                <SummaryCard icon={Package} label="Produtos" value={String(itemsCount)} sub={itemsCount ? `${selectedItemsCount} vendidos` : undefined} tone="primary" />
                <SummaryCard icon={Target} label="Status" value={getStatusLabel(salesStatus)} tone="muted" />
                <SummaryCard icon={DollarSign} label="Valor potencial" value={`R$ ${values.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} tone="success" />
                <SummaryCard
                  icon={Calendar}
                  label="Próxima ação"
                  value={currentTask.nextActionDate ? formatDateDisplay(currentTask.nextActionDate as any) : '—'}
                  sub={currentTask.nextAction ? String(currentTask.nextAction).slice(0, 22) : undefined}
                  tone="warning"
                />
              </div>

              {(values.closed > 0 || salesStatus !== 'prospect') && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MetricStrip icon={TrendingUp} label="Valor potencial" value={values.total} tone="primary" />
                  <MetricStrip icon={DollarSign} label="Valor fechado" value={values.closed} tone="success" />
                  <div className="rounded-xl border bg-gradient-to-br from-warning/10 to-transparent p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Percent className="w-3.5 h-3.5 text-warning" /> Taxa de conversão
                    </div>
                    <p className="text-2xl font-bold text-warning tabular-nums">{conversionRate.toFixed(1)}%</p>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-warning rounded-full transition-all" style={{ width: `${Math.min(conversionRate, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}
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
                    <Field label="Cidade" value={(currentTask as any).city} />
                    <Field label="Estado" value={(currentTask as any).state} />
                    <Field label="Hectares" value={currentTask.propertyHectares ? `${currentTask.propertyHectares} ha` : undefined} />
                  </div>
                </SectionCard>

                <SectionCard icon={UserCheck} title="Contato da Visita" tone="success">
                  <div className="grid grid-cols-1 gap-4 text-sm">
                    <Field label="Nome" value={currentTask.contactName} />
                    <Field label="Função" value={currentTask.contactFunction} />
                    {!currentTask.contactName && !currentTask.contactFunction && (
                      <p className="text-xs text-muted-foreground italic">Sem contato registrado nesta visita.</p>
                    )}
                  </div>
                </SectionCard>
              </div>

              {/* 5. LOCALIZAÇÃO */}
              {hasLocation && mapEmbedUrl && (
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
              )}

              {/* 6. FOTOS */}
              {photoCount > 0 && (
                <SectionCard
                  icon={ImageIcon}
                  title="Registro Fotográfico"
                  tone="warning"
                  description={`${photoCount} foto${photoCount > 1 ? 's' : ''} capturada${photoCount > 1 ? 's' : ''} durante a visita`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {currentTask.photos!.map((photo, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightboxPhoto(photo)}
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
              )}

              {/* 7. EQUIPAMENTOS */}
              {currentTask.equipmentList && currentTask.equipmentList.length > 0 && (
                <SectionCard
                  icon={Tractor}
                  title="Parque de Máquinas Registrado"
                  tone="muted"
                  description={`${equipmentCount} item${equipmentCount > 1 ? 'ns' : ''} • ${equipmentTotalUnits} unidade${equipmentTotalUnits !== 1 ? 's' : ''}`}
                >
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
                            <TableRow key={eq.id || idx}>
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

              {/* 8. PRODUTOS E SERVIÇOS (read-only) */}
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
                          {currentTask.checklist.map(item => {
                            const qty = item.quantity || 1;
                            const subtotal = (item.price || 0) * qty;
                            return (
                              <React.Fragment key={item.id}>
                                <TableRow className={item.selected ? 'bg-success/5' : ''}>
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

              {/* 9. VISITA TÉCNICA (quando aplicável) */}
              {currentTask.taskType === 'technical_visit' && (
                <SectionCard icon={Wrench} title="Dados da Visita Técnica" tone="primary">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <Field label="Categoria Técnica" value={currentTask.technicalCategory} />
                    <Field label="Etapa Funil Técnico" value={currentTask.technicalFunnelStage} />
                    <Field label="Interesse" value={currentTask.opportunityInterest} />
                    <Field label="Urgência" value={currentTask.opportunityUrgency} />
                    <Field label="Impacto" value={currentTask.opportunityImpact} />
                    <Field label="Fechamento" value={currentTask.opportunityClosing} />
                    {currentTask.salesEstimate && typeof currentTask.salesEstimate === 'object' && Object.entries(currentTask.salesEstimate)
                      .filter(([k]) => k !== 'puk')
                      .map(([k, v]) => (
                        <Field key={k} label={`Estimativa ${k}`} value={formatCurrency(Number(v || 0))} />
                      ))}
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
                      <p className="text-[11px] uppercase tracking-wider font-bold text-warning mb-1">Próxima Ação</p>
                      {currentTask.nextAction && (
                        <p className="text-base sm:text-lg font-semibold text-foreground whitespace-pre-wrap leading-snug">
                          {String(currentTask.nextAction)}
                        </p>
                      )}
                      {currentTask.nextActionDate && (
                        <p className="mt-2 text-sm text-muted-foreground inline-flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-warning" />
                          <span className="font-medium text-foreground">{formatDateDisplay(currentTask.nextActionDate as any)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 11. OBSERVAÇÕES */}
              {(currentTask.observations || currentTask.prospectNotes || currentTask.prospectNotesJustification) && (
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
              )}

              {/* 12. TIMELINE */}
              <SectionCard icon={History} title="Timeline da Visita" tone="muted">
                <ol className="relative border-l-2 border-muted ml-3 space-y-4">
                  <TimelineItem color="bg-primary" title="Visita criada" date={currentTask.createdAt} detail={currentTask.responsible ? `por ${currentTask.responsible}` : undefined} />
                  <TimelineItem color="bg-warning" title="Visita agendada" date={currentTask.startDate}
                    detail={currentTask.startTime ? `${currentTask.startTime}${currentTask.endTime ? ` – ${currentTask.endTime}` : ''}` : undefined} />
                  {currentTask.checkInLocation?.timestamp && (
                    <TimelineItem color="bg-success" title="Check-in realizado" date={currentTask.checkInLocation.timestamp}
                      detail={hasLocation ? `${currentTask.checkInLocation.lat.toFixed(4)}, ${currentTask.checkInLocation.lng.toFixed(4)}` : undefined} />
                  )}
                  {currentTask.updatedAt && (
                    <TimelineItem color="bg-muted-foreground" title="Última atualização" date={currentTask.updatedAt} detail={getStatusLabel(salesStatus)} />
                  )}
                  {currentTask.nextActionDate && (
                    <TimelineItem color="bg-primary" title="Próxima ação prevista" date={currentTask.nextActionDate as any} detail={currentTask.nextAction as any} future />
                  )}
                </ol>
              </SectionCard>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {lightboxPhoto && (
        <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
          <DialogContent className="max-w-5xl w-[95vw] p-2 bg-background">
            <div className="relative">
              <button
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background rounded-full p-2 border shadow"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
              <img src={lightboxPhoto} alt="Foto ampliada" className="w-full max-h-[85vh] object-contain rounded" />
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
  tone: 'primary' | 'success' | 'warning' | 'muted';
}> = ({ icon: Icon, label, value, sub, tone }) => {
  const toneMap = {
    primary: 'from-primary/10 to-transparent text-primary border-primary/20',
    success: 'from-success/10 to-transparent text-success border-success/20',
    warning: 'from-warning/10 to-transparent text-warning border-warning/20',
    muted: 'from-muted to-transparent text-muted-foreground border-border',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${toneMap[tone]} p-3.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <p className="text-lg font-bold text-foreground tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
};

const MetricStrip: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; tone: 'primary' | 'success';
}> = ({ icon: Icon, label, value, tone }) => {
  const toneMap = {
    primary: 'from-primary/10 text-primary',
    success: 'from-success/10 text-success',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${toneMap[tone]} to-transparent p-4`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${tone === 'primary' ? 'text-primary' : 'text-success'}`}>
        {formatCurrency(value)}
      </p>
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
}> = ({ color, title, date, detail, future }) => {
  let dateStr = '—';
  if (date) {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      dateStr = format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch { dateStr = String(date); }
  }
  return (
    <li className="ml-4 relative">
      <span className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full ${color} ring-4 ring-background`} />
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className={`text-sm font-semibold ${future ? 'text-primary' : 'text-foreground'}`}>{title}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{dateStr}</p>
      </div>
      {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
    </li>
  );
};
