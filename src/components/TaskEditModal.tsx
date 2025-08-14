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
        prospectNotes: task.prospectNotes || ''
      });
    }
  }, [task]);
  const handleSave = async () => {
    if (!task || !editedTask.id) return;
    setLoading(true);
    try {
      const {
        error
      } = await supabase.from('tasks').update({
        name: editedTask.name,
        responsible: editedTask.responsible,
        client: editedTask.client,
        property: editedTask.property,
        observations: editedTask.observations,
        priority: editedTask.priority,
        status: editedTask.status,
        sales_value: editedTask.salesValue || 0,
        sales_confirmed: editedTask.salesConfirmed || false,
        is_prospect: editedTask.isProspect || false,
        prospect_notes: editedTask.prospectNotes || '',
        updated_at: new Date().toISOString()
      }).eq('id', editedTask.id);
      if (error) throw error;
      toast({
        title: "✅ Tarefa Atualizada",
        description: "As alterações foram salvas com sucesso!"
      });
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
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Tarefa</DialogTitle>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            

            <div className="space-y-2">
              <Label className="text-base font-medium">Status do Prospect</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                <div className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${editedTask.status === 'in_progress' ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-gray-200 bg-white hover:border-blue-300'}`} onClick={() => setEditedTask(prev => ({
                ...prev,
                status: 'in_progress',
                salesConfirmed: undefined,
                isProspect: true,
                prospectNotes: ''
              }))}>
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${editedTask.status === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      ⏳
                    </div>
                    <div>
                      <div className="font-medium text-sm">Prospect Em Andamento</div>
                      <div className="text-xs text-muted-foreground">Negociação em curso</div>
                    </div>
                  </div>
                  {editedTask.status === 'in_progress' && <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>}
                </div>
                
                <div className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${editedTask.salesConfirmed === true ? 'border-green-500 bg-green-50 shadow-lg' : 'border-gray-200 bg-white hover:border-green-300'}`} onClick={() => setEditedTask(prev => ({
                ...prev,
                salesConfirmed: true,
                status: 'completed',
                isProspect: true
              }))}>
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${editedTask.salesConfirmed === true ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      💰
                    </div>
                    <div>
                      <div className="font-medium text-sm">Prospect Convertido</div>
                      <div className="text-xs text-muted-foreground">Venda realizada</div>
                    </div>
                  </div>
                  {editedTask.salesConfirmed === true && <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>}
                </div>
                
                <div className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${editedTask.salesConfirmed === false ? 'border-red-500 bg-red-50 shadow-lg' : 'border-gray-200 bg-white hover:border-red-300'}`} onClick={() => setEditedTask(prev => ({
                ...prev,
                salesConfirmed: false,
                status: 'closed',
                isProspect: true
              }))}>
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${editedTask.salesConfirmed === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      ❌
                    </div>
                    <div>
                      <div className="font-medium text-sm">Prospect Perdido</div>
                      <div className="text-xs text-muted-foreground">Negócio não realizado</div>
                    </div>
                  </div>
                  {editedTask.salesConfirmed === false && <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-salesValue">Valor de Venda/Oportunidade (R$)</Label>
            <div className="relative">
              <Input id="edit-salesValue" type="text" value={editedTask.salesValue ? new Intl.NumberFormat('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(editedTask.salesValue) : ''} onChange={e => {
              const value = e.target.value.replace(/\D/g, '');
              const numericValue = parseFloat(value) / 100;
              setEditedTask(prev => ({
                ...prev,
                salesValue: isNaN(numericValue) ? 0 : numericValue
              }));
            }} placeholder="0,00" className="pl-8" />
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
                  quantity: 0
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

              {/* Campo de valor para venda parcial */}
              {editedTask.prospectItems && editedTask.prospectItems.length > 0 && <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-partialValue">Valor da Venda Parcial (R$)</Label>
                    <div className="relative">
                      <Input id="edit-partialValue" type="text" value={editedTask.salesValue ? new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(editedTask.salesValue) : ''} onChange={e => {
                  const value = e.target.value.replace(/\D/g, '');
                  const numericValue = parseFloat(value) / 100;
                  setEditedTask(prev => ({
                    ...prev,
                    salesValue: isNaN(numericValue) ? 0 : numericValue
                  }));
                }} placeholder="0,00" className="pl-8" />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    </div>
                  </div>
                </div>}
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
    </Dialog>;
};