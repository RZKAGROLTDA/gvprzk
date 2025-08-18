import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Task } from '@/types/task';
import { mapSalesStatus, getStatusLabel, getStatusColor, resolveFilialName } from '@/lib/taskStandardization';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTasks } from '@/hooks/useTasks';

interface OpportunityDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OpportunityDetailsModal: React.FC<OpportunityDetailsModalProps> = ({
  task,
  isOpen,
  onClose
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'prospect' | 'ganho' | 'perdido' | 'parcial'>('prospect');
  const { loadTasks } = useTasks();

  React.useEffect(() => {
    if (task) {
      setSelectedStatus(mapSalesStatus(task));
    }
  }, [task]);

  const handleStatusUpdate = async () => {
    if (!task) return;
    
    setIsUpdating(true);
    try {
      let salesConfirmed: boolean | null = null;
      
      // Mapear o status selecionado para o valor correto de salesConfirmed
      switch (selectedStatus) {
        case 'ganho':
        case 'parcial':
          salesConfirmed = true;
          break;
        case 'perdido':
          salesConfirmed = false;
          break;
        case 'prospect':
          salesConfirmed = null;
          break;
      }

      const { error } = await supabase
        .from('tasks')
        .update({
          sales_confirmed: salesConfirmed,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (error) throw error;

      toast.success('Status da oportunidade atualizado com sucesso!');
      await loadTasks();
      onClose();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status da oportunidade');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!task) return null;

  const currentStatus = mapSalesStatus(task);
  const filialName = resolveFilialName(task.filial);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-sm bg-muted p-2 rounded">{task.email || 'Não informado'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">CPF</label>
                <p className="text-sm bg-muted p-2 rounded">{task.cpf || 'Não informado'}</p>
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
                <label className="text-sm font-medium text-muted-foreground">Tipo de Atividade</label>
                <p className="text-sm bg-muted p-2 rounded capitalize">{task.taskType}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Data da Atividade</label>
                <p className="text-sm bg-muted p-2 rounded">
                  {format(new Date(task.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Valor da Oportunidade</label>
                <p className="text-sm bg-muted p-2 rounded">
                  {task.salesValue ? `R$ ${task.salesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Não informado'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status Atual</label>
                <Badge className={getStatusColor(currentStatus)}>
                  {getStatusLabel(currentStatus)}
                </Badge>
              </div>
            </div>

            {task.prospectNotes && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Observações</label>
                <p className="text-sm bg-muted p-2 rounded whitespace-pre-wrap">{task.prospectNotes}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Produtos/Itens da Oportunidade */}
          {task.checklist && task.checklist.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Produtos/Serviços</h3>
              <div className="space-y-2">
                {task.checklist.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">Categoria: {item.category}</p>
                        {item.quantity && (
                          <p className="text-sm text-muted-foreground">Quantidade: {item.quantity}</p>
                        )}
                        {item.price && (
                          <p className="text-sm text-muted-foreground">
                            Preço: R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        {item.observations && (
                          <p className="text-sm text-muted-foreground mt-1">{item.observations}</p>
                        )}
                      </div>
                      <Badge variant={item.selected ? 'default' : 'secondary'}>
                        {item.selected ? 'Selecionado' : 'Não selecionado'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Atualização de Status */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Atualizar Status da Oportunidade</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Novo Status</label>
                <Select value={selectedStatus} onValueChange={(value: 'prospect' | 'ganho' | 'perdido' | 'parcial') => setSelectedStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="ganho">Venda Realizada</SelectItem>
                    <SelectItem value="perdido">Venda Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleStatusUpdate}
                  disabled={isUpdating || selectedStatus === currentStatus}
                >
                  {isUpdating ? 'Atualizando...' : 'Atualizar Status'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};