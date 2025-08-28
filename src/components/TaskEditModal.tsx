import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
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
  
  // Status padronizado conforme especificação
  const getInitialStatus = () => {
    if (task.isProspect && (!task.salesConfirmed && !task.salesType)) return 'Prospect';
    if (task.salesConfirmed && task.salesType === 'ganho') return 'Venda Total';
    if (task.salesConfirmed && task.salesType === 'parcial') return 'Venda Parcial';
    if (task.salesConfirmed === false) return 'Venda Perdida';
    return 'Prospect';
  };

  const [formData, setFormData] = useState({
    customerName: task.client || '',
    customerEmail: task.email || '',
    status: getInitialStatus(),
    prospectNotes: task.prospectNotes || '',
    itens_oportunidade: [] as any[]
  });

  const { invalidateAll } = useSecurityCache();

  // Carregar produtos da task (itens_oportunidade)
  useEffect(() => {
    const allProducts = (task.prospectItems?.length > 0) ? task.prospectItems : (task.checklist || []);
    
    setFormData(prev => ({
      ...prev,
      customerName: task.client || '',
      customerEmail: task.email || '',
      status: getInitialStatus(),
      prospectNotes: task.prospectNotes || '',
      itens_oportunidade: allProducts.map(product => ({
        produto: product.name || '—',
        quantidade: product.quantity || 0,
        preco_unitario: product.price || 0,
        incluir_na_venda_parcial: Boolean(product.selected) || false,
        ...product
      }))
    }));
  }, [task]);

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
      status: newStatus,
      // Reset de campos específicos ao mudar status
      ...(newStatus !== 'Venda Perdida' && { prospectNotes: '' })
    }));
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
      if (!task.id) {
        toast.error('Erro: Task ID não encontrado');
        return;
      }

      // Validação para venda perdida
      if (formData.status === 'Venda Perdida' && (!formData.prospectNotes || formData.prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        return;
      }

      // Validação para venda parcial
      if (formData.status === 'Venda Parcial' && valor_venda_parcial <= 0) {
        toast.error('Selecione ao menos um item para a venda parcial');
        return;
      }

      // Mapear status para campos do banco
      const statusMapping = {
        'Prospect': { isProspect: true, salesConfirmed: null, salesType: null },
        'Venda Total': { isProspect: false, salesConfirmed: true, salesType: 'ganho' },
        'Venda Parcial': { isProspect: false, salesConfirmed: true, salesType: 'parcial' },
        'Venda Perdida': { isProspect: false, salesConfirmed: false, salesType: 'perdido' }
      };

      const statusData = statusMapping[formData.status as keyof typeof statusMapping];

      // Preparar dados para atualização
      const updateData = {
        client: formData.customerName || null,
        email: formData.customerEmail || null,
        sales_value: valor_venda_realizada,
        sales_confirmed: statusData.salesConfirmed,
        sales_type: statusData.salesType,
        prospect_notes: formData.prospectNotes || null,
        is_prospect: statusData.isProspect,
        partial_sales_value: formData.status === 'Venda Parcial' ? valor_venda_parcial : null,
        updated_at: new Date().toISOString()
      };

      // Atualizar task principal
      const { error: updateError } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task.id);

      if (updateError) {
        throw updateError;
      }

      // Atualizar produtos (itens_oportunidade)
      if (formData.itens_oportunidade.length > 0) {
        const { data: existingProducts, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('task_id', task.id);

        if (!fetchError && existingProducts) {
          for (const item of formData.itens_oportunidade) {
            const existingProduct = existingProducts.find(p => 
              p.id === item.id || (p.name === item.produto && p.category === item.category)
            );

            if (existingProduct) {
              await supabase
                .from('products')
                .update({
                  name: item.produto || existingProduct.name,
                  selected: Boolean(item.selected),
                  quantity: Number(item.quantidade) || 0,
                  price: Number(item.preco_unitario) || 0,
                  observations: item.observations || null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingProduct.id);
            }
          }
        }
      }

      // Invalidar cache
      await invalidateAll();
      
      // Aguardar sincronização
      await new Promise(resolve => setTimeout(resolve, 300));
      
      onTaskUpdate();
      onClose();
      toast.success('Task atualizada com sucesso!');

    } catch (error: any) {
      console.error('🔍 TaskEditModal - Erro geral:', error);
      
      // Mensagens de erro mais específicas
      if (error?.code === 'PGRST116') {
        toast.error('Erro: Dados inválidos para atualização');
      } else if (error?.message?.includes('constraint')) {
        toast.error('Erro: Violação de restrição no banco de dados');
      } else if (error?.message?.includes('permission')) {
        toast.error('Erro: Permissão negada para atualização');
      } else {
        toast.error(`Erro ao atualizar task: ${error?.message || 'Erro desconhecido'}`);
      }
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
                value={formData.prospectNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, prospectNotes: e.target.value }))}
                placeholder="Descreva o motivo da perda..."
                rows={3}
                className={formData.prospectNotes.trim() === '' ? 'border-red-500' : ''}
              />
              {formData.prospectNotes.trim() === '' && (
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