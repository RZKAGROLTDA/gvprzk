import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMyDaySummary, useMyDayTeamSummary } from '@/hooks/useMyDay';
import { useUserRole } from '@/hooks/useUserRole';
import { useFiliaisList } from '@/hooks/useVacations';
import { ExecutionCards } from '@/components/myday/ExecutionCards';
import { PendingBlock } from '@/components/myday/PendingBlock';
import { SeeAllDialog } from '@/components/myday/SeeAllDialog';
import { TeamFilters } from '@/components/myday/TeamFilters';
import { TeamOverview } from '@/components/myday/TeamOverview';
import { UserDayDialog } from '@/components/myday/UserDayDialog';
import {
  bucketTotal,
  canSeeTeam,
  destinationFor,
  type MyDayBlock,
  type MyDayBucket,
  type MyDayItem,
  type MyDayTeamFilters,
  type MyDayTeamRow,
} from '@/lib/myDay';
import { parseLocalDate } from '@/lib/utils';

const BUCKETS: MyDayBucket[] = ['overdue', 'today', 'upcoming'];

const MyDay: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data, isLoading, isFetching, isError, refetch } = useMyDaySummary();
  const { rawRoles, isLoading: rolesLoading } = useUserRole();

  const roles = (rawRoles ?? []) as string[];
  const showTeam = canSeeTeam(roles);
  const isSupervisorOnly =
    showTeam && !roles.some((r) => ['admin', 'manager'].includes(String(r).toLowerCase()));

  const [tab, setTab] = React.useState<'me' | 'team'>('me');
  const [teamFilters, setTeamFilters] = React.useState<MyDayTeamFilters>({
    filialId: null,
    role: null,
    userId: null,
  });
  const [search, setSearch] = React.useState('');
  const [member, setMember] = React.useState<MyDayTeamRow | null>(null);

  const { data: filiais = [] } = useFiliaisList();
  const team = useMyDayTeamSummary(teamFilters, showTeam && tab === 'team');

  const teamRows = React.useMemo(() => {
    const rows = team.data?.rows ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term));
  }, [team.data?.rows, search]);

  const [dialog, setDialog] = React.useState<{
    open: boolean;
    block: MyDayBlock | null;
    bucket: MyDayBucket | null;
  }>({ open: false, block: null, bucket: null });

  const handleSelect = React.useCallback(
    (item: MyDayItem) => {
      navigate(destinationFor(item));
    },
    [navigate],
  );

  const handleSeeAll = React.useCallback((block: MyDayBlock, bucket: MyDayBucket) => {
    setDialog({ open: true, block, bucket });
  }, []);

  const todayLabel = React.useMemo(() => {
    const iso = data?.user?.today;
    const date = iso ? parseLocalDate(iso) : new Date();
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  }, [data?.user?.today]);

  const allClear = !!data && BUCKETS.every((bucket) => bucketTotal(data, bucket) === 0);

  const personalView = (
    <>
      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar o Meu Dia</AlertTitle>
          <AlertDescription className="mt-2">
            <Button size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Minha execução
            </h2>
            <ExecutionCards visitas={data.goals?.visitas} ligacoes={data.goals?.ligacoes} />
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pendências
            </h2>

            {allClear && (
              <Card className="border-primary/30">
                <CardHeader className="py-3">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Você está em dia com suas atividades.
                  </p>
                </CardHeader>
              </Card>
            )}

            <div className="space-y-3">
              {BUCKETS.map((bucket) => (
                <PendingBlock
                  key={bucket}
                  bucket={bucket}
                  summary={data}
                  // Mobile: só "Atrasado" aberto. Desktop: todos abertos.
                  defaultOpen={isMobile ? bucket === 'overdue' : true}
                  onSelect={handleSelect}
                  onSeeAll={handleSeeAll}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Meu Dia</h1>
          <p className="text-xs sm:text-sm text-muted-foreground capitalize">{todayLabel}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (tab === 'team' ? void team.refetch() : void refetch())}
          disabled={tab === 'team' ? team.isFetching : isFetching}
          className="shrink-0"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${
              (tab === 'team' ? team.isFetching : isFetching) ? 'animate-spin' : ''
            }`}
          />
          Atualizar
        </Button>
      </div>

      {showTeam && !rolesLoading ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'me' | 'team')} className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="me" className="flex-1 sm:flex-none">
              Minha visão
            </TabsTrigger>
            <TabsTrigger value="team" className="flex-1 sm:flex-none">
              Minha equipe
            </TabsTrigger>
          </TabsList>

          <TabsContent value="me" className="space-y-4">
            {personalView}
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <TeamFilters
              showFilialFilter={!isSupervisorOnly}
              filiais={filiais as { id: string; nome: string }[]}
              filters={teamFilters}
              onChange={setTeamFilters}
              rows={team.data?.rows ?? []}
              search={search}
              onSearchChange={setSearch}
            />
            <TeamOverview
              data={team.data}
              rows={teamRows}
              isLoading={team.isLoading}
              isError={team.isError}
              onRetry={() => void team.refetch()}
              onSelectMember={setMember}
            />
          </TabsContent>
        </Tabs>
      ) : (
        personalView
      )}

      <SeeAllDialog
        open={dialog.open}
        block={dialog.block}
        bucket={dialog.bucket}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        onSelect={(item) => {
          setDialog((prev) => ({ ...prev, open: false }));
          handleSelect(item);
        }}
      />

      <UserDayDialog
        open={!!member}
        member={member}
        onOpenChange={(open) => {
          if (!open) setMember(null);
        }}
      />
    </div>
  );
};

export default MyDay;
