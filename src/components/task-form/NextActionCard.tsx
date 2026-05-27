import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NextActionCardProps {
  title?: string;
  description?: string;
  date?: Date | null;
  empty?: boolean;
  className?: string;
}

const fmt = (d: Date) =>
  d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Card de próxima ação — exibe o próximo follow-up planejado.
 */
export const NextActionCard: React.FC<NextActionCardProps> = ({
  title,
  description,
  date,
  empty,
  className,
}) => {
  if (empty || !title) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="flex items-center gap-3 p-4 text-muted-foreground">
          <CalendarClock className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Defina a próxima ação</p>
            <p className="text-xs">Agende um lembrete para manter a oportunidade viva.</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-primary/30 bg-primary/5', className)}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold truncate">{title}</p>
            {date && (
              <Badge variant="secondary" className="font-mono">
                {fmt(date)}
              </Badge>
            )}
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
