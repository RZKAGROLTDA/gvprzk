import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Task } from '@/types/task';
import { mapSalesStatus, getStatusLabel, getStatusColor, resolveFilialName } from '@/lib/taskStandardization';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDateDisplay } from '@/lib/utils';
import { useTasksOptimized, useTaskDetails } from '@/hooks/useTasksOptimized';
import { useOpportunityManager } from '@/hooks/useOpportunityManager';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import {
  FileText,
  Printer,
  Mail,
  Target,
  TrendingUp,
  DollarSign,
  Percent,
  User,
  Building2,
  Calendar,
  Clock,
  MapPin,
  Phone,
  AtSign,
  Package,
  FileCheck,
  MessageSquare,
  Download,
  Tractor,
  Image as ImageIcon,
  Activity,
  ListChecks,
  UserCheck,
  Navigation,
  Camera,
  CheckCircle2,
  X,
  History,
  Sparkles,
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SectionCard } from '@/components/task-form/sections/SectionCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WorkshopChecklistView } from '@/components/WorkshopChecklistView';

interface OpportunityDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: Task) => void;
}

interface Filial {
  id: string;
  nome: string;
}

const useFiliais = () => {
  const [filiais, setFiliais] = useState<Filial[]>([]);
  useEffect(() => {
    const fetchFiliais = async () => {
      const { data } = await supabase.from('filiais').select('id, nome');
      if (data) setFiliais(data);
    };
    fetchFiliais();
  }, []);
  return filiais;
};

const getFilialNameRobust = (filialValue: string | undefined | null, filiais: Filial[]): string => {
  if (!filialValue) return 'N/A';
  if (!filialValue.includes('-') || filialValue.length < 30) return filialValue;
  const found = filiais.find(f => f.id === filialValue);
  return found?.nome || resolveFilialName(filialValue) || 'N/A';
};

const getTaskTypeLabel = (taskType: string): string => {
  const types: Record<string, string> = {
    prospection: 'Prospecção',
    visita: 'Visita de Campo',
    ligacao: 'Ligação',
    checklist: 'Checklist de Oficina',
    technical_visit: 'Visita Técnica',
  };
  return types[taskType] || taskType;
};

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

export const OpportunityDetailsModal: React.FC<OpportunityDetailsModalProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated,
}) => {
  // ⚙️ Fluxo único: Checklist da Oficina não usa esta modal comercial.
  if (task?.taskType === 'checklist') {
    return (
      <WorkshopChecklistView task={task} filiais={[]} isOpen={isOpen} onClose={onClose} />
    );
  }
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'prospect' | 'ganho' | 'perdido' | 'parcial'>('prospect');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [partialValue, setPartialValue] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initialStatusRef, setInitialStatusRef] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const filiais = useFiliais();
  const printRef = useRef<HTMLDivElement>(null);
  const { ensureOpportunity } = useOpportunityManager();
  const { refetch } = useTasksOptimized();

  // Sempre buscar detalhes completos quando o modal abre para garantir fotos/localização/equipamentos
  const { data: taskWithProducts, isLoading: loadingDetails } = useTaskDetails(
    isOpen && task ? task.id : null,
  );

  // Merge: prefere dados frescos do RPC quando disponíveis
  const currentTask = useMemo<Task | null>(() => {
    if (!task) return null;
    if (!taskWithProducts) return task;
    return {
      ...task,
      ...taskWithProducts,
      // preserva campos que o mapper do RPC pode não trazer
      contactName: task.contactName ?? (taskWithProducts as any).contactName,
      contactFunction: task.contactFunction ?? (taskWithProducts as any).contactFunction,
      nextAction: task.nextAction ?? (taskWithProducts as any).nextAction,
      nextActionDate: task.nextActionDate ?? (taskWithProducts as any).nextActionDate,
      photos: (taskWithProducts.photos && taskWithProducts.photos.length > 0)
        ? taskWithProducts.photos
        : (task.photos || []),
      checkInLocation: taskWithProducts.checkInLocation || task.checkInLocation,
      equipmentList: (taskWithProducts.equipmentList && taskWithProducts.equipmentList.length > 0)
        ? taskWithProducts.equipmentList
        : (task.equipmentList || []),
      checklist: (taskWithProducts.checklist && taskWithProducts.checklist.length > 0)
        ? taskWithProducts.checklist
        : (task.checklist || []),
    };
  }, [task, taskWithProducts]);

  useEffect(() => {
    if (!currentTask) return;
    const currentStatus = mapSalesStatus(currentTask);
    setSelectedStatus(currentStatus);
    setInitialStatusRef(currentStatus);

    if (currentTask.checklist && currentTask.checklist.length > 0) {
      const initialSelected: Record<string, boolean> = {};
      const initialQuantities: Record<string, number> = {};
      let calc = 0;
      currentTask.checklist.forEach(item => {
        initialSelected[item.id] = item.selected || false;
        initialQuantities[item.id] = item.quantity || 1;
        if (item.selected) calc += (item.price || 0) * (item.quantity || 1);
      });
      setSelectedItems(initialSelected);
      setItemQuantities(initialQuantities);
      setPartialValue(calc);
    } else {
      setSelectedItems({});
      setItemQuantities({});
      setPartialValue(0);
    }

    requestAnimationFrame(() => setIsInitialized(true));
  }, [currentTask?.id, taskWithProducts?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setInitialStatusRef(null);
      setLightboxPhoto(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isInitialized || !task || !initialStatusRef) return;
    if (selectedStatus && selectedStatus !== initialStatusRef) {
      const timeoutId = setTimeout(() => handleStatusUpdate(), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedStatus, isInitialized, initialStatusRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleItemSelection = (itemId: string, selected: boolean) => {
    if (!currentTask) return;
    setSelectedItems(prev => ({ ...prev, [itemId]: selected }));
    let newVal = 0;
    currentTask.checklist?.forEach(item => {
      const isSel = itemId === item.id ? selected : selectedItems[item.id];
      const q = itemQuantities[item.id] || item.quantity || 1;
      if (isSel) newVal += (item.price || 0) * q;
    });
    setPartialValue(newVal);
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (!currentTask || newQuantity < 1) return;
    setItemQuantities(prev => ({ ...prev, [itemId]: newQuantity }));
    let newVal = 0;
    currentTask.checklist?.forEach(item => {
      const isSel = selectedItems[item.id];
      const q = itemId === item.id ? newQuantity : itemQuantities[item.id] || item.quantity || 1;
      if (isSel) newVal += (item.price || 0) * q;
    });
    setPartialValue(newVal);
  };

  const handleStatusUpdate = async () => {
    if (!task) return;
    setIsUpdating(true);
    try {
      let salesConfirmed: boolean | null = null;
      let updatedChecklist = [...(task.checklist || [])];
      let taskStatus = task.status;
      let isProspect = task.isProspect;

      switch (selectedStatus) {
        case 'ganho':
          salesConfirmed = true; taskStatus = 'completed'; isProspect = true;
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: true }));
          break;
        case 'parcial':
          salesConfirmed = true; taskStatus = 'completed'; isProspect = true;
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: selectedItems[item.id] || false }));
          break;
        case 'perdido':
          salesConfirmed = false; taskStatus = 'completed'; isProspect = false;
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: false }));
          break;
        case 'prospect':
          salesConfirmed = null; taskStatus = 'in_progress'; isProspect = true;
          break;
      }

      const shouldZeroPartial = selectedStatus === 'prospect' || selectedStatus === 'perdido';
      const taskUpdateData = {
        sales_confirmed: salesConfirmed,
        sales_type: selectedStatus,
        status: taskStatus,
        is_prospect: isProspect,
        partial_sales_value: shouldZeroPartial ? 0 : (selectedStatus === 'parcial' ? partialValue : null),
        updated_at: new Date().toISOString(),
      };

      const { error: taskError } = await supabase.from('tasks').update(taskUpdateData).eq('id', task.id);
      if (taskError) throw taskError;

      if (task.checklist && task.checklist.length > 0) {
        const { data: existingProducts, error: fetchError } = await supabase
          .from('products').select('id, name, task_id').eq('task_id', task.id);
        if (fetchError) throw fetchError;

        for (const checklistItem of updatedChecklist) {
          const existingProduct = existingProducts?.find(p => p.name === checklistItem.name || p.id === checklistItem.id);
          if (existingProduct) {
            const newQty = itemQuantities[checklistItem.id] || checklistItem.quantity || 1;
            let shouldSel = checklistItem.selected;
            let shouldQty = newQty;
            if (selectedStatus === 'perdido' || selectedStatus === 'prospect') { shouldSel = false; shouldQty = 0; }
            await supabase.from('products').update({
              selected: shouldSel, quantity: shouldQty, updated_at: new Date().toISOString(),
            }).eq('id', existingProduct.id);
          }
        }
      }

      const totalSalesValue = getSalesValueAsNumber(task.salesValue);
      const shouldZeroSales = selectedStatus === 'prospect' || selectedStatus === 'perdido';

      await ensureOpportunity({
        taskId: task.id,
        clientName: task.client,
        filial: task.filial || '',
        salesValue: totalSalesValue,
        salesType: selectedStatus,
        partialSalesValue: shouldZeroSales ? 0 : (selectedStatus === 'parcial' ? partialValue : 0),
        salesConfirmed: salesConfirmed,
        items: task.checklist?.map(item => ({
          id: item.id, produto: item.name, sku: '',
          preco_unit: item.price || 0, qtd_ofertada: item.quantity || 0,
          qtd_vendida: selectedStatus === 'ganho' ? (item.quantity || 0) :
            (selectedStatus === 'parcial' && selectedItems[item.id]) ? (itemQuantities[item.id] || 0) : 0,
        })) || [],
      });

      const updatedTask: Task = {
        ...task, salesConfirmed, status: taskStatus, isProspect,
        checklist: updatedChecklist, updatedAt: new Date(),
      };

      await refetch();
      if (onTaskUpdated) onTaskUpdated(updatedTask);
      toast.success('Status da oportunidade atualizado com sucesso!');
      onClose();
    } catch (error: any) {
      toast.error(`Erro ao atualizar: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // ============ Cálculos de resumo ============
  const totalOpportunityValue = currentTask ? getSalesValueAsNumber(currentTask.salesValue) : 0;
  const closedValue = selectedStatus === 'ganho' ? totalOpportunityValue :
    selectedStatus === 'parcial' ? partialValue : 0;
  const conversionRate = totalOpportunityValue > 0 ? (closedValue / totalOpportunityValue * 100) : 0;

  const itemsCount = currentTask?.checklist?.length || 0;
  const selectedItemsCount = currentTask?.checklist?.filter(i => i.selected).length || 0;
  const equipmentCount = currentTask?.equipmentList?.length || 0;
  const equipmentTotalUnits = (currentTask?.equipmentList || []).reduce((s, e: any) => s + (Number(e.quantity) || 0), 0);
  const photoCount = currentTask?.photos?.length || 0;
  const hasLocation = !!(currentTask?.checkInLocation?.lat && currentTask?.checkInLocation?.lng);
  const duration = formatDuration(currentTask?.startTime, currentTask?.endTime);

  // ============ PDF ============
  // Dispatcher único (src/lib/generateReportPDF.ts) decide o gerador por taskType.
  // Checklist da Oficina → generateWorkshopChecklistPDF; demais → fallback abaixo.
  const handlePDF = async () => {
    if (!currentTask) return;
    const { generateReportPDF } = await import('@/lib/generateReportPDF');
    await generateReportPDF(currentTask, {
      fallback: async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 0;


    // Header band
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('Relatório da Visita', 14, 14);
    doc.setFontSize(10);
    doc.text(`${getTaskTypeLabel(currentTask.taskType)}  •  ${formatDateDisplay(currentTask.startDate)}`, 14, 22);
    doc.setFontSize(9);
    doc.text(getStatusLabel(selectedStatus).toUpperCase(), pageWidth - 14, 14, { align: 'right' });
    y = 40;

    // Cliente
    doc.setTextColor(37, 99, 235);
    doc.setFontSize(13);
    doc.text(currentTask.client || 'Cliente', 14, y);
    doc.setTextColor(90);
    doc.setFontSize(9);
    doc.text(`Código: ${currentTask.clientCode || '—'}   •   Propriedade: ${currentTask.property || '—'}`, 14, y + 6);
    y += 14;

    // KPIs
    const kpis = [
      ['Duração', duration],
      ['Equipamentos', String(equipmentCount)],
      ['Fotos', String(photoCount)],
      ['Localização', hasLocation ? 'Sim' : 'Não'],
      ['Itens vendidos', `${selectedItemsCount}/${itemsCount}`],
      ['Valor potencial', `R$ ${totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
    ];
    (doc as any).autoTable({
      startY: y,
      body: kpis,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: [60, 60, 60], fillColor: [245, 247, 252] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Dados do cliente
    doc.setTextColor(37, 99, 235); doc.setFontSize(11);
    doc.text('Dados do Cliente', 14, y); y += 4;
    (doc as any).autoTable({
      startY: y,
      body: [
        ['Nome', currentTask.client || '—', 'Código', currentTask.clientCode || '—'],
        ['Propriedade', currentTask.property || '—', 'Hectares', currentTask.propertyHectares ? `${currentTask.propertyHectares} ha` : '—'],
        ['Email', currentTask.email || '—', 'Telefone', currentTask.phone || '—'],
        ['Responsável', currentTask.responsible || '—', 'Filial', getFilialNameRobust(currentTask.filial, filiais)],
      ],
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: [110, 110, 110] }, 2: { fontStyle: 'bold', textColor: [110, 110, 110] } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Contato
    if (currentTask.contactName || currentTask.contactFunction) {
      doc.setTextColor(37, 99, 235); doc.setFontSize(11);
      doc.text('Contato da Visita', 14, y); y += 4;
      (doc as any).autoTable({
        startY: y,
        body: [['Nome', currentTask.contactName || '—', 'Função', currentTask.contactFunction || '—']],
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', textColor: [110, 110, 110] }, 2: { fontStyle: 'bold', textColor: [110, 110, 110] } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Localização
    if (hasLocation) {
      doc.setTextColor(37, 99, 235); doc.setFontSize(11);
      doc.text('Localização', 14, y); y += 5;
      doc.setTextColor(60); doc.setFontSize(9);
      doc.text(`Latitude: ${currentTask.checkInLocation!.lat}   Longitude: ${currentTask.checkInLocation!.lng}`, 14, y);
      y += 5;
      doc.setTextColor(37, 99, 235);
      doc.textWithLink('Abrir no Google Maps', 14, y, {
        url: `https://www.google.com/maps?q=${currentTask.checkInLocation!.lat},${currentTask.checkInLocation!.lng}`,
      });
      y += 8;
    }

    // Equipamentos
    if (currentTask.equipmentList && currentTask.equipmentList.length > 0) {
      doc.setTextColor(37, 99, 235); doc.setFontSize(11);
      doc.text('Equipamentos', 14, y); y += 4;
      (doc as any).autoTable({
        startY: y,
        head: [['Família / Modelo', 'Quantidade']],
        body: currentTask.equipmentList.map((e: any) => [e.familyProduct || '—', String(e.quantity || 0)]),
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Produtos
    if (currentTask.checklist && currentTask.checklist.length > 0) {
      doc.setTextColor(37, 99, 235); doc.setFontSize(11);
      doc.text('Produtos / Serviços', 14, y); y += 4;
      (doc as any).autoTable({
        startY: y,
        head: [['Produto', 'Categoria', 'Qtd', 'Unit.', 'Subtotal', 'Status']],
        body: currentTask.checklist.map(item => [
          item.name,
          item.category,
          String(item.quantity || 1),
          `R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          item.selected ? 'Vendido' : 'Ofertado',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Observações
    const obs = currentTask.observations || currentTask.prospectNotes;
    if (obs) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setTextColor(37, 99, 235); doc.setFontSize(11);
      doc.text('Observações', 14, y); y += 6;
      doc.setTextColor(60); doc.setFontSize(9);
      const lines = doc.splitTextToSize(obs, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 4 + 4;
    }

    // Fotos (até 6, incorporadas)
    const photos = (currentTask.photos || []).filter(p => typeof p === 'string');
    if (photos.length > 0) {
      doc.addPage(); y = 20;
      doc.setTextColor(37, 99, 235); doc.setFontSize(13);
      doc.text('Registro Fotográfico', 14, y); y += 8;
      const slice = photos.slice(0, 6);
      const colW = (pageWidth - 28 - 10) / 2;
      const rowH = 60;
      for (let i = 0; i < slice.length; i++) {
        const url = slice[i];
        if (!url.startsWith('data:image')) continue;
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 14 + col * (colW + 10);
        const yy = y + row * (rowH + 8);
        try { doc.addImage(url, 'JPEG', x, yy, colW, rowH); } catch { /* ignore */ }
      }
    }

    doc.save(`visita-${currentTask.client || 'cliente'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF gerado com sucesso!');
      },
    });
  };


  const handlePrint = () => window.print();

  const handleEmail = () => {
    if (!currentTask) return;
    const statusLabel = getStatusLabel(selectedStatus);
    const subject = `Relatório de Visita - ${currentTask.client} - ${statusLabel}`;
    const body = `Relatório de Visita

Cliente: ${currentTask.client || '—'}
Código: ${currentTask.clientCode || '—'}
Propriedade: ${currentTask.property || '—'}
Data: ${formatDateDisplay(currentTask.startDate)}
Duração: ${duration}
Responsável: ${currentTask.responsible || '—'}
Filial: ${getFilialNameRobust(currentTask.filial, filiais)}
Status: ${statusLabel}

Valor potencial: R$ ${totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Valor fechado:  R$ ${closedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Equipamentos: ${equipmentCount}
Fotos: ${photoCount}
Localização: ${hasLocation ? `${currentTask.checkInLocation!.lat}, ${currentTask.checkInLocation!.lng}` : '—'}

Observações:
${currentTask.observations || currentTask.prospectNotes || '—'}
`;
    window.open(`mailto:${currentTask.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  if (!task) return null;

  if (loadingDetails && !currentTask?.checklist?.length && !currentTask?.photos?.length) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            <span className="ml-2">Carregando...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!currentTask) return null;

  const mapEmbedUrl = hasLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${currentTask.checkInLocation!.lng - 0.005}%2C${currentTask.checkInLocation!.lat - 0.003}%2C${currentTask.checkInLocation!.lng + 0.005}%2C${currentTask.checkInLocation!.lat + 0.003}&layer=mapnik&marker=${currentTask.checkInLocation!.lat}%2C${currentTask.checkInLocation!.lng}`
    : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[95vh] overflow-y-auto overflow-x-hidden p-0 w-[96vw] max-w-[96vw] sm:w-full sm:max-w-6xl">
          <div ref={printRef} className="print:p-4">
            {/* 1. CABEÇALHO EXECUTIVO */}
            <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/15 via-primary/5 to-background">
              <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <div className="relative p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/30">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                          {getTaskTypeLabel(currentTask.taskType)}
                        </Badge>
                        <Badge className={`${getStatusColor(selectedStatus)} text-[10px] uppercase tracking-wider`}>
                          {getStatusLabel(selectedStatus)}
                        </Badge>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight tracking-tight">
                        {currentTask.client || 'Cliente'}
                      </h2>
                      {currentTask.property && (
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {currentTask.property}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 print:hidden">
                    <Button variant="default" size="sm" onClick={handlePDF}>
                      <Download className="w-4 h-4 mr-1" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Printer className="w-4 h-4 mr-1" /> Imprimir
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleEmail}>
                      <Mail className="w-4 h-4 mr-1" /> Email
                    </Button>
                  </div>
                </div>

                {/* Grade de metadados do cabeçalho */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 rounded-xl border bg-background/60 backdrop-blur-sm p-4">
                  <HeaderMeta icon={FileText} label="Código" value={currentTask.clientCode} mono />
                  <HeaderMeta icon={Calendar} label="Data" value={formatDateDisplay(currentTask.startDate)} />
                  <HeaderMeta icon={Clock} label="Início" value={currentTask.startTime} />
                  <HeaderMeta icon={Clock} label="Fim" value={currentTask.endTime} />
                  <HeaderMeta icon={Activity} label="Duração" value={duration} highlight />
                  <HeaderMeta icon={User} label="Responsável" value={currentTask.responsible} />
                  <HeaderMeta icon={Building2} label="Filial" value={getFilialNameRobust(currentTask.filial, filiais)} />
                </div>
              </div>
            </div>

            {/* 2. RESUMO DA VISITA */}
            <div className="px-5 sm:px-7 pt-5">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Resumo da Visita
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <SummaryCard icon={Tractor} label="Equip. selecionados" value={String(equipmentCount)} tone="primary" />
                <SummaryCard icon={CheckCircle2} label="Equip. validados" value="—" tone="success" />
                <SummaryCard icon={Sparkles} label="Novas máquinas" value="—" tone="muted" />
                <SummaryCard icon={Camera} label="Fotos" value={String(photoCount)} tone="warning" />
                <SummaryCard icon={Navigation} label="Localização" value={hasLocation ? 'Sim' : '—'} tone={hasLocation ? 'success' : 'muted'} />
                <SummaryCard icon={Package} label="Produtos" value={String(itemsCount)} sub={itemsCount ? `${selectedItemsCount} vendidos` : undefined} tone="primary" />
                <SummaryCard
                  icon={DollarSign}
                  label="Valor potencial"
                  value={`R$ ${totalOpportunityValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                  tone="success"
                />
                <SummaryCard
                  icon={Calendar}
                  label="Próxima ação"
                  value={currentTask.nextActionDate ? formatDateDisplay(currentTask.nextActionDate as any) : '—'}
                  sub={currentTask.nextAction ? String(currentTask.nextAction).slice(0, 22) : undefined}
                  tone="warning"
                />
              </div>

              {/* KPIs de conversão */}
              {(closedValue > 0 || selectedStatus !== 'prospect') && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MetricStrip icon={TrendingUp} label="Valor potencial" value={totalOpportunityValue} tone="primary" />
                  <MetricStrip icon={DollarSign} label="Valor fechado" value={closedValue} tone="success" />
                  <div className="rounded-xl border bg-gradient-to-br from-warning/10 to-transparent p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Percent className="w-3.5 h-3.5 text-warning" /> Taxa de conversão
                    </div>
                    <div className="flex items-end gap-2">
                      <p className="text-2xl font-bold text-warning tabular-nums">{conversionRate.toFixed(1)}%</p>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-warning rounded-full transition-all" style={{ width: `${Math.min(conversionRate, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Conteúdo */}
            <div className="p-5 sm:p-7 space-y-4">
              {/* 3. DADOS DO CLIENTE + 4. CONTATO DA VISITA */}
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


              {/* Mapa */}
              {hasLocation && mapEmbedUrl && (
                <SectionCard
                  icon={MapPin}
                  title="Localização da Visita"
                  tone="success"
                  description={`${currentTask.checkInLocation!.lat.toFixed(6)}, ${currentTask.checkInLocation!.lng.toFixed(6)}`}
                  headerRight={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://www.google.com/maps?q=${currentTask.checkInLocation!.lat},${currentTask.checkInLocation!.lng}`, '_blank')}
                      className="print:hidden"
                    >
                      <Navigation className="w-3.5 h-3.5 mr-1" /> Google Maps
                    </Button>
                  }
                >
                  <div className="rounded-lg overflow-hidden border bg-muted">
                    <iframe
                      title="Mapa da Localização"
                      src={mapEmbedUrl}
                      className="w-full h-64 sm:h-80"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Latitude</p>
                      <p className="font-mono tabular-nums font-semibold">{currentTask.checkInLocation!.lat.toFixed(6)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Longitude</p>
                      <p className="font-mono tabular-nums font-semibold">{currentTask.checkInLocation!.lng.toFixed(6)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Horário do check-in</p>
                      <p className="font-semibold inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-success" />
                        {currentTask.checkInLocation!.timestamp
                          ? format(new Date(currentTask.checkInLocation!.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : '—'}
                      </p>
                    </div>
                  </div>
                </SectionCard>
              )}


              {/* Galeria de Fotos */}
              {photoCount > 0 && (
                <SectionCard
                  icon={ImageIcon}
                  title="Registro Fotográfico"
                  tone="warning"
                  description={`${photoCount} foto${photoCount > 1 ? 's' : ''} capturada${photoCount > 1 ? 's' : ''} durante a visita`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {currentTask.photos!.map((photo, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setLightboxPhoto(photo)}
                        className="group relative aspect-square border rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                      >
                        <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="absolute bottom-1 right-1.5 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          {index + 1}/{photoCount}
                        </span>
                      </button>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Equipamentos */}
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
                          <TableHead className="min-w-[160px]">Observação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentTask.equipmentList.map((eq: any, idx: number) => {
                          const priority = eq.priority || eq.prioridade;
                          const priorityColors: Record<string, string> = {
                            alta: 'destructive', high: 'destructive',
                            media: 'warning', média: 'warning', medium: 'warning',
                            baixa: 'secondary', low: 'secondary',
                          };
                          const validated = eq.validated ?? eq.validado ?? eq.is_validated;
                          return (
                            <TableRow key={eq.id || idx}>
                              <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                              <TableCell>
                                {priority ? (
                                  <Badge variant={(priorityColors[String(priority).toLowerCase()] as any) || 'outline'} className="text-[10px] uppercase">
                                    {String(priority)}
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

              {/* Produtos / Serviços */}
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
                            {selectedStatus === 'parcial' && (
                              <TableHead className="text-center print:hidden">Vender</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentTask.checklist.map(item => {
                            const qty = itemQuantities[item.id] || item.quantity || 1;
                            const subtotal = (item.price || 0) * qty;
                            return (
                              <React.Fragment key={item.id}>
                                <TableRow className={item.selected ? 'bg-success/5' : ''}>
                                  <TableCell>
                                    <div className="font-medium text-sm">{item.name}</div>
                                    <div className="text-xs text-muted-foreground capitalize">{item.category}</div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {selectedStatus === 'parcial' ? (
                                      <Input
                                        type="number"
                                        min="1"
                                        value={qty}
                                        onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                        className="h-8 w-20 text-sm text-right inline-block"
                                        disabled={!selectedItems[item.id]}
                                      />
                                    ) : (
                                      qty
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold text-primary">
                                    R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant={item.selected ? 'success' : 'secondary'} className="text-xs">
                                      {item.selected ? 'Vendido' : 'Ofertado'}
                                    </Badge>
                                  </TableCell>
                                  {selectedStatus === 'parcial' && (
                                    <TableCell className="text-center print:hidden">
                                      <Checkbox
                                        checked={selectedItems[item.id] || false}
                                        onCheckedChange={(checked) => handleItemSelection(item.id, checked as boolean)}
                                      />
                                    </TableCell>
                                  )}
                                </TableRow>
                                {item.observations && (
                                  <TableRow className="bg-muted/30">
                                    <TableCell colSpan={selectedStatus === 'parcial' ? 6 : 5} className="text-xs italic text-muted-foreground py-2">
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
                        <p className="text-xl font-bold text-primary tabular-nums">
                          R$ {totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
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

              {/* Próxima Ação — destaque */}
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
                          {currentTask.nextAction}
                        </p>
                      )}
                      {currentTask.nextActionDate && (
                        <p className="mt-2 text-sm text-muted-foreground inline-flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-warning" />
                          <span className="font-medium text-foreground">
                            {formatDateDisplay(currentTask.nextActionDate as any)}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Observações — destaque */}
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


              {/* Timeline */}
              <SectionCard icon={History} title="Timeline da Visita" tone="muted">
                <ol className="relative border-l-2 border-muted ml-3 space-y-4">
                  <TimelineItem
                    color="bg-primary"
                    title="Visita criada"
                    date={currentTask.createdAt}
                    detail={currentTask.createdBy ? `por ${currentTask.responsible || 'usuário'}` : undefined}
                  />
                  <TimelineItem
                    color="bg-warning"
                    title="Visita agendada"
                    date={currentTask.startDate}
                    detail={currentTask.startTime ? `${currentTask.startTime}${currentTask.endTime ? ` – ${currentTask.endTime}` : ''}` : undefined}
                  />
                  {currentTask.checkInLocation?.timestamp && (
                    <TimelineItem
                      color="bg-success"
                      title="Check-in realizado"
                      date={currentTask.checkInLocation.timestamp}
                      detail={hasLocation ? `${currentTask.checkInLocation.lat.toFixed(4)}, ${currentTask.checkInLocation.lng.toFixed(4)}` : undefined}
                    />
                  )}
                  {currentTask.updatedAt && (
                    <TimelineItem
                      color="bg-muted-foreground"
                      title="Última atualização"
                      date={currentTask.updatedAt}
                      detail={getStatusLabel(selectedStatus)}
                    />
                  )}
                  {currentTask.nextActionDate && (
                    <TimelineItem
                      color="bg-primary"
                      title="Próxima ação prevista"
                      date={currentTask.nextActionDate as any}
                      detail={currentTask.nextAction}
                      future
                    />
                  )}
                </ol>
              </SectionCard>

              {/* Atualização de Status */}
              <SectionCard icon={FileCheck} title="Atualizar Status da Oportunidade" tone="primary" className="print:hidden">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                  <div className="flex-1 w-full md:w-auto">
                    <Select
                      value={selectedStatus}
                      onValueChange={(v: 'prospect' | 'ganho' | 'perdido' | 'parcial') => setSelectedStatus(v)}
                    >
                      <SelectTrigger className="w-full md:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prospect">🎯 Prospect</SelectItem>
                        <SelectItem value="parcial">📊 Venda Parcial</SelectItem>
                        <SelectItem value="ganho">✅ Venda Total</SelectItem>
                        <SelectItem value="perdido">❌ Venda Perdida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedStatus === 'parcial' && (
                    <div className="bg-warning/10 text-warning-foreground px-3 py-2 rounded-lg text-sm">
                      Valor Parcial: <strong className="tabular-nums">R$ {partialValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                      {totalOpportunityValue > 0 && (
                        <span className="ml-2 text-xs">({conversionRate.toFixed(1)}%)</span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 ml-auto">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleStatusUpdate} disabled={isUpdating || selectedStatus === mapSalesStatus(currentTask)}>
                      {isUpdating ? 'Salvando...' : 'Salvar Alterações'}
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
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

// ============ Subcomponents ============

const SummaryCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
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
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className="text-lg font-bold text-foreground tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
};

const MetricStrip: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: 'primary' | 'success';
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
        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value?: string | number | null;
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
}> = ({ label, value, icon: Icon, mono }) => (
  <div>
    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{label}</p>
    <p className={`font-medium text-sm flex items-center gap-1.5 ${mono ? 'font-mono' : ''}`}>
      {Icon && value && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      {value ? String(value) : <span className="text-muted-foreground italic font-normal">—</span>}
    </p>
  </div>
);

const HeaderMeta: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number | null;
  mono?: boolean;
  highlight?: boolean;
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

const TimelineItem: React.FC<{
  color: string;
  title: string;
  date?: Date | string;
  detail?: string;
  future?: boolean;
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
