import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, Package, TrendingUp, AlertCircle, Plus } from 'lucide-react';
import { Autocomplete, AutocompleteOption } from '@/components/ui/autocomplete';
import { predefinedProducts } from '@/lib/predefinedProducts';

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

interface StandardTaskFormProps {
  formData: {
    customerName: string;
    customerEmail: string;
    filial: string;
    observacoes: string;
    status: string;
    prospectNotes: string;
    prospectNotesJustification?: string;
    products: OpportunityItem[];
    name: string;
    responsible: string;
    property: string;
    phone: string;
    clientCode: string;
    taskType: 'visita' | 'ligacao' | 'checklist';
    priority: 'low' | 'medium' | 'high';
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    familyProduct: string;
    equipmentQuantity: number;
    propertyHectares: number;
  };
  onFormDataChange: (data: any) => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
  showProductsSection?: boolean;
  title: string;
}

export const StandardTaskForm: React.FC<StandardTaskFormProps> = ({
  formData,
  onFormDataChange,
  onSubmit,
  isSubmitting,
  showProductsSection = true,
  title
}) => {
  // Converter produtos pré-definidos para opções do autocomplete
  const productOptions: AutocompleteOption[] = predefinedProducts.map(product => ({
    value: product.name,
    label: product.name,
    category: product.category
  }));
  // Cálculos dos totais (READ-ONLY)
  // Valor Total da Oportunidade deve ser FIXO baseado no subtotal_ofertado original
  const valorTotalOportunidade = useMemo(() => {
    return formData.products.reduce((sum, item) => {
      return sum + (item.subtotal_ofertado || 0);
    }, 0);
  }, [formData.products]);

  const valorVendaParcial = useMemo(() => {
    return formData.products
      .filter(item => item.incluir_na_venda_parcial)
      .reduce((sum, item) => {
        // CORRETO: usar sempre qtd_vendida para calcular valor da venda parcial
        return sum + (item.qtd_vendida * item.preco_unit);
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
    onFormDataChange({
      ...formData,
      status: newStatus,
      ...(newStatus !== 'venda_perdida' && { prospectNotes: '' })
    });
  };

  // Funções para gerenciar itens da oportunidade
  const handleItemToggle = (itemIndex: number) => {
    onFormDataChange({
      ...formData,
      products: formData.products.map((product, index) => 
        index === itemIndex 
          ? { 
              ...product, 
              incluir_na_venda_parcial: !product.incluir_na_venda_parcial,
              qtd_vendida: !product.incluir_na_venda_parcial ? product.qtd_vendida || product.qtd_ofertada : 0
            }
          : product
      )
    });
  };

  // Função para atualizar quantidade do produto
  const handleQuantityChange = (itemIndex: number, newQuantity: number) => {
    onFormDataChange({
      ...formData,
      products: formData.products.map((product, index) => 
        index === itemIndex 
          ? { 
              ...product, 
              qtd_ofertada: newQuantity,
              qtd_vendida: product.incluir_na_venda_parcial ? newQuantity : product.qtd_vendida,
              subtotal_ofertado: newQuantity * product.preco_unit // CORRETO: recalcular subtotal
            }
          : product
      )
    });
  };

  // Função para atualizar quantidade vendida diretamente
  const handleSoldQuantityChange = (itemIndex: number, newQuantity: number) => {
    onFormDataChange({
      ...formData,
      products: formData.products.map((product, index) => 
        index === itemIndex 
          ? { 
              ...product, 
              qtd_vendida: newQuantity,
              subtotal_vendido: newQuantity * product.preco_unit // CORRETO: recalcular subtotal vendido
            }
          : product
      )
    });
  };

  const handleSelectAll = () => {
    onFormDataChange({
      ...formData,
      products: formData.products.map(product => ({
        ...product,
        incluir_na_venda_parcial: true
      }))
    });
  };

  const handleClearSelection = () => {
    onFormDataChange({
      ...formData,
      products: formData.products.map(product => ({
        ...product,
        incluir_na_venda_parcial: false
      }))
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Incluir os valores calculados no formData antes de salvar
    // CORREÇÃO: Preservar o status selecionado pelo usuário, não forçar 'closed'
    const formDataWithValues = {
      ...formData,
      salesValue: valorVenda, // Valor da venda calculado
      prospectValue: valorTotalOportunidade, // Valor total da oportunidade (fixo)
      partialSalesValue: valorVendaParcial, // Valor da venda parcial
      // Status deve permanecer o que foi selecionado pelo usuário (venda_parcial, venda_total, etc.)
    };
    
    onSubmit(formDataWithValues);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informações da Tarefa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Informações da Tarefa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taskName">Nome da Tarefa</Label>
              <Input
                id="taskName"
                value={formData.name}
                onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
                placeholder="Nome da tarefa"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="responsible">Responsável</Label>
              <Input
                id="responsible"
                value={formData.responsible}
                onChange={(e) => onFormDataChange({ ...formData, responsible: e.target.value })}
                placeholder="Responsável pela tarefa"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taskType">Tipo de Atividade</Label>
              <Select 
                value={formData.taskType} 
                onValueChange={(value: 'visita' | 'ligacao' | 'checklist') => 
                  onFormDataChange({ ...formData, taskType: value })
                }
              >
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
              <Select 
                value={formData.priority} 
                onValueChange={(value: 'low' | 'medium' | 'high') => 
                  onFormDataChange({ ...formData, priority: value })
                }
              >
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
                onChange={(e) => onFormDataChange({ ...formData, startDate: e.target.value })}
                required
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
                onChange={(e) => onFormDataChange({ ...formData, endDate: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="startTime">Hora de Início</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => onFormDataChange({ ...formData, startTime: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">Hora de Fim</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => onFormDataChange({ ...formData, endTime: e.target.value })}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informações do Cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Nome do Cliente</Label>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => onFormDataChange({ ...formData, customerName: e.target.value })}
                placeholder="Nome do cliente"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input
                id="customerEmail"
                type="email"
                value={formData.customerEmail || ''}
                onChange={(e) => onFormDataChange({ ...formData, customerEmail: e.target.value })}
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
                onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
                placeholder="Telefone do cliente"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="clientCode">Código do Cliente</Label>
              <Input
                id="clientCode"
                value={formData.clientCode}
                onChange={(e) => onFormDataChange({ ...formData, clientCode: e.target.value })}
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
                onChange={(e) => onFormDataChange({ ...formData, property: e.target.value })}
                placeholder="Nome da propriedade"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="filial">Filial</Label>
              <Input
                id="filial"
                value={formData.filial}
                onChange={(e) => onFormDataChange({ ...formData, filial: e.target.value })}
                placeholder="Filial"
                required
              />
            </div>
          </div>

          {formData.taskType !== 'ligacao' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="equipmentQuantity">Quantidade de Equipamentos</Label>
                <Input
                  id="equipmentQuantity"
                  type="number"
                  min="0"
                  value={formData.equipmentQuantity}
                  onChange={(e) => onFormDataChange({ 
                    ...formData, 
                    equipmentQuantity: parseInt(e.target.value) || 0 
                  })}
                  placeholder="Quantidade"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="propertyHectares">Hectares da Propriedade</Label>
                <Input
                  id="propertyHectares"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.propertyHectares}
                  onChange={(e) => onFormDataChange({ 
                    ...formData, 
                    propertyHectares: parseFloat(e.target.value) || 0 
                  })}
                  placeholder="Hectares"
                />
              </div>
            </div>
          )}

          {formData.taskType === 'checklist' && (
            <div className="space-y-2">
              <Label htmlFor="familyProduct">Família do Produto</Label>
              <Input
                id="familyProduct"
                value={formData.familyProduct}
                onChange={(e) => onFormDataChange({ ...formData, familyProduct: e.target.value })}
                placeholder="Família do produto"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção de Produtos e Valores - SEMPRE VISÍVEL */}
      {showProductsSection && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Produtos Oferecidos e Valores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Resumo Financeiro - SEMPRE VISÍVEL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Valor Total da Oportunidade</p>
                <p className="text-2xl font-bold text-primary">
                  R$ {valorTotalOportunidade.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Valor da Venda Parcial</p>
                <p className="text-2xl font-bold text-warning">
                  R$ {valorVendaParcial.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {itensIncluidos} de {formData.products.length} itens
                  {formData.products.length === 0 && " (nenhum produto cadastrado)"}
                </p>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {formData.status === 'venda_total' ? 'Valor Venda Fechada' : 
                   formData.status === 'venda_parcial' ? 'Valor Venda Parcial' : 
                   'Valor da Venda'}
                </p>
                <p className="text-2xl font-bold text-success">
                  R$ {valorVenda.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
            </div>

            {/* Status da Venda */}
            <div className="space-y-4">
              <Label>Status da Venda</Label>
              <RadioGroup value={formData.status} onValueChange={handleStatusChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="prospect" id="prospect" />
                  <Label htmlFor="prospect">
                    <Badge variant="warning">Prospect</Badge>
                    <span className="ml-2">Em prospecção</span>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="venda_total" id="venda_total" />
                  <Label htmlFor="venda_total">
                    <Badge variant="success">Venda Total</Badge>
                    <span className="ml-2">Venda de todos os itens ofertados</span>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="venda_parcial" id="venda_parcial" />
                  <Label htmlFor="venda_parcial">
                    <Badge variant="warning">Venda Parcial</Badge>
                    <span className="ml-2">Venda de itens selecionados</span>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="venda_perdida" id="venda_perdida" />
                  <Label htmlFor="venda_perdida">
                    <Badge variant="destructive">Venda Perdida</Badge>
                    <span className="ml-2">Venda não realizada</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Lista de Produtos com Seleção para Venda Parcial */}
            {formData.status === 'venda_parcial' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    Selecione os itens para venda parcial:
                  </Label>
                  <div className="space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      Selecionar Todos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                    >
                      Limpar Seleção
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {formData.products.map((product, index) => (
                    <div
                      key={product.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        product.incluir_na_venda_parcial 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`product-${index}`}
                          checked={product.incluir_na_venda_parcial}
                          onCheckedChange={() => handleItemToggle(index)}
                        />
                        
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <Label className="text-sm font-medium">{product.produto}</Label>
                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                          </div>
                          
                           <div>
                             <Label className="text-xs text-muted-foreground">Qtd: {product.qtd_vendida}</Label>
                             <Input
                               type="number"
                               min="0"
                               value={product.qtd_vendida}
                               onChange={(e) => handleSoldQuantityChange(index, parseInt(e.target.value) || 0)}
                               className="h-8 text-sm"
                               disabled={!product.incluir_na_venda_parcial}
                             />
                           </div>
                          
                          <div>
                            <p className="text-sm">
                              R$ {product.preco_unit.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-sm font-medium">
                              Total: R$ {(product.qtd_ofertada * product.preco_unit).toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção para adicionar produtos quando não há produtos */}
            {formData.products.length === 0 && (
              <div className="text-center p-8 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                  Nenhum produto cadastrado
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Esta tarefa ainda não possui produtos ou serviços cadastrados.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Adiciona um produto vazio para começar
                    const newProduct = {
                      id: `new-${Date.now()}`,
                      produto: '',
                      sku: '',
                      qtd_ofertada: 1,
                      qtd_vendida: 0,
                      preco_unit: 0,
                      subtotal_ofertado: 0,
                      subtotal_vendido: 0,
                      incluir_na_venda_parcial: false
                    };
                    onFormDataChange({
                      ...formData,
                      products: [newProduct]
                    });
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Primeiro Produto
                </Button>
              </div>
            )}

            {/* Lista Completa de Produtos (Somente Leitura) */}
            {formData.products.length > 0 && formData.status !== 'venda_parcial' && (
              <div className="space-y-4">
                <Label className="text-base font-semibold">Produtos Oferecidos:</Label>
                <div className="space-y-2">
                  {formData.products.map((product, index) => (
                    <div key={product.id} className="border rounded p-3 bg-muted/20 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Nome do Produto</Label>
                          <Autocomplete
                            options={productOptions}
                            value={product.produto}
                            onSelect={(selectedValue) => {
                              const updatedProducts = [...formData.products];
                              updatedProducts[index] = { ...product, produto: selectedValue };
                              onFormDataChange({
                                ...formData,
                                products: updatedProducts
                              });
                            }}
                            placeholder="Digite ou selecione um produto"
                            searchPlaceholder="Buscar produtos..."
                            emptyMessage="Nenhum produto encontrado. Digite para adicionar um novo."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">SKU/Código</Label>
                          <Input
                            value={product.sku}
                            onChange={(e) => {
                              const updatedProducts = [...formData.products];
                              updatedProducts[index] = { ...product, sku: e.target.value };
                              onFormDataChange({
                                ...formData,
                                products: updatedProducts
                              });
                            }}
                            placeholder="SKU ou código"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Quantidade</Label>
                          <Input
                            type="number"
                            min="1"
                            value={product.qtd_ofertada}
                            onChange={(e) => {
                              const newQtd = parseInt(e.target.value) || 1;
                              const updatedProducts = [...formData.products];
                              updatedProducts[index] = { 
                                ...product, 
                                qtd_ofertada: newQtd,
                                subtotal_ofertado: newQtd * product.preco_unit
                              };
                              onFormDataChange({
                                ...formData,
                                products: updatedProducts
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Preço Unitário (R$)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.preco_unit}
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0;
                              const updatedProducts = [...formData.products];
                              updatedProducts[index] = { 
                                ...product, 
                                preco_unit: newPrice,
                                subtotal_ofertado: product.qtd_ofertada * newPrice
                              };
                              onFormDataChange({
                                ...formData,
                                products: updatedProducts
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Subtotal</Label>
                          <div className="flex items-center h-10 px-3 py-2 border rounded-md bg-muted">
                            <span className="text-sm font-medium">
                              R$ {(product.qtd_ofertada * product.preco_unit).toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Botão para remover produto */}
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const updatedProducts = formData.products.filter((_, i) => i !== index);
                            onFormDataChange({
                              ...formData,
                              products: updatedProducts
                            });
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Botão para adicionar mais produtos */}
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newProduct = {
                        id: `new-${Date.now()}`,
                        produto: '',
                        sku: '',
                        qtd_ofertada: 1,
                        qtd_vendida: 0,
                        preco_unit: 0,
                        subtotal_ofertado: 0,
                        subtotal_vendido: 0,
                        incluir_na_venda_parcial: false
                      };
                      onFormDataChange({
                        ...formData,
                        products: [...formData.products, newProduct]
                      });
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar Produto
                  </Button>
                </div>
              </div>
            )}

            {/* Motivo da Perda (obrigatório para venda perdida) */}
            {formData.status === 'venda_perdida' && (
              <div className="space-y-2">
                <Label htmlFor="prospectNotes" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Motivo da Perda (Obrigatório)
                </Label>
                <Select 
                  value={formData.prospectNotes || ''} 
                  onValueChange={(value) => onFormDataChange({ 
                    ...formData, 
                    prospectNotes: value,
                    ...(value !== 'Outros' && { prospectNotesJustification: '' })
                  })}
                >
                  <SelectTrigger className="z-10">
                    <SelectValue placeholder="Selecione o motivo da perda" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="Preço">Preço</SelectItem>
                    <SelectItem value="Falta de Produto">Falta de Produto</SelectItem>
                    <SelectItem value="Paralelo">Paralelo</SelectItem>
                    <SelectItem value="Duplo Domicilio">Duplo Domicilio</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Campo de justificativa para "Outros" */}
                {formData.prospectNotes === 'Outros' && (
                  <div className="space-y-2">
                    <Label htmlFor="prospectNotesJustification">Justificativa (Obrigatório)</Label>
                    <Textarea
                      id="prospectNotesJustification"
                      value={formData.prospectNotesJustification || ''}
                      onChange={(e) => onFormDataChange({ 
                        ...formData, 
                        prospectNotesJustification: e.target.value 
                      })}
                      placeholder="Descreva o motivo da perda..."
                      required
                      className="min-h-[80px]"
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Observações */}
      <Card>
        <CardHeader>
          <CardTitle>Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações Gerais</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => onFormDataChange({ ...formData, observacoes: e.target.value })}
              placeholder="Observações adicionais sobre a tarefa..."
              className="min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Botões de Ação */}
      <div className="flex justify-end space-x-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-w-[120px]"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Salvando...
            </>
          ) : (
            'Salvar Tarefa'
          )}
        </Button>
      </div>
    </form>
  );
};