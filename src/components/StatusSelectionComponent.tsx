import React, { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductType } from '@/types/task';
import { LOSS_REASONS } from './TaskFormCore';
import { supabase } from '@/integrations/supabase/client';

export interface StatusSelectionProps {
  taskId?: string; // Add taskId for automatic value calculation
  salesConfirmed?: boolean | null;
  salesType?: 'ganho' | 'parcial' | 'perdido';
  prospectNotes?: string;
  isProspect?: boolean;
  prospectItems?: ProductType[];
  availableProducts?: ProductType[];
  onStatusChange: (status: { 
    salesConfirmed?: boolean | null; 
    salesType?: 'ganho' | 'parcial' | 'perdido';
    isProspect?: boolean; 
    prospectNotes?: string;
    prospectItems?: ProductType[];
    partialSalesValue?: number; // Add calculated value
  }) => void;
  showError?: boolean;
  errorMessage?: string;
}

export const StatusSelectionComponent: React.FC<StatusSelectionProps> = ({
  taskId,
  salesConfirmed,
  salesType,
  prospectNotes,
  isProspect,
  prospectItems,
  availableProducts,
  onStatusChange,
  showError = false,
  errorMessage
}) => {
  // Calculate partial sales value automatically
  const calculatePartialSalesValue = (items: ProductType[] = []): number => {
    return items
      .filter(item => item.selected)
      .reduce((sum, item) => {
        const quantity = item.quantity || 0;
        const price = item.price || 0;
        return sum + (quantity * price);
      }, 0);
  };

  // Auto-recalculate partial sales value when products change
  useEffect(() => {
    if (salesConfirmed === true && salesType === 'parcial' && prospectItems) {
      const partialValue = calculatePartialSalesValue(prospectItems);
      
      console.log('🔍 StatusSelection - Auto-calculando valor parcial:', {
        taskId,
        salesType,
        salesConfirmed,
        itemsCount: prospectItems.length,
        selectedItems: prospectItems.filter(item => item.selected).length,
        calculatedValue: partialValue
      });

      // Trigger the parent with the calculated value
      onStatusChange({
        salesConfirmed,
        salesType,
        isProspect,
        prospectNotes,
        prospectItems,
        partialSalesValue: partialValue
      });
    }
  }, [prospectItems, salesConfirmed, salesType]);

  const handleProspectItemChange = (index: number, field: keyof ProductType, value: any) => {
    if (!prospectItems) return;
    
    const updatedItems = [...prospectItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Calculate new partial sales value
    const partialValue = calculatePartialSalesValue(updatedItems);
    
    console.log(`🔍 StatusSelection - Produto ${updatedItems[index].name} alterado:`, {
      field,
      newValue: value,
      product: updatedItems[index],
      newPartialValue: partialValue
    });
    
    onStatusChange({
      salesConfirmed,
      salesType,
      isProspect,
      prospectNotes,
      prospectItems: updatedItems,
      partialSalesValue: partialValue
    });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-base font-medium">Status do Prospect</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {/* Prospect Em Andamento */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === undefined && isProspect
                ? 'border-blue-500 bg-blue-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-blue-300'
            }`} 
            onClick={() => {
              onStatusChange({
                salesConfirmed: undefined,
                isProspect: true,
                prospectNotes: ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === undefined && isProspect
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                ⏳
              </div>
              <div>
                <div className="font-medium text-sm">Prospect Em Andamento</div>
                <div className="text-xs text-muted-foreground">Negociação em curso</div>
              </div>
            </div>
            {salesConfirmed === undefined && isProspect && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
          
          {/* Vendas Total */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === true && salesType === 'ganho'
                ? 'border-green-500 bg-green-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-green-300'
            }`} 
            onClick={() => {
              onStatusChange({
                salesConfirmed: true,
                salesType: 'ganho',
                isProspect: true,
                prospectNotes: ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === true && salesType === 'ganho'
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                💰
              </div>
              <div>
                <div className="font-medium text-sm">Vendas Total</div>
                <div className="text-xs text-muted-foreground">Valor total dos produtos oferecidos</div>
              </div>
            </div>
            {salesConfirmed === true && salesType === 'ganho' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>

          {/* Vendas Parcial */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === true && salesType === 'parcial'
                ? 'border-yellow-500 bg-yellow-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-yellow-300'
            }`} 
             onClick={() => {
               // Configurar produtos automaticamente para venda parcial
               const selectedProducts = availableProducts?.filter(item => item.selected).map(item => ({
                 ...item,
                 selected: true,
                 quantity: item.quantity || 1,
                 price: item.price || 0
               })) || [];
               
               const partialValue = calculatePartialSalesValue(selectedProducts);
               
               console.log('🔍 StatusSelection - Venda parcial selecionada:', {
                 selectedProducts: selectedProducts.length,
                 partialValue
               });
               
               onStatusChange({
                 salesConfirmed: true,
                 salesType: 'parcial',
                 isProspect: true,
                 prospectNotes: '',
                 prospectItems: selectedProducts,
                 partialSalesValue: partialValue
               });
             }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === true && salesType === 'parcial'
                  ? 'bg-yellow-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                📊
              </div>
              <div>
                <div className="font-medium text-sm">Vendas Parcial</div>
                <div className="text-xs text-muted-foreground">Negócio parcialmente fechado</div>
              </div>
            </div>
            {salesConfirmed === true && salesType === 'parcial' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
          
          {/* Venda Perdida */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === false 
                ? 'border-red-500 bg-red-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-red-300'
            }`} 
            onClick={() => {
              console.log('🔍 StatusSelection - Venda perdida selecionada');
              onStatusChange({
                salesConfirmed: false,
                salesType: 'perdido',
                isProspect: true,
                prospectNotes: prospectNotes || ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === false 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                ❌
              </div>
              <div>
                <div className="font-medium text-sm">Venda Perdida</div>
                <div className="text-xs text-muted-foreground">Negócio não realizado</div>
              </div>
            </div>
            {salesConfirmed === false && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campo obrigatório para motivo da perda */}
      {salesConfirmed === false && (
        <div className="space-y-2">
          <Label htmlFor="lossReason" className="text-sm font-medium">
            Motivo da Perda *
          </Label>
          <Select 
            value={prospectNotes || ''} 
            onValueChange={(value) => {
              console.log('🔍 StatusSelection - Motivo da perda selecionado:', value);
              onStatusChange({
                salesConfirmed: false,
                salesType: 'perdido',
                isProspect: true,
                prospectNotes: value
              });
            }}
          >
            <SelectTrigger className={showError && (!prospectNotes || prospectNotes.trim() === '') ? 'border-red-500' : ''}>
              <SelectValue placeholder="Selecione o motivo da perda" />
            </SelectTrigger>
            <SelectContent>
              {LOSS_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showError && (!prospectNotes || prospectNotes.trim() === '') && (
            <p className="text-sm text-red-500">
              {errorMessage || 'O motivo da perda é obrigatório'}
            </p>
          )}
        </div>
      )}

      {/* Seção de produtos para vendas parciais */}
      {salesConfirmed === true && salesType === 'parcial' && prospectItems && prospectItems.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partialSaleValue">Valor da Venda Parcial (R$)</Label>
            <div className="relative">
              <Input 
                id="partialSaleValue" 
                type="text" 
                value={new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                 }).format(calculatePartialSalesValue(prospectItems))} 
                 className="pl-8 bg-green-50 border-green-200 text-green-800 font-medium" 
                 readOnly 
               />
               <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-green-600">R$</span>
             </div>
             <p className="text-xs text-green-600 font-medium">
               ⚡ Valor calculado automaticamente com base nos produtos selecionados
             </p>
           </div>
           
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <Label className="text-sm font-medium">Produtos Vendidos</Label>
               <span className="text-xs text-muted-foreground bg-blue-50 px-2 py-1 rounded">
                 ✏️ Clique para editar quantidade e preço
               </span>
             </div>
            <div className="space-y-2 max-h-48 overflow-y-auto border-2 border-dashed border-blue-200 rounded-lg p-4 bg-blue-50/30">
              {prospectItems.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between space-x-3 p-4 bg-white rounded-lg border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      checked={item.selected} 
                      onCheckedChange={(checked) => {
                        handleProspectItemChange(index, 'selected', checked as boolean);
                      }} 
                      className="border-2 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full inline-block w-fit">
                          {item.category}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {item.selected && (
                    <div className="flex items-center space-x-3 bg-gray-50 p-2 rounded-lg">
                      <div className="flex flex-col space-y-1">
                        <Label className="text-xs font-medium text-blue-700">Quantidade</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity || 1}
                          onChange={(e) => handleProspectItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-20 h-9 text-sm border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div className="flex flex-col space-y-1">
                        <Label className="text-xs font-medium text-blue-700">Preço Unit. (R$)</Label>
                        <div className="relative">
                          <Input
                            type="text"
                            value={item.price ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price) : ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              const numericValue = parseFloat(value) / 100;
                              handleProspectItemChange(index, 'price', isNaN(numericValue) ? 0 : numericValue);
                            }}
                            placeholder="0,00"
                            className="pl-7 w-24 h-9 text-sm border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                          />
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 font-medium">R$</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col space-y-1">
                        <Label className="text-xs font-medium text-green-700">Subtotal</Label>
                        <div className="text-sm font-bold text-green-600 px-3 py-2 bg-green-100 rounded-lg border border-green-200">
                          R$ {new Intl.NumberFormat('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          }).format((item.price || 0) * (item.quantity || 1))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {prospectItems.filter(item => item.selected).length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <div className="text-sm">Nenhum produto selecionado</div>
                  <div className="text-xs mt-1">Marque os produtos que foram vendidos</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};