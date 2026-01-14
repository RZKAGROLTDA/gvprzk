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
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
    doc.text(`${getTaskTypeLabel(currentTask.taskType)} • ${format(new Date(currentTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, 14, 28);
    
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
• Data: ${format(new Date(currentTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0">
        <div ref={printRef} className="print:p-4">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 border-b bg-gradient-to-r from-blue-50 to-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Detalhes da Oportunidade</h2>
                <p className="text-sm text-muted-foreground">
                  {getTaskTypeLabel(currentTask.taskType)} • {format(new Date(currentTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 print:hidden">
              <Button variant="default" size="sm" onClick={handlePDF} className="bg-blue-600 hover:bg-blue-700">
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={handleEmail}>
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
            </div>
          </div>

          {/* Status Cards */}
          <div className="p-6 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Status */}
              <div className="bg-white rounded-xl p-4 border shadow-sm text-center">
                <Target className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-2">Status</p>
                <Badge className={`${getStatusColor(selectedStatus)} text-sm px-3 py-1`}>
                  {getStatusLabel(selectedStatus)}
                </Badge>
              </div>
              
              {/* Valor Potencial */}
              <div className="bg-white rounded-xl p-4 border shadow-sm text-center">
                <TrendingUp className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">Valor Potencial</p>
                <p className="text-lg font-bold text-blue-600">
                  R$ {totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              
              {/* Valor Fechado */}
              <div className="bg-white rounded-xl p-4 border shadow-sm text-center">
                <DollarSign className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">Valor Fechado</p>
                <p className="text-lg font-bold text-green-600">
                  R$ {closedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              
              {/* Conversão */}
              <div className="bg-white rounded-xl p-4 border shadow-sm text-center">
                <Percent className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">Conversão</p>
                <p className="text-lg font-bold text-orange-600">
                  {conversionRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dados do Cliente */}
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Dados do Cliente</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Nome</p>
                    <p className="font-medium text-sm">{currentTask.client || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Código</p>
                    <p className="font-medium text-sm">{currentTask.clientCode || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Email</p>
                    <p className="font-medium text-sm flex items-center gap-1">
                      {currentTask.email ? (
                        <>
                          <AtSign className="w-3 h-3" />
                          {currentTask.email}
                        </>
                      ) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Telefone</p>
                    <p className="font-medium text-sm flex items-center gap-1">
                      {currentTask.phone ? (
                        <>
                          <Phone className="w-3 h-3" />
                          {currentTask.phone}
                        </>
                      ) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Propriedade</p>
                    <p className="font-medium text-sm">{currentTask.property || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Hectares</p>
                    <p className="font-medium text-sm">
                      {currentTask.propertyHectares ? `${currentTask.propertyHectares} ha` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Filial e Responsável */}
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Filial e Responsável</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Responsável</p>
                    <p className="font-medium text-sm">{currentTask.responsible || 'N/A'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Filial do Responsável</p>
                      <p className="font-medium text-sm">{getFilialNameRobust(currentTask.filial, filiais)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Filial Atendida</p>
                      <p className="font-medium text-sm italic">
                        {currentTask.filialAtendida 
                          ? getFilialNameRobust(currentTask.filialAtendida, filiais) 
                          : 'Mesma do responsável'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tipo de Atividade</p>
                      <Badge variant="outline" className="text-xs">
                        {getTaskTypeLabel(currentTask.taskType)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Prioridade</p>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          currentTask.priority === 'high' ? 'bg-red-100 text-red-800 border-red-200' :
                          currentTask.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                          'bg-green-100 text-green-800 border-green-200'
                        }`}
                      >
                        {currentTask.priority === 'high' ? 'Alta' : 
                         currentTask.priority === 'medium' ? 'Média' : 'Baixa'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agendamento e Deslocamento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Agendamento</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Data Início</p>
                    <p className="font-medium text-sm">
                      {format(new Date(currentTask.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Data Fim</p>
                    <p className="font-medium text-sm">
                      {currentTask.endDate 
                        ? format(new Date(currentTask.endDate), 'dd/MM/yyyy', { locale: ptBR }) 
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Horário Início</p>
                    <p className="font-medium text-sm">{currentTask.startTime || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Horário Fim</p>
                    <p className="font-medium text-sm">{currentTask.endTime || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Car className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Deslocamento</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">KM Inicial</p>
                    <p className="font-medium text-sm">{currentTask.initialKm || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">KM Final</p>
                    <p className="font-medium text-sm">{currentTask.finalKm || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Percorrido</p>
                    <p className="font-medium text-sm text-blue-600">
                      {currentTask.initialKm && currentTask.finalKm 
                        ? `${currentTask.finalKm - currentTask.initialKm} km` 
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                
                {currentTask.checkInLocation && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-green-600" />
                      <p className="text-xs text-muted-foreground">Check-in realizado</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lat: {currentTask.checkInLocation.lat.toFixed(6)}, Lng: {currentTask.checkInLocation.lng.toFixed(6)}
                      <br />
                      {format(new Date(currentTask.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Produtos/Serviços */}
            {currentTask.checklist && currentTask.checklist.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <button 
                  onClick={() => setShowProducts(!showProducts)}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">
                      Produtos/Serviços ({currentTask.checklist.length})
                    </h3>
                  </div>
                  {showProducts ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                
                {showProducts && (
                  <div className="mt-4 space-y-3">
                    {currentTask.checklist.map((item, index) => (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-4 ${
                          selectedStatus === 'parcial' ? 'hover:border-blue-300' : ''
                        } ${item.selected ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3 flex-1">
                            {selectedStatus === 'parcial' && (
                              <Checkbox 
                                checked={selectedItems[item.id] || false} 
                                onCheckedChange={(checked) => handleItemSelection(item.id, checked as boolean)} 
                                className="mt-1" 
                              />
                            )}
                            <div className="flex-1">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-muted-foreground">Categoria: {item.category}</p>
                              
                              <div className="flex items-center gap-4 mt-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">Qtd:</span>
                                  {selectedStatus === 'parcial' ? (
                                    <Input 
                                      type="number" 
                                      min="1" 
                                      value={itemQuantities[item.id] || item.quantity || 1}
                                      onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                      className="w-16 h-7 text-sm"
                                      disabled={!selectedItems[item.id]}
                                    />
                                  ) : (
                                    <span className="font-medium">{item.quantity || 1}</span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-sm text-muted-foreground">Preço: </span>
                                  <span className="font-medium">
                                    R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-sm text-muted-foreground">Total: </span>
                                  <span className="font-bold text-blue-600">
                                    R$ {((item.price || 0) * (itemQuantities[item.id] || item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                              
                              {item.observations && (
                                <p className="text-sm text-muted-foreground mt-2 italic">{item.observations}</p>
                              )}
                            </div>
                          </div>
                          <Badge variant={item.selected ? 'default' : 'secondary'}>
                            {item.selected ? 'Vendido' : 'Ofertado'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    
                    {/* Resumo dos produtos */}
                    <div className="border-t pt-4 mt-4 flex justify-end">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Total dos Produtos</p>
                        <p className="text-xl font-bold text-blue-600">
                          R$ {totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Observações */}
            {(currentTask.observations || currentTask.prospectNotes || currentTask.prospectNotesJustification) && (
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Observações e Notas</h3>
                </div>
                
                <div className="space-y-4">
                  {currentTask.observations && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Observações da Atividade</p>
                      <p className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{currentTask.observations}</p>
                    </div>
                  )}
                  {currentTask.prospectNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Notas do Prospect</p>
                      <p className="text-sm bg-blue-50 p-3 rounded-lg whitespace-pre-wrap">{currentTask.prospectNotes}</p>
                    </div>
                  )}
                  {currentTask.prospectNotesJustification && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Justificativa</p>
                      <p className="text-sm bg-yellow-50 p-3 rounded-lg whitespace-pre-wrap">{currentTask.prospectNotesJustification}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Atualização de Status */}
            <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl border p-5 print:hidden">
              <div className="flex items-center gap-2 mb-4">
                <FileCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Atualizar Status</h3>
              </div>
              
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="flex-1">
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
                  <div className="bg-yellow-100 px-4 py-2 rounded-lg">
                    <span className="text-sm text-yellow-800">
                      Valor Parcial: <strong>R$ {partialValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                      {totalOpportunityValue > 0 && (
                        <span className="ml-2">({conversionRate.toFixed(1)}%)</span>
                      )}
                    </span>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleStatusUpdate} 
                    disabled={isUpdating || selectedStatus === mapSalesStatus(currentTask)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isUpdating ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </div>
              </div>
            </div>
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
