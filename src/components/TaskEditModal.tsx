import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { StatusSelectionComponent } from './StatusSelectionComponent';
import { ProductListComponent } from './ProductListComponent';
import { useSecurityCache } from '@/hooks/useSecurityCache';

interface TaskEditModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate: () => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdate
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerName: task.client || '',
    customerPhone: '',
    customerEmail: task.email || '',
    salesValue: task.salesValue || '',
    salesConfirmed: task.salesConfirmed,
    salesType: (task.salesType as 'ganho' | 'parcial' | 'perdido') || 'ganho',
    prospectNotes: task.prospectNotes || '',
    prospectNotesJustification: task.prospectNotesJustification || '',
    isProspect: task.isProspect || false,
    products: task.checklist || [],
    prospectItems: task.prospectItems || [],
    partialSalesValue: task.partialSalesValue || 0
  });

  const { invalidateAll } = useSecurityCache();

  useEffect(() => {
    console.log('🔍 TaskEditModal - Carregando task:', {
      id: task.id,
      salesConfirmed: task.salesConfirmed,
      salesType: task.salesType,
      checklistCount: task.checklist?.length,
      prospectItemsCount: task.prospectItems?.length
    });

    // Usar checklist como fonte principal de produtos
    const allProducts = task.checklist || [];
    
    setFormData({
      customerName: task.client || '',
      customerPhone: '',
      customerEmail: task.email || '',
      salesValue: task.salesValue || '',
      salesConfirmed: task.salesConfirmed,
      salesType: (task.salesType as 'ganho' | 'parcial' | 'perdido') || 'ganho',
      prospectNotes: task.prospectNotes || '',
      prospectNotesJustification: task.prospectNotesJustification || '',
      isProspect: task.isProspect || false,
      products: allProducts,
      prospectItems: task.salesType === 'parcial' ? allProducts.filter(p => p.selected) : [],
      partialSalesValue: task.partialSalesValue || 0
    });
  }, [task]);

  const handleStatusChange = (status: { 
    salesConfirmed?: boolean | null; 
    salesType?: 'ganho' | 'parcial' | 'perdido'; 
    isProspect?: boolean; 
    prospectNotes?: string; 
    prospectNotesJustification?: string;
    prospectItems?: any[];
    partialSalesValue?: number;
  }) => {
    console.log('🔍 TaskEditModal - Status alterado:', status);
    
    setFormData(prev => ({
      ...prev,
      ...status,
      // Garantir que prospectItems seja sempre atualizado quando vier no status
      ...(status.prospectItems && { prospectItems: status.prospectItems }),
      // Atualizar o valor parcial calculado
      ...(status.partialSalesValue !== undefined && { partialSalesValue: status.partialSalesValue })
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      console.log('🔍 TaskEditModal - Iniciando submit:', {
        taskId: task.id,
        formData
      });

      // Adicionar validação básica
      if (!task.id) {
        console.error('🚨 TaskEditModal - Task ID não encontrado');
        toast.error('Erro: Task ID não encontrado');
        setIsSubmitting(false);
        return;
      }

      // Validação para venda perdida
      if (formData.salesConfirmed === false && (!formData.prospectNotes || formData.prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        setIsSubmitting(false);
        return;
      }

      const updateData = {
        client: formData.customerName,
        email: formData.customerEmail,
        sales_value: formData.salesValue,
        sales_confirmed: formData.salesConfirmed,
        sales_type: formData.salesType,
        prospect_notes: formData.prospectNotes,
        prospect_notes_justification: formData.prospectNotesJustification,
        is_prospect: formData.isProspect,
        partial_sales_value: formData.salesType === 'parcial' && formData.salesConfirmed ? formData.partialSalesValue : null
      };

      console.log('🔍 TaskEditModal - Dados para Supabase:', updateData);

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task.id);

      if (error) {
        console.error('🔍 TaskEditModal - Erro na atualização:', error);
        throw error;
      }

  // Atualizar produtos - corrigir tanto checklist quanto prospectItems
  const productsToUpdate = formData.salesType === 'parcial' && formData.prospectItems?.length > 0 
    ? formData.prospectItems 
    : formData.products || [];

  if (productsToUpdate.length > 0) {
    console.log('🔍 TaskEditModal - Produtos para atualizar:', productsToUpdate);
    
    // Buscar todos os produtos existentes da task
    const { data: existingProducts, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('task_id', task.id);

    if (fetchError) {
      console.error('🔍 TaskEditModal - Erro ao buscar produtos:', fetchError);
      throw fetchError;
    }

    console.log('🔍 TaskEditModal - Produtos no banco:', existingProducts);

    // Atualizar cada produto
    for (const product of productsToUpdate) {
      // Encontrar produto existente pelo ID ou por nome/categoria
      const existingProduct = existingProducts?.find(p => 
        p.id === product.id || (p.name === product.name && p.category === product.category)
      );

      if (!existingProduct) {
        console.warn(`🔍 TaskEditModal - Produto ${product.name} não encontrado, pulando`);
        continue;
      }

      console.log(`🔍 TaskEditModal - Atualizando produto ${product.name}:`, {
        id: existingProduct.id,
        selected: product.selected,
        quantity: product.quantity || 0,
        price: product.price || 0
      });

      const { error: productError } = await supabase
        .from('products')
        .update({
          selected: product.selected,
          quantity: product.quantity || 0,
          price: product.price || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProduct.id);

      if (productError) {
        console.error('🔍 TaskEditModal - Erro ao atualizar produto:', existingProduct.id, productError);
        throw productError;
      }

      console.log(`🔍 TaskEditModal - Produto ${product.name} atualizado com sucesso`);
    }
  }

      console.log('🔍 TaskEditModal - Atualização realizada com sucesso');

      // Invalidar cache e aguardar
      console.log('🔍 TaskEditModal - Invalidando cache...');
      await invalidateAll();
      
      // Aguardar um momento para garantir sincronização
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('🔍 TaskEditModal - Atualização concluída, fechando modal');
      onTaskUpdate();
      onClose();
      
      toast.success('Task atualizada com sucesso!');
    } catch (error) {
      console.error('🔍 TaskEditModal - Erro geral:', error);
      toast.error('Erro ao atualizar task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Nome do Cliente</Label>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input
                id="customerEmail"
                type="email"
                value={formData.customerEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                placeholder="Email do cliente"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="salesValue">Valor da Venda (R$)</Label>
              <Input
                id="salesValue"
                value={formData.salesValue}
                onChange={(e) => setFormData(prev => ({ ...prev, salesValue: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>

          <StatusSelectionComponent
            taskId={task.id}
            salesConfirmed={formData.salesConfirmed}
            salesType={formData.salesType}
            prospectNotes={formData.prospectNotes}
            prospectNotesJustification={formData.prospectNotesJustification}
            isProspect={formData.isProspect}
            prospectItems={formData.prospectItems}
            availableProducts={formData.products}
            onStatusChange={handleStatusChange}
            showError={formData.salesConfirmed === false && (!formData.prospectNotes || formData.prospectNotes.trim() === '')}
          />

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};