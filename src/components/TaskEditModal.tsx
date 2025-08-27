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
    salesType: (task.salesType as 'total' | 'parcial') || 'total',
    prospectNotes: task.prospectNotes || '',
    isProspect: task.isProspect || false,
    products: task.checklist || []
  });

  const { invalidateAll } = useSecurityCache();

  useEffect(() => {
    console.log('🔍 TaskEditModal - Iniciando com task:', {
      id: task.id,
      salesConfirmed: task.salesConfirmed,
      isProspect: task.isProspect,
      prospectNotes: task.prospectNotes
    });

    setFormData({
      customerName: task.client || '',
      customerPhone: '',
      customerEmail: task.email || '',
      salesValue: task.salesValue || '',
      salesConfirmed: task.salesConfirmed,
      salesType: (task.salesType as 'total' | 'parcial') || 'total',
      prospectNotes: task.prospectNotes || '',
      isProspect: task.isProspect || false,
      products: task.checklist || []
    });
  }, [task]);

  const handleStatusChange = (status: { salesConfirmed?: boolean | null; salesType?: 'total' | 'parcial'; isProspect?: boolean; prospectNotes?: string }) => {
    console.log('🔍 TaskEditModal - Status alterado:', status);
    setFormData(prev => ({
      ...prev,
      ...status
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      console.log('🔍 TaskEditModal - Enviando dados:', {
        taskId: task.id,
        formData
      });

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
        is_prospect: formData.isProspect,
        checklist: formData.products
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

      console.log('🔍 TaskEditModal - Atualização realizada com sucesso');

      // Invalidar cache para forçar atualização
      await invalidateAll();
      console.log('🔍 TaskEditModal - Cache invalidado, chamando onTaskUpdate');
      
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
            salesConfirmed={formData.salesConfirmed}
            salesType={formData.salesType}
            prospectNotes={formData.prospectNotes}
            isProspect={formData.isProspect}
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