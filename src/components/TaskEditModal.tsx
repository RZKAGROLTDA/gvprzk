
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

interface OpportunityItem {
  id: string;
  produto: string;
  sku: string;
  qtd_ofertada: number;
  qtd_vendida: number;
  preco_unit: number;
  subtotal_ofertado: number;
  subtotal_vendido: number;
  incluir_na_venda_parcial?: boolean;
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
    prospectNotes: '',
    products: [] as OpportunityItem[]
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
      prospectNotes: taskData.notas || '',
      products: taskData.items.map(item => ({
        id: item.id,
        produto: item.produto,
        sku: item.sku,
        qtd_ofertada: item.qtd_ofertada,
        qtd_vendida: item.qtd_vendida,
        preco_unit: item.preco_unit,
        subtotal_ofertado: item.subtotal_ofertado,
        subtotal_vendido: item.subtotal_vendido,
        incluir_na_venda_parcial: item.qtd_vendida > 0
      }))
    });
  }, [taskData]);

  // 1) Cálculos dos totais (READ-ONLY)
  const valorTotalOportunidade = useMemo(() => {
    return formData.products.reduce((sum, item) => {
      return sum + (item.qtd_ofertada * item.preco_unit);
    }, 0);
  }, [formData.products]);

  const valorVendaParcial = useMemo(() => {
    return formData.products
      .filter(item => item.incluir_na_venda_parcial)
      .reduce((sum, item) => {
        return sum + (item.qtd_ofertada * item.preco_unit);
      }, 0);
  }, [formData.products]);

  const valorVenda = useMemo(() => {
    switch (formData.status) {
      case 'venda_total':
        return valorTotalOportunidade;
      case 'venda_parcial':
        return valorVendaParcial;
      default:
        return 0;
    }
  }, [formData.status, valorTotalOportunidade, valorVendaParcial]);

  // Contador de itens incluídos
  const itensIncluidos = useMemo(() => {
    return formData.products.filter(item => item.incluir_na_venda_parcial).length;
  }, [formData.products]);

  const handleStatusChange = (newStatus: string) => {
    setFormData(prev => ({
      ...prev,
      status: newStatus,
      ...(newStatus !== 'venda_perdida' && { prospectNotes: '' })
    }));
  };

  // 2) Funções para gerenciar itens da oportunidade
  const handleItemToggle = (itemIndex: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) => 
        index === itemIndex 
          ? { ...product, incluir_na_venda_parcial: !product.incluir_na_venda_parcial }
          : product
      )
    }));
  };

  const handleSelectAll = () => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map(product => ({
        ...product,
        incluir_na_venda_parcial: true
      }))
    }));
  };

  const handleClearSelection = () => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map(product => ({
        ...product,
        incluir_na_venda_parcial: false
      }))
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
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

      // Prepare update data
      const updates = {
        cliente_nome: formData.customerName,
        cliente_email: formData.customerEmail,
        filial: formData.filial,
        notas: formData.observacoes,
        opportunity: taskData.opportunity ? {
          id: taskData.opportunity.id,
          status: opportunityStatus,
          valor_total_oportunidade: valorTotalOportunidade,
          valor_venda_fechada: valorVenda
        } : undefined,
        items: formData.products.map(product => ({
          id: product.id,
          qtd_vendida: product.incluir_na_venda_parcial ? product.qtd_ofertada : 0
        }))
      };

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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label htmlFor="filial">Filial</Label>
            <Input
              id="filial"
              value={formData.filial || '—'}
              onChange={(e) => setFormData(prev => ({ ...prev, filial: e.target.value }))}
              placeholder="Filial"
            />
          </div>

          {/* 1) Totais (READ-ONLY) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="space-y-2">
              <Label>Valor Total da Oportunidade (R$)</Label>
              <Input
                value={valorTotalOportunidade.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                readOnly
                className="bg-white"
              />
            </div>
            
            {/* 3) Visibilidade - Campo aparece apenas quando status == "Venda Parcial" */}
            {formData.status === 'venda_parcial' && (
              <div className="space-y-2">
                <Label>Valor da Venda Parcial (R$)</Label>
                <Input
                  value={valorVendaParcial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  readOnly
                  className="bg-white"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Valor da Venda (R$)</Label>
              <Input
                value={valorVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                readOnly
                className="bg-white"
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

          {/* 2) Tabela de itens da oportunidade */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-base font-medium">Produtos da Oportunidade</Label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  Itens incluídos: {itensIncluidos}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    Selecionar todos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearSelection}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">✓ Incluir na venda parcial</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Produto</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">SKU</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Qtd. Ofertada</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Preço Unit.</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.products.map((product, index) => (
                      <tr key={product.id} className="border-t">
                        <td className="px-4 py-2">
                          <Checkbox
                            checked={product.incluir_na_venda_parcial || false}
                            onCheckedChange={() => handleItemToggle(index)}
                          />
                        </td>
                        <td className="px-4 py-2 font-medium">{product.produto || '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{product.sku || '—'}</td>
                        <td className="px-4 py-2">{product.qtd_ofertada || '—'}</td>
                        <td className="px-4 py-2">
                          {(product.preco_unit || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="px-4 py-2">
                          {((product.qtd_ofertada || 0) * (product.preco_unit || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                    
                    {formData.products.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          Nenhum produto cadastrado para esta oportunidade
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
