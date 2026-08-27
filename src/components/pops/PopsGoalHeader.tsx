import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, CalendarDays, CalendarRange, CalendarCheck, Tractor } from 'lucide-react';
import type { PopsGoalSummary } from '@/hooks/usePops';

const nf = new Intl.NumberFormat('pt-BR');

type Props = {
  programName: string;
  summary?: PopsGoalSummary;
  isLoading: boolean;
  showFilialFilter: boolean;
  filiais: { id: string; nome: string }[];
  filialId: string | null;
  onFilialChange: (id: string | null) => void;
};

const MiniCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) => (
  <Card className="border-border/60">
    <CardContent className="p-3 sm:p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-xl sm:text-2xl font-bold text-foreground">{value}</p>
    </CardContent>
  </Card>
);

export const PopsGoalHeader: React.FC<Props> = ({
  programName,
  summary,
  isLoading,
  showFilialFilter,
  filiais,
  filialId,
  onFilialChange,
}) => {
  const goal = summary?.goal ?? 0;
  const serviced = summary?.serviced ?? 0;
  const percent = summary?.attainment_percent ?? 0;

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Target className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-widest">Programa POPS</span>
              </div>
              <h1 className="mt-1 text-xl sm:text-3xl font-bold text-foreground">{programName}</h1>
            </div>

            {showFilialFilter && (
              <div className="w-full sm:w-56">
                <Select
                  value={filialId ?? 'all'}
                  onValueChange={(v) => onFilialChange(v === 'all' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as filiais" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as filiais</SelectItem>
                    {filiais.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Meta</p>
                  <p className="text-2xl sm:text-4xl font-bold text-foreground">
                    {nf.format(serviced)}{' '}
                    <span className="text-muted-foreground text-lg sm:text-2xl">/ {nf.format(goal)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Faltam</p>
                  <p className="text-xl sm:text-2xl font-semibold text-foreground">
                    {nf.format(summary?.remaining ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Atingimento</p>
                  <p className="text-xl sm:text-2xl font-semibold text-primary">
                    {(percent ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </p>
                </div>
              </div>
              <Progress value={Math.min(percent ?? 0, 100)} className="h-2 sm:h-3" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <MiniCard icon={CalendarDays} label="Hoje" value={nf.format(summary?.today ?? 0)} />
        <MiniCard icon={CalendarRange} label="Semana" value={nf.format(summary?.this_week ?? 0)} />
        <MiniCard icon={CalendarCheck} label="Mês" value={nf.format(summary?.this_month ?? 0)} />
        <MiniCard icon={Tractor} label="Total de máquinas" value={nf.format(summary?.total_universe ?? 0)} />
      </div>
    </div>
  );
};
