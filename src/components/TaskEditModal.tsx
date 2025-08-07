import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
      const { error } = await supabase
        .from('tasks')
        .update({
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
        })
        .eq('id', editedTask.id);

      if (error) throw error;

      toast({
        title: "✅ Tarefa Atualizada",
        description: "As alterações foram salvas com sucesso!",
      });

      onTaskUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao atualizar tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar as alterações",
        variant: "destructive",
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
          <DialogTitle>Editar Tarefa</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome da Tarefa</Label>
              <Input
                id="edit-name"
                value={editedTask.name || ''}
                onChange={(e) => setEditedTask(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome da tarefa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-responsible">Responsável</Label>
              <Input
                id="edit-responsible"
                value={editedTask.responsible || ''}
                onChange={(e) => setEditedTask(prev => ({ ...prev, responsible: e.target.value }))}
                placeholder="Nome do responsável"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client">Cliente</Label>
              <Input
                id="edit-client"
                value={editedTask.client || ''}
                onChange={(e) => setEditedTask(prev => ({ ...prev, client: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-property">Propriedade</Label>
              <Input
                id="edit-property"
                value={editedTask.property || ''}
                onChange={(e) => setEditedTask(prev => ({ ...prev, property: e.target.value }))}
                placeholder="Nome da propriedade"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-priority">Prioridade</Label>
              <Select
                value={editedTask.priority}
                onValueChange={(value) => setEditedTask(prev => ({ ...prev, priority: value as 'low' | 'medium' | 'high' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editedTask.status}
                onValueChange={(value) => setEditedTask(prev => ({ ...prev, status: value as 'pending' | 'in_progress' | 'completed' | 'closed' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="closed">Fechada</SelectItem>
                </SelectContent>
              </Select>
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
                }).format(editedTask.salesValue) : ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  const numericValue = parseFloat(value) / 100;
                  setEditedTask(prev => ({
                    ...prev,
                    salesValue: isNaN(numericValue) ? 0 : numericValue
                  }));
                }}
                placeholder="0,00"
                className="pl-8"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-observations">Observações</Label>
            <Textarea
              id="edit-observations"
              value={editedTask.observations || ''}
              onChange={(e) => setEditedTask(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Observações sobre a tarefa..."
              className="min-h-[100px]"
            />
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