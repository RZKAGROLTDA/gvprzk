
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
import { toast } from '@/components/ui/use-toast';

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

  useEffect(() => {
    if (task) {
      setEditedTask({
        id: task.id,
        name: task.name,
        responsible: task.responsible,
        client: task.client,
        property: task.property,
        observations: task.observations,
        priority: task.priority,
        status: task.status,
        salesValue: task.salesValue || 0,
        salesConfirmed: task.salesConfirmed || false,
        isProspect: task.isProspect || false,
        prospectNotes: task.prospectNotes || '',
        prospectItems: task.prospectItems || []
      });
    }
  }, [task]);

  // Atualizar valor da venda parcial automaticamente
  useEffect(() => {
    if (editedTask.prospectItems && editedTask.prospectItems.length > 0) {
      const partialValue = editedTask.prospectItems.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
      
      setEditedTask(prev => ({
        ...prev,
        salesValue: partialValue
      }));
    }
  }, [editedTask.prospectItems]);

  const handleSave = async () => {
    if (!task || !editedTask.id) return;
    
    setLoading(true);
    try {
      console.log('Salvando tarefa com dados:', editedTask);
      
      // Automaticamente definir status como "completed" quando há venda confirmada ou perdida
      let finalStatus = editedTask.status;
      if (editedTask.salesConfirmed === true || editedTask.salesConfirmed === false) {
        finalStatus = 'completed';
      }

      // Garantir que isProspect seja sempre verdadeiro quando há informações de prospect
      const finalIsProspect = editedTask.isProspect || 
                             editedTask.salesConfirmed !== undefined || 
                             (editedTask.salesValue && editedTask.salesValue > 0);

      const updateData = {
        name: editedTask.name,
        responsible: editedTask.responsible,
        client: editedTask.client,
        property: editedTask.property,
        observations: editedTask.observations,
        priority: editedTask.priority,
        status: finalStatus,
        sales_value: editedTask.salesValue || 0,
        sales_confirmed: editedTask.salesConfirmed,
        is_prospect: finalIsProspect,
        prospect_notes: editedTask.prospectNotes || '',
        updated_at: new Date().toISOString()
      };

      console.log('Dados sendo enviados para Supabase:', updateData);

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', editedTask.id);

      if (error) {
        console.error('Erro no Supabase:', error);
        throw error;
      }

      console.log('Tarefa atualizada com sucesso no banco de dados');

      toast({
        title: "✅ Tarefa Atualizada",
        description: "As alterações foram salvas com sucesso!"
      });

      // Recarregar os dados para garantir sincronização
      onTaskUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao atualizar tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as alterações",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Tarefa: {task.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome da Tarefa</Label>
              <Input id="edit-name" value={editedTask.name || ''} onChange={e => setEditedTask(prev => ({
              ...prev,
              name: e.target.value
            }))} placeholder="Nome da tarefa" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-responsible">Responsável</Label>
              <Input id="edit-responsible" value={editedTask.responsible || ''} onChange={e => setEditedTask(prev => ({
              ...prev,
              responsible: e.target.value
            }))} placeholder="Nome do responsável" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client">Cliente</Label>
              <Input id="edit-client" value={editedTask.client || ''} onChange={e => setEditedTask(prev => ({
              ...prev,
              client: e.target.value
            }))} placeholder="Nome do cliente" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-property">Propriedade</Label>
              <Input id="edit-property" value={editedTask.property || ''} onChange={e => setEditedTask(prev => ({
              ...prev,
              property: e.target.value
            }))} placeholder="Nome da propriedade" />
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
                    isProspect: true
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
                disabled
                value={editedTask.salesValue ? new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(editedTask.salesValue) : ''} 
                placeholder="0,00" 
                className="pl-8" 
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
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
                  
                  <div className={`cursor-pointer p-3 rounded-lg border-2 transition-all duration-200 ${editedTask.prospectItems && editedTask.prospectItems.length > 0 ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`} onClick={() => setEditedTask(prev => ({
                ...prev,
                prospectItems: task?.checklist?.map(item => ({
                  ...item,
                  selected: false,
                  quantity: item.quantity || 1,
                  price: item.price || 0
                })) || []
              }))}>
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
                  
                  {/* Valor total calculado automaticamente */}
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <Label className="text-sm font-medium text-green-700">Valor Total da Venda Parcial:</Label>
                    <div className="text-lg font-bold text-green-700">
                      R$ {new Intl.NumberFormat('pt-BR', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      }).format(editedTask.prospectItems?.reduce((sum, item) => {
                        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
                      }, 0) || 0)}
                    </div>
                  </div>
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
