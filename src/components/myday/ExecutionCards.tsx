import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, MapPin, PhoneCall } from 'lucide-react';
import type { MyDayGoal } from '@/lib/myDay';

interface GoalCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  goal: MyDayGoal | undefined;
  /** Texto usado quando não existe meta cadastrada (meta = null). */
  noGoalLabel: (realizado: number) => string;
}

const periodLabel = (goal?: MyDayGoal): string | null => {
  if (!goal?.period_type) return null;
  return goal.period_type === 'weekly' ? 'Semana' : 'Hoje';
};

const GoalCard: React.FC<GoalCardProps> = ({ title, icon: Icon, goal, noGoalLabel }) => {
  const realizado = Number(goal?.realizado ?? 0);
  const meta = goal?.meta ?? null;
  const semMetaHoje = !!goal?.sem_meta_hoje;
  const period = periodLabel(goal);
  const pct = meta && meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0;

  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide truncate">
              {title}
            </span>
          </div>
          {period && !semMetaHoje && meta !== null && (
            <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">{period}</Badge>
          )}
        </div>

        {semMetaHoje ? (
          <>
            <p className="text-xl sm:text-2xl font-bold leading-none">{realizado}</p>
            <p className="text-xs text-muted-foreground">Sem meta hoje</p>
          </>
        ) : meta === null ? (
          <>
            <p className="text-xl sm:text-2xl font-bold leading-none">{realizado}</p>
            <p className="text-xs text-muted-foreground">{noGoalLabel(realizado)}</p>
          </>
        ) : (
          <>
            <p className="text-xl sm:text-2xl font-bold leading-none">
              {realizado}
              <span className="text-sm font-medium text-muted-foreground"> / {meta}</span>
            </p>
            <Progress value={pct} className="h-1.5" />
            {goal?.atingida ? (
              <p className="flex items-center gap-1 text-xs font-medium text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> Meta atingida
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Faltam {goal?.faltam ?? Math.max(meta - realizado, 0)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

interface ExecutionCardsProps {
  visitas?: MyDayGoal;
  ligacoes?: MyDayGoal;
}

export const ExecutionCards: React.FC<ExecutionCardsProps> = ({ visitas, ligacoes }) => (
  <div className="grid grid-cols-2 gap-3">
    <GoalCard
      title="Visitas"
      icon={MapPin}
      goal={visitas}
      noGoalLabel={(n) => `${n} ${n === 1 ? 'realizada hoje' : 'realizadas hoje'}`}
    />
    <GoalCard
      title="Ligações / Prospecções"
      icon={PhoneCall}
      goal={ligacoes}
      noGoalLabel={(n) => `${n} ${n === 1 ? 'realizada hoje' : 'realizadas hoje'}`}
    />
  </div>
);
