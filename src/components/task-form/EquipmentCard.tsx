import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tractor, Trash2 } from 'lucide-react';

export interface EquipmentItem {
  id: string;
  familyProduct: string;
  quantity: number;
  hectares?: number;
}

interface EquipmentCardProps {
  item: EquipmentItem;
  onRemove?: (id: string) => void;
}

/**
 * Card individual de equipamento — visual; ações controladas externamente.
 */
export const EquipmentCard: React.FC<EquipmentCardProps> = ({ item, onRemove }) => {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Tractor className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate" title={item.familyProduct}>
            {item.familyProduct || 'Equipamento'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono">
              {item.quantity}× un.
            </Badge>
            {typeof item.hectares === 'number' && item.hectares > 0 && (
              <Badge variant="outline" className="font-mono">
                {item.hectares} ha
              </Badge>
            )}
          </div>
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(item.id)}
            aria-label="Remover equipamento"
            className="opacity-60 hover:opacity-100 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
