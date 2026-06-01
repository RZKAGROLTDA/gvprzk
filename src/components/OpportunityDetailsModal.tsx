import React, { useState, useEffect, useRef } from 'react';
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
  Car, 
  MapPin, 
  Phone, 
  AtSign,
  Package,
  FileCheck,
  ClipboardList,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Tractor,
  Image as ImageIcon,
  Activity,
  ListChecks
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SectionCard } from '@/components/task-form/sections/SectionCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

interface OpportunityDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: Task) => void;
}

// Tipagem para filiais
interface Filial {
  id: string;
  nome: string;
}

// Helper function para buscar filiais
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

// Helper para resolver nome da filial
const getFilialNameRobust = (filialValue: string | undefined | null, filiais: Filial[]): string => {
  if (!filialValue) return 'N/A';
  
  // Se já é um nome (não é UUID), retorna direto
  if (!filialValue.includes('-') || filialValue.length < 30) {
    return filialValue;
  }
  
  // Tenta encontrar pelo ID
  const found = filiais.find(f => f.id === filialValue);
  return found?.nome || resolveFilialName(filialValue) || 'N/A';
};

// Helper para tipo de atividade
const getTaskTypeLabel = (taskType: string): string => {
  const types: Record<string, string> = {
    'prospection': 'Prospecção',
    'visita': 'Visita de Campo',
    'ligacao': 'Ligação',
    'checklist': 'Checklist de Oficina'
  };
  return types[taskType] || taskType;
};

export const OpportunityDetailsModal: React.FC<OpportunityDetailsModalProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'prospect' | 'ganho' | 'perdido' | 'parcial'>('prospect');
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [partialValue, setPartialValue] = useState<number>(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initialStatusRef, setInitialStatusRef] = useState<string | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  
  const filiais = useFiliais();
  const printRef = useRef<HTMLDivElement>(null);
  
  const { ensureOpportunity } = useOpportunityManager();
  const { refetch } = useTasksOptimized();

  // Carregar produtos se não estão presentes
  const needsProductsLoading = task && (!task.checklist || task.checklist.length === 0);
  const { data: taskWithProducts, isLoading: loadingProducts } = useTaskDetails(needsProductsLoading ? task.id : null);
  
  useEffect(() => {
    if (needsProductsLoading && loadingProducts) return;
    
    const currentTask = taskWithProducts || task;
    if (currentTask) {
      const currentStatus = mapSalesStatus(currentTask);
      setSelectedStatus(currentStatus);
      setInitialStatusRef(currentStatus);

      if (currentTask.checklist && currentTask.checklist.length > 0) {
        const initialSelected: Record<string, boolean> = {};
        const initialQuantities: Record<string, number> = {};
        let calculatedPartialValue = 0;
        
        currentTask.checklist.forEach(item => {
          initialSelected[item.id] = item.selected || false;
          initialQuantities[item.id] = item.quantity || 1;
          if (item.selected) {
            calculatedPartialValue += (item.price || 0) * (item.quantity || 1);
          }
        });
        
        setSelectedItems(initialSelected);
        setItemQuantities(initialQuantities);
        setPartialValue(calculatedPartialValue);
      } else {
        setSelectedItems({});
        setItemQuantities({});
        setPartialValue(0);
      }
      
      requestAnimationFrame(() => {
        setIsInitialized(true);
      });
    }
  }, [task, taskWithProducts, loadingProducts, needsProductsLoading]);

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setInitialStatusRef(null);
      setShowProducts(false);
    }
  }, [isOpen]);

  // Auto-save quando status muda
  useEffect(() => {
    if (!isInitialized || !task || !initialStatusRef) return;
    
    if (selectedStatus && selectedStatus !== initialStatusRef) {
      const timeoutId = setTimeout(() => {
        handleStatusUpdate();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedStatus, isInitialized, initialStatusRef]);

  const handleItemSelection = (itemId: string, selected: boolean) => {
    const currentTask = taskWithProducts || task;
    if (!currentTask) return;
    
    setSelectedItems(prev => ({ ...prev, [itemId]: selected }));

    let newPartialValue = 0;
    currentTask.checklist?.forEach(item => {
      const isSelected = itemId === item.id ? selected : selectedItems[item.id];
      const quantity = itemQuantities[item.id] || item.quantity || 1;
      if (isSelected) {
        newPartialValue += (item.price || 0) * quantity;
      }
    });
    setPartialValue(newPartialValue);
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    const currentTask = taskWithProducts || task;
    if (!currentTask || newQuantity < 1) return;
    
    setItemQuantities(prev => ({ ...prev, [itemId]: newQuantity }));

    let newPartialValue = 0;
    currentTask.checklist?.forEach(item => {
      const isSelected = selectedItems[item.id];
      const quantity = itemId === item.id ? newQuantity : itemQuantities[item.id] || item.quantity || 1;
      if (isSelected) {
        newPartialValue += (item.price || 0) * quantity;
      }
    });
    setPartialValue(newPartialValue);
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
          salesConfirmed = true;
          taskStatus = 'completed';
          isProspect = true;
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: true }));
          break;
        case 'parcial':
          salesConfirmed = true;
          taskStatus = 'completed';
          isProspect = true;
          updatedChecklist = updatedChecklist.map(item => ({
            ...item,
            selected: selectedItems[item.id] || false
          }));
          break;
        case 'perdido':
          salesConfirmed = false;
          taskStatus = 'completed';
          isProspect = false;
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: false }));
          break;
        case 'prospect':
          salesConfirmed = null;
          taskStatus = 'in_progress';
          isProspect = true;
          break;
      }

      const shouldZeroPartialValue = selectedStatus === 'prospect' || selectedStatus === 'perdido';
      
      const taskUpdateData = {
        sales_confirmed: salesConfirmed,
        sales_type: selectedStatus,
        status: taskStatus,
        is_prospect: isProspect,
        partial_sales_value: shouldZeroPartialValue ? 0 : (selectedStatus === 'parcial' ? partialValue : null),
        updated_at: new Date().toISOString()
      };
      
      const { error: taskError } = await supabase
        .from('tasks')
        .update(taskUpdateData)
        .eq('id', task.id);
      
      if (taskError) throw taskError;

      // Update products
      if (task.checklist && task.checklist.length > 0) {
        const { data: existingProducts, error: fetchError } = await supabase
          .from('products')
          .select('id, name, task_id')
          .eq('task_id', task.id);
        
        if (fetchError) throw fetchError;

        for (const checklistItem of updatedChecklist) {
          const existingProduct = existingProducts?.find(p => p.name === checklistItem.name || p.id === checklistItem.id);
          if (existingProduct) {
            const newQuantity = itemQuantities[checklistItem.id] || checklistItem.quantity || 1;
            let shouldBeSelected = checklistItem.selected;
            let shouldQuantity = newQuantity;
            
            if (selectedStatus === 'perdido' || selectedStatus === 'prospect') {
              shouldBeSelected = false;
              shouldQuantity = 0;
            }
            
            await supabase
              .from('products')
              .update({
                selected: shouldBeSelected,
                quantity: shouldQuantity,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingProduct.id);
          }
        }
      }

      const totalSalesValue = getSalesValueAsNumber(task.salesValue);
      const shouldZeroSalesValue = selectedStatus === 'prospect' || selectedStatus === 'perdido';
      
      await ensureOpportunity({
        taskId: task.id,
        clientName: task.client,
        filial: task.filial || '',
        salesValue: totalSalesValue,
        salesType: selectedStatus,
        partialSalesValue: shouldZeroSalesValue ? 0 : (selectedStatus === 'parcial' ? partialValue : 0),
        salesConfirmed: salesConfirmed,
        items: task.checklist?.map(item => ({
          id: item.id,
          produto: item.name,
          sku: '',
          preco_unit: item.price || 0,
          qtd_ofertada: item.quantity || 0,
          qtd_vendida: selectedStatus === 'ganho' ? (item.quantity || 0) : 
                      (selectedStatus === 'parcial' && selectedItems[item.id]) ? (itemQuantities[item.id] || 0) : 0
        })) || []
      });

      const updatedTask: Task = {
        ...task,
        salesConfirmed: salesConfirmed,
        status: taskStatus,
        isProspect: isProspect,
        checklist: updatedChecklist,
        updatedAt: new Date()
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

  // Função para gerar PDF
  const handlePDF = () => {
    if (!task) return;
    
    const currentTask = taskWithProducts || task;
    const doc = new jsPDF();
    const statusLabel = getStatusLabel(selectedStatus);
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text('Detalhes da Oportunidade', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${getTaskTypeLabel(currentTask.taskType)} • ${formatDateDisplay(currentTask.startDate)}`, 14, 28);
    
    // Status box
    const bgColor = getStatusBackgroundColor(selectedStatus);
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.roundedRect(14, 35, 50, 20, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`Status: ${statusLabel}`, 18, 47);
    
    // Valores
    const totalValue = getSalesValueAsNumber(currentTask.salesValue);
    const closedValue = selectedStatus === 'ganho' ? totalValue : 
                       selectedStatus === 'parcial' ? partialValue : 0;
    const conversion = totalValue > 0 ? (closedValue / totalValue * 100) : 0;
    
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(`Valor Potencial: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 70, 40);
    doc.text(`Valor Fechado: R$ ${closedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 70, 47);
    doc.text(`Conversão: ${conversion.toFixed(1)}%`, 70, 54);
    
    let yPos = 65;
    
    // Dados do Cliente
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('Dados do Cliente', 14, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(60);
    const clientInfo = [
      ['Nome:', currentTask.client || 'N/A'],
      ['Código:', currentTask.clientCode || 'N/A'],
      ['Propriedade:', currentTask.property || 'N/A'],
      ['Hectares:', currentTask.propertyHectares ? `${currentTask.propertyHectares} ha` : 'N/A'],
      ['Email:', currentTask.email || 'N/A'],
      ['Telefone:', currentTask.phone || 'N/A']
    ];
    
    clientInfo.forEach(([label, value]) => {
      doc.setTextColor(100);
      doc.text(label, 14, yPos);
      doc.setTextColor(40);
      doc.text(String(value), 45, yPos);
      yPos += 6;
    });
    
    yPos += 5;
    
    // Filial e Responsável
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('Filial e Responsável', 14, yPos);
    yPos += 8;
    
    const filialInfo = [
      ['Responsável:', currentTask.responsible || 'N/A'],
      ['Filial:', getFilialNameRobust(currentTask.filial, filiais)],
      ['Filial Atendida:', currentTask.filialAtendida ? getFilialNameRobust(currentTask.filialAtendida, filiais) : 'Mesma do responsável'],
      ['Tipo:', getTaskTypeLabel(currentTask.taskType)],
      ['Prioridade:', currentTask.priority || 'N/A']
    ];
    
    doc.setFontSize(10);
    filialInfo.forEach(([label, value]) => {
      doc.setTextColor(100);
      doc.text(label, 14, yPos);
      doc.setTextColor(40);
      doc.text(String(value), 50, yPos);
      yPos += 6;
    });
    
    // Produtos
    if (currentTask.checklist && currentTask.checklist.length > 0) {
      yPos += 10;
      doc.setFontSize(12);
      doc.setTextColor(37, 99, 235);
      doc.text('Produtos/Serviços', 14, yPos);
      yPos += 5;
      
      const tableData = currentTask.checklist.map(item => [
        item.name,
        item.category,
        String(item.quantity || 1),
        `R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `R$ ${((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        item.selected ? 'Sim' : 'Não'
      ]);
      
      (doc as any).autoTable({
        startY: yPos,
        head: [['Produto', 'Categoria', 'Qtd', 'Preço Unit.', 'Total', 'Vendido']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: 14 }
      });
    }
    
    // Observações
    if (currentTask.observations || currentTask.prospectNotes) {
      const finalY = (doc as any).lastAutoTable?.finalY || yPos + 10;
      doc.setFontSize(12);
      doc.setTextColor(37, 99, 235);
      doc.text('Observações', 14, finalY + 10);
      
      doc.setFontSize(10);
      doc.setTextColor(60);
      const obs = currentTask.observations || currentTask.prospectNotes || '';
      const splitObs = doc.splitTextToSize(obs, 180);
      doc.text(splitObs, 14, finalY + 18);
    }
    
    doc.save(`oportunidade-${currentTask.client}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF gerado com sucesso!');
  };

  // Função para imprimir
  const handlePrint = () => {
    window.print();
  };

  // Função para enviar email
  const handleEmail = () => {
    if (!task) return;
    
    const currentTask = taskWithProducts || task;
    const statusLabel = getStatusLabel(selectedStatus);
    const totalValue = getSalesValueAsNumber(currentTask.salesValue);
    const closedValue = selectedStatus === 'ganho' ? totalValue : 
                       selectedStatus === 'parcial' ? partialValue : 0;
    
    const subject = `Oportunidade - ${currentTask.client} - ${statusLabel}`;
    const body = `Olá,

Segue o resumo da oportunidade:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 INFORMAÇÕES GERAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Cliente: ${currentTask.client || 'N/A'}
• Código: ${currentTask.clientCode || 'N/A'}
• Propriedade: ${currentTask.property || 'N/A'}
• Tipo: ${getTaskTypeLabel(currentTask.taskType)}
• Data: ${formatDateDisplay(currentTask.startDate)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 STATUS DA VENDA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Status: ${statusLabel}
• Valor Potencial: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
• Valor Fechado: R$ ${closedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 FILIAL E RESPONSÁVEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Responsável: ${currentTask.responsible || 'N/A'}
• Filial: ${getFilialNameRobust(currentTask.filial, filiais)}
• Filial Atendida: ${currentTask.filialAtendida ? getFilialNameRobust(currentTask.filialAtendida, filiais) : 'Mesma do responsável'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 OBSERVAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${currentTask.observations || currentTask.prospectNotes || 'Nenhuma observação'}

Atenciosamente,
${currentTask.responsible || 'Equipe Comercial'}`;

    const mailtoLink = `mailto:${currentTask.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  if (!task) return null;
  
  const currentTask = taskWithProducts || task;
  const totalOpportunityValue = getSalesValueAsNumber(currentTask.salesValue);
  const closedValue = selectedStatus === 'ganho' ? totalOpportunityValue : 
                     selectedStatus === 'parcial' ? partialValue : 0;
  const conversionRate = totalOpportunityValue > 0 ? (closedValue / totalOpportunityValue * 100) : 0;

  if (loadingProducts && needsProductsLoading) {
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

  const itemsCount = currentTask.checklist?.length || 0;
  const selectedItemsCount = currentTask.checklist?.filter(i => i.selected).length || 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[95vh] overflow-y-auto overflow-x-hidden p-0 w-[95vw] max-w-[95vw] sm:w-full sm:max-w-5xl">
        <div ref={printRef} className="print:p-4">
          {/* Cabeçalho executivo */}
          <div className="p-4 sm:p-6 border-b bg-gradient-to-r from-primary/5 via-background to-background">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-primary/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    {currentTask.client || 'Oportunidade'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      {getTaskTypeLabel(currentTask.taskType)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDateDisplay(currentTask.startDate)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      {getFilialNameRobust(currentTask.filial, filiais)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {currentTask.responsible || 'N/A'}
                    </span>
                    <Badge className={`${getStatusColor(selectedStatus)} text-xs px-2 py-0.5`}>
                      {getStatusLabel(selectedStatus)}
                    </Badge>
                  </div>
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
          </div>

          {/* KPIs compactos */}
          <div className="px-4 sm:px-6 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" /> Valor Potencial
                </div>
                <p className="text-base font-bold text-primary tabular-nums">
                  R$ {totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-success" /> Valor Fechado
                </div>
                <p className="text-base font-bold text-success tabular-nums">
                  R$ {closedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Percent className="w-3.5 h-3.5 text-warning" /> Conversão
                </div>
                <p className="text-base font-bold text-warning tabular-nums">
                  {conversionRate.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Target className="w-3.5 h-3.5" /> Status
                </div>
                <Badge className={`${getStatusColor(selectedStatus)} text-xs`}>
                  {getStatusLabel(selectedStatus)}
                </Badge>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <ListChecks className="w-3.5 h-3.5 text-primary" /> Itens
                </div>
                <p className="text-base font-bold tabular-nums">
                  {selectedItemsCount}<span className="text-muted-foreground font-normal">/{itemsCount}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="p-4 sm:p-6 space-y-4">
            {/* Cliente + Filial/Responsável */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionCard icon={User} title="Dados do Cliente" tone="primary">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium">{currentTask.client || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Código</p>
                    <p className="font-medium">{currentTask.clientCode || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium flex items-center gap-1">
                      {currentTask.email ? (<><AtSign className="w-3 h-3" />{currentTask.email}</>) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium flex items-center gap-1">
                      {currentTask.phone ? (<><Phone className="w-3 h-3" />{currentTask.phone}</>) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Propriedade</p>
                    <p className="font-medium">{currentTask.property || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hectares</p>
                    <p className="font-medium">
                      {currentTask.propertyHectares ? `${currentTask.propertyHectares} ha` : 'N/A'}
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={Building2} title="Filial e Responsável" tone="primary">
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Responsável</p>
                    <p className="font-medium">{currentTask.responsible || 'N/A'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Filial do Responsável</p>
                      <p className="font-medium">{getFilialNameRobust(currentTask.filial, filiais)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Filial Atendida</p>
                      <p className="font-medium italic">
                        {currentTask.filialAtendida
                          ? getFilialNameRobust(currentTask.filialAtendida, filiais)
                          : 'Mesma do responsável'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Tipo de Atividade</p>
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {getTaskTypeLabel(currentTask.taskType)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Prioridade</p>
                      <Badge
                        variant={
                          currentTask.priority === 'high' ? 'destructive' :
                          currentTask.priority === 'medium' ? 'warning' : 'success'
                        }
                        className="text-xs mt-0.5"
                      >
                        {currentTask.priority === 'high' ? 'Alta' :
                         currentTask.priority === 'medium' ? 'Média' : 'Baixa'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Produtos / Serviços (tabela moderna) */}
            <SectionCard
              icon={Package}
              title="Produtos / Serviços"
              tone="primary"
              description={itemsCount > 0 ? `${selectedItemsCount} de ${itemsCount} vendido(s)` : undefined}
            >
              {currentTask.checklist && currentTask.checklist.length > 0 ? (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor Unit.</TableHead>
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
                                  <div className="text-xs text-muted-foreground">{item.category}</div>
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
                  <div className="flex justify-between items-center pt-1">
                    <p className="text-xs text-muted-foreground">
                      {currentTask.checklist.length} item(ns)
                    </p>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total da Oportunidade</p>
                      <p className="text-lg font-bold text-primary tabular-nums">
                        R$ {totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  Nenhum produto oferecido
                </div>
              )}
            </SectionCard>

            {/* Equipamentos (read-only) */}
            {currentTask.equipmentList && currentTask.equipmentList.length > 0 && (
              <SectionCard
                icon={Tractor}
                title="Parque de Máquinas"
                tone="muted"
                description={`${currentTask.equipmentList.length} equipamento(s)`}
              >
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Família / Modelo</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentTask.equipmentList.map((eq, idx) => (
                        <TableRow key={eq.id || idx}>
                          <TableCell className="text-sm">{eq.familyProduct || 'N/A'}</TableCell>
                          <TableCell className="text-right tabular-nums">{eq.quantity || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>
            )}

            {/* Próxima Ação */}
            {(currentTask.nextAction || currentTask.nextActionDate) && (
              <SectionCard icon={Activity} title="Próxima Ação" tone="warning">
                <div className="space-y-2 text-sm">
                  {currentTask.nextAction && (
                    <p className="whitespace-pre-wrap">{currentTask.nextAction}</p>
                  )}
                  {currentTask.nextActionDate && (
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDateDisplay(currentTask.nextActionDate as any)}
                    </p>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Observações */}
            {(currentTask.observations || currentTask.prospectNotes || currentTask.prospectNotesJustification) && (
              <SectionCard icon={MessageSquare} title="Observações e Notas" tone="primary">
                <div className="space-y-3">
                  {currentTask.observations && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Observações da Atividade</p>
                      <p className="text-sm bg-muted/40 p-3 rounded-lg whitespace-pre-wrap">{currentTask.observations}</p>
                    </div>
                  )}
                  {currentTask.prospectNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Notas do Prospect</p>
                      <p className="text-sm bg-primary/5 p-3 rounded-lg whitespace-pre-wrap">{currentTask.prospectNotes}</p>
                    </div>
                  )}
                  {currentTask.prospectNotesJustification && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Justificativa</p>
                      <p className="text-sm bg-warning/10 p-3 rounded-lg whitespace-pre-wrap">{currentTask.prospectNotesJustification}</p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Fotos */}
            {currentTask.photos && currentTask.photos.length > 0 && (
              <SectionCard
                icon={ImageIcon}
                title="Fotos"
                tone="muted"
                description={`${currentTask.photos.length} foto(s)`}
              >
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {currentTask.photos.map((photo, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => window.open(photo, '_blank')}
                      className="aspect-square border rounded-md overflow-hidden hover:opacity-80 transition-opacity"
                    >
                      <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Check-in / Localização */}
            {currentTask.checkInLocation && (
              <SectionCard icon={MapPin} title="Check-in" tone="success">
                <div className="text-sm space-y-1">
                  {currentTask.checkInLocation.lat && currentTask.checkInLocation.lng && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Lat: {currentTask.checkInLocation.lat}, Lng: {currentTask.checkInLocation.lng}
                    </p>
                  )}
                  {currentTask.property && (
                    <p className="text-sm">{currentTask.property}</p>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Atualização de Status */}
            <SectionCard icon={FileCheck} title="Atualizar Status" tone="primary" className="print:hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                <div className="flex-1 w-full md:w-auto">
                  <Select
                    value={selectedStatus}
                    onValueChange={(value: 'prospect' | 'ganho' | 'perdido' | 'parcial') => setSelectedStatus(value)}
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
                  <Button variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleStatusUpdate}
                    disabled={isUpdating || selectedStatus === mapSalesStatus(currentTask)}
                  >
                    {isUpdating ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Helper functions para PDF
function getStatusBackgroundColor(status: string): [number, number, number] {
  switch (status) {
    case 'ganho': return [34, 197, 94];
    case 'parcial': return [234, 179, 8];
    case 'perdido': return [239, 68, 68];
    default: return [59, 130, 246];
  }
}

function getStatusTextColor(status: string): [number, number, number] {
  return [255, 255, 255];
}
