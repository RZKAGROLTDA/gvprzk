import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
  className?: string;
  right?: React.ReactNode;
}

const toneMap = {
  primary:     { bg: 'bg-primary/10',     text: 'text-primary',     ring: 'ring-primary/20' },
  success:     { bg: 'bg-success/10',     text: 'text-success',     ring: 'ring-success/20' },
  warning:     { bg: 'bg-warning/10',     text: 'text-warning',     ring: 'ring-warning/20' },
  destructive: { bg: 'bg-destructive/10', text: 'text-destructive', ring: 'ring-destructive/20' },
  muted:       { bg: 'bg-muted',          text: 'text-muted-foreground', ring: 'ring-border' },
} as const;

/**
 * SectionHeader — versão "inline" do SectionCard, sem Card wrapper.
 * Usado para modernizar headers de Cards existentes sem reestruturar JSX.
 * Pure presentational: nenhum estado, nenhum side-effect.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon: Icon,
  title,
  description,
  tone = 'primary',
  className,
  right,
}) => {
  const t = toneMap[tone];
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
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
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
};

export default SectionHeader;
