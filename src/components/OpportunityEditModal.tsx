import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  OpportunityWithTask, 
  useOpportunityItems, 
  useUpdateOpportunity 
} from '@/hooks/useOpportunities';

interface OpportunityEditModalProps {
  opportunity: OpportunityWithTask | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OpportunityEditModal: React.FC<OpportunityEditModalProps> = ({
  opportunity,
  isOpen,
  onClose
}) => {
  const [status, setStatus] = useState<string>('Prospect');
  const [itemsQuantities, setItemsQuantities] = useState<Record<string, number>>({});

  const { data: items = [], isLoading: itemsLoading } = useOpportunityItems(
    opportunity?.opportunity_id || ''
  );
  
  const updateOpportunityMutation = useUpdateOpportunity();

  // Inicializar formulário quando opportunity mudar
  useEffect(() => {
    if (opportunity) {
      setStatus(opportunity.status);
      
      // Inicializar quantidades vendidas dos itens
      const quantities: Record<string, number> = {};
      items.forEach(item => {
        quantities[item.id] = item.qtd_vendida;
      });
      setItemsQuantities(quantities);
    }
  }, [opportunity, items]);

  // Calcular totais
  const totals = useMemo(() => {
    const valorTotal = items.reduce((sum, item) => sum + item.subtotal_ofertado, 0);
    
    let valorVendido = 0;
    if (status === 'Venda Total') {
      valorVendido = valorTotal;
    } else if (status === 'Venda Parcial') {
      valorVendido = items.reduce((sum, item) => {
        const qtdVendida = itemsQuantities[item.id] || 0;
        return sum + (qtdVendida * item.preco_unit);
      }, 0);
    }
    // Para Prospect e Venda Perdida, valorVendido = 0

    const conversao = valorTotal > 0 ? (valorVendido / valorTotal) * 100 : 0;

    return { valorTotal, valorVendido, conversao };
  }, [items, status, itemsQuantities]);

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setItemsQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, quantity)
    }));
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    
    // Auto-ajustar quantidades baseado no status
    if (newStatus === 'Venda Total') {
      const newQuantities: Record<string, number> = {};
      items.forEach(item => {
        newQuantities[item.id] = item.qtd_ofertada;
      });
      setItemsQuantities(newQuantities);
    } else if (newStatus === 'Venda Perdida') {
      const newQuantities: Record<string, number> = {};
      items.forEach(item => {
        newQuantities[item.id] = 0;
      });
      setItemsQuantities(newQuantities);
    }
  };

  const handleSave = async () => {
    if (!opportunity) return;

    const itemsToUpdate = items.map(item => ({
      id: item.id,
      qtd_vendida: itemsQuantities[item.id] || 0
    }));

    await updateOpportunityMutation.mutateAsync({
      opportunityId: opportunity.opportunity_id,
      status,
      items: itemsToUpdate
    });

    onClose();
  };

  if (!opportunity) return null;

  const isEditable = status === 'Venda Parcial';
  const canReopen = (opportunity.status === 'Venda Total' || opportunity.status === 'Venda Perdida');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Oportunidade</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Cabeçalho da Oportunidade */}
          <Card>
            <CardHeader>
              <CardTitle>Informações do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Cliente</Label>
                <Input value={opportunity.cliente_nome} readOnly />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={opportunity.cliente_email || ''} readOnly />
              </div>
              <div>
                <Label>Filial</Label>
                <Input value={opportunity.filial} readOnly />
              </div>
            </CardContent>
          </Card>

          {/* Status do Prospect */}
          <Card>
            <CardHeader>
              <CardTitle>Status do Prospect</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={status}
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

              {canReopen && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-700">
                    ⚠️ Apenas managers podem reabrir oportunidades fechadas (voltar para Prospect).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resumo Financeiro */}
          <Card>
            <CardHeader>
              <CardTitle>Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Valor Total da Oportunidade (R$)</Label>
                <Input 
                  value={totals.valorTotal.toFixed(2)} 
                  readOnly 
                  className="bg-muted" 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Soma de todos os produtos ofertados
                </p>
              </div>
              <div>
                <Label>Valor da Venda Fechada (R$)</Label>
                <Input 
                  value={totals.valorVendido.toFixed(2)} 
                  readOnly 
                  className="bg-muted" 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Calculado automaticamente
                </p>
              </div>
              <div>
                <Label>Conversão (%)</Label>
                <div className="flex items-center space-x-2">
                  <Input 
                    value={totals.conversao.toFixed(1)} 
                    readOnly 
                    className="bg-muted" 
                  />
                  <Badge variant={totals.conversao >= 70 ? 'default' : totals.conversao >= 30 ? 'secondary' : 'destructive'}>
                    {totals.conversao >= 70 ? 'Ótima' : totals.conversao >= 30 ? 'Boa' : 'Baixa'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Produtos */}
          <Card>
            <CardHeader>
              <CardTitle>Produtos da Oportunidade</CardTitle>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="text-center py-4">Carregando produtos...</div>
              ) : items.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  Nenhum produto cadastrado para esta oportunidade
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center">
                        <div>
                          <Label className="text-xs">Produto</Label>
                          <p className="font-medium">{item.produto}</p>
                          {item.sku && (
                            <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                          )}
                        </div>
                        
                        <div>
                          <Label className="text-xs">Preço Unit.</Label>
                          <p>R$ {item.preco_unit.toFixed(2)}</p>
                        </div>

                        <div>
                          <Label className="text-xs">Qtd Ofertada</Label>
                          <p>{item.qtd_ofertada}</p>
                        </div>

                        <div>
                          <Label className="text-xs">Qtd Vendida</Label>
                          {isEditable ? (
                            <Input
                              type="number"
                              min="0"
                              max={item.qtd_ofertada}
                              value={itemsQuantities[item.id] || 0}
                              onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))}
                              className="h-8"
                            />
                          ) : (
                            <p>{itemsQuantities[item.id] || item.qtd_vendida}</p>
                          )}
                        </div>

                        <div>
                          <Label className="text-xs">Subtotal Ofertado</Label>
                          <p>R$ {item.subtotal_ofertado.toFixed(2)}</p>
                        </div>

                        <div>
                          <Label className="text-xs">Subtotal Vendido</Label>
                          <p className="font-medium">
                            R$ {((itemsQuantities[item.id] || item.qtd_vendida) * item.preco_unit).toFixed(2)}
                          </p>
                        </div>

                        <div className="flex justify-center">
                          <Badge 
                            variant={
                              (itemsQuantities[item.id] || item.qtd_vendida) === item.qtd_ofertada 
                                ? 'default' 
                                : (itemsQuantities[item.id] || item.qtd_vendida) > 0 
                                  ? 'secondary' 
                                  : 'outline'
                            }
                          >
                            {(itemsQuantities[item.id] || item.qtd_vendida) === item.qtd_ofertada 
                              ? 'Total' 
                              : (itemsQuantities[item.id] || item.qtd_vendida) > 0 
                                ? 'Parcial' 
                                : 'Não vendido'
                            }
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rodapé com Totais */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-lg font-semibold">
                <div className="text-center">
                  <div className="text-sm font-normal text-muted-foreground">Valor Total da Oportunidade</div>
                  <div className="text-xl">R$ {totals.valorTotal.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-normal text-muted-foreground">Valor Fechado</div>
                  <div className="text-xl text-primary">R$ {totals.valorVendido.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-normal text-muted-foreground">Taxa de Conversão</div>
                  <div className="text-xl">{totals.conversao.toFixed(1)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botões de Ação */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateOpportunityMutation.isPending}
            >
              {updateOpportunityMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};