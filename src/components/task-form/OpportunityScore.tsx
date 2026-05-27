import React from 'react';
import { cn } from '@/lib/utils';

interface OpportunityScoreProps {
  score: number; // 0..100
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

/**
 * Score visual da oportunidade (0-100).
 * Puramente visual — não persistido, não afeta regras de negócio.
 */
export const OpportunityScore: React.FC<OpportunityScoreProps> = ({
  score,
  size = 'md',
  label,
  className,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  const color =
    clamped >= 70 ? 'text-success' : clamped >= 40 ? 'text-warning' : 'text-destructive';
  const ring =
    clamped >= 70 ? 'stroke-success' : clamped >= 40 ? 'stroke-warning' : 'stroke-destructive';

  const dims = size === 'sm' ? 48 : size === 'lg' ? 96 : 64;
  const stroke = size === 'sm' ? 5 : size === 'lg' ? 9 : 7;
  const radius = (dims - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const fontSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-base';

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <div className="relative" style={{ width: dims, height: dims }}>
        <svg width={dims} height={dims} className="-rotate-90">
          <circle
            cx={dims / 2}
            cy={dims / 2}
            r={radius}
            strokeWidth={stroke}
            className="stroke-muted fill-none"
          />
          <circle
            cx={dims / 2}
            cy={dims / 2}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn('fill-none transition-all duration-500', ring)}
          />
        </svg>
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center font-bold tabular-nums',
            fontSize,
            color,
          )}
        >
          {clamped}
        </div>
      </div>
      {label && (
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className={cn('text-sm font-semibold', color)}>
            {clamped >= 70 ? 'Forte' : clamped >= 40 ? 'Em formação' : 'Inicial'}
          </span>
        </div>
      )}
    </div>
  );
};
