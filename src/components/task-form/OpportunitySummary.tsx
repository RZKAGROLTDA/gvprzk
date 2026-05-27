import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Wrench, Package, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OpportunitySummaryProps {
  totalValue: number;
  partsCount: number;
  servicesCount: number;
  equipmentCount?: number;
  className?: string;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Resumo compacto da oportunidade — usado sticky no rodapé da aba Oferta.
 */
export const OpportunitySummary: React.FC<OpportunitySummaryProps> = ({
  totalValue,
  partsCount,
  servicesCount,
  equipmentCount,
  className,
}) => {
  return (
    <Card className={cn('border-primary/20 bg-primary/5', className)}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Valor da oportunidade
            </p>
            <p className="text-2xl font-bold text-primary tabular-nums">
              {formatBRL(totalValue)}
            </p>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden h-12 sm:block" />

        <dl className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-muted-foreground" />
            <dt className="text-muted-foreground">Peças:</dt>
            <dd className="font-semibold tabular-nums">{partsCount}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <dt className="text-muted-foreground">Serviços:</dt>
            <dd className="font-semibold tabular-nums">{servicesCount}</dd>
          </div>
          {typeof equipmentCount === 'number' && (
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">Equipamentos:</dt>
              <dd className="font-semibold tabular-nums">{equipmentCount}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
};
