import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  console.log('🔧 TaskEditModal: Renderizado com props:', { taskId, isOpen });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: taskData, loading, error, updateTaskData } = useTaskEditData(taskId);
  const { invalidateAll } = useSecurityCache();
  
  console.log('🔧 TaskEditModal: Estado dos dados:', { taskData: !!taskData, loading, error });
  
  // Map task type from different sources to standardized values
  const mapTaskType = (type: string): 'visita' | 'ligacao' | 'checklist' => {
    switch (type) {
      case 'prospection':
      case 'field-visit':
      case 'visita':
        return 'visita';
      case 'ligacao':
      case 'call':
        return 'ligacao';
      case 'checklist':
      case 'workshop-checklist':
        return 'checklist';
      default:
        return 'visita';
    }
  };
  
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
    products: [] as OpportunityItem[],
    // Campos adicionais da tarefa
    name: '',
    responsible: '',
    property: '',
    phone: '',
    clientCode: '',
    taskType: 'visita' as 'visita' | 'ligacao' | 'checklist',
    priority: 'medium' as 'low' | 'medium' | 'high',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    familyProduct: '',
    equipmentQuantity: 0,
    propertyHectares: 0
  });

  // Load task data into form when available
  useEffect(() => {
    console.log('🔧 TaskEditModal: useEffect - taskData mudou:', { 
      hasTaskData: !!taskData,
      taskId: taskData?.id,
      cliente_nome: taskData?.cliente_nome 
    });
    
    if (!taskData) return;
    
    const newFormData = {
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
      })),
      // Preencher campos adicionais da tarefa
      name: taskData.name || '',
      responsible: taskData.responsible || '',
      property: taskData.property || '',
      phone: taskData.phone || '',
      clientCode: taskData.clientCode || '',
      taskType: mapTaskType(taskData.taskType || taskData.tipo || 'prospection'),
      priority: (taskData.priority as 'low' | 'medium' | 'high') || 'medium',
      startDate: taskData.startDate ? new Date(taskData.startDate).toISOString().split('T')[0] : '',
      endDate: taskData.endDate ? new Date(taskData.endDate).toISOString().split('T')[0] : '',
      startTime: taskData.startTime || '',
      endTime: taskData.endTime || '',
      familyProduct: taskData.familyProduct || '',
      equipmentQuantity: taskData.equipmentQuantity || 0,
      propertyHectares: taskData.propertyHectares || 0
    };
    
    console.log('🔧 TaskEditModal: Atualizando formData:', newFormData);
    setFormData(newFormData);
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

      // Prepare update data including all task fields
      const updatedData = {
        cliente_nome: formData.customerName,
        cliente_email: formData.customerEmail,
        filial: formData.filial,
        notas: formData.observacoes,
        tipo: formData.taskType,
        // Additional task fields
        name: formData.name,
        responsible: formData.responsible,
        property: formData.property,
        phone: formData.phone,
        clientCode: formData.clientCode,
        taskType: formData.taskType,
        priority: formData.priority,
        opportunity: {
          status: opportunityStatus,
          valor_venda_fechada: valorVenda
        },
        items: formData.products.map(product => ({
          id: product.id,
          qtd_vendida: product.incluir_na_venda_parcial ? product.qtd_ofertada : 0
        }))
      };

      const success = await updateTaskData(updatedData);
      
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
    console.log('🔧 TaskEditModal: Exibindo estado de carregamento:', { loading, hasTaskData: !!taskData, error });
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {loading ? 'Carregando dados da task...' : error ? 'Erro ao carregar' : 'Carregando...'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            {loading && (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Carregando dados da task...</p>
              </>
            )}
            {error && (
              <div className="text-center space-y-2">
                <p className="text-red-600 font-medium">Erro: {error}</p>
                <p className="text-sm text-muted-foreground">
                  Verifique sua conexão e permissões de acesso
                </p>
                <Button 
                  onClick={onClose} 
                  variant="outline"
                  className="mt-4"
                >
                  Fechar
                </Button>
              </div>
            )}
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
          {/* Dados da Tarefa */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Informações da Tarefa</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taskName">Nome da Tarefa</Label>
                <Input
                  id="taskName"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome da tarefa"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="responsible">Responsável</Label>
                <Input
                  id="responsible"
                  value={formData.responsible}
                  onChange={(e) => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
                  placeholder="Responsável pela tarefa"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taskType">Tipo de Atividade</Label>
                <Select value={formData.taskType} onValueChange={(value: 'visita' | 'ligacao' | 'checklist') => setFormData(prev => ({ ...prev, taskType: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visita">Visita</SelectItem>
                    <SelectItem value="ligacao">Ligação</SelectItem>
                    <SelectItem value="checklist">Checklist</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select value={formData.priority} onValueChange={(value: 'low' | 'medium' | 'high') => setFormData(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Data de Início</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="endDate">Data de Fim</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="startTime">Hora de Início</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">Hora de Fim</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Dados do Cliente */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Informações do Cliente</h3>
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
                  value={formData.customerEmail || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                  placeholder="Email do cliente"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Telefone do cliente"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="clientCode">Código do Cliente</Label>
                <Input
                  id="clientCode"
                  value={formData.clientCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientCode: e.target.value }))}
                  placeholder="Código do cliente"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="property">Propriedade</Label>
                <Input
                  id="property"
                  value={formData.property}
                  onChange={(e) => setFormData(prev => ({ ...prev, property: e.target.value }))}
                  placeholder="Nome da propriedade"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="filial">Filial</Label>
                <Input
                  id="filial"
                  value={formData.filial || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, filial: e.target.value }))}
                  placeholder="Filial"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyHectares">Hectares da Propriedade</Label>
                <Input
                  id="propertyHectares"
                  type="number"
                  value={formData.propertyHectares}
                  onChange={(e) => setFormData(prev => ({ ...prev, propertyHectares: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="equipmentQuantity">Quantidade de Equipamentos</Label>
                <Input
                  id="equipmentQuantity"
                  type="number"
                  value={formData.equipmentQuantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, equipmentQuantity: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="familyProduct">Família do Produto</Label>
                <Input
                  id="familyProduct"
                  value={formData.familyProduct}
                  onChange={(e) => setFormData(prev => ({ ...prev, familyProduct: e.target.value }))}
                  placeholder="Família do produto"
                />
              </div>
            </div>
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
                          <div className="space-y-2">
                            <p>Nenhum produto cadastrado para esta task</p>
                            <p className="text-sm text-gray-400">
                              Os produtos podem estar em uma estrutura de dados diferente ou não foram cadastrados durante a criação da task
                            </p>
                          </div>
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