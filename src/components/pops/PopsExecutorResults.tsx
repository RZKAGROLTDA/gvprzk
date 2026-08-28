import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Users2 } from 'lucide-react';
import { getRoleLabel } from '@/lib/roles';
import type { PopsExecutorRow, PopsPlatformFilter } from '@/hooks/usePops';

const nf = new Intl.NumberFormat('pt-BR');
const pf = (v: number | null | undefined) =>
  `${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

type Props = {
  rows: PopsExecutorRow[];
  totalServiced: number;
  isLoading: boolean;
  error?: unknown;
  platform: PopsPlatformFilter;
  onPlatformChange: (v: PopsPlatformFilter) => void;
  executedBy: string | null;
  onExecutedByChange: (v: string | null) => void;
};

export const PopsExecutorResults: React.FC<Props> = ({
  rows,
  totalServiced,
  isLoading,
  error,
  platform,
  onPlatformChange,
  executedBy,
  onExecutedByChange,
}) => (
  <Card>
    <CardContent className="p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base sm:text-lg font-semibold">Resultado por executor</h2>
          <Badge variant="secondary">{nf.format(totalServiced)} serviçadas</Badge>
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          <Select value={platform} onValueChange={(v) => onPlatformChange(v as PopsPlatformFilter)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas plataformas</SelectItem>
              <SelectItem value="Large">Large</SelectItem>
              <SelectItem value="Small">Small</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={executedBy ?? 'all'}
            onValueChange={(v) => onExecutedByChange(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Todos os executores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os executores</SelectItem>
              {rows.map((r) => (
                <SelectItem key={r.user_id} value={r.user_id}>
                  {r.executor_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Não foi possível carregar o resultado por executor.</AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma máquina concluída no escopo selecionado.
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Executor</th>
                  <th className="py-2 pr-3 text-left font-medium">Cargo</th>
                  <th className="py-2 pr-3 text-left font-medium">Filial</th>
                  <th className="py-2 pr-3 text-right font-medium whitespace-nowrap">Serviçadas</th>
                  <th className="py-2 pr-3 text-right font-medium">Large</th>
                  <th className="py-2 pr-3 text-right font-medium">Small</th>
                  <th className="py-2 pr-3 text-right font-medium">Hoje</th>
                  <th className="py-2 pr-3 text-right font-medium">Semana</th>
                  <th className="py-2 pr-3 text-right font-medium">Mês</th>
                  <th className="py-2 text-right font-medium whitespace-nowrap">% part.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.executor_name}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{getRoleLabel(r.executor_role)}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.filial_nome || '—'}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{nf.format(r.serviced)}</td>
                    <td className="py-2 pr-3 text-right">{nf.format(r.large_serviced)}</td>
                    <td className="py-2 pr-3 text-right">{nf.format(r.small_serviced)}</td>
                    <td className="py-2 pr-3 text-right">{nf.format(r.today)}</td>
                    <td className="py-2 pr-3 text-right">{nf.format(r.this_week)}</td>
                    <td className="py-2 pr-3 text-right">{nf.format(r.this_month)}</td>
                    <td className="py-2 text-right font-semibold text-primary">{pf(r.share_percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <div key={r.user_id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{r.executor_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getRoleLabel(r.executor_role)} · {r.filial_nome || 'Sem filial'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{nf.format(r.serviced)}</p>
                    <p className="text-xs text-primary">{pf(r.share_percent)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  <Badge variant="outline">Large {nf.format(r.large_serviced)}</Badge>
                  <Badge variant="outline">Small {nf.format(r.small_serviced)}</Badge>
                  <Badge variant="secondary">Hoje {nf.format(r.today)}</Badge>
                  <Badge variant="secondary">Sem. {nf.format(r.this_week)}</Badge>
                  <Badge variant="secondary">Mês {nf.format(r.this_month)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </CardContent>
  </Card>
);
