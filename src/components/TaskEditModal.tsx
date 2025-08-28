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
  
  // Status padronizado: prospect | venda_total | venda_parcial | venda_perdida
  const getInitialStatus = () => {
    if (task.isProspect && (!task.salesConfirmed && !task.salesType)) return 'prospect';
    if (task.salesConfirmed && task.salesType === 'ganho') return 'venda_total';
    if (task.salesConfirmed && task.salesType === 'parcial') return 'venda_parcial';
    if (task.salesConfirmed === false) return 'venda_perdida';
    return 'prospect';
  };

  const [formData, setFormData] = useState({
    customerName: task.client || '',
    customerEmail: task.email || '',
    status: getInitialStatus(),
    valorVendaParcial: Number(task.partialSalesValue) || 0,
    valorVenda: Number(task.salesValue) || 0,
    prospectNotes: task.prospectNotes || '',
    products: [] as any[]
  });

  const { invalidateAll } = useSecurityCache();

  // Carregar produtos da task
  useEffect(() => {
    const allProducts = (task.prospectItems?.length > 0) ? task.prospectItems : (task.checklist || []);
    
    setFormData(prev => ({
      ...prev,
      customerName: task.client || '',
      customerEmail: task.email || '',
      status: getInitialStatus(),
      valorVendaParcial: Number(task.partialSalesValue) || 0,
      valorVenda: Number(task.salesValue) || 0,
      prospectNotes: task.prospectNotes || '',
      products: allProducts.map(product => ({
        ...product,
        selected: task.salesType === 'parcial' ? (product.selected || false) : false,
        quantity: product.quantity || 1,
        price: product.price || 0
      }))
    }));
  }, [task]);

  // Cálculo automático do Valor Total da Oportunidade
  const valorTotalOportunidade = useMemo(() => {
    return formData.products.reduce((sum, product) => {
      return sum + ((product.quantity || 0) * (product.price || 0));
    }, 0);
  }, [formData.products]);

  // Cálculo automático do Valor da Venda baseado no status
  const valorVendaCalculado = useMemo(() => {
    switch (formData.status) {
      case 'venda_total':
        return valorTotalOportunidade;
      case 'venda_parcial':
        return formData.valorVendaParcial;
      case 'prospect':
      case 'venda_perdida':
      default:
        return 0;
    }
  }, [formData.status, valorTotalOportunidade, formData.valorVendaParcial]);

  // Atualizar valor da venda quando mudar o cálculo
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      valorVenda: valorVendaCalculado
    }));
  }, [valorVendaCalculado]);

  const handleStatusChange = (newStatus: string) => {
    setFormData(prev => ({
      ...prev,
      status: newStatus,
      // Reset de campos específicos ao mudar status
      ...(newStatus !== 'venda_parcial' && { valorVendaParcial: 0 }),
      ...(newStatus !== 'venda_perdida' && { prospectNotes: '' })
    }));
  };

  const handleProductChange = (productIndex: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) => 
        index === productIndex ? { ...product, [field]: value } : product
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
      if (formData.status === 'venda_perdida' && (!formData.prospectNotes || formData.prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        return;
      }

      // Mapear status para campos do banco
      const statusMapping = {
        prospect: { isProspect: true, salesConfirmed: null, salesType: null },
        venda_total: { isProspect: false, salesConfirmed: true, salesType: 'ganho' },
        venda_parcial: { isProspect: false, salesConfirmed: true, salesType: 'parcial' },
        venda_perdida: { isProspect: false, salesConfirmed: false, salesType: 'perdido' }
      };

      const statusData = statusMapping[formData.status as keyof typeof statusMapping];

      // Preparar dados para atualização
      const updateData = {
        client: formData.customerName || null,
        email: formData.customerEmail || null,
        sales_value: formData.valorVenda,
        sales_confirmed: statusData.salesConfirmed,
        sales_type: statusData.salesType,
        prospect_notes: formData.prospectNotes || null,
        is_prospect: statusData.isProspect,
        partial_sales_value: formData.status === 'venda_parcial' ? formData.valorVendaParcial : null,
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

      // Atualizar produtos
      if (formData.products.length > 0) {
        const { data: existingProducts, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('task_id', task.id);

        if (!fetchError && existingProducts) {
          for (const product of formData.products) {
            const existingProduct = existingProducts.find(p => 
              p.id === product.id || (p.name === product.name && p.category === product.category)
            );

            if (existingProduct) {
              await supabase
                .from('products')
                .update({
                  selected: Boolean(product.selected),
                  quantity: Number(product.quantity) || 0,
                  price: Number(product.price) || 0,
                  observations: product.observations || null,
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

          {/* Status do Prospect - Radio Group */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Status do Prospect</Label>
            <RadioGroup
              value={formData.status}
              onValueChange={handleStatusChange}
              className="grid grid-cols-2 gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prospect" id="prospect" />
                <Label htmlFor="prospect">Prospect</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="venda_total" id="venda_total" />
                <Label htmlFor="venda_total">Venda Total</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="venda_parcial" id="venda_parcial" />
                <Label htmlFor="venda_parcial">Venda Parcial</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="venda_perdida" id="venda_perdida" />
                <Label htmlFor="venda_perdida">Venda Perdida</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Campo Valor da Venda Parcial - Condicional */}
          {formData.status === 'venda_parcial' && (
            <div className="space-y-2">
              <Label htmlFor="valorVendaParcial">Valor da Venda Parcial (R$)</Label>
              <Input
                id="valorVendaParcial"
                type="number"
                value={formData.valorVendaParcial}
                onChange={(e) => setFormData(prev => ({ ...prev, valorVendaParcial: Number(e.target.value) }))}
                placeholder="0,00"
                min="0"
                step="0.01"
              />
            </div>
          )}

          {/* Campo Valor da Venda - Calculado automaticamente */}
          <div className="space-y-2">
            <Label htmlFor="valorVenda">Valor da Venda (R$)</Label>
            <Input
              id="valorVenda"
              value={Number(formData.valorVenda).toFixed(2)}
              readOnly
              className="bg-gray-50"
              placeholder="Calculado automaticamente"
            />
            <p className="text-xs text-gray-500">
              Este valor é calculado automaticamente baseado no status selecionado
            </p>
          </div>

          {/* Motivo da Perda - Condicional */}
          {formData.status === 'venda_perdida' && (
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

          {/* Produtos Vendidos */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-base font-medium">Produtos da Oportunidade</Label>
              <div className="text-sm text-gray-500">
                Valor Total: R$ {valorTotalOportunidade.toFixed(2)}
              </div>
            </div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {formData.products.map((product, index) => (
                <div key={product.id || index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={product.selected || false}
                        onCheckedChange={(checked) => handleProductChange(index, 'selected', checked)}
                      />
                      <span className="font-medium">{product.name}</span>
                      <span className="text-sm text-gray-500">({product.category})</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        type="number"
                        value={product.quantity || 1}
                        onChange={(e) => handleProductChange(index, 'quantity', Number(e.target.value))}
                        min="1"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço Unitário</Label>
                      <Input
                        type="number"
                        value={product.price || 0}
                        onChange={(e) => handleProductChange(index, 'price', Number(e.target.value))}
                        min="0"
                        step="0.01"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Subtotal</Label>
                      <Input
                        value={((product.quantity || 0) * (product.price || 0)).toFixed(2)}
                        readOnly
                        className="h-8 bg-gray-50"
                      />
                    </div>
                  </div>

                  {product.observations && (
                    <div>
                      <Label className="text-xs">Observações</Label>
                      <Textarea
                        value={product.observations}
                        onChange={(e) => handleProductChange(index, 'observations', e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
              
              {formData.products.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <p className="text-sm">Nenhum produto cadastrado para esta oportunidade</p>
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