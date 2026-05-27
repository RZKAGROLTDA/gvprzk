import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Building2, User2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { OpportunityScore } from './OpportunityScore';
import { cn } from '@/lib/utils';

interface TaskHeaderProps {
  title: string;
  subtitle?: string;
  status?: { label: string; variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' };
  score?: number;
  client?: string;
  filial?: string;
  consultant?: string;
  backTo?: string;
  className?: string;
}

/**
 * Header executivo para telas de tarefa (Visita, Ligação, Visita Técnica).
 * Mobile-first: layout colapsa em coluna; metadados ficam compactos.
 */
export const TaskHeader: React.FC<TaskHeaderProps> = ({
  title,
  subtitle,
  status,
  score,
  client,
  filial,
  consultant,
  backTo = '/create-task',
  className,
}) => {
  const navigate = useNavigate();

  return (
    <header
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        'p-4 sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(backTo)}
            aria-label="Voltar"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{title}</h1>
              {status && (
                <Badge variant={status.variant ?? 'secondary'} className="shrink-0">
                  {status.label}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
            )}
            {(client || filial || consultant) && (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 sm:text-sm">
                {client && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <dt className="sr-only">Cliente</dt>
                    <dd className="font-medium truncate">{client}</dd>
                  </div>
                )}
                {filial && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <dt className="sr-only">Filial</dt>
                    <dd className="truncate">{filial}</dd>
                  </div>
                )}
                {consultant && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <dt className="sr-only">Consultor</dt>
                    <dd className="truncate">{consultant}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          {typeof score === 'number' && (
            <OpportunityScore score={score} size="md" label="Score" />
          )}
          <div className="w-full sm:w-72">
            <OfflineIndicator />
          </div>
        </div>
      </div>
    </header>
  );
};
