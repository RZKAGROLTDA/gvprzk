import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { getRoleLabel } from '@/lib/roles';
import type { MyDayTeamRow, MyDayTeamSummary } from '@/lib/myDay';

interface TeamOverviewProps {
  data: MyDayTeamSummary | undefined;
  rows: MyDayTeamRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectMember: (row: MyDayTeamRow) => void;
}

const Kpi: React.FC<{ label: string; value: number | string; tone?: 'default' | 'alert' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <Card>
    <CardContent className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-bold ${tone === 'alert' ? 'text-destructive' : 'text-foreground'}`}
      >
        {value}
      </p>
    </CardContent>
  </Card>
);

const goalLabel = (realizado: number, meta: number | null): string =>
  meta == null ? `${realizado} / —` : `${realizado} / ${meta}`;

/** "Hoje" compacto: realizado/meta do dia (— quando a meta é semanal ou inexistente). */
const todayLabel = (row: MyDayTeamRow, kind: 'visitas' | 'ligacoes'): string => {
  const done = Number(
    (kind === 'visitas' ? row.visitas_hoje : row.ligacoes_hoje) ?? 0,
  );
  const target = kind === 'visitas' ? row.visitas_meta_hoje : row.ligacoes_meta_hoje;
  return target == null ? `${done} / —` : `${done} / ${target}`;
};

const PendCell: React.FC<{ value: number | null | undefined }> = ({ value }) => {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return <span className="font-semibold text-destructive">{value}</span>;
};

const GoalBadge: React.FC<{ row: MyDayTeamRow }> = ({ row }) => {
  if (row.meta_atingida == null) return <Badge variant="outline">Sem meta</Badge>;
  return row.meta_atingida ? (
    <Badge variant="secondary">Meta atingida</Badge>
  ) : (
    <Badge variant="destructive">Abaixo da meta</Badge>
  );
};


export const TeamOverview: React.FC<TeamOverviewProps> = ({
  data,
  rows,
  isLoading,
  isError,
  onRetry,
  onSelectMember,
}) => {
  const isMobile = useIsMobile();

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar a visão da equipe</AlertTitle>
        <AlertDescription className="mt-2">
          <Button size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const k = data.kpis;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Colaboradores" value={k.colaboradores} />
        <Kpi label="Com pendências" value={k.com_pendencias} tone="alert" />
        <Kpi label="Pend. visitas (semana)" value={k.visitas_pendencia_semana ?? 0} tone="alert" />
        <Kpi label="Pend. ligações (semana)" value={k.ligacoes_pendencia_semana ?? 0} tone="alert" />
        <Kpi label="Abaixo da meta" value={k.meta_nao_atingida} tone="alert" />
        <Kpi label="Visitas atrasadas" value={k.visitas_atrasadas} tone="alert" />
        <Kpi label="Retornos atrasados" value={k.retornos_atrasados} tone="alert" />
        <Kpi label="Treinamentos pendentes" value={k.treinamentos_pendentes} />
        <Kpi label="Próximas ações atrasadas" value={k.acoes_atrasadas} tone="alert" />
        <Kpi label="Total de pendências" value={
          k.visitas_atrasadas + k.retornos_atrasados + k.treinamentos_pendentes + k.acoes_atrasadas
        } tone="alert" />
      </div>


      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado com os filtros selecionados.
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card
              key={row.user_id}
              className="cursor-pointer active:opacity-80"
              onClick={() => onSelectMember(row)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {getRoleLabel(row.role)}
                      {row.filial_nome ? ` • ${row.filial_nome}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Visitas hoje {todayLabel(row, 'visitas')}</Badge>
                  <Badge variant={(row.visitas_pendencia_semana ?? 0) > 0 ? 'destructive' : 'secondary'}>
                    Pend. visitas {row.visitas_pendencia_semana ?? '—'}
                  </Badge>
                  <Badge variant="outline">Ligações hoje {todayLabel(row, 'ligacoes')}</Badge>
                  <Badge variant={(row.ligacoes_pendencia_semana ?? 0) > 0 ? 'destructive' : 'secondary'}>
                    Pend. ligações {row.ligacoes_pendencia_semana ?? '—'}
                  </Badge>
                  <GoalBadge row={row} />

                  <Badge variant={row.total_pendencias > 0 ? 'destructive' : 'secondary'}>
                    {row.total_pendencias} pendência(s)
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Colaborador</TableHead>
                    <TableHead className="whitespace-nowrap">Cargo</TableHead>
                    <TableHead className="whitespace-nowrap">Filial</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Vis. hoje</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Pend. vis.</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Lig. hoje</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Pend. lig.</TableHead>

                    <TableHead className="whitespace-nowrap text-right">Visitas atras.</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Retornos atras.</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Trein. pend.</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Ações atras.</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Pendências</TableHead>
                    <TableHead className="whitespace-nowrap">Meta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.user_id}
                      className="cursor-pointer"
                      onClick={() => onSelectMember(row)}
                    >
                      <TableCell className="whitespace-nowrap font-medium">{row.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{getRoleLabel(row.role)}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.filial_nome ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {goalLabel(row.visitas_realizado, row.visitas_meta)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {goalLabel(row.ligacoes_realizado, row.ligacoes_meta)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {row.visitas_atrasadas}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {row.retornos_atrasados}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {row.treinamentos_pendentes}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {row.acoes_atrasadas}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold">
                        {row.total_pendencias}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <GoalBadge row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
