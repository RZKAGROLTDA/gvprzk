import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTaskWithOpportunity, useTaskOpportunityItems, useUpdateTaskWithOpportunity } from '@/hooks/useTaskWithOpportunity';

interface TaskEditModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate: () => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  taskId,
  isOpen,
  onClose,
  onTaskUpdate
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prospectNotes, setProspectNotes] = useState('');
  
  // Fetch task with opportunity data
  const { data: taskData, isLoading: isLoadingTask } = useTaskWithOpportunity(taskId);
  const { data: items = [], isLoading: isLoadingItems } = useTaskOpportunityItems(taskId);
  const updateTaskMutation = useUpdateTaskWithOpportunity();

  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    status: 'Prospect' as 'Prospect' | 'Venda Total' | 'Venda Parcial' | 'Venda Perdida',
    itens_oportunidade: [] as any[]
  });

  // Initialize form data when task and items are loaded
  useEffect(() => {
    if (taskData && items) {
      setFormData({
        customerName: taskData.cliente_nome || '',
        customerEmail: taskData.cliente_email || '',
        status: taskData.status,
        itens_oportunidade: items.map(item => ({
          id: item.id,
          produto: item.produto || '—',
          quantidade: item.qtd_ofertada || 0,
          preco_unitario: item.preco_unit || 0,
          incluir_na_venda_parcial: item.incluir_na_venda_parcial || false,
          ...item
        }))
      });
      setProspectNotes('');
    }
  }, [taskData, items]);

  // Valor Total da Oportunidade (soma de quantidade * preço_unitário de todos os itens)
  const valor_total_oportunidade = useMemo(() => {
    return formData.itens_oportunidade.reduce((sum, item) => {
      return sum + ((item.quantidade || 0) * (item.preco_unitario || 0));
    }, 0);
  }, [formData.itens_oportunidade]);

  // Valor da Venda Parcial (soma dos itens marcados para venda parcial)
  const valor_venda_parcial = useMemo(() => {
    return formData.itens_oportunidade
      .filter(item => item.incluir_na_venda_parcial)
      .reduce((sum, item) => {
        return sum + ((item.quantidade || 0) * (item.preco_unitario || 0));
      }, 0);
  }, [formData.itens_oportunidade]);

  // Valor da Venda (calculado baseado no status)
  const valor_venda_realizada = useMemo(() => {
    switch (formData.status) {
      case 'Venda Total':
        return valor_total_oportunidade;
      case 'Venda Parcial':
        return valor_venda_parcial;
      case 'Prospect':
      case 'Venda Perdida':
      default:
        return 0;
    }
  }, [formData.status, valor_total_oportunidade, valor_venda_parcial]);

  const handleStatusChange = (newStatus: string) => {
    setFormData(prev => ({
      ...prev,
      status: newStatus as 'Prospect' | 'Venda Total' | 'Venda Parcial' | 'Venda Perdida'
    }));
    
    // Reset prospect notes when changing away from "Venda Perdida"
    if (newStatus !== 'Venda Perdida') {
      setProspectNotes('');
    }
  };

  const handleSelectAllProducts = () => {
    setFormData(prev => ({
      ...prev,
      itens_oportunidade: prev.itens_oportunidade.map(item => ({
        ...item,
        incluir_na_venda_parcial: true
      }))
    }));
  };

  const handleClearAllProducts = () => {
    setFormData(prev => ({
      ...prev,
      itens_oportunidade: prev.itens_oportunidade.map(item => ({
        ...item,
        incluir_na_venda_parcial: false
      }))
    }));
  };

  const handleProductChange = (itemIndex: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      itens_oportunidade: prev.itens_oportunidade.map((item, index) => 
        index === itemIndex ? { 
          ...item, 
          [field]: value,
          // Recalcular subtotal quando quantidade ou preço mudarem
          ...(field === 'quantidade' || field === 'preco_unitario' 
            ? { subtotal: (field === 'quantidade' ? value : item.quantidade || 0) * (field === 'preco_unitario' ? value : item.preco_unitario || 0) }
            : {})
        } : item
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validações
      if (!taskId) {
        toast.error('Erro: Task ID não encontrado');
        return;
      }

      // Validação para venda perdida
      if (formData.status === 'Venda Perdida' && (!prospectNotes || prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        return;
      }

      // Validação para venda parcial
      if (formData.status === 'Venda Parcial' && valor_venda_parcial <= 0) {
        toast.error('Selecione ao menos um item para a venda parcial');
        return;
      }

      // Prepare update data
      const data_fechamento = formData.status === 'Venda Total' || formData.status === 'Venda Parcial' || formData.status === 'Venda Perdida' 
        ? new Date().toISOString() 
        : null;

      await updateTaskMutation.mutateAsync({
        taskId,
        taskData: {
          cliente_nome: formData.customerName,
          cliente_email: formData.customerEmail || null
        },
        opportunityData: {
          status: formData.status,
          valor_venda_fechada: valor_venda_realizada,
          data_fechamento
        },
        items: formData.itens_oportunidade.map(item => ({
          id: item.id,
          qtd_vendida: item.quantidade || 0,
          incluir_na_venda_parcial: Boolean(item.incluir_na_venda_parcial)
        }))
      });

      onTaskUpdate();
      onClose();

    } catch (error: any) {
      console.error('🔍 TaskEditModal - Erro geral:', error);
      // Error is already handled by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state
  if (isLoadingTask || isLoadingItems) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Task</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Carregando...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!taskData) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Task</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Task não encontrada</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados do Cliente */}
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
          </div>

          {/* Status do Prospect - Radio Group Unificado */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Status do Prospect</Label>
            <RadioGroup
              value={formData.status}
              onValueChange={handleStatusChange}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Prospect" id="prospect" />
                <Label htmlFor="prospect">Prospect</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Venda Total" id="venda_total" />
                <Label htmlFor="venda_total">Venda Total</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Venda Parcial" id="venda_parcial" />
                <Label htmlFor="venda_parcial">Venda Parcial</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Venda Perdida" id="venda_perdida" />
                <Label htmlFor="venda_perdida">Venda Perdida</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Valores Calculados (ReadOnly) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valor_total_oportunidade">Valor Total da Oportunidade (R$)</Label>
              <Input
                id="valor_total_oportunidade"
                value={valor_total_oportunidade.toFixed(2)}
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Soma de todos os produtos
              </p>
            </div>

            {formData.status === 'Venda Parcial' && (
              <div className="space-y-2">
                <Label htmlFor="valor_venda_parcial">Valor da Venda Parcial (R$)</Label>
                <Input
                  id="valor_venda_parcial"
                  value={valor_venda_parcial.toFixed(2)}
                  readOnly
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Soma dos itens selecionados
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="valor_venda_realizada">Valor da Venda (R$)</Label>
              <Input
                id="valor_venda_realizada"
                value={valor_venda_realizada.toFixed(2)}
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Calculado pelo status
              </p>
            </div>
          </div>

          {/* Motivo da Perda - Condicional */}
          {formData.status === 'Venda Perdida' && (
            <div className="space-y-2">
              <Label htmlFor="prospectNotes">Motivo da Perda *</Label>
              <Textarea
                id="prospectNotes"
                value={prospectNotes}
                onChange={(e) => setProspectNotes(e.target.value)}
                placeholder="Descreva o motivo da perda..."
                rows={3}
                className={prospectNotes.trim() === '' ? 'border-red-500' : ''}
              />
              {prospectNotes.trim() === '' && (
                <p className="text-xs text-red-500">O motivo da perda é obrigatório</p>
              )}
            </div>
          )}

          {/* Produtos da Oportunidade */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Produtos da Oportunidade</Label>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handleSelectAllProducts}
                  disabled={formData.itens_oportunidade.length === 0}
                >
                  Selecionar Todos
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handleClearAllProducts}
                  disabled={formData.itens_oportunidade.length === 0}
                >
                  Limpar Seleção
                </Button>
              </div>
            </div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {formData.itens_oportunidade.map((item, index) => (
                <div key={item.id || index} className="border rounded-lg p-4">
                  <div className="grid grid-cols-5 gap-3 items-center">
                    <div className="flex items-center justify-center">
                      <div className="space-y-2">
                        <Label className="text-xs text-center block">✓ Incluir na venda parcial</Label>
                        <Checkbox
                          checked={Boolean(item.incluir_na_venda_parcial)}
                          onCheckedChange={(checked) => 
                            handleProductChange(index, 'incluir_na_venda_parcial', Boolean(checked))
                          }
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs">Produto</Label>
                      <p className="font-medium">{item.produto || '—'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        type="number"
                        value={item.quantidade || 0}
                        onChange={(e) => handleProductChange(index, 'quantidade', Number(e.target.value))}
                        min="0"
                        className="h-8"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs">Preço Unitário (R$)</Label>
                      <Input
                        type="number"
                        value={item.preco_unitario || 0}
                        onChange={(e) => handleProductChange(index, 'preco_unitario', Number(e.target.value))}
                        min="0"
                        step="0.01"
                        className="h-8"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs">Subtotal (R$)</Label>
                      <Input
                        value={((item.quantidade || 0) * (item.preco_unitario || 0)).toFixed(2)}
                        readOnly
                        className="h-8 bg-muted"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {formData.itens_oportunidade.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="text-sm">—</p>
                  <p className="text-xs">Nenhum produto cadastrado para esta oportunidade</p>
                </div>
              )}
            </div>
          </div>

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