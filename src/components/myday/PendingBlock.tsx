import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { PendingItemRow } from '@/components/myday/PendingItemRow';
import {
  BLOCK_LABELS,
  BLOCK_ORDER,
  BUCKET_LABELS,
  countOf,
  normalizeItem,
  previewOf,
  sortByDateTime,
  type MyDayBlock,
  type MyDayBucket,
  type MyDayItem,
  type MyDaySummary,
} from '@/lib/myDay';

const MAX_PREVIEW = 5;

interface PendingBlockProps {
  bucket: MyDayBucket;
  summary: MyDaySummary;
  defaultOpen: boolean;
  onSelect: (item: MyDayItem) => void;
  onSeeAll: (block: MyDayBlock, bucket: MyDayBucket) => void;
}

const emptyBucketMessage: Record<MyDayBucket, string> = {
  overdue: 'Nenhuma pendência atrasada',
  today: 'Nenhuma pendência para hoje',
  upcoming: 'Nenhuma pendência nos próximos dias',
};

export const PendingBlock: React.FC<PendingBlockProps> = ({
  bucket,
  summary,
  defaultOpen,
  onSelect,
  onSeeAll,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);

  const counts = React.useMemo(
    () =>
      BLOCK_ORDER.map((block) => ({ block, count: countOf(summary[block], bucket) })),
    [summary, bucket],
  );
  const total = counts.reduce((acc, c) => acc + c.count, 0);

  const items = React.useMemo(() => {
    const merged = BLOCK_ORDER.flatMap((block) =>
      previewOf(summary[block], bucket).map((raw) => normalizeItem(block, raw)),
    );
    return sortByDateTime(merged).slice(0, MAX_PREVIEW);
  }, [summary, bucket]);

  const tone =
    bucket === 'overdue'
      ? 'border-destructive/40'
      : bucket === 'today'
        ? 'border-primary/40'
        : '';

  return (
    <Card className={tone}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-3 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide">
                  {BUCKET_LABELS[bucket]}
                </h2>
                <Badge variant={bucket === 'overdue' ? 'destructive' : 'secondary'}>{total}</Badge>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
            {total === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyBucketMessage[bucket]}</p>
            ) : (
              <>
                <div className="space-y-2">
                  {items.map((item) => (
                    <PendingItemRow key={item.key} item={item} onSelect={onSelect} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {counts
                    .filter((c) => c.count > 0)
                    .map(({ block, count }) => (
                      <Button
                        key={block}
                        variant="outline"
                        size="sm"
                        onClick={() => onSeeAll(block, bucket)}
                      >
                        Ver todos · {BLOCK_LABELS[block]} ({count})
                      </Button>
                    ))}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
