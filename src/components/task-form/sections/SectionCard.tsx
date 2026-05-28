import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /**
   * Cor do ícone. Usa tokens semânticos do design system.
   * @default 'primary'
   */
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
  className?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

const toneMap: Record<NonNullable<SectionCardProps['tone']>, { bg: string; text: string; ring: string }> = {
  primary:     { bg: 'bg-primary/10',     text: 'text-primary',     ring: 'ring-primary/20' },
  success:     { bg: 'bg-success/10',     text: 'text-success',     ring: 'ring-success/20' },
  warning:     { bg: 'bg-warning/10',     text: 'text-warning',     ring: 'ring-warning/20' },
  destructive: { bg: 'bg-destructive/10', text: 'text-destructive', ring: 'ring-destructive/20' },
  muted:       { bg: 'bg-muted',          text: 'text-muted-foreground', ring: 'ring-border' },
};

/**
 * SectionCard — base presentational para seções de formulário modernas.
 * Pure presentational: não tem estado, não chama Supabase, não conhece regras de negócio.
 */
export const SectionCard: React.FC<SectionCardProps> = ({
  icon: Icon,
  title,
  description,
  tone = 'primary',
  className,
  contentClassName,
  headerRight,
  children,
}) => {
  const t = toneMap[tone];
  return (
    <Card className={cn('border-border/60 shadow-sm overflow-hidden', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1',
                t.bg,
                t.text,
                t.ring,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
                {title}
              </h3>
              {description && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      </CardHeader>
      <CardContent className={cn('pt-0 space-y-4', contentClassName)}>{children}</CardContent>
    </Card>
  );
};

export default SectionCard;
