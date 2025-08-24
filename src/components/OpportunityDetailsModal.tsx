import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Task } from '@/types/task';
import { mapSalesStatus, getStatusLabel, getStatusColor, resolveFilialName } from '@/lib/taskStandardization';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTasksOptimized } from '@/hooks/useTasksOptimized';

interface OpportunityDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: Task) => void;
}

export const OpportunityDetailsModal: React.FC<OpportunityDetailsModalProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'prospect' | 'ganho' | 'perdido' | 'parcial'>('prospect');
  const [selectedItems, setSelectedItems] = useState<{[key: string]: boolean}>({});
  const [itemQuantities, setItemQuantities] = useState<{[key: string]: number}>({});
  const [partialValue, setPartialValue] = useState<number>(0);
  const { refetch } = useTasksOptimized();

  React.useEffect(() => {
    if (task) {
      setSelectedStatus(mapSalesStatus(task));
      
      // Initialize selected items and quantities based on current checklist
      if (task.checklist) {
        const initialSelected: {[key: string]: boolean} = {};
        const initialQuantities: {[key: string]: number} = {};
        let calculatedPartialValue = 0;
        
        task.checklist.forEach(item => {
          initialSelected[item.id] = item.selected || false;
          initialQuantities[item.id] = item.quantity || 1;
          if (item.selected) {
            calculatedPartialValue += (item.price || 0) * (item.quantity || 1);
          }
        });
        
        setSelectedItems(initialSelected);
        setItemQuantities(initialQuantities);
        setPartialValue(calculatedPartialValue);
      }
    }
  }, [task]);

  const handleItemSelection = (itemId: string, selected: boolean) => {
    if (!task) return;
    
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: selected
    }));

    // Recalculate partial value
    let newPartialValue = 0;
    task.checklist?.forEach(item => {
      const isSelected = itemId === item.id ? selected : selectedItems[item.id];
      const quantity = itemQuantities[item.id] || item.quantity || 1;
      if (isSelected) {
        newPartialValue += (item.price || 0) * quantity;
      }
    });
    
    setPartialValue(newPartialValue);
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (!task || newQuantity < 1) return;
    
    setItemQuantities(prev => ({
      ...prev,
      [itemId]: newQuantity
    }));

    // Recalculate partial value
    let newPartialValue = 0;
    task.checklist?.forEach(item => {
      const isSelected = selectedItems[item.id];
      const quantity = itemId === item.id ? newQuantity : (itemQuantities[item.id] || item.quantity || 1);
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
      
      // Mapear o status selecionado para os valores corretos
      switch (selectedStatus) {
        case 'ganho':
          salesConfirmed = true;
          taskStatus = 'completed';
          isProspect = true;
          // Mark all items as selected for full sale
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: true }));
          break;
        case 'parcial':
          salesConfirmed = true;
          taskStatus = 'completed';
          isProspect = true;
          // Update checklist with selected items for partial sale
          updatedChecklist = updatedChecklist.map(item => ({
            ...item,
            selected: selectedItems[item.id] || false
          }));
          break;
        case 'perdido':
          salesConfirmed = false;
          taskStatus = 'completed';
          isProspect = false;
          // Mark all items as not selected for lost sale
          updatedChecklist = updatedChecklist.map(item => ({ ...item, selected: false }));
          break;
        case 'prospect':
          salesConfirmed = null;
          taskStatus = 'in_progress';
          isProspect = true;
          // Keep current selection state
          break;
      }

      // Update task in database with comprehensive status update
      const { data: taskUpdateResult, error: taskError } = await supabase
        .from('tasks')
        .update({
          sales_confirmed: salesConfirmed,
          sales_type: selectedStatus, // Save the selected sales type
          status: taskStatus,
          is_prospect: isProspect,
          sales_value: selectedStatus === 'parcial' ? partialValue : task.salesValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)
        .select()
        .single();

      if (taskError) {
        throw taskError;
      }

      // Update products in database - usar uma abordagem mais robusta
      if (task.checklist && task.checklist.length > 0) {
        // Buscar produtos existentes na base de dados
        const { data: existingProducts, error: fetchError } = await supabase
          .from('products')
          .select('id, name, task_id')
          .eq('task_id', task.id);

        if (fetchError) {
          throw fetchError;
        }

        // Atualizar cada produto baseado no checklist
        for (const checklistItem of updatedChecklist) {
          // Encontrar o produto correspondente na base de dados
          const existingProduct = existingProducts?.find(p => 
            p.name === checklistItem.name || p.id === checklistItem.id
          );

          if (existingProduct) {
            const newQuantity = itemQuantities[checklistItem.id] || checklistItem.quantity || 1;
            
            // Para vendas parciais, manter apenas produtos selecionados
            // Para vendas ganhas, marcar todos como selecionados  
            // Para vendas perdidas, marcar todos como não selecionados
            let shouldBeSelected = checklistItem.selected;
            let shouldQuantity = newQuantity;
            
            if (selectedStatus === 'perdido' || selectedStatus === 'prospect') {
              shouldBeSelected = false;
              shouldQuantity = 0;
            }
            
            const { error: productError } = await supabase
              .from('products')
              .update({
                selected: shouldBeSelected,
                quantity: shouldQuantity,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingProduct.id);

            if (productError) {
              throw productError;
            }
          }
        }
      }

      // Create updated task object for immediate UI update
      const updatedTask: Task = {
        ...task,
        salesConfirmed: salesConfirmed,
        status: taskStatus,
        isProspect: isProspect,
        checklist: updatedChecklist,
        updatedAt: new Date() // Add current timestamp
      };
      
      // Refresh data using optimized refetch
      await refetch();

      // Update parent component with the refreshed data
      if (onTaskUpdated) {
        onTaskUpdated(updatedTask);
      }

      // Show success toast
      toast.success('Status da oportunidade atualizado com sucesso!');
      
      // Close modal and reset state ONLY after everything is synced
      onClose();
    } catch (error) {
      toast.error(`Erro ao atualizar status da oportunidade: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!task) return null;

  const currentStatus = mapSalesStatus(task);
  const filialName = resolveFilialName(task.filial);
  const totalOpportunityValue = task.salesValue || 0;
  const conversionRate = totalOpportunityValue > 0 ? (partialValue / totalOpportunityValue) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Oportunidade</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas do Cliente - Não Editável */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Informações do Cliente</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                <p className="text-sm bg-muted p-2 rounded">{task.client}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Propriedade</label>
                <p className="text-sm bg-muted p-2 rounded">{task.property || 'Não informado'}</p>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-sm bg-muted p-2 rounded">{task.email || 'Não informado'}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Informações da Filial - Não Editável */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Informações da Filial</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Filial</label>
                <p className="text-sm bg-muted p-2 rounded">{filialName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Vendedor Responsável</label>
                <p className="text-sm bg-muted p-2 rounded">{task.responsible}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Informações da Oportunidade */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Detalhes da Oportunidade</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Data da Atividade</label>
                <p className="text-sm bg-muted p-2 rounded">
                  {format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Horário</label>
                <p className="text-sm bg-muted p-2 rounded">
                  {task.startTime} - {task.endTime}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Prioridade</label>
                <p className="text-sm bg-muted p-2 rounded capitalize">{task.priority}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status da Tarefa</label>
                <Badge variant="outline" className="capitalize">
                  {task.status === 'pending' ? 'Pendente' : 
                   task.status === 'in_progress' ? 'Em Progresso' : 
                   task.status === 'completed' ? 'Concluída' : 'Fechada'}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Valor Total da Oportunidade</label>
                <p className="text-sm bg-muted p-2 rounded font-semibold">
                  {totalOpportunityValue ? `R$ ${totalOpportunityValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Não informado'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status da Oportunidade</label>
                <Badge className={getStatusColor(currentStatus)}>
                  {getStatusLabel(currentStatus)}
                </Badge>
              </div>
              {selectedStatus === 'parcial' && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Valor Parcial</label>
                  <p className="text-sm bg-yellow-50 p-2 rounded font-semibold text-yellow-800">
                    R$ {partialValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    {totalOpportunityValue > 0 && (
                      <span className="text-xs ml-2">
                        ({conversionRate.toFixed(1)}% do total)
                      </span>
                    )}
                  </p>
                </div>
              )}
              {task.familyProduct && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Família de Produtos</label>
                  <p className="text-sm bg-muted p-2 rounded">{task.familyProduct}</p>
                </div>
              )}
              {task.equipmentQuantity && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Quantidade de Equipamentos</label>
                  <p className="text-sm bg-muted p-2 rounded">{task.equipmentQuantity}</p>
                </div>
              )}
              {task.propertyHectares && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Hectares da Propriedade</label>
                  <p className="text-sm bg-muted p-2 rounded">{task.propertyHectares}</p>
                </div>
              )}
              {(task.initialKm > 0 || task.finalKm > 0) && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Quilometragem</label>
                  <p className="text-sm bg-muted p-2 rounded">
                    Inicial: {task.initialKm}km - Final: {task.finalKm}km
                    {task.finalKm > task.initialKm && ` (Total: ${task.finalKm - task.initialKm}km)`}
                  </p>
                </div>
              )}
            </div>

            {task.observations && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Observações da Atividade</label>
                <p className="text-sm bg-muted p-2 rounded whitespace-pre-wrap">{task.observations}</p>
              </div>
            )}

            {task.prospectNotes && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Observações da Oportunidade</label>
                <p className="text-sm bg-muted p-2 rounded whitespace-pre-wrap">{task.prospectNotes}</p>
              </div>
            )}

            {task.checkInLocation && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Localização do Check-in</label>
                <p className="text-sm bg-muted p-2 rounded">
                  Lat: {task.checkInLocation.lat.toFixed(6)}, Lng: {task.checkInLocation.lng.toFixed(6)}
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(task.checkInLocation.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </span>
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Produtos/Itens da Oportunidade - SEMPRE mostrar quando 'parcial' for selecionado */}
          {(() => {
            console.log('🔍 MODAL DEBUG - Task checklist:', {
              taskId: task.id,
              hasChecklist: !!task.checklist,
              checklistLength: task.checklist?.length || 0,
              checklistItems: task.checklist?.map(item => ({id: item.id, name: item.name, selected: item.selected})) || [],
              selectedStatus: selectedStatus,
              shouldShowSection: selectedStatus === 'parcial' || (task.checklist && task.checklist.length > 0)
            });
            return null;
          })()}
          {selectedStatus === 'parcial' || (task.checklist && task.checklist.length > 0) ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Produtos/Serviços</h3>
              {selectedStatus === 'parcial' && (!task.checklist || task.checklist.length === 0) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 text-sm">
                    ⚠️ Nenhum produto encontrado para esta tarefa. Para realizar uma venda parcial, 
                    é necessário que a tarefa tenha produtos cadastrados.
                  </p>
                  <p className="text-yellow-700 text-xs mt-2">
                    Verifique se os produtos foram cadastrados corretamente na criação da tarefa.
                  </p>
                </div>
              )}
              {task.checklist && task.checklist.length > 0 && (
                <div className="space-y-2">
                  {task.checklist.map((item, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3 flex-1">
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
                            
                            {/* Quantidade com opção de editar */}
                            <div className="flex items-center space-x-2 mt-1">
                              <span className="text-sm text-muted-foreground">Quantidade:</span>
                              {selectedStatus === 'parcial' ? (
                                <div className="flex items-center space-x-1">
                                  <Input
                                    type="number"
                                    min="1"
                                    value={itemQuantities[item.id] || item.quantity || 1}
                                    onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                    className="w-20 h-7 text-sm"
                                    disabled={!selectedItems[item.id]}
                                  />
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  {itemQuantities[item.id] || item.quantity || 1}
                                </span>
                              )}
                            </div>

                            <div className="text-sm text-muted-foreground mt-1">
                              <p>Preço unitário: R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              {(itemQuantities[item.id] || item.quantity || 1) > 1 && (
                                <p className="font-medium text-primary">
                                  Total: R$ {((item.price || 0) * (itemQuantities[item.id] || item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>

                            {item.observations && (
                              <p className="text-sm text-muted-foreground mt-1">{item.observations}</p>
                            )}
                          </div>
                        </div>
                        <Badge variant={item.selected ? 'default' : 'secondary'}>
                          {item.selected ? 'Selecionado' : 'Não selecionado'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Produtos/Serviços</h3>
              <div className="bg-muted/50 border rounded-lg p-4 text-center">
                <p className="text-muted-foreground text-sm">
                  Nenhum produto/serviço cadastrado para esta oportunidade.
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Atualização de Status */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Atualizar Status da Oportunidade</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status da Oportunidade</label>
                <Select value={selectedStatus} onValueChange={(value: 'prospect' | 'ganho' | 'perdido' | 'parcial') => setSelectedStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="parcial">Venda Parcial</SelectItem>
                    <SelectItem value="ganho">Venda Realizada</SelectItem>
                    <SelectItem value="perdido">Venda Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedStatus === 'parcial' && (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <h4 className="font-medium text-yellow-800 mb-2">Configuração de Venda Parcial</h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    Selecione os produtos/serviços que foram vendidos parcialmente marcando as caixas de seleção acima.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-yellow-700">Valor Parcial:</span>
                      <span className="font-semibold ml-2">
                        R$ {partialValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-yellow-700">Taxa de Conversão:</span>
                      <span className="font-semibold ml-2">{conversionRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleStatusUpdate}
                  disabled={isUpdating || selectedStatus === currentStatus}
                >
                  {isUpdating ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
