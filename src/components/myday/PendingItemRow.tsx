import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Clock } from 'lucide-react';
import type { MyDayItem } from '@/lib/myDay';

interface PendingItemRowProps {
  item: MyDayItem;
  onSelect: (item: MyDayItem) => void;
}

export const PendingItemRow: React.FC<PendingItemRowProps> = ({ item, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(item)}
    className="w-full text-left rounded-md border bg-card px-3 py-2.5 min-h-[44px] transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold truncate">{item.clientLabel}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px] font-normal">{item.typeLabel}</Badge>
          <span>{item.dateLabel}</span>
          {item.time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.time}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
    </div>
  </button>
);
