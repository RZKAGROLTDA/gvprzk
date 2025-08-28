import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useTaskEditData } from '@/hooks/useTaskEditData';
import { useSecurityCache } from '@/hooks/useSecurityCache';

interface TaskEditModalProps {
  taskId: string | null;
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
  const { data: taskData, loading, updateTaskData } = useTaskEditData(taskId);
  const { invalidateAll } = useSecurityCache();
  
  // Status mapping from opportunity status
  const getInitialStatus = () => {
    if (!taskData?.opportunity) return 'prospect';
    
    const status = taskData.opportunity.status;
    switch (status) {
      case 'Prospect': return 'prospect';
      case 'Venda Total': return 'venda_total';
      case 'Venda Parcial': return 'venda_parcial';
      case 'Venda Perdida': return 'venda_perdida';
      default: return 'prospect';
    }
  };

  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    filial: '',
    observacoes: '',
    status: 'prospect',
    valorVendaParcial: 0,
    valorVenda: 0,
    prospectNotes: '',
    products: [] as any[]
  });

  // Load task data into form when available
  useEffect(() => {
    if (!taskData) return;
    
    setFormData({
      customerName: taskData.cliente_nome || '',
      customerEmail: taskData.cliente_email || '',
      filial: taskData.filial || '',
      observacoes: taskData.notas || '',
      status: getInitialStatus(),
      valorVendaParcial: taskData.opportunity?.valor_venda_fechada || 0,
      valorVenda: taskData.opportunity?.valor_venda_fechada || 0,
      prospectNotes: taskData.notas || '',
      products: taskData.items.map(item => ({
        id: item.id,
        name: item.produto,
        sku: item.sku,
        selected: item.qtd_vendida > 0,
        quantity: item.qtd_vendida || item.qtd_ofertada,
        price: item.preco_unit,
        qtd_ofertada: item.qtd_ofertada,
        qtd_vendida: item.qtd_vendida,
        subtotal_ofertado: item.subtotal_ofertado,
        subtotal_vendido: item.subtotal_vendido
      }))
    });
  }, [taskData]);

  // Cálculo automático do Valor Total da Oportunidade
  const valorTotalOportunidade = useMemo(() => {
    if (!taskData?.opportunity) return 0;
    return taskData.opportunity.valor_total_oportunidade;
  }, [taskData]);

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
      if (!taskId || !taskData) {
        toast.error('Erro: Task não encontrada');
        return;
      }

      // Validação para venda perdida
      if (formData.status === 'venda_perdida' && (!formData.prospectNotes || formData.prospectNotes.trim() === '')) {
        toast.error('O motivo da perda é obrigatório');
        return;
      }

      // Map status to opportunity status
      const statusMapping = {
        prospect: 'Prospect',
        venda_total: 'Venda Total',
        venda_parcial: 'Venda Parcial',
        venda_perdida: 'Venda Perdida'
      };

      const opportunityStatus = statusMapping[formData.status as keyof typeof statusMapping];

      // Calculate valor_venda_fechada based on status
      let valorVendaFechada = 0;
      if (formData.status === 'venda_total') {
        valorVendaFechada = valorTotalOportunidade;
      } else if (formData.status === 'venda_parcial') {
        valorVendaFechada = formData.valorVendaParcial;
      }

      // Prepare update data
      const updates = {
        cliente_nome: formData.customerName,
        cliente_email: formData.customerEmail,
        filial: formData.filial,
        notas: formData.observacoes,
        opportunity: taskData.opportunity ? {
          id: taskData.opportunity.id,
          status: opportunityStatus,
          valor_total_oportunidade: taskData.opportunity.valor_total_oportunidade,
          valor_venda_fechada: valorVendaFechada
        } : undefined,
        items: formData.products.map(product => ({
          id: product.id,
          qtd_vendida: product.selected ? product.quantity : 0
        }))
      };

      // Update data using the hook
      const success = await updateTaskData(updates);
      
      if (success) {
        await invalidateAll();
        onTaskUpdate();
        onClose();
      }

    } catch (error: any) {
      console.error('🔍 TaskEditModal - Erro geral:', error);
      toast.error(`Erro ao atualizar task: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state
  if (loading || !taskData) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Carregando...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
                value={formData.customerEmail || '—'}
                onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                placeholder="Email do cliente"
              />
            </div>
          </div>

          {/* Additional fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filial">Filial</Label>
              <Input
                id="filial"
                value={formData.filial || '—'}
                onChange={(e) => setFormData(prev => ({ ...prev, filial: e.target.value }))}
                placeholder="Filial"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="valorTotalOportunidade">Valor Total da Oportunidade (R$)</Label>
              <Input
                id="valorTotalOportunidade"
                value={valorTotalOportunidade.toFixed(2)}
                readOnly
                className="bg-gray-50"
                placeholder="—"
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
              value={Number(formData.valorVenda || 0).toFixed(2)}
              readOnly
              className="bg-gray-50"
              placeholder="—"
            />
            <p className="text-xs text-gray-500">
              Este valor é calculado automaticamente baseado no status selecionado
            </p>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Observações gerais..."
              rows={3}
            />
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
                      <span className="font-medium">{product.name || '—'}</span>
                      {product.sku && <span className="text-sm text-gray-500">({product.sku})</span>}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Qtd. Ofertada</Label>
                      <Input
                        value={product.qtd_ofertada || '—'}
                        readOnly
                        className="h-8 bg-gray-50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Qtd. Vendida</Label>
                      <Input
                        type="number"
                        value={product.quantity || 0}
                        onChange={(e) => handleProductChange(index, 'quantity', Number(e.target.value))}
                        min="0"
                        max={product.qtd_ofertada || 999}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Preço Unit.</Label>
                      <Input
                        value={(product.price || 0).toFixed(2)}
                        readOnly
                        className="h-8 bg-gray-50"
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