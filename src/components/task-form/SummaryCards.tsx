import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface SummaryCardItem {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'primary';
}

interface SummaryCardsProps {
  items: SummaryCardItem[];
  className?: string;
}

const toneMap: Record<NonNullable<SummaryCardItem['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  primary: 'text-primary',
};

const toneBg: Record<NonNullable<SummaryCardItem['tone']>, string> = {
  default: 'bg-muted text-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  primary: 'bg-primary/10 text-primary',
};

/**
 * Cards de resumo executivos. Responsivo: 1 col mobile → 2 tablet → 4 desktop.
 */
export const SummaryCards: React.FC<SummaryCardsProps> = ({ items, className }) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item, idx) => {
        const Icon = item.icon;
        const tone = item.tone ?? 'default';
        return (
          <Card key={idx} className="overflow-hidden">
            <CardContent className="flex items-start gap-3 p-4">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  toneBg[tone],
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-lg font-bold tabular-nums truncate',
                    toneMap[tone],
                  )}
                  title={item.value}
                >
                  {item.value}
                </p>
                {item.hint && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {item.hint}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
