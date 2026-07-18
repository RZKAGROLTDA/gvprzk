
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar, User, Building, Crop, Package, Camera, FileText, Download, Printer, Mail, Phone, Hash, AtSign, Car, Loader2, Wrench, Target, TrendingUp, CalendarClock, CheckCircle2 } from 'lucide-react';
import { formatDateDisplay, parseLocalDate, cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Task, ProductType } from "@/types/task";
import { useToast } from "@/hooks/use-toast";
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { getStatusLabel, getStatusColor, resolveFilialName } from '@/lib/taskStandardization';
import { getTaskTypeLabel, calculateTaskTotalValue } from './TaskFormCore';
import { generateReportPDF } from '@/lib/generateReportPDF';
import { SalesStatusDisplay } from './SalesStatusDisplay';
import { ProductListComponent } from './ProductListComponent';
import { SectionCard } from '@/components/task-form/sections/SectionCard';
import { WorkshopChecklistView } from '@/components/WorkshopChecklistView';
import { useFiliais } from '@/hooks/useTasksOptimized';

// TypeScript module declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface FormVisualizationProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export const FormVisualization: React.FC<FormVisualizationProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const { toast } = useToast();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const filiaisQuery = useFiliais();
  const filiaisForChecklist = Array.isArray(filiaisQuery) ? filiaisQuery : (filiaisQuery as any)?.data || [];

  // ⚙️ Fluxo único: qualquer Checklist da Oficina é renderizado pela WorkshopChecklistView.
  if (task?.taskType === 'checklist') {
    return (
      <WorkshopChecklistView
        task={task}
        filiais={filiaisForChecklist || []}
        isOpen={isOpen}
        onClose={onClose}
      />
    );
  }


  // MESMA fonte de dados do "Editar" (useTaskEditData) — e congelar em snapshot para não "mudar" depois de carregar
  const { data: taskEditData, loading, error } = useTaskEditData(isOpen ? task?.id : null);
  const [fullTaskSnapshot, setFullTaskSnapshot] = useState<Task | null>(null);
  const [snapshotSalesStatus, setSnapshotSalesStatus] = useState<'prospect' | 'ganho' | 'perdido' | 'parcial'>('prospect');
  const [snapshotOpportunityValue, setSnapshotOpportunityValue] = useState<number>(0);

  const detailsReady = isOpen && !loading && !!taskEditData;

  useEffect(() => {
    // ao fechar OU ao trocar a task com o modal aberto, limpar snapshot
    // (evita mostrar status/dados "da task anterior" enquanto carrega a atual)
    if (!isOpen) {
      setFullTaskSnapshot(null);
      setSnapshotSalesStatus('prospect');
      setSnapshotOpportunityValue(0);
      return;
    }

    // Se abriu/trocou de task, garantir que não existe snapshot antigo
    setFullTaskSnapshot(null);
    setSnapshotSalesStatus('prospect');
    setSnapshotOpportunityValue(0);
  }, [isOpen, task?.id]);

  // Criar snapshot UMA VEZ quando taskEditData carrega (inclui itens/produtos)
  useEffect(() => {
    if (!isOpen) return;
    if (!taskEditData) return;
    if (loading) return;
    if (fullTaskSnapshot) return; // já congelou — não atualizar mais

    // Mapear checklist
    const checklist: ProductType[] = (taskEditData.items || []).map((item) => ({
      id: item.id,
      name: item.produto,
      category: (item.sku || 'other') as ProductType['category'],
      selected: (item.qtd_vendida || 0) > 0,
      quantity: item.qtd_ofertada || 0,
      price: item.preco_unit || 0,
      observations: '',
      photos: [],
    }));

    // Calcular valor da oportunidade.
    // Prioridade: (1) valor salvo na oportunidade existente → imutável após criação;
    //             (2) soma de todos os itens ofertados (qtd_ofertada) → fonte da verdade;
    //             (3) sales_value da task → fallback apenas quando não há itens.
    // Nota: NÃO usar task.sales_value como segunda prioridade pois pode conter
    // valor parcial salvo em edições anteriores e contaminar o total.
    const fromOpportunity = taskEditData.opportunity?.valor_total_oportunidade;
    const fromItems = (taskEditData.items || []).reduce((sum, i) => {
      return sum + (i.preco_unit || 0) * (i.qtd_ofertada || 0);
    }, 0);

    let totalValue = 0;
    if (typeof fromOpportunity === 'number' && fromOpportunity > 0) {
      totalValue = fromOpportunity;
    } else if (fromItems > 0) {
      totalValue = fromItems;
    } else {
      const fromTask = taskEditData.sales_value;
      totalValue = typeof fromTask === 'number' && fromTask > 0 ? fromTask : 0;
    }

    // Calcular status exatamente como no modal de editar:
    // 1) Se existir opportunity.status, ele manda.
    // 2) Se NÃO existir, só considera venda quando sales_confirmed === true; caso contrário é prospect.
    const salesConfirmed = taskEditData.sales_confirmed;
    const salesType = taskEditData.sales_type;

    let calculatedStatus: 'prospect' | 'ganho' | 'perdido' | 'parcial' = 'prospect';

    const opportunityStatus = taskEditData.opportunity?.status;
    if (opportunityStatus) {
      switch (opportunityStatus) {
        case 'Prospect':
          calculatedStatus = 'prospect';
          break;
        case 'Venda Total':
          calculatedStatus = 'ganho';
          break;
        case 'Venda Parcial':
          calculatedStatus = 'parcial';
          break;
        case 'Venda Perdida':
          calculatedStatus = 'perdido';
          break;
        default:
          calculatedStatus = 'prospect';
      }
    } else if (salesConfirmed === true) {
      switch (salesType) {
        case 'ganho':
          calculatedStatus = 'ganho';
          break;
        case 'parcial':
          calculatedStatus = 'parcial';
          break;
        case 'perdido':
          calculatedStatus = 'perdido';
          break;
        default:
          calculatedStatus = 'prospect';
      }
    } else {
      calculatedStatus = 'prospect';
    }

    // Normalizar os campos para que componentes que usam mapSalesStatus (ex.: SalesStatusDisplay)
    // fiquem 100% consistentes com o status do "Editar".
    const normalizedSalesConfirmed: boolean | null =
      calculatedStatus === 'prospect' ? null : calculatedStatus === 'perdido' ? false : true;

    const normalizedSalesType: 'prospect' | 'ganho' | 'parcial' | 'perdido' =
      calculatedStatus === 'prospect'
        ? 'prospect'
        : calculatedStatus === 'parcial'
          ? 'parcial'
          : calculatedStatus === 'perdido'
            ? 'perdido'
            : 'ganho';

    const startDate = taskEditData.startDate || taskEditData.data;
    const endDate = taskEditData.endDate || taskEditData.data;

    const snapshot: Task = {
      id: taskEditData.id,
      name: taskEditData.name || '',
      responsible: taskEditData.responsible || '',
      contactName: (taskEditData as any).contactName,
      contactFunction: (taskEditData as any).contactFunction,
      client: taskEditData.cliente_nome || '',
      clientCode: taskEditData.clientCode,
      property: taskEditData.property || '',
      email: taskEditData.cliente_email || undefined,
      phone: taskEditData.phone || undefined,
      filial: taskEditData.filial || undefined,
      filialAtendida: taskEditData.filialAtendida,
      taskType: (taskEditData.taskType || taskEditData.tipo || 'prospection') as Task['taskType'],
      checklist: checklist,
      startDate: startDate ? new Date(startDate as any) : new Date(),
      endDate: endDate ? new Date(endDate as any) : new Date(),
      startTime: taskEditData.startTime || '',
      endTime: taskEditData.endTime || '',
      observations: taskEditData.notas || taskEditData.observations || '',
      priority: (taskEditData.priority || 'medium') as Task['priority'],
      reminders: [],
      photos: taskEditData.photos || [],
      documents: taskEditData.documents || [],
      checkInLocation: taskEditData.check_in_location as any,
      initialKm: (taskEditData.initialKm as any) || 0,
      finalKm: (taskEditData.finalKm as any) || 0,
      status: (taskEditData.status as any) || 'pending',
      createdBy: taskEditData.vendedor_id,
      createdAt: new Date(),
      updatedAt: new Date(),
      isProspect: calculatedStatus === 'prospect',
      prospectNotes: taskEditData.prospectNotes || undefined,
      prospectNotesJustification: taskEditData.prospectNotesJustification || undefined,
      salesConfirmed: normalizedSalesConfirmed ?? undefined,
      salesType: normalizedSalesType as any,
      // Para exibição, usar o mesmo valor calculado/fixado
      salesValue: totalValue,
      partialSalesValue: taskEditData.partial_sales_value || undefined,
      familyProduct: taskEditData.familyProduct,
      equipmentQuantity: taskEditData.equipmentQuantity,
      propertyHectares: taskEditData.propertyHectares,
      equipmentList: Array.isArray(taskEditData.equipment_list) ? (taskEditData.equipment_list as any) : undefined,
      prospectItems: undefined,
      // Technical visit fields
      technicalCategory: taskEditData.technical_category || undefined,
      technicalFunnelStage: taskEditData.technical_funnel_stage || undefined,
      technicalVisitData: taskEditData.technical_visit_data || undefined,
      opportunityInterest: (taskEditData.opportunity_interest as any) || undefined,
      opportunityUrgency: (taskEditData.opportunity_urgency as any) || undefined,
      opportunityImpact: (taskEditData.opportunity_impact as any) || undefined,
      opportunityClosing: (taskEditData.opportunity_closing as any) || undefined,
      salesEstimate: taskEditData.sales_estimate || undefined,
      nextAction: taskEditData.next_action || undefined,
      nextActionDate: taskEditData.next_action_date || undefined,
      isMasked: (task as any).isMasked,
    };

    // CONGELAR todos os valores calculados
    setFullTaskSnapshot(snapshot);
    setSnapshotSalesStatus(calculatedStatus);
    setSnapshotOpportunityValue(totalValue);

    console.log('📸 FormVisualization: Snapshot criado', {
      id: snapshot.id,
      salesConfirmed,
      salesType,
      calculatedStatus,
      totalValue,
    });
  }, [isOpen, taskEditData, loading, fullTaskSnapshot, task]);

  // Mostrar loading dentro do modal enquanto carrega os dados
  if (isOpen && (!detailsReady || !fullTaskSnapshot)) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="pb-6 border-b">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-primary rounded-lg shadow-lg">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Relatório Completo de Oportunidade
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Carregando informações...
                </p>
              </div>
            </div>
          </DialogHeader>
          
          {error ? (
            <div className="space-y-4 py-8">
              <p className="text-sm text-destructive text-center">{error}</p>
              <div className="flex justify-center">
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-muted-foreground">Carregando detalhes da oportunidade...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }


  const fullTask = fullTaskSnapshot!;
  const salesStatus = snapshotSalesStatus;
  const opportunityTotalValue = snapshotOpportunityValue;

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateReportPDF(fullTask.id, { calculateTotalValue: calculateTaskTotalValue, getTaskTypeLabel });

      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado automaticamente.",
      });
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Ocorreu um erro ao gerar o arquivo. Verifique os dados e tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const productsRows = (fullTask.checklist || [])
      .map((item) => {
        const subtotal = (item.price || 0) * (item.quantity || 1);
        return `
          <tr>
            <td style="text-align:center;">${item.selected ? '✓' : ''}</td>
            <td>${escapeHtml(String(item.name || 'N/A'))}</td>
            <td>${escapeHtml(String(item.category || 'N/A'))}</td>
            <td style="text-align:center;">${item.quantity || 1}</td>
            <td style="text-align:right;">R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:right; font-weight:600;">R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          </tr>`;
      })
      .join('');

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=720');
    if (!printWindow) return;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Relatório de Oportunidade — ${escapeHtml(fullTask.client || '')}</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .sub { color: #555; font-size: 12px; margin: 0 0 14px; }
    h2 { font-size: 13px; margin: 14px 0 6px; color:#1f4e8a; }
    .box { border: 1px solid #ddd; padding: 10px; border-radius: 8px; margin-bottom: 10px; }
    .row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; margin: 2px 0; }
    .label { color: #666; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 12px; }
    .grid > div > span.label { display:block; font-size:10px; color:#888; }
    .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; background:#eef2ff; color:#1e3a8a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
    th { background: #f5f5f5; text-align: left; }
    pre.note { white-space: pre-wrap; font-family: inherit; font-size:12px; margin:0; }
  </style>
</head>
<body>
  <h1>Relatório de Oportunidade — ${escapeHtml(fullTask.client || 'N/A')}</h1>
  <p class="sub">
    ${escapeHtml(getTaskTypeLabel(fullTask.taskType || 'prospection'))}
    • ${escapeHtml(formatDateDisplay(fullTask.startDate))}
    • <span class="badge">${escapeHtml(getStatusLabel(salesStatus))}</span>
  </p>

  <div class="box">
    <h2>Cliente</h2>
    <div class="grid">
      <div><span class="label">Nome</span>${escapeHtml(fullTask.client || 'N/A')}</div>
      <div><span class="label">Código</span>${escapeHtml(fullTask.clientCode || 'N/A')}</div>
      <div><span class="label">Email</span>${escapeHtml(fullTask.email || 'N/A')}</div>
      <div><span class="label">Telefone</span>${escapeHtml(fullTask.phone || 'N/A')}</div>
      <div><span class="label">Propriedade</span>${escapeHtml(fullTask.property || 'N/A')}</div>
      <div><span class="label">Hectares</span>${fullTask.propertyHectares ? `${fullTask.propertyHectares} ha` : 'N/A'}</div>
      <div><span class="label">Responsável (Vendedor)</span>${escapeHtml(fullTask.responsible || 'N/A')}</div>
      ${(fullTask as any).contactName ? `<div><span class="label">Contato no Cliente</span>${escapeHtml((fullTask as any).contactName)}</div>` : ''}
      ${(fullTask as any).contactFunction ? `<div><span class="label">Função do Contato</span>${escapeHtml((fullTask as any).contactFunction)}</div>` : ''}
      <div><span class="label">Filial</span>${escapeHtml(resolveFilialName(fullTask.filial) || 'N/A')}</div>
      ${fullTask.filialAtendida ? `<div><span class="label">Filial Atendida</span>${escapeHtml(resolveFilialName(fullTask.filialAtendida) || fullTask.filialAtendida)}</div>` : ''}
    </div>
  </div>

  <h2>Produtos e Serviços (${(fullTask.checklist || []).length})</h2>
  <table>
    <thead>
      <tr>
        <th style="width:28px; text-align:center;">✓</th>
        <th>Produto / Serviço</th>
        <th style="width:120px;">Categoria</th>
        <th style="width:44px; text-align:center;">Qtd</th>
        <th style="width:90px; text-align:right;">Preço</th>
        <th style="width:90px; text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${productsRows || '<tr><td colspan="6" style="text-align:center; color:#666;">Nenhum produto/serviço cadastrado.</td></tr>'}
    </tbody>
  </table>
  <p style="text-align:right; font-size:12px; margin-top:6px;">
    <strong>Valor da Oportunidade:</strong>
    R$ ${opportunityTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
  </p>

  ${fullTask.observations ? `
  <div class="box">
    <h2>Observações</h2>
    <pre class="note">${escapeHtml(fullTask.observations)}</pre>
  </div>` : ''}

  ${salesStatus === 'perdido' && (fullTask.prospectNotes || fullTask.prospectNotesJustification) ? `
  <div class="box" style="border-color:#fca5a5;">
    <h2 style="color:#b91c1c;">Motivo da Perda</h2>
    ${fullTask.prospectNotes ? `<p><span class="label">Motivo:</span></p><pre class="note">${escapeHtml(fullTask.prospectNotes)}</pre>` : ''}
    ${fullTask.prospectNotesJustification ? `<p><span class="label">Justificativa:</span></p><pre class="note">${escapeHtml(fullTask.prospectNotesJustification)}</pre>` : ''}
  </div>` : ''}

  ${(fullTask.nextAction || fullTask.nextActionDate) ? `
  <div class="box">
    <h2>Próxima Ação</h2>
    <div class="grid">
      ${fullTask.nextAction ? `<div><span class="label">Ação</span>${escapeHtml(String(fullTask.nextAction))}</div>` : ''}
      ${fullTask.nextActionDate ? `<div><span class="label">Data prevista</span>${escapeHtml(formatDateDisplay(fullTask.nextActionDate as any))}</div>` : ''}
    </div>
  </div>` : ''}

  ${fullTask.taskType === 'technical_visit' && (
    fullTask.technicalCategory || fullTask.technicalFunnelStage ||
    fullTask.opportunityInterest || fullTask.opportunityUrgency ||
    fullTask.opportunityImpact || fullTask.opportunityClosing ||
    fullTask.salesEstimate
  ) ? `
  <div class="box" style="border-color:#fcd34d;">
    <h2 style="color:#b45309;">Dados da Visita Técnica</h2>
    <div class="grid">
      ${fullTask.technicalCategory ? `<div><span class="label">Categoria Técnica</span>${escapeHtml(fullTask.technicalCategory)}</div>` : ''}
      ${fullTask.technicalFunnelStage ? `<div><span class="label">Etapa Funil Técnico</span>${escapeHtml(fullTask.technicalFunnelStage)}</div>` : ''}
      ${fullTask.opportunityInterest ? `<div><span class="label">Interesse</span>${escapeHtml(fullTask.opportunityInterest)}</div>` : ''}
      ${fullTask.opportunityUrgency ? `<div><span class="label">Urgência</span>${escapeHtml(fullTask.opportunityUrgency)}</div>` : ''}
      ${fullTask.opportunityImpact ? `<div><span class="label">Impacto</span>${escapeHtml(fullTask.opportunityImpact)}</div>` : ''}
      ${fullTask.opportunityClosing ? `<div><span class="label">Fechamento</span>${escapeHtml(fullTask.opportunityClosing)}</div>` : ''}
      ${fullTask.salesEstimate ? Object.entries(fullTask.salesEstimate).filter(([k]) => k !== 'puk').map(([k, v]) => `<div><span class="label">Estimativa ${escapeHtml(k)}</span>R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>`).join('') : ''}
    </div>
  </div>` : ''}

  ${fullTask.checkInLocation ? `
  <div class="box">
    <h2>Check-in</h2>
    <div class="grid">
      <div><span class="label">Coordenadas</span>${fullTask.checkInLocation.lat}, ${fullTask.checkInLocation.lng}</div>
      ${fullTask.checkInLocation.timestamp ? `<div><span class="label">Data/Hora</span>${escapeHtml(format(parseLocalDate(fullTask.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }))}</div>` : ''}
    </div>
  </div>` : ''}
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleEmail = () => {
    const subject = `Relatório de Oportunidade - ${fullTask?.client || 'Cliente'}`;
    const contactLine = (fullTask as any)?.contactName
      ? `\n- Contato no Cliente: ${(fullTask as any).contactName}${(fullTask as any).contactFunction ? ` (${(fullTask as any).contactFunction})` : ''}`
      : '';
    const body = `Olá,\n\nSegue em anexo o relatório da oportunidade para o cliente ${fullTask?.client || 'N/A'}.\n\nDetalhes:\n- Propriedade: ${fullTask?.property || 'N/A'}\n- Responsável (Vendedor): ${fullTask?.responsible || 'N/A'}${contactLine}\n- Data: ${fullTask?.startDate ? formatDateDisplay(fullTask.startDate) : 'N/A'}\n\nAtenciosamente,\n${fullTask?.responsible || 'Equipe'}`;

    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  // Não bloquear o dialog inteiro - dados já estão congelados no snapshot
  const displayChecklist = fullTask.checklist || [];


  // ============ Helpers de apresentação ============
  const formatBRL = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

  const totalProducts = displayChecklist.length;
  const selectedCount = displayChecklist.filter(i => i.selected).length;
  const productsOfferedTotal = displayChecklist.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const productsSelectedTotal = displayChecklist
    .filter(i => i.selected)
    .reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

  const potentialValue = opportunityTotalValue || productsOfferedTotal;
  const closedValue =
    salesStatus === 'ganho'
      ? potentialValue
      : salesStatus === 'parcial'
        ? (fullTask.partialSalesValue || productsSelectedTotal)
        : 0;
  const conversion = potentialValue > 0 ? Math.round((closedValue / potentialValue) * 100) : 0;

  const typeLabel = getTaskTypeLabel(fullTask.taskType || 'prospection');

  const Field: React.FC<{ label: string; value?: React.ReactNode; icon?: React.ElementType }> = ({ label, value, icon: Icon }) => (
    <div className="space-y-1 min-w-0">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-foreground flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="truncate">{value || <span className="text-muted-foreground/60">—</span>}</span>
      </div>
    </div>
  );

  const KpiCard: React.FC<{ label: string; value: string; sub?: string; tone?: 'primary' | 'success' | 'warning' | 'muted' }> = ({ label, value, sub, tone = 'primary' }) => {
    const toneMap = {
      primary: 'border-primary/20 bg-primary/5 text-primary',
      success: 'border-success/20 bg-success/5 text-success',
      warning: 'border-warning/20 bg-warning/5 text-warning',
      muted:   'border-border bg-muted/40 text-foreground',
    } as const;
    return (
      <div className={cn('rounded-xl border px-4 py-3', toneMap[tone])}>
        <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-xl sm:text-2xl font-bold leading-tight mt-1">{value}</div>
        {sub && <div className="text-[11px] opacity-70 mt-0.5">{sub}</div>}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0 gap-0">
        {/* ===== Header executivo sticky ===== */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
          <DialogHeader className="px-4 sm:px-6 py-4 space-y-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  Relatório · {typeLabel}
                </div>
                <DialogTitle className="text-xl sm:text-2xl font-bold leading-tight truncate">
                  {fullTask.client || 'Cliente não informado'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {fullTask.property || '—'}
                  <span className="mx-1.5 opacity-50">·</span>
                  {formatDateDisplay(fullTask.startDate)}
                  {fullTask.startTime && <span className="opacity-70"> · {fullTask.startTime}{fullTask.endTime ? ` – ${fullTask.endTime}` : ''}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Badge className={cn(getStatusColor(salesStatus), 'text-xs px-2.5 py-1 border')}>
                  {getStatusLabel(salesStatus)}
                </Badge>
                <Button variant="gradient" size="sm" onClick={generatePDF} disabled={isGeneratingPDF}>
                  <Download className="w-4 h-4" />
                  {isGeneratingPDF ? 'Gerando…' : 'PDF'}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4" />
                  Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={handleEmail}>
                  <Mail className="w-4 h-4" />
                  E-mail
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-4 sm:px-6 py-6 space-y-6">
          {/* ===== KPIs executivos ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Valor Potencial" value={formatBRL(potentialValue)} tone="primary" />
            <KpiCard
              label="Valor Fechado"
              value={closedValue > 0 ? formatBRL(closedValue) : '—'}
              tone={salesStatus === 'ganho' ? 'success' : salesStatus === 'parcial' ? 'warning' : 'muted'}
            />
            <KpiCard
              label="Conversão"
              value={potentialValue > 0 ? `${conversion}%` : '—'}
              sub={salesStatus === 'prospect' ? 'Em prospecção' : getStatusLabel(salesStatus)}
              tone={conversion >= 100 ? 'success' : conversion > 0 ? 'warning' : 'muted'}
            />
            <KpiCard
              label="Produtos"
              value={`${selectedCount}/${totalProducts}`}
              sub={selectedCount > 0 ? `${formatBRL(productsSelectedTotal)} selecionados` : 'Nenhum selecionado'}
              tone="muted"
            />
          </div>

          {/* ===== Cliente & Propriedade ===== */}
          <SectionCard icon={User} title="Cliente & Propriedade" description="Identificação, contato e localização" tone="primary">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <Field label="Cliente" value={fullTask.client} icon={User} />
              <Field label="Código" value={fullTask.clientCode} icon={Hash} />
              <Field label="Propriedade" value={fullTask.property} icon={Building} />
              <Field label="Hectares" value={fullTask.propertyHectares ? `${fullTask.propertyHectares} ha` : undefined} icon={Crop} />
              <Field label="E-mail" value={fullTask.email} icon={AtSign} />
              <Field label="Telefone" value={fullTask.phone} icon={Phone} />
              <Field label="Responsável (Vendedor)" value={fullTask.responsible} icon={User} />
              {(fullTask as any).contactName && (
                <Field label="Contato no Cliente" value={(fullTask as any).contactName} icon={User} />
              )}
              {(fullTask as any).contactFunction && (
                <Field label="Função do Contato" value={(fullTask as any).contactFunction} />
              )}
              <Field label="Filial Responsável" value={resolveFilialName(fullTask.filial)} icon={Building} />
              {fullTask.filialAtendida && (
                <Field label="Filial Atendida" value={resolveFilialName(fullTask.filialAtendida) || fullTask.filialAtendida} icon={Building} />
              )}
            </div>
          </SectionCard>

          {/* ===== Parque de Máquinas ===== */}
          {fullTask.equipmentList && fullTask.equipmentList.length > 0 && (
            <SectionCard
              icon={Car}
              title="Parque de Máquinas"
              description={`${fullTask.equipmentList.length} família(s) · ${fullTask.equipmentList.reduce((s, e) => s + (e.quantity || 0), 0)} equipamento(s)`}
              tone="success"
            >
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                      <th className="px-2 py-2 font-medium">Família</th>
                      <th className="px-2 py-2 font-medium text-right w-24">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullTask.equipmentList.map((eq, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-2 py-2 font-medium">{eq.familyProduct}</td>
                        <td className="px-2 py-2 text-right font-semibold text-primary">{eq.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* ===== Produtos & Serviços ===== */}
          <SectionCard
            icon={Package}
            title={fullTask.taskType === 'ligacao' ? 'Produtos Ofertados' : 'Produtos & Serviços'}
            description={`${totalProducts} item(ns) · ${selectedCount} selecionado(s)`}
            tone="primary"
            headerRight={
              <Badge variant="outline" className="text-xs">
                {formatBRL(productsOfferedTotal)}
              </Badge>
            }
          >
            {displayChecklist.length > 0 ? (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                      <th className="px-2 py-2 font-medium w-8"></th>
                      <th className="px-2 py-2 font-medium">Produto / Serviço</th>
                      <th className="px-2 py-2 font-medium hidden md:table-cell">Categoria</th>
                      <th className="px-2 py-2 font-medium text-center w-16">Qtd</th>
                      <th className="px-2 py-2 font-medium text-right w-28">Preço</th>
                      <th className="px-2 py-2 font-medium text-right w-32">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayChecklist.map((item, idx) => {
                      const sub = (item.price || 0) * (item.quantity || 1);
                      return (
                        <tr
                          key={item.id || idx}
                          className={cn(
                            'border-b last:border-0 hover:bg-muted/30',
                            item.selected && 'bg-success/5'
                          )}
                        >
                          <td className="px-2 py-2">
                            {item.selected ? (
                              <CheckCircle2 className="w-4 h-4 text-success" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />
                            )}
                          </td>
                          <td className="px-2 py-2 font-medium">{item.name}</td>
                          <td className="px-2 py-2 hidden md:table-cell text-muted-foreground capitalize">{item.category}</td>
                          <td className="px-2 py-2 text-center">{item.quantity || 1}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatBRL(item.price || 0)}</td>
                          <td className={cn('px-2 py-2 text-right font-semibold tabular-nums', item.selected ? 'text-success' : 'text-foreground')}>
                            {formatBRL(sub)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2">
                      <td colSpan={4} className="px-2 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground font-medium">Selecionado</td>
                      <td className="px-2 py-3"></td>
                      <td className="px-2 py-3 text-right font-bold tabular-nums text-success">{formatBRL(productsSelectedTotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-right text-xs uppercase tracking-wide text-muted-foreground font-medium">Total Ofertado</td>
                      <td className="px-2 py-1"></td>
                      <td className="px-2 py-1 text-right font-bold tabular-nums text-primary">{formatBRL(productsOfferedTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum produto/serviço cadastrado.</p>
              </div>
            )}
          </SectionCard>

          {/* ===== Status da Oportunidade ===== */}
          <SalesStatusDisplay task={fullTask} showDetails={true} showLossReason={true} />

          {/* ===== Venda Parcial — produtos ===== */}
          {salesStatus === 'parcial' && (fullTask.prospectItems?.some(p => p.selected) || fullTask.checklist?.some(p => p.selected)) && (
            <ProductListComponent
              products={fullTask.prospectItems?.length ? fullTask.prospectItems : fullTask.checklist || []}
              readOnly
              showSelectedOnly
              title="Produtos da Venda Parcial"
            />
          )}

          {/* ===== Motivo da Perda ===== */}
          {salesStatus === 'perdido' && (fullTask.prospectNotes || fullTask.prospectNotesJustification) && (
            <SectionCard icon={FileText} title="Motivo da Perda" description="Razão e justificativa registradas" tone="destructive">
              <div className="space-y-3">
                {fullTask.prospectNotes && (
                  <div className="bg-destructive/5 rounded-lg p-3 border-l-4 border-destructive">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Motivo</div>
                    <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{fullTask.prospectNotes}</p>
                  </div>
                )}
                {fullTask.prospectNotesJustification && (
                  <div className="bg-muted/40 rounded-lg p-3 border-l-4 border-muted-foreground/40">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Justificativa</div>
                    <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{fullTask.prospectNotesJustification}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ===== Notas de Prospect (não-perdido) ===== */}
          {salesStatus !== 'perdido' && fullTask.prospectNotes && (
            <SectionCard icon={FileText} title="Notas de Prospecção" tone="primary">
              <div className="bg-muted/40 rounded-lg p-3 border-l-4 border-primary">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullTask.prospectNotes}</p>
              </div>
            </SectionCard>
          )}

          {/* ===== Próxima Ação ===== */}
          {(fullTask.nextAction || fullTask.nextActionDate) && (
            <SectionCard icon={CalendarClock} title="Próxima Ação" description="Próximo passo planejado" tone="warning">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Ação" value={fullTask.nextAction as any} />
                <Field label="Data prevista" value={fullTask.nextActionDate ? formatDateDisplay(fullTask.nextActionDate as any) : undefined} icon={Calendar} />
              </div>
            </SectionCard>
          )}

          {/* ===== Visita Técnica ===== */}
          {fullTask.taskType === 'technical_visit' && (
            fullTask.technicalCategory || fullTask.technicalFunnelStage ||
            fullTask.opportunityInterest || fullTask.opportunityUrgency ||
            fullTask.opportunityImpact || fullTask.opportunityClosing ||
            fullTask.salesEstimate
          ) && (
            <SectionCard icon={Wrench} title="Dados da Visita Técnica" description="Categoria, funil e classificação" tone="warning">
              <div className="space-y-5">
                {(fullTask.technicalCategory || fullTask.technicalFunnelStage) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Categoria Técnica" value={fullTask.technicalCategory} />
                    <Field label="Etapa do Funil Técnico" value={fullTask.technicalFunnelStage} />
                  </div>
                )}

                {(fullTask.opportunityInterest || fullTask.opportunityUrgency ||
                  fullTask.opportunityImpact || fullTask.opportunityClosing) && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" /> Classificação
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ['Interesse', fullTask.opportunityInterest],
                        ['Urgência', fullTask.opportunityUrgency],
                        ['Impacto', fullTask.opportunityImpact],
                        ['Fechamento', fullTask.opportunityClosing],
                      ].map(([label, val]) => val ? (
                        <div key={label as string} className="rounded-lg border bg-muted/30 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                          <div className="text-sm font-semibold capitalize">{val}</div>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}

                {fullTask.salesEstimate && Object.keys(fullTask.salesEstimate).length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> Estimativa de Venda
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(fullTask.salesEstimate).filter(([k]) => k !== 'puk').map(([k, v]) => (
                        <div key={k} className="rounded-lg border bg-muted/30 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground capitalize">{k}</div>
                          <div className="text-sm font-semibold tabular-nums">{formatBRL(Number(v || 0))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ===== Observações ===== */}
          {fullTask.observations && (
            <SectionCard icon={FileText} title="Observações" tone="muted">
              <div className="bg-muted/40 rounded-lg p-3 border-l-4 border-primary">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullTask.observations}</p>
              </div>
            </SectionCard>
          )}

          {/* ===== Fotos & Check-in ===== */}
          {((fullTask.photos && fullTask.photos.length > 0) || fullTask.checkInLocation) && (
            <SectionCard
              icon={Camera}
              title="Fotos & Check-in"
              description={`${fullTask.photos?.length || 0} foto(s)${fullTask.checkInLocation ? ' · localização registrada' : ''}`}
              tone="muted"
            >
              {fullTask.photos && fullTask.photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                  {fullTask.photos.map((photo, idx) => (
                    <div key={idx} className="aspect-square rounded-lg overflow-hidden border bg-muted/30">
                      <img
                        src={photo}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => window.open(photo, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              )}
              {fullTask.checkInLocation && (
                <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="font-medium tabular-nums">
                      {fullTask.checkInLocation.lat?.toFixed?.(5) ?? fullTask.checkInLocation.lat},{' '}
                      {fullTask.checkInLocation.lng?.toFixed?.(5) ?? fullTask.checkInLocation.lng}
                    </span>
                  </div>
                  {fullTask.checkInLocation.timestamp && (
                    <div className="text-xs text-muted-foreground">
                      {format(parseLocalDate(fullTask.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </div>
                  )}
                  <Button variant="outline" size="sm" asChild className="ml-auto">
                    <a
                      href={`https://www.google.com/maps?q=${fullTask.checkInLocation.lat},${fullTask.checkInLocation.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin className="w-4 h-4" />
                      Google Maps
                    </a>
                  </Button>
                </div>
              )}
            </SectionCard>
          )}

          {/* ===== Documentos ===== */}
          {fullTask.documents && fullTask.documents.length > 0 && (
            <SectionCard icon={FileText} title="Documentos" description={`${fullTask.documents.length} arquivo(s)`} tone="muted">
              <div className="space-y-2">
                {fullTask.documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-muted/40 transition-colors">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">Documento {idx + 1}</span>
                    <Button variant="outline" size="sm" asChild>
                      <a href={doc} target="_blank" rel="noopener noreferrer">Abrir</a>
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ===== Rodapé metadados ===== */}
          <div className="pt-2 text-[11px] text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 justify-end border-t mt-4 pt-3">
            {fullTask.id && <span>ID: {String(fullTask.id).substring(0, 8)}…</span>}
            {fullTask.createdAt && <span>Criado: {format(new Date(fullTask.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>}
            {fullTask.updatedAt && <span>Atualizado: {format(new Date(fullTask.updatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
