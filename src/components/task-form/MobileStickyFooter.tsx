import React from 'react';
import { cn } from '@/lib/utils';
import { OpportunityScore } from './OpportunityScore';

interface MobileStickyFooterProps {
  score?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Barra inferior sticky para experiência mobile/campo.
 * Mostra score + ação primária (children).
 */
export const MobileStickyFooter: React.FC<MobileStickyFooterProps> = ({
  score,
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'sticky bottom-0 left-0 right-0 z-30 mt-4',
        'border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        'px-3 py-3 shadow-[0_-4px_12px_-4px_hsl(var(--foreground)/0.08)]',
        '-mx-3 sm:mx-0 sm:rounded-xl sm:border',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {typeof score === 'number' ? (
          <OpportunityScore score={score} size="sm" label="Score" />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
};
