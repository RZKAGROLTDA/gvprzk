import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import toast from 'react-hot-toast';
import { createTaskWithFilialSnapshot, resolveFilialName } from '@/lib/taskStandardization';
import { useTaskDetails } from '@/hooks/useTasksOptimized';
import { getSalesValueAsNumber, formatSalesValue } from '@/lib/securityUtils';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { StatusSelectionComponent } from './StatusSelectionComponent';
import { ProductListComponent } from './ProductListComponent';

interface TaskEditModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdate: () => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  task,
  open,
  onOpenChange,
  onTaskUpdate
}) => {
  const [editedTask, setEditedTask] = useState<Partial<Task>>({});
  const [loading, setLoading] = useState(false);
  const { invalidateAll } = useSecurityCache();

  // Carregar detalhes completos da task se necessário
  const needsDetailsLoading = task && (!task.checklist || task.checklist.length === 0 || !task.reminders || task.reminders.length === 0);
  const { data: taskDetails, isLoading: loadingDetails } = useTaskDetails(
    needsDetailsLoading ? task.id : null
  );

  // Usar task completa (com detalhes carregados) ou task original
  const fullTask = taskDetails || task;

  // Função para calcular valor total dos produtos selecionados (apenas para exibição)
  const calculateSelectedProductsValue = () => {
    if (editedTask.prospectItems && editedTask.prospectItems.length > 0) {
      return editedTask.prospectItems.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
    }
    return 0;
  };

  useEffect(() => {
    if (fullTask) {
      console.log('🔍 DEBUG TaskEditModal - Carregando task no modal:', fullTask);
      console.log('🔍 DEBUG TaskEditModal - checklist da task:', fullTask.checklist);
      console.log('🔍 DEBUG TaskEditModal - prospectItems da task:', fullTask.prospectItems);
      
      setEditedTask({
        id: fullTask.id,
        name: fullTask.name,
        responsible: fullTask.responsible,
        client: fullTask.client,
        property: fullTask.property,
        observations: fullTask.observations,
        priority: fullTask.priority,
        status: fullTask.status,
        salesValue: fullTask.salesValue || 0, // Sempre manter o valor original
        salesConfirmed: fullTask.salesConfirmed,
        isProspect: task.isProspect || false,
        prospectNotes: task.prospectNotes || '',
        // Carregar os prospectItems salvos baseado no tipo de tarefa
        prospectItems: fullTask.taskType === 'ligacao' 
          ? (fullTask.prospectItems && fullTask.prospectItems.length > 0 
              ? fullTask.prospectItems.map(item => ({
                  id: item.id,
                  name: item.name,
                  category: item.category,
                  quantity: item.quantity || 0,
                  price: item.price || 0,
                  selected: item.selected || false,
                  observations: item.observations || '',
                  photos: item.photos || []
                }))
              : [])
          : (fullTask.checklist && fullTask.checklist.length > 0 
              ? fullTask.checklist.map(item => ({
                  id: item.id,
                  name: item.name,
                  category: item.category,
                  quantity: item.quantity || 0,
                  price: item.price || 0,
                  selected: item.selected || false,
                  observations: item.observations || '',
                  photos: item.photos || []
                }))
              : fullTask.salesType === 'parcial' || (fullTask.salesConfirmed === true && fullTask.prospectItems && fullTask.prospectItems.length > 0)
                ? [
                    { id: '1', name: 'Pneus', category: 'tires' as const, selected: false, quantity: 1, price: 0 },
                    { id: '2', name: 'Lubrificantes', category: 'lubricants' as const, selected: false, quantity: 1, price: 0 },
                    { id: '3', name: 'Peças', category: 'parts' as const, selected: false, quantity: 1, price: 0 },
                    { id: '4', name: 'Serviços', category: 'services' as const, selected: false, quantity: 1, price: 0 }
                  ]
                : [])
      });
    }
  }, [fullTask]);

  // Remover o useEffect que alterava automaticamente o salesValue
  // O valor da venda deve sempre permanecer o valor original da oportunidade

  const handleSave = async () => {
    if (!task || !editedTask.id) return;
    
    setLoading(true);
    try {
      console.log('🔍 DEBUG: Estado inicial do editedTask:', editedTask);
      console.log('🔍 DEBUG: salesConfirmed valor:', editedTask.salesConfirmed, 'tipo:', typeof editedTask.salesConfirmed);
      console.log('🔍 DEBUG: isProspect valor:', editedTask.isProspect);
      
      // Criar dados padronizados com snapshot de filial atualizado
      const standardizedData = await createTaskWithFilialSnapshot({
        ...editedTask,
        filial: task.filial // Manter filial original
      });
      
      console.log('🔍 DEBUG: Dados padronizados:', standardizedData);
      
      // VALIDAÇÃO CRÍTICA: Motivo obrigatório para venda perdida
      if (editedTask.salesConfirmed === false && (!editedTask.prospectNotes || editedTask.prospectNotes.trim() === '')) {
        toast.error('❌ Erro - O motivo da perda é obrigatório quando a venda é marcada como perdida');
        setLoading(false);
        return;
      }

      // Usar funções padronizadas do TaskFormCore
      const finalStatus = editedTask.salesConfirmed === true || editedTask.salesConfirmed === false ? 'completed' : 'pending';
      const finalIsProspect = editedTask.isProspect === true;
      const finalSalesConfirmed = editedTask.salesConfirmed;
      
      console.log('🔍 DEBUG: Valores finais antes do update:');
      console.log('  - finalSalesConfirmed:', finalSalesConfirmed, 'tipo:', typeof finalSalesConfirmed);
      console.log('  - finalIsProspect:', finalIsProspect);
      console.log('  - finalStatus:', finalStatus);

      // Determinar o tipo de venda usando lógica padronizada
      let salesType = null;
      if (finalSalesConfirmed === true) {
        if (editedTask.prospectItems && editedTask.prospectItems.length > 0) {
          salesType = 'parcial'; // Tem produtos parciais selecionados
        } else {
          salesType = 'ganho'; // Venda do valor total
        }
      } else if (finalSalesConfirmed === false) {
        salesType = 'perdido';
      }

      const updateData = {
        name: editedTask.name,
        responsible: editedTask.responsible,
        client: editedTask.client,
        property: editedTask.property,
        observations: editedTask.observations,
        priority: editedTask.priority,
        status: finalStatus,
        sales_value: editedTask.salesValue || 0, // Sempre usar o valor original
        sales_confirmed: finalSalesConfirmed, // Preservar valor exato
        sales_type: salesType, // Definir tipo de venda
        is_prospect: finalIsProspect,
        prospect_notes: editedTask.prospectNotes || '',
        updated_at: new Date().toISOString()
      };

      console.log('🔍 DEBUG: Dados sendo enviados para Supabase:', updateData);
      console.log('🔍 DEBUG: sales_confirmed no updateData:', updateData.sales_confirmed, 'tipo:', typeof updateData.sales_confirmed);

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', editedTask.id);

      if (error) {
        console.error('Erro no Supabase:', error);
        throw error;
      }

      // Salvar produtos da venda parcial se existirem
      if (editedTask.prospectItems && editedTask.prospectItems.length > 0) {
        // Primeiro, deletar produtos existentes para esta task
        await supabase
          .from('products')
          .delete()
          .eq('task_id', editedTask.id);

        // Inserir os novos produtos
        const productsToInsert = editedTask.prospectItems.map(item => ({
          task_id: editedTask.id,
          name: item.name,
          category: item.category,
          selected: item.selected,
          quantity: item.quantity || 1,
          price: item.price || 0,
          observations: item.observations || '',
          photos: item.photos || []
        }));

        const { error: productsError } = await supabase
          .from('products')
          .insert(productsToInsert);

        if (productsError) {
          console.error('Erro ao salvar produtos:', productsError);
          throw productsError;
        }
      }

      console.log('Tarefa atualizada com sucesso no banco de dados');

      console.log('🔄 TaskEditModal - Invalidando cache após atualização');
      
      // Invalidar cache globalmente para garantir atualização em todas as páginas
      await invalidateAll();
      
      console.log('🔄 TaskEditModal - Cache invalidado, chamando onTaskUpdate');
      
      toast.success("✅ Tarefa Atualizada - As alterações foram salvas com sucesso!");

      // Recarregar os dados para garantir sincronização
      onTaskUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao atualizar tarefa:', error);
      toast.error("❌ Erro - Não foi possível salvar as alterações");
    } finally {
      setLoading(false);
    }
  };

  if (loadingDetails) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center p-8">
            <span className="ml-2">Carregando detalhes...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Tarefa: {task.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-responsible">Vendedor/Responsável</Label>
              <Input 
                id="edit-responsible" 
                value={task?.responsible || ''} 
                disabled
                placeholder="Nome do vendedor" 
                className="bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client">Nome do Contato/Cliente</Label>
              <Input 
                id="edit-client" 
                value={task?.client || ''} 
                disabled
                placeholder="Nome do cliente" 
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-clientCode">Código do Cliente</Label>
              <Input 
                id="edit-clientCode" 
                value={task?.clientCode || ''} 
                disabled
                placeholder="Código do cliente" 
                className="bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-property">Nome da Propriedade</Label>
              <Input 
                id="edit-property" 
                value={task?.property || ''} 
                disabled
                placeholder="Nome da propriedade" 
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-propertyHectares">Hectares da Propriedade</Label>
              <Input 
                id="edit-propertyHectares" 
                value={task?.propertyHectares ? 
                  new Intl.NumberFormat('pt-BR', { 
                    minimumFractionDigits: 0, 
                    maximumFractionDigits: 2 
                  }).format(task.propertyHectares) + ' hectares' : 
                  'Não informado'
                } 
                disabled
                placeholder="Hectares da propriedade" 
                className="bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email do Cliente</Label>
              <Input 
                id="edit-email" 
                value={task?.email || ''} 
                disabled
                placeholder="Email do cliente" 
                className="bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-filial">Filial</Label>
              <Input 
                id="edit-filial" 
                value={resolveFilialName(task?.filial) || 'Não informado'} 
                disabled
                placeholder="Filial" 
                className="bg-muted"
              />
            </div>
          </div>

          <StatusSelectionComponent
            salesConfirmed={editedTask.salesConfirmed}
            prospectNotes={editedTask.prospectNotes}
            isProspect={editedTask.isProspect}
            onStatusChange={(status) => {
              console.log('🔍 TaskEditModal - Status alterado:', status);
              setEditedTask(prev => {
                const newTask = {
                  ...prev,
                  ...status
                };
                console.log('🔍 TaskEditModal - Estado atualizado:', newTask);
                return newTask;
              });
            }}
          />

          <div className="space-y-2">
            <Label htmlFor="edit-salesValue">Valor de Venda/Oportunidade (R$)</Label>
            <div className="relative">
              <Input 
                id="edit-salesValue" 
                type="text" 
                value={formatSalesValue(editedTask.salesValue)} 
                className="pl-8 bg-muted cursor-not-allowed" 
                readOnly
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Valor total da oportunidade (não alterável)
            </p>
          </div>


          {/* Opções para venda realizada */}
          {editedTask.salesConfirmed === true && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Tipo de Venda</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className={`cursor-pointer p-3 rounded-lg border-2 transition-all duration-200 ${!editedTask.prospectItems || editedTask.prospectItems.length === 0 ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`} onClick={() => setEditedTask(prev => ({
                ...prev,
                prospectItems: []
              }))}>
                    <div className="flex items-center space-x-2">
                      <div className={`w-4 h-4 rounded-full border-2 ${!editedTask.prospectItems || editedTask.prospectItems.length === 0 ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                        {(!editedTask.prospectItems || editedTask.prospectItems.length === 0) && <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>}
                      </div>
                      <Label className="cursor-pointer">Valor Total</Label>
                    </div>
                  </div>
                  
                  <div className={`cursor-pointer p-3 rounded-lg border-2 transition-all duration-200 ${editedTask.prospectItems && editedTask.prospectItems.length > 0 ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`} onClick={() => {
                    // Create default prospect items based on task type
                    const defaultItems = [
                      { id: '1', name: 'Pneus', category: 'tires' as const, selected: false, quantity: 1, price: 0 },
                      { id: '2', name: 'Lubrificantes', category: 'lubricants' as const, selected: false, quantity: 1, price: 0 },
                      { id: '3', name: 'Óleos', category: 'oils' as const, selected: false, quantity: 1, price: 0 },
                      { id: '4', name: 'Graxas', category: 'greases' as const, selected: false, quantity: 1, price: 0 },
                      { id: '5', name: 'Baterias', category: 'batteries' as const, selected: false, quantity: 1, price: 0 },
                      { id: '6', name: 'Silo Bolsa', category: 'other' as const, selected: false, quantity: 1, price: 0 },
                      { id: '7', name: 'Cool Gard', category: 'other' as const, selected: false, quantity: 1, price: 0 },
                      { id: '8', name: 'Disco', category: 'other' as const, selected: false, quantity: 1, price: 0 }
                    ];
                    
                    setEditedTask(prev => ({
                      ...prev,
                      prospectItems: fullTask?.checklist && fullTask.checklist.length > 0 ? 
                        fullTask.checklist.map(item => ({
                          ...item,
                          selected: false,
                          quantity: item.quantity || 1,
                          price: item.price || 0
                        })) : defaultItems
                    }));
                  }}>
                    <div className="flex items-center space-x-2">
                      <div className={`w-4 h-4 rounded-full border-2 ${editedTask.prospectItems && editedTask.prospectItems.length > 0 ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                        {editedTask.prospectItems && editedTask.prospectItems.length > 0 && <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>}
                      </div>
                      <Label className="cursor-pointer">Valor Parcial</Label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de produtos para venda parcial usando componente padronizado */}
              {editedTask.prospectItems && editedTask.prospectItems.length > 0 && (
                <ProductListComponent
                  products={editedTask.prospectItems || []}
                  onProductChange={(products) => {
                    setEditedTask(prev => ({ ...prev, prospectItems: products }));
                  }}
                  readOnly={false}
                  showSelectedOnly={false}
                  title="Selecionar Produtos para Venda Parcial"
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-observations">Observações</Label>
            <Textarea id="edit-observations" value={editedTask.observations || ''} onChange={e => setEditedTask(prev => ({
            ...prev,
            observations: e.target.value
          }))} placeholder="Observações sobre a tarefa..." className="min-h-[100px]" />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
