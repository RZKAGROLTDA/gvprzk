import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyDayDetails } from '@/hooks/useMyDay';
import {
  BLOCK_LABELS,
  BUCKET_LABELS,
  emptyMessage,
  normalizeItem,
  type MyDayBlock,
  type MyDayBucket,
  type MyDayItem,
} from '@/lib/myDay';
import { PendingItemRow } from '@/components/myday/PendingItemRow';

const PAGE_SIZE = 20;

interface SeeAllDialogProps {
  open: boolean;
  block: MyDayBlock | null;
  bucket: MyDayBucket | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MyDayItem) => void;
}

export const SeeAllDialog: React.FC<SeeAllDialogProps> = ({
  open,
  block,
  bucket,
  onOpenChange,
  onSelect,
}) => {
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    if (open) setPage(0);
  }, [open, block, bucket]);

  // A consulta só roda com o modal aberto (paginação server-side).
  const { data, isLoading, isFetching, isError, refetch } = useMyDayDetails(
    block,
    bucket,
    page,
    PAGE_SIZE,
    open,
  );

  const items = React.useMemo(
    () => (block && data?.items ? data.items.map((raw) => normalizeItem(block, raw)) : []),
    [block, data],
  );
  const total = Number(data?.total_count ?? 0);
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {block ? BLOCK_LABELS[block] : ''}
            {bucket ? ` — ${BUCKET_LABELS[bucket]}` : ''}
            {total > 0 ? ` (${total})` : ''}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Não foi possível carregar os itens.</p>
            <Button size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {block && bucket ? emptyMessage(block, bucket) : 'Nenhum item'}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <PendingItemRow key={item.key} item={item} onSelect={onSelect} />
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || isFetching}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {lastPage + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage || isFetching}
              onClick={() => setPage((p) => Math.min(p + 1, lastPage))}
            >
              Próxima
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
