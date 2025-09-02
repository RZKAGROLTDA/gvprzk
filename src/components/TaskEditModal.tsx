import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { StandardTaskForm } from './StandardTaskForm';
import { toast } from 'sonner';

interface TaskEditModalProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate: () => void;
}

interface OpportunityItem {
  id: string;
  produto: string;
  sku: string;
  qtd_ofertada: number;
  qtd_vendida: number;
  preco_unit: number;
  subtotal_ofertado: number;
  subtotal_vendido: number;
  incluir_na_venda_parcial?: boolean;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  taskId,
  isOpen,
  onClose,
  onTaskUpdate
}) => {
  console.log('🔧 TaskEditModal: Renderizado com props:', { taskId, isOpen });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: taskData, loading, error, updateTaskData } = useTaskEditData(taskId);
  const { invalidateAll } = useSecurityCache();
  
  console.log('🔧 TaskEditModal: Estado dos dados:', { taskData: !!taskData, loading, error });
  
  // Map task type from different sources to standardized values
  const mapTaskType = (type: string): 'visita' | 'ligacao' | 'checklist' => {
    switch (type) {
      case 'prospection':
      case 'field-visit':
      case 'visita':
        return 'visita';
      case 'ligacao':
      case 'call':
        return 'ligacao';
      case 'checklist':
      case 'workshop-checklist':
        return 'checklist';
      default:
        return 'visita';
    }
  };
  
  // Status mapping from opportunity status
  const getInitialStatus = () => {
    if (!taskData?.opportunity) return 'prospect';
    
    const status = taskData.opportunity.status;
    switch (status) {
      case 'Prospect': return 'prospect';
      case 'Venda Total': return 'venda_total';
      case 'Venda Parcial': return 'venda_parcial';
      case 'Venda Perdida': return 'venda_perdida';
      default: return 'prospect';
    }
  };

  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    filial: '',
    observacoes: '',
    status: 'prospect',
    prospectNotes: '',
    products: [] as OpportunityItem[],
    // Campos adicionais da tarefa
    name: '',
    responsible: '',
    property: '',
    phone: '',
    clientCode: '',
    taskType: 'visita' as 'visita' | 'ligacao' | 'checklist',
    priority: 'medium' as 'low' | 'medium' | 'high',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    familyProduct: '',
    equipmentQuantity: 0,
    propertyHectares: 0
  });

  // Load task data into form when available
  useEffect(() => {
    console.log('🔧 TaskEditModal: useEffect - taskData mudou:', { 
      hasTaskData: !!taskData,
      taskId: taskData?.id,
      cliente_nome: taskData?.cliente_nome 
    });
    
    if (!taskData) return;
    
    const newFormData = {
      customerName: taskData.cliente_nome || '',
      customerEmail: taskData.cliente_email || '',
      filial: taskData.filial || '',
      observacoes: taskData.notas || '',
      status: getInitialStatus(),
      prospectNotes: taskData.notas || '',
      products: (taskData.items || []).map(item => ({
        id: item.id,
        produto: item.produto,
        sku: item.sku,
        qtd_ofertada: item.qtd_ofertada,
        qtd_vendida: item.qtd_vendida,
        preco_unit: item.preco_unit,
        subtotal_ofertado: item.subtotal_ofertado,
        subtotal_vendido: item.subtotal_vendido,
        incluir_na_venda_parcial: item.qtd_vendida > 0
      })),
      // Preencher campos adicionais da tarefa
      name: taskData.name || '',
      responsible: taskData.responsible || '',
      property: taskData.property || '',
      phone: taskData.phone || '',
      clientCode: taskData.clientCode || '',
      taskType: mapTaskType(taskData.taskType || taskData.tipo || 'prospection'),
      priority: (taskData.priority as 'low' | 'medium' | 'high') || 'medium',
      startDate: taskData.startDate ? new Date(taskData.startDate).toISOString().split('T')[0] : '',
      endDate: taskData.endDate ? new Date(taskData.endDate).toISOString().split('T')[0] : '',
      startTime: taskData.startTime || '',
      endTime: taskData.endTime || '',
      familyProduct: taskData.familyProduct || '',
      equipmentQuantity: taskData.equipmentQuantity || 0,
      propertyHectares: taskData.propertyHectares || 0
    };
    
    console.log('🔧 TaskEditModal: Atualizando formData:', newFormData);
    setFormData(newFormData);
  }, [taskData]);

  const handleSubmit = async (formDataWithValues: any) => {
    setIsSubmitting(true);

    try {
      if (!taskId || !taskData) {
        toast.error('Erro: Task não encontrada');
        return;
      }

      // Usar os dados recebidos do StandardTaskForm que já incluem os valores calculados
      const formDataToProcess = formDataWithValues || formData;

      // Validação para venda perdida
      if (formDataToProcess.status === 'venda_perdida' && (!formDataToProcess.prospectNotes || formDataToProcess.prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        return;
      }

      // Map status to opportunity status
      const statusMapping = {
        prospect: 'Prospect',
        venda_total: 'Venda Total',
        venda_parcial: 'Venda Parcial',
        venda_perdida: 'Venda Perdida'
      };

      const opportunityStatus = statusMapping[formDataToProcess.status as keyof typeof statusMapping];

      // Usar valores calculados que vieram do StandardTaskForm
      const valorVenda = formDataToProcess.salesValue || 0;
      const valorVendaParcial = formDataToProcess.partialSalesValue || 0;
      
      // CRÍTICO: Preservar valor original da oportunidade ou usar valor da task se oportunidade não existe
      const valorTotalOportunidade = taskData?.opportunity?.valor_total_oportunidade || valorVenda;

      console.log('🔧 TaskEditModal: Valores calculados recebidos:', {
        salesValue: valorVenda,
        prospectValue: valorTotalOportunidade,
        partialSalesValue: valorVendaParcial
      });

      // Prepare update data including all task fields and calculated values
      const updatedData = {
        cliente_nome: formDataToProcess.customerName,
        cliente_email: formDataToProcess.customerEmail,
        filial: formDataToProcess.filial,
        notas: formDataToProcess.observacoes,
        tipo: formDataToProcess.taskType,
        // Additional task fields
        name: formDataToProcess.name,
        responsible: formDataToProcess.responsible,
        property: formDataToProcess.property,
        phone: formDataToProcess.phone,
        clientCode: formDataToProcess.clientCode,
        taskType: formDataToProcess.taskType,
        priority: formDataToProcess.priority,
        status: 'closed', // Garantir que o status seja fechado
        // Valores calculados corretos para ambas as tabelas
        salesValue: valorVenda,
        prospectValue: valorTotalOportunidade,
        partialSalesValue: valorVendaParcial,
        // Sales value fields for tasks table
        sales_value: valorVenda,
        partial_sales_value: valorVendaParcial,
        // Sales type based on status
        sales_type: formDataToProcess.status === 'venda_total' ? 'ganho' :
                   formDataToProcess.status === 'venda_parcial' ? 'parcial' :
                   formDataToProcess.status === 'venda_perdida' ? 'perdido' : null,
        sales_confirmed: formDataToProcess.status !== 'prospect',
        opportunity: {
          status: opportunityStatus,
          valor_venda_fechada: valorVenda
          // NÃO alterar valor_total_oportunidade - ele preserva o valor original
        },
        items: formDataToProcess.products.map(product => ({
          id: product.id,
          qtd_vendida: product.incluir_na_venda_parcial ? product.qtd_ofertada : 0,
          qtd_ofertada: product.qtd_ofertada,
          preco_unit: product.preco_unit
        }))
      };

      console.log('🔧 TaskEditModal: Dados de atualização preparados:', {
        salesValue: updatedData.salesValue,
        sales_value: updatedData.sales_value,
        partialSalesValue: updatedData.partialSalesValue,
        partial_sales_value: updatedData.partial_sales_value,
        sales_type: updatedData.sales_type,
        sales_confirmed: updatedData.sales_confirmed,
        status: updatedData.status,
        opportunity: updatedData.opportunity
      });

      const success = await updateTaskData(updatedData);
      
      if (success) {
        await invalidateAll();
        onTaskUpdate();
        onClose();
      }

    } catch (error: any) {
      console.error('🔍 TaskEditModal - Erro geral:', error);
      toast.error(`Erro ao atualizar task: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state
  if (loading || !taskData) {
    console.log('🔧 TaskEditModal: Exibindo estado de carregamento:', { loading, hasTaskData: !!taskData, error });
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {loading ? 'Carregando dados da task...' : error ? 'Erro ao carregar' : 'Carregando...'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            {loading && (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Carregando dados da task...</p>
              </>
            )}
            {error && (
              <div className="text-center space-y-2">
                <p className="text-red-600 font-medium">Erro: {error}</p>
                <p className="text-sm text-muted-foreground">
                  Verifique sua conexão e permissões de acesso
                </p>
                <Button 
                  onClick={onClose} 
                  variant="outline"
                  className="mt-4"
                >
                  Fechar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Tarefa</DialogTitle>
        </DialogHeader>
        
        <StandardTaskForm
          formData={formData}
          onFormDataChange={setFormData}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          showProductsSection={true}
          title="Editar Tarefa"
        />
      </DialogContent>
    </Dialog>
  );
};