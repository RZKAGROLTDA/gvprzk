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

  // Carregar detalhes completos da task se necessário
  const needsDetailsLoading = task && (!task.checklist || task.checklist.length === 0 || !task.prospectItems || task.prospectItems.length === 0);
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
      console.log('Carregando task no modal:', fullTask);
      console.log('prospectItems da task:', fullTask.prospectItems);
      
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
        // Carregar os prospectItems com os valores salvos exatos
        prospectItems: fullTask.prospectItems?.map(item => ({
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity || 0,
          price: item.price || 0,
          selected: item.selected || false,
          observations: item.observations || '',
          photos: item.photos || []
        })) || []
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
      
      // Automaticamente definir status como "completed" quando há venda confirmada ou perdida
      let finalStatus = editedTask.status;
      if (editedTask.salesConfirmed === true || editedTask.salesConfirmed === false) {
        finalStatus = 'completed';
      }

      // Lógica corrigida para isProspect: deve ser true se é um prospect ativo
      const finalIsProspect = editedTask.isProspect === true;

      // Preservar o valor exato de salesConfirmed - NUNCA converter null para false
      let finalSalesConfirmed = editedTask.salesConfirmed;
      
      console.log('🔍 DEBUG: Valores finais antes do update:');
      console.log('  - finalSalesConfirmed:', finalSalesConfirmed, 'tipo:', typeof finalSalesConfirmed);
      console.log('  - finalIsProspect:', finalIsProspect);
      console.log('  - finalStatus:', finalStatus);

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

      console.log('Tarefa atualizada com sucesso no banco de dados');

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

          <div className="space-y-2">
            <Label className="text-base font-medium">Status do Prospect</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              <div 
                className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                  editedTask.salesConfirmed === undefined && editedTask.isProspect
                    ? 'border-blue-500 bg-blue-50 shadow-lg' 
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`} 
                 onClick={() => {
                  console.log('Selecionando: Prospect Em Andamento');
                  setEditedTask(prev => ({
                    ...prev,
                    salesConfirmed: undefined,
                    isProspect: true,
                    prospectNotes: ''
                  }));
                }}
              >
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    editedTask.salesConfirmed === undefined && editedTask.isProspect
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    ⏳
                  </div>
                  <div>
                    <div className="font-medium text-sm">Prospect Em Andamento</div>
                    <div className="text-xs text-muted-foreground">Negociação em curso</div>
                  </div>
                </div>
                {editedTask.salesConfirmed === undefined && editedTask.isProspect && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              
              <div 
                className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                  editedTask.salesConfirmed === true 
                    ? 'border-green-500 bg-green-50 shadow-lg' 
                    : 'border-gray-200 bg-white hover:border-green-300'
                }`} 
                onClick={() => {
                  console.log('Selecionando: Venda Realizada');
                  setEditedTask(prev => ({
                    ...prev,
                    salesConfirmed: true,
                    isProspect: true,
                    prospectItems: [] // Sempre selecionar "Valor Total" quando escolher "Venda Realizada"
                  }));
                }}
              >
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    editedTask.salesConfirmed === true 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    💰
                  </div>
                  <div>
                    <div className="font-medium text-sm">Venda Realizada</div>
                    <div className="text-xs text-muted-foreground">Prospect convertido</div>
                  </div>
                </div>
                {editedTask.salesConfirmed === true && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
              
              <div 
                className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                  editedTask.salesConfirmed === false 
                    ? 'border-red-500 bg-red-50 shadow-lg' 
                    : 'border-gray-200 bg-white hover:border-red-300'
                }`} 
                onClick={() => {
                  console.log('Selecionando: Venda Perdida');
                  setEditedTask(prev => ({
                    ...prev,
                    salesConfirmed: false,
                    isProspect: true
                  }));
                }}
              >
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    editedTask.salesConfirmed === false 
                      ? 'bg-red-500 text-white' 
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    ❌
                  </div>
                  <div>
                    <div className="font-medium text-sm">Venda Perdida</div>
                    <div className="text-xs text-muted-foreground">Negócio não realizado</div>
                  </div>
                </div>
                {editedTask.salesConfirmed === false && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-salesValue">Valor de Venda/Oportunidade (R$)</Label>
            <div className="relative">
              <Input 
                id="edit-salesValue" 
                type="text" 
                value={editedTask.salesValue ? new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(editedTask.salesValue) : '0,00'} 
                className="pl-8 bg-muted cursor-not-allowed" 
                readOnly
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Valor total da oportunidade (não alterável)
            </p>
          </div>

          {/* Campo de observação para venda perdida */}
          {editedTask.salesConfirmed === false && <div className="space-y-2">
              <Label htmlFor="edit-lossReason">Motivo da Perda</Label>
              <Select value={editedTask.prospectNotes || ''} onValueChange={value => setEditedTask(prev => ({
            ...prev,
            prospectNotes: value
          }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Falta de peça">Falta de peça</SelectItem>
                  <SelectItem value="Preço">Preço</SelectItem>
                  <SelectItem value="Prazo">Prazo</SelectItem>
                  <SelectItem value="Duplo Domicilio">Duplo Domicilio</SelectItem>
                </SelectContent>
              </Select>
            </div>}

          {/* Opções para venda realizada */}
          {editedTask.salesConfirmed === true && <div className="space-y-4">
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

              {/* Lista de produtos para venda parcial */}
              {editedTask.prospectItems && editedTask.prospectItems.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Produtos Vendidos</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                    {editedTask.prospectItems.map((item, index) => (
                      <div key={item.id} className="flex items-center justify-between space-x-3 p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={item.selected}
                            onCheckedChange={(checked) => {
                              const updatedItems = [...(editedTask.prospectItems || [])];
                              updatedItems[index] = { ...updatedItems[index], selected: checked as boolean };
                              setEditedTask(prev => ({ ...prev, prospectItems: updatedItems }));
                            }}
                          />
                          <div className="flex-1">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">({item.category})</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 min-w-[200px]">
                          <div className="flex flex-col space-y-1">
                            <Label className="text-xs">Qtd</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.quantity || 1}
                              onChange={(e) => {
                                const quantity = parseInt(e.target.value) || 1;
                                const updatedItems = [...(editedTask.prospectItems || [])];
                                updatedItems[index] = { ...updatedItems[index], quantity };
                                setEditedTask(prev => ({ ...prev, prospectItems: updatedItems }));
                              }}
                              className="w-16 h-8 text-xs"
                            />
                          </div>
                          
                          <div className="flex flex-col space-y-1">
                            <Label className="text-xs">Preço Unit.</Label>
                            <div className="relative">
                              <Input
                                type="text"
                                value={item.price ? new Intl.NumberFormat('pt-BR', { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                }).format(item.price) : '0,00'}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '');
                                  const price = parseFloat(value) / 100;
                                  const updatedItems = [...(editedTask.prospectItems || [])];
                                  updatedItems[index] = { ...updatedItems[index], price: isNaN(price) ? 0 : price };
                                  setEditedTask(prev => ({ ...prev, prospectItems: updatedItems }));
                                }}
                                className="w-20 h-8 text-xs pl-4"
                              />
                              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col space-y-1">
                            <Label className="text-xs">Total</Label>
                            <div className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                              R$ {new Intl.NumberFormat('pt-BR', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              }).format((item.price || 0) * (item.quantity || 1))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Valor total dos produtos selecionados (apenas informativo) */}
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Label className="text-sm font-medium text-blue-700">Valor dos Produtos Selecionados:</Label>
                    <div className="text-lg font-bold text-blue-700">
                      R$ {new Intl.NumberFormat('pt-BR', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      }).format(calculateSelectedProductsValue())}
                    </div>
                  </div>
                  
                  {/* Mostrar diferença entre valor total da oportunidade e produtos selecionados */}
                  {calculateSelectedProductsValue() !== (editedTask.salesValue || 0) && (
                    <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <Label className="text-sm font-medium text-yellow-700">Diferença (Oportunidade - Produtos):</Label>
                      <div className="text-lg font-bold text-yellow-700">
                        R$ {new Intl.NumberFormat('pt-BR', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        }).format((editedTask.salesValue || 0) - calculateSelectedProductsValue())}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>}

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
