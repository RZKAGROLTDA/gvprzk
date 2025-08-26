import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import { ProductType } from '@/types/task';

interface ProductListComponentProps {
  products: ProductType[];
  onProductChange?: (products: ProductType[]) => void;
  readOnly?: boolean;
  showSelectedOnly?: boolean;
  title?: string;
}

export const ProductListComponent: React.FC<ProductListComponentProps> = ({
  products,
  onProductChange,
  readOnly = false,
  showSelectedOnly = false,
  title = "Produtos/Serviços"
}) => {
  const displayProducts = showSelectedOnly ? products.filter(p => p.selected) : products;
  
  const handleProductUpdate = (index: number, field: keyof ProductType, value: any) => {
    if (readOnly || !onProductChange) return;
    
    const updatedProducts = [...products];
    updatedProducts[index] = {
      ...updatedProducts[index],
      [field]: value
    };
    onProductChange(updatedProducts);
  };

  const calculateTotalValue = () => {
    return products
      .filter(p => p.selected)
      .reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
  };

  if (displayProducts.length === 0 && showSelectedOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Nenhum produto selecionado
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          {title}
        </CardTitle>
        {showSelectedOnly && (
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {displayProducts.length} produto(s) selecionado(s)
            </Badge>
            <div className="text-sm">
              <span className="text-muted-foreground">Valor Total: </span>
              <span className="font-bold text-primary">
                R$ {calculateTotalValue().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayProducts.map((product, index) => {
            const originalIndex = showSelectedOnly 
              ? products.findIndex(p => p.id === product.id) 
              : index;
            
            return (
              <div key={product.id} className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-start gap-4">
                  {!readOnly && !showSelectedOnly && (
                    <Checkbox
                      checked={product.selected}
                      onCheckedChange={(checked) => 
                        handleProductUpdate(originalIndex, 'selected', checked)
                      }
                      className="mt-2"
                    />
                  )}
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{product.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {product.category}
                      </Badge>
                    </div>
                    
                    {(product.selected || readOnly || showSelectedOnly) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Quantidade</Label>
                          {readOnly ? (
                            <div className="font-medium">
                              {product.quantity || 1}
                            </div>
                          ) : (
                            <Input
                              type="number"
                              min="1"
                              value={product.quantity || 1}
                              onChange={(e) => 
                                handleProductUpdate(originalIndex, 'quantity', parseInt(e.target.value) || 1)
                              }
                              placeholder="Quantidade"
                            />
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-sm">Preço Unitário (R$)</Label>
                          {readOnly ? (
                            <div className="font-medium">
                              R$ {(product.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={product.price || 0}
                              onChange={(e) => 
                                handleProductUpdate(originalIndex, 'price', parseFloat(e.target.value) || 0)
                              }
                              placeholder="0,00"
                            />
                          )}
                        </div>
                      </div>
                    )}
                    
                    {(product.selected || showSelectedOnly) && product.quantity && product.price && (
                      <div className="text-right border-t pt-2">
                        <span className="text-sm text-muted-foreground">Subtotal: </span>
                        <span className="font-bold">
                          R$ {((product.price || 0) * (product.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {!showSelectedOnly && products.some(p => p.selected) && (
          <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total Geral:</span>
              <span className="text-xl font-bold text-primary">
                R$ {calculateTotalValue().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};