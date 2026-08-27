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

const GoalCard: React.FC<GoalCardProps> = ({ title, icon: Icon, goal, noGoalLabel }) => {
  const semMetaHoje = !!goal?.sem_meta_hoje;
  const semanal = goal?.period_type === 'weekly';

  // HOJE
  const feitoHoje = Number(goal?.realizado_hoje ?? goal?.realizado ?? 0);
  const metaHoje = goal?.meta_hoje ?? null;
  const pctHoje = metaHoje && metaHoje > 0 ? Math.min(100, Math.round((feitoHoje / metaHoje) * 100)) : 0;
  const atingidaHoje = metaHoje != null && feitoHoje >= metaHoje;

  // PENDÊNCIA DA SEMANA
  const temMeta = goal?.meta != null;
  const feitoSemana = Number(goal?.realizado_semana ?? 0);
  const metaSemana = goal?.meta_acumulada_semana ?? null;
  const pendSemana = goal?.pendencia_semana ?? null;

  return (
    <Card className="h-full">
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide truncate">
              {title}
            </span>
          </div>
          {semanal && (
            <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">
              Meta semanal
            </Badge>
          )}
        </div>

        {/* Bloco HOJE */}
        <div className="space-y-1">
          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hoje
          </p>
          {metaHoje === null ? (
            <>
              <p className="text-xl sm:text-2xl font-bold leading-none">{feitoHoje}</p>
              <p className="text-xs text-muted-foreground">
                {semMetaHoje
                  ? 'Sem meta hoje'
                  : semanal
                    ? 'Meta apurada na semana'
                    : noGoalLabel(feitoHoje)}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl sm:text-2xl font-bold leading-none">
                {feitoHoje}
                <span className="text-sm font-medium text-muted-foreground"> / {metaHoje}</span>
              </p>
              <Progress value={pctHoje} className="h-1.5" />
              {atingidaHoje ? (
                <p className="flex items-center gap-1 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Meta do dia atingida
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Faltam {Math.max(metaHoje - feitoHoje, 0)} hoje
                </p>
              )}
            </>
          )}
        </div>

        {/* Bloco PENDÊNCIA DA SEMANA */}
        <div className="space-y-1 border-t pt-2">
          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pendência da semana
          </p>
          {!temMeta || pendSemana == null ? (
            <p className="text-xs text-muted-foreground">Sem meta cadastrada</p>
          ) : pendSemana === 0 ? (
            <p className="flex items-center gap-1 text-sm font-semibold text-primary">
              <CheckCircle2 className="h-4 w-4" /> Em dia
            </p>
          ) : (
            <p className="text-lg sm:text-xl font-bold leading-none text-destructive">
              {pendSemana}
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                em atraso na semana
              </span>
            </p>
          )}
          {temMeta && metaSemana != null && (
            <p className="text-[11px] text-muted-foreground">
              {feitoSemana} de {metaSemana} até hoje
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface ExecutionCardsProps {
  visitas?: MyDayGoal;
  ligacoes?: MyDayGoal;
}

export const ExecutionCards: React.FC<ExecutionCardsProps> = ({ visitas, ligacoes }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
