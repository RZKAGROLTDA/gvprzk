import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Package } from 'lucide-react';
import { ProductType } from '@/types/task';

interface Props {
  products: ProductType[];
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

/**
 * Wrapper recolhível para listas de produtos.
 * Mostra resumo (total / selecionados / valor estimado) e revela a lista
 * completa apenas ao clicar em "Mostrar Produtos".
 *
 * Puramente apresentacional — não altera estado nem persistência.
 */
export const CollapsibleProductsBlock: React.FC<Props> = ({
  products,
  children,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const summary = useMemo(() => {
    const selected = products.filter((p) => p.selected);
    const total = selected.reduce(
      (s, p) => s + (p.price || 0) * (p.quantity || 1),
      0,
    );
    return { count: selected.length, total };
  }, [products]);

  const formatBRL = (n: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(n || 0);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>
                {products.length} produto{products.length === 1 ? '' : 's'}
              </span>
            </div>
            <Badge variant="default" className="text-[10px]">
              {summary.count} selecionado{summary.count === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Total: {formatBRL(summary.total)}
            </Badge>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            disabled={products.length === 0}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1.5" /> Ocultar Produtos
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1.5" /> Mostrar Produtos
              </>
            )}
          </Button>
        </div>
      </div>

      {expanded && <div>{children}</div>}
    </div>
  );
};

export default CollapsibleProductsBlock;
